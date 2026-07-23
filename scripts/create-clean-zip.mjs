import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const output = fs.createWriteStream(path.resolve('./tripsher-deploy.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`ZIP created successfully: ${archive.pointer()} total bytes`);
});

archive.pipe(output);

// Add build directories
if (fs.existsSync('client/dist')) archive.directory('client/dist/', 'client/dist');
if (fs.existsSync('client/public')) archive.directory('client/public/', 'client/public');
if (fs.existsSync('server/dist')) archive.directory('server/dist/', 'server/dist');
if (fs.existsSync('server/assets')) archive.directory('server/assets/', 'server/assets');
if (fs.existsSync('shared/dist')) archive.directory('shared/dist/', 'shared/dist');
if (fs.existsSync('wiki')) archive.directory('wiki/', 'wiki');

// Add manifests & configuration
if (fs.existsSync('package.json')) archive.file('package.json', { name: 'package.json' });
if (fs.existsSync('package-lock.json')) archive.file('package-lock.json', { name: 'package-lock.json' });
if (fs.existsSync('server/package.json')) archive.file('server/package.json', { name: 'server/package.json' });
if (fs.existsSync('client/package.json')) archive.file('client/package.json', { name: 'client/package.json' });
if (fs.existsSync('shared/package.json')) archive.file('shared/package.json', { name: 'shared/package.json' });
if (fs.existsSync('server/tsconfig.json')) archive.file('server/tsconfig.json', { name: 'server/tsconfig.json' });
if (fs.existsSync('server/reset-admin.js')) archive.file('server/reset-admin.js', { name: 'server/reset-admin.js' });
if (fs.existsSync('index.js')) archive.file('index.js', { name: 'index.js' });
if (fs.existsSync('deploy-ispmanager.sh')) archive.file('deploy-ispmanager.sh', { name: 'deploy-ispmanager.sh' });

archive.finalize();
