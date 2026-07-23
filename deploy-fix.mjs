import { Client } from 'ssh2';
import path from 'path';
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

conn.on('ready', async () => {
  console.log('\x1b[32m[Connected to VPS - Running Full Install & Build]\x1b[0m');
  try {
    const remoteAppDir = '/opt/tripsher';

    console.log('\n--- Installing ALL Dependencies (including devDependencies for build) ---');
    await runRemote(`cd ${remoteAppDir} && npm install --include=dev --legacy-peer-deps`);

    console.log('\n--- Running npm run build ---');
    await runRemote(`cd ${remoteAppDir} && npm run build`);

    console.log('\n--- Restarting Tripsher Service ---');
    await runRemote('systemctl restart tripsher');

    console.log('\n--- Checking Service Status ---');
    await runRemote('sleep 3');
    await runRemote('systemctl status tripsher --no-pager || true');

    console.log('\n--- Testing Local HTTP Response ---');
    await runRemote('curl -i http://127.0.0.1:3000 || true');

    console.log('\n\x1b[32m=====================================================');
    console.log('🎉 TRIPSHER IS LIVE AND HEALTHY ON VPS!');
    console.log('Site URL: http://188.34.181.191 (or http://tripsher.online)');
    console.log('=====================================================\x1b[0m');

    conn.end();
  } catch (err) {
    console.error('\x1b[31mDeployment Fix Error:\x1b[0m', err.message);
    conn.end();
    process.exit(1);
  }
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);
