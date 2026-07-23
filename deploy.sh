#!/bin/bash

# Deployment script triggered by webhook
# This script runs on VPS when GitHub webhook is triggered

set -e

APP_DIR="/opt/tripsher"
BACKUP_DIR="/opt/tripsher-backups"
LOG_FILE="/var/log/tripsher-deploy.log"

echo "$(date): Starting webhook deployment" >> $LOG_FILE

# Create backup
if [ -d "$APP_DIR" ]; then
    echo "$(date): Creating backup" >> $LOG_FILE
    mkdir -p $BACKUP_DIR
    tar -czf "$BACKUP_DIR/tripsher-backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C $APP_DIR .
fi

# Pull latest changes
echo "$(date): Pulling latest changes from GitHub" >> $LOG_FILE
cd $APP_DIR
git fetch origin main
git reset --hard origin/main

# Install dependencies
echo "$(date): Installing dependencies" >> $LOG_FILE
npm ci --production

# Build project
echo "$(date): Building project" >> $LOG_FILE
npm run build

# Restart service
echo "$(date): Restarting tripsher service" >> $LOG_FILE
systemctl restart tripsher

# Verify service is running
sleep 5
if systemctl is-active --quiet tripsher; then
    echo "$(date): Deployment completed successfully" >> $LOG_FILE
else
    echo "$(date): Deployment failed - service not running" >> $LOG_FILE
    systemctl status tripsher >> $LOG_FILE
    exit 1
fi
