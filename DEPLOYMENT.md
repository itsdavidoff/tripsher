# Deployment Guide

This guide explains how to set up automatic deployment to your VPS using GitHub Actions.

## Prerequisites

- VPS server with SSH access
- GitHub repository with this project
- Node.js installed on VPS

## Step 1: Generate SSH Keys

Generate SSH keys on your local machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/tripsher_deploy
```

Copy the public key to your VPS:

```bash
ssh-copy-id -i ~/.ssh/tripsher_deploy.pub root@your-vps-ip
```

Or manually add it to VPS:

```bash
cat ~/.ssh/tripsher_deploy.pub | ssh root@your-vps-ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

## Step 2: Configure GitHub Secrets

Go to your GitHub repository: https://github.com/itsdavidoff/tripsher/settings/secrets/actions

Add the following secrets:

### Required Secrets:

- **VPS_HOST**: Your VPS IP address (e.g., `188.34.181.191`)
- **VPS_USER**: SSH username (e.g., `root`)
- **VPS_SSH_KEY**: Private SSH key content

  To get the private key content:
  ```bash
  cat ~/.ssh/tripsher_deploy
  ```
  
  Copy the entire output (including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`) and paste it as the secret value.

### Optional Secrets:

- **VPS_PORT**: SSH port (default: `22`)
- **VPS_PASSWORD**: Alternative to SSH key (not recommended)

## Step 3: Prepare VPS

SSH into your VPS and run:

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

# Install nginx
apt install -y nginx

# Create application directory
mkdir -p /opt/tripsher

# Set up systemd service
cat > /etc/systemd/system/tripsher.service << 'EOF'
[Unit]
Description=Tripsher Web Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tripsher
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tripsher
```

## Step 4: Manual Deployment (Optional)

For manual deployment, you can use the provided scripts:

```bash
# Set environment variables
export VPS_HOST="188.34.181.191"
export VPS_USER="root"
export VPS_PASSWORD="your-password"  # or use VPS_SSH_KEY

# Quick update (build on VPS)
node quick-update.mjs

# Full deployment
node deploy-to-vps.mjs
```

## Step 5: Automatic Deployment

Once GitHub Secrets are configured, deployment will automatically trigger on:

- **Push to main branch**: Automatic deployment
- **Manual trigger**: Go to Actions tab → Deploy to VPS → Run workflow

## Troubleshooting

### SSH Connection Issues

If deployment fails with SSH errors:

1. Verify SSH key is correctly added to VPS:
   ```bash
   ssh -i ~/.ssh/tripsher_deploy root@your-vps-ip
   ```

2. Check VPS SSH config:
   ```bash
   # On VPS
   cat /etc/ssh/sshd_config | grep -E "PubkeyAuthentication|AuthorizedKeysFile"
   ```

3. Ensure permissions are correct:
   ```bash
   # On VPS
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```

### Build Failures

If build fails on VPS:

1. Check Node.js version:
   ```bash
   node --version  # Should be v24.x
   ```

2. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

3. Check disk space:
   ```bash
   df -h
   ```

### Service Not Starting

Check service logs:

```bash
# On VPS
journalctl -u tripsher -n 50
systemctl status tripsher
```

## Security Notes

- **Never commit SSH keys or passwords to the repository**
- Use SSH keys instead of passwords for authentication
- Regularly rotate your SSH keys
- Limit SSH access to specific IPs if possible
- Use a separate deployment user instead of root when possible

## Monitoring

After deployment, monitor your service:

```bash
# Check service status
systemctl status tripsher

# View logs
journalctl -u tripsher -f

# Check application health
curl http://localhost:3000/api/health
```
