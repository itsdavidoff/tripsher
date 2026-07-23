# Webhook Deployment Setup

This guide explains how to set up automatic deployment to your VPS using GitHub webhooks.

## Prerequisites

- VPS server with SSH access
- GitHub repository
- Node.js installed on VPS (will be installed automatically by setup script)

## Quick Setup

### 1. Run Setup Script on VPS

SSH into your VPS and run the setup script:

```bash
ssh root@188.34.181.191

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/itsdavidoff/tripsher/main/webhook-setup.sh -o webhook-setup.sh
chmod +x webhook-setup.sh
./webhook-setup.sh
```

Or manually copy the files from your local machine:

```bash
# From local machine
scp webhook-setup.sh root@188.34.181.191:/tmp/
scp webhook-server.js root@188.34.181.191:/tmp/
scp deploy.sh root@188.34.181.191:/tmp/

# On VPS
ssh root@188.34.181.191
cd /tmp
chmod +x webhook-setup.sh
./webhook-setup.sh
```

### 2. Save Webhook Secret

The setup script will generate a webhook secret. **Save it** - you'll need it for GitHub configuration.

Example output:
```
IMPORTANT: Save this webhook secret:
WEBHOOK_SECRET: abc123def456...
```

### 3. Configure GitHub Webhook

1. Go to your GitHub repository: https://github.com/itsdavidoff/tripsher/settings/hooks
2. Click **"Add webhook"**
3. Fill in the form:
   - **Payload URL**: `http://188.34.181.191:3001/webhook`
   - **Content type**: `application/json`
   - **Secret**: (paste the webhook secret from step 2)
   - **Events**: Select **"Just the push event"**
4. Click **"Add webhook"**

### 4. Test Webhook

Make a test push to trigger deployment:

```bash
# On local machine
cd c:\Users\Daniil\Desktop\проекты\TREK-main
echo "# Test webhook deployment" >> README.md
git add README.md
git commit -m "Test webhook deployment"
git push origin main
```

Check webhook delivery in GitHub: https://github.com/itsdavidoff/tripsher/settings/hooks

## How It Works

1. **Webhook Server**: Runs on port 3001 on your VPS
2. **GitHub Webhook**: Sends POST request when you push to main branch
3. **Deployment Script**: Automatically pulls, builds, and restarts the service
4. **Systemd Services**: Both webhook server and main app run as services

## Monitoring

Check webhook server status:
```bash
# On VPS
systemctl status tripsher-webhook
```

Check deployment logs:
```bash
# On VPS
tail -f /var/log/tripsher-deploy.log
```

Check webhook server health:
```bash
curl http://188.34.181.191:3001/health
```

## Troubleshooting

### Webhook not triggering

1. Check webhook server is running:
   ```bash
   systemctl status tripsher-webhook
   ```

2. Check webhook server logs:
   ```bash
   journalctl -u tripsher-webhook -n 50
   ```

3. Test webhook manually:
   ```bash
   curl -X POST http://188.34.181.191:3001/webhook \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=..." \
     -d '{"ref":"refs/heads/main"}'
   ```

### Deployment fails

1. Check deployment logs:
   ```bash
   tail -f /var/log/tripsher-deploy.log
   ```

2. Check main app status:
   ```bash
   systemctl status tripsher
   ```

3. Manually run deployment script:
   ```bash
   cd /opt/tripsher
   bash deploy.sh
   ```

### Port 3001 not accessible

1. Check firewall:
   ```bash
   ufw allow 3001
   # or
   iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
   ```

2. Check if webhook server is listening:
   ```bash
   netstat -tlnp | grep 3001
   ```

## Security Notes

- The webhook secret prevents unauthorized deployments
- Only pushes to the `main` branch trigger deployment
- Consider using HTTPS for webhook URL in production
- Regularly rotate the webhook secret

## Manual Deployment

If webhook fails, you can still deploy manually:

```bash
# On VPS
cd /opt/tripsher
git fetch origin main
git reset --hard origin/main
npm ci --production
npm run build
systemctl restart tripsher
```

Or use the local scripts:
```bash
# On local machine
cd c:\Users\Daniil\Desktop\проекты\TREK-main
$env:VPS_HOST="188.34.181.191"
$env:VPS_USER="root"
$env:VPS_PASSWORD="your-password"
node quick-update.mjs
```
