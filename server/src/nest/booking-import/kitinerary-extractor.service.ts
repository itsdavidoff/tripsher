import { Injectable, OnModuleInit } from '@nestjs/common';
import { execFile, execSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { KiReservation } from './kitinerary.types';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 5 * 1024 * 1024;

@Injectable()
export class KitineraryExtractorService implements OnModuleInit {
  private binaryPath: string | null = null;
  private serviceUrl: string | null = null;

  onModuleInit() {
    this.serviceUrl = process.env.KITINERARY_SERVICE_URL?.trim() || null;
    this.binaryPath = this.findBinary();

    if (this.serviceUrl) {
      console.log(`[KItinerary] remote extractor microservice configured at: ${this.serviceUrl}`);
    } else if (this.binaryPath) {
      console.log(`[KItinerary] local extractor found at: ${this.binaryPath}`);
    } else {
      console.info('[KItinerary] extractor not found — booking import feature disabled');
    }
  }

  isAvailable(): boolean {
    return this.serviceUrl !== null || this.binaryPath !== null;
  }

  async extract(buffer: Buffer, fileName: string): Promise<KiReservation[]> {
    if (this.serviceUrl) {
      return this.extractRemote(buffer, fileName);
    }
    return this.extractLocal(buffer, fileName);
  }

  private async extractRemote(buffer: Buffer, fileName: string): Promise<KiReservation[]> {
    if (!this.serviceUrl) throw new Error('KITINERARY_SERVICE_URL is not configured');

    const url = `${this.serviceUrl.replace(/\/+$/, '')}/extract`;
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' });
    formData.append('file', blob, fileName);

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`KItinerary microservice HTTP error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { reservations?: KiReservation[] };
    return Array.isArray(data.reservations) ? data.reservations : [];
  }

  private async extractLocal(buffer: Buffer, fileName: string): Promise<KiReservation[]> {
    if (!this.binaryPath) {
      throw new Error('kitinerary-extractor is not available on this system');
    }

    const ext = extname(fileName).toLowerCase();
    const tmpFile = join(tmpdir(), `trek-ki-${randomUUID()}${ext}`);

    try {
      writeFileSync(tmpFile, buffer);

      const { stdout, stderr } = await execFileAsync(this.binaryPath, [tmpFile], {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });

      if (stderr?.trim()) {
        const unexpected = stderr
          .split('\n')
          .filter(l => l.trim())
          .filter(l => !l.includes('Ambig') && !l.includes('JS ERROR') && !l.includes('Invalid result type from script'));
        if (unexpected.length) {
          console.warn(`[KItinerary] stderr for "${fileName}":`, unexpected.join('\n'));
        }
      }

      const text = stdout.trim();
      if (!text) return [];

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.warn(`[KItinerary] non-JSON output for "${fileName}"`);
        return [];
      }

      if (Array.isArray(parsed)) return parsed as KiReservation[];
      if (typeof parsed === 'object' && parsed !== null) return [parsed as KiReservation];
      return [];
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  private findBinary(): string | null {
    const envPath = process.env.KITINERARY_EXTRACTOR_PATH;
    if (envPath) {
      if (existsSync(envPath)) return envPath;
      console.warn(`[KItinerary] KITINERARY_EXTRACTOR_PATH="${envPath}" not found`);
      return null;
    }

    try {
      for (const dir of readdirSync('/usr/lib')) {
        const candidate = join('/usr/lib', dir, 'libexec', 'kf6', 'kitinerary-extractor');
        if (existsSync(candidate)) return candidate;
      }
    } catch { /* not a Debian system */ }

    try {
      execSync('kitinerary-extractor --version', { stdio: 'pipe', timeout: 3000 });
      return 'kitinerary-extractor';
    } catch { /* not in PATH */ }

    return null;
  }
}
