import { Client } from 'ssh2';
import fs from 'fs';
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
    console.log(`\n\x1b[36m> ${command}\x1b[0m`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        if (code !== 0) {
          console.error(`\x1b[31mError: code ${code}\x1b[0m`);
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
  console.log('\x1b[32m[Quick Update Started]\x1b[0m');
  try {
    const remoteAppDir = '/opt/tripsher';

    // 1. Upload source files (excluding node_modules)
    console.log('\n--- Uploading Source Files ---');
    const tarName = 'tripsher-quick.tar.gz';
    const localTar = path.join(__dirname, tarName);
    
    if (fs.existsSync(localTar)) fs.unlinkSync(localTar);

    // Create tar with source only
    const { execSync } = await import('child_process');
    execSync(`tar -czf "${localTar}" --exclude="node_modules" --exclude=".git" --exclude="tripsher-src.tar.gz" --exclude="*.log" .`, {
      cwd: __dirname
    });
    
    const sizeMB = (fs.statSync(localTar).size / (1024 * 1024)).toFixed(2);
    console.log(`Archive created: ${tarName} (${sizeMB} MB)`);

    // Upload via SFTP
    const remoteTar = `${remoteAppDir}/${tarName}`;
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.fastPut(localTar, remoteTar, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // 2. Extract and build on VPS
    console.log('\n--- Extracting and Building on VPS ---');
    await runRemote(`cd ${remoteAppDir} && tar -xzf ${remoteTar} && rm ${remoteTar}`);
    await runRemote(`cd ${remoteAppDir} && npm run build`);

    // 3. Restart service
    console.log('\n--- Restarting Service ---');
    await runRemote('systemctl restart tripsher');
    await runRemote('sleep 2');
    await runRemote('systemctl status tripsher --no-pager || true');

    // Cleanup
    if (fs.existsSync(localTar)) fs.unlinkSync(localTar);

    console.log('\n\x1b[32m=====================================================');
    console.log('✅ QUICK UPDATE COMPLETED SUCCESSFULLY!');
    console.log('=====================================================\x1b[0m');

    conn.end();
  } catch (err) {
    console.error('\x1b[31mUpdate Error:\x1b[0m', err);
    conn.end();
    process.exit(1);
  }
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);
