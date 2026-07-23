// Tripsher Production Entrypoint with Auto-Install
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Auto-install dependencies if node_modules is missing or incomplete
const markerPath = path.join(__dirname, 'node_modules', '.install-done');
const needsInstall = !fs.existsSync(markerPath);

if (needsInstall) {
  console.log('[Tripsher] First run detected — installing dependencies...');
  console.log('[Tripsher] This may take 1-2 minutes...');
  try {
    execSync('npm install --omit=dev --no-audit --no-fund', {
      cwd: __dirname,
      stdio: 'inherit',
      timeout: 300000 // 5 min timeout
    });
    // Mark install as done
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString());
    console.log('[Tripsher] Dependencies installed successfully!');
  } catch (err) {
    console.error('[Tripsher] Failed to install dependencies:', err.message);
    process.exit(1);
  }
}

// Start the server
console.log('[Tripsher] Starting server...');
require('./server/dist/index.js');
