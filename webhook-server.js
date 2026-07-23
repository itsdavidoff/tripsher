const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-change-this';
const APP_DIR = '/opt/tripsher';

app.use(express.json());

// Verify GitHub webhook signature
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

  // Check if push to main branch
  if (req.body.ref === 'refs/heads/main') {
    console.log('Push to main detected, starting deployment...');
    
    // Trigger deployment script
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
