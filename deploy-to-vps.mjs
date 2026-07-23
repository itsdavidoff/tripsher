import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const conn = new Client();

const config = {
  host: '188.34.181.191',
  port: 22,
  username: 'root',
  password: 'KJqNHbaMXWb3XJFerWT4_2026!'
};

function runRemote(command) {
  return new Promise((resolve, reject) => {
    console.log(`\n\x1b[36m> Remote Exec: ${command}\x1b[0m`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        if (code !== 0) {
          console.error(`\x1b[31mRemote command exited with code ${code}\x1b[0m`);
          reject(new Error(`Command failed: ${stderr || stdout}`));
        } else {
          resolve(stdout);
        }
      }).on('data', (data) => {
        process.stdout.write(data);
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
        stderr += data.toString();
      });
    });
  });
}

function uploadFile(localPath, remotePath) {
  return new Promise((resolve, reject) => {
    console.log(`\x1b[35m> Uploading ${localPath} -> ${remotePath}\x1b[0m`);
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('\x1b[32m[Connected to VPS for Fast Deployment]\x1b[0m');
  try {
    const remoteAppDir = '/opt/tripsher';
    await runRemote(`mkdir -p ${remoteAppDir}`);

    // Check if tar already uploaded
    const tarCheck = await runRemote(`if [ -f ${remoteAppDir}/tripsher-src.tar.gz ]; then echo "EXISTS"; fi`);
    
    if (tarCheck.trim() === 'EXISTS') {
      console.log('\n--- Using existing source archive on VPS ---');
      await runRemote(`tar -xzf ${remoteAppDir}/tripsher-src.tar.gz -C ${remoteAppDir}`);
    } else {
      console.log('\n--- Packaging and Uploading Codebase ---');
      const tarName = 'tripsher-src.tar.gz';
      const localTar = path.join(__dirname, tarName);
      if (fs.existsSync(localTar)) fs.unlinkSync(localTar);
      execSync(`tar -czf "${localTar}" --exclude="node_modules" --exclude=".git" --exclude="tripsher-deploy.zip" --exclude="*.log" .`, { cwd: __dirname });
      await uploadFile(localTar, `${remoteAppDir}/${tarName}`);
      await runRemote(`tar -xzf ${remoteAppDir}/${tarName} -C ${remoteAppDir}`);
    }

    // Upload updated package.json
    console.log('\n--- Uploading Restored package.json ---');
    await uploadFile(path.join(__dirname, 'package.json'), `${remoteAppDir}/package.json`);

    // 4. Install Dependencies
    console.log('\n--- Installing NPM Dependencies on VPS ---');
    await runRemote(`cd ${remoteAppDir} && npm install`);

    // 5. Build Client and Server
    console.log('\n--- Building Project on VPS ---');
    await runRemote(`cd ${remoteAppDir} && npm run build`);
    await runRemote(`rm -rf ${remoteAppDir}/server/public && ln -s ${remoteAppDir}/client/dist ${remoteAppDir}/server/public`);

    // 6. Configure Nginx
    console.log('\n--- Configuring Nginx ---');
    const nginxConf = `
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
`;
    await runRemote(`cat << 'EOF' > /etc/nginx/sites-available/tripsher
${nginxConf}
EOF`);
    await runRemote('ln -sf /etc/nginx/sites-available/tripsher /etc/nginx/sites-enabled/tripsher');
    await runRemote('rm -f /etc/nginx/sites-enabled/default');
    await runRemote('nginx -t && systemctl reload nginx');

    // 7. Configure Systemd Service
    console.log('\n--- Configuring Systemd Service ---');
    const systemdConf = `[Unit]
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
Environment=COOKIE_SECURE=false

[Install]
WantedBy=multi-user.target
`;
    await runRemote(`cat << 'EOF' > /etc/systemd/system/tripsher.service
${systemdConf}
EOF`);
    await runRemote('systemctl daemon-reload');
    await runRemote('systemctl enable tripsher');
    await runRemote('systemctl restart tripsher');

    // 8. Check Service Status
    console.log('\n--- Service Status ---');
    await runRemote('systemctl status tripsher --no-pager || true');
    await runRemote('sleep 3');
    await runRemote('curl -I http://127.0.0.1:3000 || true');

    // 9. Try Certbot for SSL
    console.log('\n--- Requesting SSL Certificate ---');
    try {
      await runRemote('certbot --nginx -d tripsher.online -d www.tripsher.online --non-interactive --agree-tos -m admin@tripsher.online || true');
    } catch (e) {
      console.log('Certbot notice:', e.message);
    }

    console.log('\n\x1b[32m=====================================================');
    console.log('🎉 DEPLOYMENT TO VPS COMPLETED SUCCESSFULLY!');
    console.log('Site URL: http://tripsher.online (or http://188.34.181.191)');
    console.log('=====================================================\x1b[0m');

    conn.end();
  } catch (err) {
    console.error('\x1b[31mDeployment Error:\x1b[0m', err);
    conn.end();
    process.exit(1);
  }
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);
