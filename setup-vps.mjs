import { Client } from 'ssh2';

const conn = new Client();

const config = {
  host: '188.34.181.191',
  port: 22,
  username: 'root',
  password: 'KJqNHbaMXWb3XJFerWT4_2026!'
};

function runCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`\n\x1b[36m> Executing: ${command}\x1b[0m`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        if (code !== 0) {
          console.error(`\x1b[31mCommand exited with code ${code}\x1b[0m`);
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
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
  console.log('\x1b[32m[SSH Connected Successfully to VPS!]\x1b[0m');
  try {
    console.log('\n--- Checking System Info ---');
    await runCommand('cat /etc/os-release | grep PRETTY_NAME && free -h && df -h /');

    console.log('\n--- Updating System Packages & Installing Prerequisites ---');
    await runCommand('apt-get update -qq');
    await runCommand('apt-get install -y -qq curl git nginx certbot python3-certbot-nginx build-essential rsync tar ufw unzip');
    
    console.log('\n--- Installing Node.js 22 LTS ---');
    await runCommand('if ! command -v node &> /dev/null; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -qq nodejs; fi');
    await runCommand('node -v && npm -v');

    console.log('\x1b[32m\n=== VPS PREREQUISITES INSTALLED SUCCESSFULLY ===\x1b[0m');
    conn.end();
  } catch (err) {
    console.error('\x1b[31mError during setup:\x1b[0m', err.message);
    conn.end();
    process.exit(1);
  }
}).on('error', (err) => {
  console.error('\x1b[31mSSH Connection Error:\x1b[0m', err);
}).connect(config);
