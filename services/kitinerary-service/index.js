import express from 'express';
import multer from 'multer';
import { execFile, execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 5 * 1024 * 1024;
const PORT = process.env.PORT || 3002;

function findBinary() {
  const envPath = process.env.KITINERARY_EXTRACTOR_PATH;
  if (envPath) {
    if (existsSync(envPath)) return envPath;
    console.warn(`[KItinerary-Service] KITINERARY_EXTRACTOR_PATH="${envPath}" not found`);
    return null;
  }

  try {
    for (const dir of readdirSync('/usr/lib')) {
      const candidate = join('/usr/lib', dir, 'libexec', 'kf6', 'kitinerary-extractor');
      if (existsSync(candidate)) return candidate;
    }
  } catch { /* ignore */ }

  try {
    execSync('kitinerary-extractor --version', { stdio: 'pipe', timeout: 3000 });
    return 'kitinerary-extractor';
  } catch { /* ignore */ }

  return null;
}

const binaryPath = findBinary();
if (binaryPath) {
  console.log(`[KItinerary-Service] Using extractor binary at: ${binaryPath}`);
} else {
  console.warn('[KItinerary-Service] kitinerary-extractor binary not found!');
}

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    available: binaryPath !== null,
    binaryPath,
  });
});

app.post('/extract', upload.single('file'), async (req, res) => {
  if (!binaryPath) {
    return res.status(503).json({ error: 'kitinerary-extractor binary is not available' });
  }

  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'No file uploaded under key "file"' });
  }

  const ext = extname(file.originalname || '').toLowerCase() || '.pdf';
  const tmpFile = join(tmpdir(), `ki-extract-${randomUUID()}${ext}`);

  try {
    writeFileSync(tmpFile, file.buffer);

    const { stdout, stderr } = await execFileAsync(binaryPath, [tmpFile], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });

    if (stderr?.trim()) {
      const unexpected = stderr
        .split('\n')
        .filter(l => l.trim())
        .filter(l => !l.includes('Ambig') && !l.includes('JS ERROR') && !l.includes('Invalid result type from script'));
      if (unexpected.length) {
        console.warn(`[KItinerary-Service] stderr for "${file.originalname}":`, unexpected.join('\n'));
      }
    }

    const text = stdout.trim();
    if (!text) {
      return res.json({ reservations: [] });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn(`[KItinerary-Service] non-JSON output for "${file.originalname}"`);
      return res.json({ reservations: [] });
    }

    const items = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    res.json({ reservations: items });
  } catch (err) {
    console.error(`[KItinerary-Service] Error extracting "${file.originalname}":`, err);
    res.status(500).json({ error: 'Extraction failed', details: err.message });
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
});

const server = app.listen(PORT, () => {
  console.log(`[KItinerary-Service] Microservice listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[KItinerary-Service] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});
