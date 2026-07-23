#!/bin/bash

# Setup script for webhook deployment on VPS
# Run this on your VPS to set up automatic deployment via GitHub webhook

set -e

echo "Setting up webhook deployment on VPS..."

# Variables
APP_DIR="/opt/tripsher"
WEBHOOK_PORT=3001
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Install dependencies if not already installed
echo "Installing Node.js and dependencies..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt install -y nodejs
fi

# Install express for webhook server
echo "Installing express..."
npm install -g express

# Create app directory if it doesn't exist
mkdir -p $APP_DIR
cd $APP_DIR

# Clone repository if not already cloned
if [ ! -d ".git" ]; then
    echo "Cloning repository..."
    git clone https://github.com/itsdavidoff/tripsher.git .
else
    echo "Repository already exists, pulling latest..."
    git fetch origin main
    git reset --hard origin/main
fi

# Install project dependencies
echo "Installing project dependencies..."
npm ci --production

# Build project
echo "Building project..."
npm run build

# Setup webhook server
echo "Setting up webhook server..."
cat > $APP_DIR/webhook-server.js << 'EOF'
const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-change-this';
const APP_DIR = '/opt/tripsher';

app.use(express.json());

function verifySignature(payload, signature) {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  
  if (!signature) {
    console.log('No signature provided');
    return res.status(401).send('No signature');
  }

  const payload = JSON.stringify(req.body);
  
  if (!verifySignature(payload, signature.replace('sha256=', ''))) {
    console.log('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  if (req.body.ref === 'refs/heads/main') {
    console.log('Push to main detected, starting deployment...');
    
    exec(`bash ${APP_DIR}/deploy.sh`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Deployment error: ${error}`);
        return res.status(500).send('Deployment failed');
      }
      console.log(`Deployment output: ${stdout}`);
      if (stderr) console.error(`Deployment stderr: ${stderr}`);
      
      res.status(200).send('Deployment started');
    });
  } else {
    console.log(`Push to ${req.body.ref}, ignoring`);
    res.status(200).send('Not main branch, ignoring');
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('Webhook server is running');
});

app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
EOF

# Install webhook server dependencies
echo "Installing webhook server dependencies..."
cd $APP_DIR
npm install express

# Setup deployment script
echo "Setting up deployment script..."
cat > $APP_DIR/deploy.sh << 'EOF'
#!/bin/bash

set -e

APP_DIR="/opt/tripsher"
BACKUP_DIR="/opt/tripsher-backups"
LOG_FILE="/var/log/tripsher-deploy.log"

echo "$(date): Starting webhook deployment" >> $LOG_FILE

if [ -d "$APP_DIR" ]; then
    echo "$(date): Creating backup" >> $LOG_FILE
    mkdir -p $BACKUP_DIR
    tar -czf "$BACKUP_DIR/tripsher-backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C $APP_DIR .
fi

echo "$(date): Pulling latest changes from GitHub" >> $LOG_FILE
cd $APP_DIR
git fetch origin main
git reset --hard origin/main

echo "$(date): Installing dependencies" >> $LOG_FILE
npm ci --production

echo "$(date): Building project" >> $LOG_FILE
npm run build

echo "$(date): Restarting tripsher service" >> $LOG_FILE
systemctl restart tripsher

sleep 5
if systemctl is-active --quiet tripsher; then
    echo "$(date): Deployment completed successfully" >> $LOG_FILE
else
    echo "$(date): Deployment failed - service not running" >> $LOG_FILE
    systemctl status tripsher >> $LOG_FILE
    exit 1
fi
EOF

chmod +x $APP_DIR/deploy.sh

# Setup systemd service for webhook
echo "Setting up systemd service for webhook..."
cat > /etc/systemd/system/tripsher-webhook.service << EOF
[Unit]
Description=Tripsher Webhook Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node webhook-server.js
Restart=always
RestartSec=5
Environment=WEBHOOK_SECRET=$WEBHOOK_SECRET
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Setup systemd service for main app
echo "Setting up systemd service for main app..."
cat > /etc/systemd/system/tripsher.service << EOF
[Unit]
Description=Tripsher Web Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable services
systemctl daemon-reload
systemctl enable tripsher-webhook
systemctl enable tripsher

# Start services
systemctl start tripsher-webhook
systemctl start tripsher

# Setup nginx (if not already configured)
echo "Setting up nginx..."
cat > /etc/nginx/sites-available/tripsher << 'EOF'
server {
    listen 80;
    server_name tripsher.online www.tripsher.online 188.34.181.191;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/tripsher /etc/nginx/sites-enabled/tripsher
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=========================================="
echo "Webhook deployment setup completed!"
echo "=========================================="
echo ""
echo "IMPORTANT: Save this webhook secret:"
echo "WEBHOOK_SECRET: $WEBHOOK_SECRET"
echo ""
echo "Webhook URL: http://188.34.181.191:3001/webhook"
echo ""
echo "Next steps:"
echo "1. Add this webhook secret to GitHub repository settings"
echo "2. Configure webhook in GitHub with URL: http://188.34.181.191:3001/webhook"
echo "3. Content type: application/json"
echo "4. Secret: $WEBHOOK_SECRET"
echo "5. Events: push"
echo ""
echo "Services status:"
systemctl status tripsher-webhook --no-pager || true
systemctl status tripsher --no-pager || true
