// Este programa é um software livre (Licença AGPLv3)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isAllowedLanUrl, normalizeRelPath } from './security';
import type { DesktopCredentialStore } from './credentials';

export type TransferState =
  | 'queued'
  | 'running'
  | 'finalizing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DesktopTransferItem {
  id: string;
  direction: 'upload' | 'download';
  state: TransferState;
  scopeKey: string;
  remoteServerUrl: string;
  lanServerUrl?: string;
  relativePath: string;
  localPath: string;
  filename: string;
  totalBytes: number;
  loadedBytes: number;
  progressPercent: number;
  uploadId?: string;
  etag?: string | null;
  overwrite?: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransferEngineOptions {
  userDataDir: string;
  credentials: DesktopCredentialStore;
  onProgress?: (item: DesktopTransferItem) => void;
  onPowerSaveChanged?: (active: boolean) => void;
}

async function moveFileSafe(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.promises.rename(src, dest);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') {
      const tmp = path.join(path.dirname(dest), `.aurt_tmp_${path.basename(dest)}.${process.pid}.${Date.now()}.tmp`);
      await fs.promises.copyFile(src, tmp);
      await fs.promises.rename(tmp, dest);
      await fs.promises.unlink(src).catch(() => {});
      return;
    }
    throw err;
  }
}

async function computeFileSha256Streaming(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
    rs.on('error', reject);
  });
}

export class DesktopTransferEngine {
  private readonly queuePath: string;
  private readonly credentials: DesktopCredentialStore;
  private readonly onProgress?: (item: DesktopTransferItem) => void;
  private readonly onPowerSaveChanged?: (active: boolean) => void;

  private items: DesktopTransferItem[] = [];
  private controllers = new Map<string, AbortController>();
  private runningLoop = false;
  private initialized = false;
  private shuttingDown = false;
  private readonly maxConcurrency: number = 2;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(options: TransferEngineOptions) {
    this.queuePath = path.join(options.userDataDir, 'transfer-queue.json');
    this.credentials = options.credentials;
    this.onProgress = options.onProgress;
    this.onPowerSaveChanged = options.onPowerSaveChanged;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const raw = await fs.promises.readFile(this.queuePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.items = parsed.map((it) => ({
          ...it,
          state: it.state === 'running' || it.state === 'finalizing' ? 'queued' : it.state,
        }));
      }
    } catch {
      this.items = [];
    }
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.items, null, 2);
    this.persistChain = this.persistChain.then(async () => {
      await fs.promises.mkdir(path.dirname(this.queuePath), { recursive: true });
      const tmp = `${this.queuePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
      await fs.promises.rename(tmp, this.queuePath);
    });
    return this.persistChain;
  }

  listTransfers(): DesktopTransferItem[] {
    return this.items.map((it) => ({ ...it }));
  }

  async probeLan(lanUrl: string, timeoutMs = 1500): Promise<{ reachable: boolean; latencyMs?: number }> {
    const clean = String(lanUrl || '').trim().replace(/\/+$/, '');
    if (!clean || !isAllowedLanUrl(clean)) return { reachable: false };
    const start = Date.now();
    try {
      // Sem credenciais no probe: confirma estritamente a identidade do Edge Server do Aurtistic
      const res = await fetch(`${clean}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { reachable: false };
      const data = (await res.json().catch(() => null)) as { ok?: boolean; service?: string } | null;
      const isAurtistic = Boolean(data?.ok === true && data?.service === 'aurtistic-edge');
      return { reachable: isAurtistic, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false };
    }
  }

  async resolveActiveBaseUrl(remoteServerUrl: string, lanServerUrl?: string): Promise<string> {
    if (lanServerUrl && isAllowedLanUrl(lanServerUrl)) {
      const probe = await this.probeLan(lanServerUrl, 1200);
      if (probe.reachable) {
        return lanServerUrl.trim().replace(/\/+$/, '');
      }
    }
    return remoteServerUrl.trim().replace(/\/+$/, '');
  }

  selectAdaptiveChunkSize(baseUrl: string): number {
    return isAllowedLanUrl(baseUrl) && baseUrl.startsWith('http://')
      ? 32 * 1024 * 1024
      : 16 * 1024 * 1024;
  }

  async enqueueUpload(input: {
    id?: string;
    scopeKey: string;
    remoteServerUrl: string;
    lanServerUrl?: string;
    relativePath: string;
    localPath: string;
    overwrite?: boolean;
  }): Promise<DesktopTransferItem> {
    await this.init();
    const st = await fs.promises.stat(input.localPath);
    if (!st.isFile()) throw new Error(`Arquivo local não encontrado: ${input.localPath}`);
    const cleanRel = normalizeRelPath(input.relativePath);
    const now = Date.now();
    const item: DesktopTransferItem = {
      id: input.id || `up-${now}-${crypto.randomBytes(3).toString('hex')}`,
      direction: 'upload',
      state: 'queued',
      scopeKey: input.scopeKey || 'personal',
      remoteServerUrl: input.remoteServerUrl,
      lanServerUrl: input.lanServerUrl,
      relativePath: cleanRel,
      localPath: input.localPath,
      filename: path.basename(cleanRel),
      totalBytes: st.size,
      loadedBytes: 0,
      progressPercent: 0,
      overwrite: Boolean(input.overwrite),
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    await this.persist();
    void this.drainQueue();
    return { ...item };
  }

  async enqueueDownload(input: {
    id?: string;
    scopeKey: string;
    remoteServerUrl: string;
    lanServerUrl?: string;
    relativePath: string;
    localPath: string;
    sizeBytes?: number;
  }): Promise<DesktopTransferItem> {
    await this.init();
    const cleanRel = normalizeRelPath(input.relativePath);
    const now = Date.now();
    const item: DesktopTransferItem = {
      id: input.id || `dl-${now}-${crypto.randomBytes(3).toString('hex')}`,
      direction: 'download',
      state: 'queued',
      scopeKey: input.scopeKey || 'personal',
      remoteServerUrl: input.remoteServerUrl,
      lanServerUrl: input.lanServerUrl,
      relativePath: cleanRel,
      localPath: input.localPath,
      filename: path.basename(cleanRel),
      totalBytes: Math.max(0, Number(input.sizeBytes) || 0),
      loadedBytes: 0,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    await this.persist();
    void this.drainQueue();
    return { ...item };
  }

  async pauseTransfer(id: string): Promise<boolean> {
    const it = this.items.find((x) => x.id === id);
    if (!it) return false;
    it.state = 'paused';
    it.updatedAt = Date.now();
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    await this.persist();
    this.onProgress?.({ ...it });
    return true;
  }

  async resumeTransfer(id: string): Promise<boolean> {
    const it = this.items.find((x) => x.id === id);
    if (!it) return false;
    if (it.state === 'paused' || it.state === 'failed') {
      it.state = 'queued';
      it.error = undefined;
      it.updatedAt = Date.now();
      await this.persist();
      this.onProgress?.({ ...it });
      void this.drainQueue();
    }
    return true;
  }

  async cancelTransfer(id: string): Promise<boolean> {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    const it = this.items[idx];
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    if (it.direction === 'download') {
      await fs.promises.unlink(`${it.localPath}.part`).catch(() => {});
      await fs.promises.unlink(`${it.localPath}.part.meta.json`).catch(() => {});
    }
    this.items.splice(idx, 1);
    await this.persist();
    return true;
  }

  async drainQueue(): Promise<void> {
    if (this.runningLoop || this.shuttingDown) return;
    this.runningLoop = true;
    this.onPowerSaveChanged?.(true);
    try {
      const inFlight = new Set<Promise<void>>();
      while (!this.shuttingDown) {
        while (!this.shuttingDown && inFlight.size < this.maxConcurrency) {
          const next = this.items.find((it) => it.state === 'queued');
          if (!next) break;
          next.state = 'running';
          const task = this.processItem(next).finally(() => inFlight.delete(task));
          inFlight.add(task);
        }
        if (inFlight.size === 0) break;
        await Promise.race(inFlight);
      }
      if (inFlight.size > 0) {
        await Promise.allSettled(inFlight);
      }
    } finally {
      this.runningLoop = false;
      this.onPowerSaveChanged?.(false);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const [id, ctrl] of this.controllers.entries()) {
      const item = this.items.find((it) => it.id === id);
      if (item && (item.state === 'running' || item.state === 'finalizing')) {
        item.state = 'paused';
      }
      ctrl.abort();
    }
    this.controllers.clear();
    await this.persist().catch(() => {});
    this.onPowerSaveChanged?.(false);
  }

  private async processItem(item: DesktopTransferItem): Promise<void> {
    const ctrl = new AbortController();
    this.controllers.set(item.id, ctrl);
    item.state = 'running';
    item.error = undefined;
    item.updatedAt = Date.now();
    await this.persist();
    this.onProgress?.({ ...item });

    try {
      const authHeader = await this.credentials.getBasicAuthHeader(item.scopeKey);
      if (!authHeader) {
        throw new Error(`Credencial ausente para o escopo ${item.scopeKey}.`);
      }
      const baseUrl = await this.resolveActiveBaseUrl(item.remoteServerUrl, item.lanServerUrl);
      if (item.direction === 'upload') {
        await this.runStreamingUpload(item, baseUrl, authHeader, ctrl.signal);
      } else {
        await this.runStreamingDownload(item, baseUrl, authHeader, ctrl.signal);
      }
      item.state = 'completed';
      item.progressPercent = 100;
      item.updatedAt = Date.now();
    } catch (err: unknown) {
      if ((item.state as TransferState) === 'paused' || ctrl.signal.aborted) {
        item.state = 'paused';
      } else {
        item.state = 'failed';
        item.error = err instanceof Error ? err.message : String(err);
      }
      item.updatedAt = Date.now();
    } finally {
      this.controllers.delete(item.id);
      await this.persist();
      this.onProgress?.({ ...item });
    }
  }

  private async runStreamingUpload(
    item: DesktopTransferItem,
    baseUrl: string,
    authHeader: string,
    signal: AbortSignal
  ): Promise<void> {
    const st = await fs.promises.stat(item.localPath);
    item.totalBytes = st.size;

    let chunkSize = this.selectAdaptiveChunkSize(baseUrl);
    let totalChunks = st.size === 0 ? 1 : Math.ceil(st.size / chunkSize);
    const uploadedSet = new Set<number>();

    if (item.uploadId) {
      const stRes = await fetch(`${baseUrl}/api/tenant/upload/chunked/${encodeURIComponent(item.uploadId)}/status`, {
        headers: { Authorization: authHeader },
        signal,
      });
      if (stRes.ok) {
        const stJson = await stRes.json();
        if (stJson.state === 'completed') return;
        chunkSize = Number(stJson.chunkSize) || chunkSize;
        totalChunks = Number(stJson.totalChunks) || totalChunks;
        if (Array.isArray(stJson.uploadedChunks)) {
          for (const idx of stJson.uploadedChunks) uploadedSet.add(Number(idx));
        }
      } else {
        item.uploadId = undefined;
      }
    }

    if (!item.uploadId) {
      const initRes = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relPath: item.relativePath,
          totalSize: st.size,
          chunkSize,
          overwrite: Boolean(item.overwrite),
        }),
        signal,
      });
      const initJson = await initRes.json().catch(() => ({}));
      if (initRes.status === 401) {
        await this.credentials.clearCredential(item.scopeKey).catch(() => {});
        throw new Error('Credencial revogada ou expirada (401).');
      }
      if (!initRes.ok || !initJson?.uploadId) {
        throw new Error(initJson?.error || `Falha /init (${initRes.status})`);
      }
      item.uploadId = String(initJson.uploadId);
      chunkSize = Number(initJson.chunkSize) || chunkSize;
      totalChunks = Number(initJson.totalChunks) || totalChunks;
      await this.persist();
    }

    const fh = await fs.promises.open(item.localPath, 'r');
    try {
      let sent = 0;
      for (const idx of uploadedSet) {
        const s = idx * chunkSize;
        sent += Math.max(0, Math.min(st.size, s + chunkSize) - s);
      }
      item.loadedBytes = sent;

      for (let idx = 0; idx < totalChunks; idx++) {
        if (uploadedSet.has(idx)) continue;
        if (signal.aborted) throw new Error('Upload pausado.');

        const start = idx * chunkSize;
        const len = st.size === 0 ? 0 : Math.min(chunkSize, st.size - start);
        const buf = Buffer.allocUnsafe(len);
        let offset = 0;
        while (offset < len) {
          const { bytesRead } = await fh.read(buf, offset, len - offset, start + offset);
          if (bytesRead <= 0) break;
          offset += bytesRead;
        }
        const chunkSlice = buf.subarray(0, offset);
        const shaHex = crypto.createHash('sha256').update(chunkSlice).digest('hex');

        const putRes = await fetch(
          `${baseUrl}/api/tenant/upload/chunked/${encodeURIComponent(item.uploadId)}/${idx}`,
          {
            method: 'PUT',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/octet-stream',
              'x-chunk-sha256': shaHex,
            },
            body: chunkSlice,
            signal,
          }
        );
        const putJson = await putRes.json().catch(() => ({}));
        if (putRes.status === 401) {
          await this.credentials.clearCredential(item.scopeKey).catch(() => {});
          throw new Error('Credencial revogada ou expirada (401).');
        }
        if (!putRes.ok) {
          throw new Error(putJson?.error || `Falha no chunk ${idx} (${putRes.status})`);
        }

        sent += chunkSlice.length;
        item.loadedBytes = sent;
        item.progressPercent = st.size === 0 ? 100 : Math.min(99, Math.round((sent / st.size) * 100));
        item.updatedAt = Date.now();
        this.onProgress?.({ ...item });
      }
    } finally {
      await fh.close().catch(() => {});
    }

    item.state = 'finalizing';
    item.progressPercent = 100;
    await this.persist();
    this.onProgress?.({ ...item });

    const compRes = await fetch(
      `${baseUrl}/api/tenant/upload/chunked/${encodeURIComponent(item.uploadId)}/complete`,
      {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: '{}',
        signal,
      }
    );
    const compJson = await compRes.json().catch(() => ({}));
    if (compRes.status === 200 && compJson.state === 'completed') return;
    if (compRes.status !== 202) {
      throw new Error(compJson?.error || `Falha /complete (${compRes.status})`);
    }

    const pollPath = compJson.pollUrl || `/api/tenant/upload/chunked/${item.uploadId}/status`;
    const pollUrl = pollPath.startsWith('http') ? pollPath : `${baseUrl}${pollPath}`;
    while (!signal.aborted) {
      await new Promise((r) => setTimeout(r, 800));
      const stRes = await fetch(pollUrl, { headers: { Authorization: authHeader }, signal });
      const stJson = await stRes.json().catch(() => ({}));
      if (stRes.ok && stJson.state === 'completed') return;
      if (!stRes.ok || stJson.state === 'failed') {
        throw new Error(stJson?.error || `Falha ao finalizar no servidor (${stRes.status})`);
      }
    }
    throw new Error('Finalização interrompida.');
  }

  private async runStreamingDownload(
    item: DesktopTransferItem,
    baseUrl: string,
    authHeader: string,
    signal: AbortSignal
  ): Promise<void> {
    const streamUrl = `${baseUrl}/api/tenant/stream?path=${encodeURIComponent(item.relativePath)}&download=1`;
    const headRes = await fetch(streamUrl, {
      method: 'HEAD',
      headers: { Authorization: authHeader },
      signal,
    });
    if (!headRes.ok) throw new Error(`Falha HEAD download (${headRes.status})`);

    const totalBytes = Number(headRes.headers.get('content-length') || 0);
    const headEtag = headRes.headers.get('etag');
    const expectedSha = headRes.headers.get('x-plaintext-sha256');
    item.totalBytes = totalBytes;

    const partPath = `${item.localPath}.part`;
    const metaPath = `${item.localPath}.part.meta.json`;
    await fs.promises.mkdir(path.dirname(item.localPath), { recursive: true });

    let existingBytes = 0;
    try {
      const metaRaw = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
      const stPart = await fs.promises.stat(partPath);
      if (headEtag && metaRaw?.etag === headEtag && stPart.size <= totalBytes) {
        existingBytes = stPart.size;
      } else {
        await fs.promises.unlink(partPath).catch(() => {});
      }
    } catch {}

    await fs.promises.writeFile(metaPath, JSON.stringify({ etag: headEtag, relativePath: item.relativePath }));
    item.etag = headEtag;
    item.loadedBytes = existingBytes;

    const sliceSize = 8 * 1024 * 1024;
    while (item.loadedBytes < totalBytes) {
      if (signal.aborted) throw new Error('Download pausado.');
      const end = Math.min(totalBytes - 1, item.loadedBytes + sliceSize - 1);
      const headers: Record<string, string> = {
        Authorization: authHeader,
        Range: `bytes=${item.loadedBytes}-${end}`,
      };
      if (item.etag) headers['If-Range'] = item.etag;

      const res = await fetch(streamUrl, { method: 'GET', headers, signal });
      if (res.status === 200) {
        // If-Range divergente -> zera parcial e escreve do byte 0
        await fs.promises.unlink(partPath).catch(() => {});
        item.loadedBytes = 0;
        item.etag = res.headers.get('etag') || item.etag;
        await fs.promises.writeFile(metaPath, JSON.stringify({ etag: item.etag, relativePath: item.relativePath }));
        const out = fs.createWriteStream(partPath, { flags: 'w' });
        await new Promise<void>((resolve, reject) => {
          const reader = res.body?.getReader();
          if (!reader) return reject(new Error('Body ausente.'));
          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                out.write(value);
                item.loadedBytes += value.byteLength;
              }
              out.end(() => resolve());
            } catch (e) {
              out.destroy();
              reject(e);
            }
          };
          void pump();
        });
        break;
      }

      if (res.status !== 206) {
        throw new Error(`Falha ao baixar faixa (${res.status})`);
      }

      const out = fs.createWriteStream(partPath, { flags: 'a' });
      await new Promise<void>((resolve, reject) => {
        const reader = res.body?.getReader();
        if (!reader) return reject(new Error('Body ausente.'));
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              out.write(value);
              item.loadedBytes += value.byteLength;
            }
            out.end(() => resolve());
          } catch (e) {
            out.destroy();
            reject(e);
          }
        };
        void pump();
      });

      item.progressPercent = totalBytes === 0 ? 100 : Math.min(100, Math.round((item.loadedBytes / totalBytes) * 100));
      this.onProgress?.({ ...item });
    }

    if (totalBytes === 0 && !fs.existsSync(partPath)) {
      await fs.promises.writeFile(partPath, Buffer.alloc(0));
    }

    if (expectedSha) {
      const actualSha = await computeFileSha256Streaming(partPath);
      if (actualSha !== expectedSha.toLowerCase()) {
        await fs.promises.unlink(partPath).catch(() => {});
        await fs.promises.unlink(metaPath).catch(() => {});
        throw new Error('Falha de integridade X-Plaintext-Sha256 no arquivo baixado.');
      }
    }

    await moveFileSafe(partPath, item.localPath);
    await fs.promises.unlink(metaPath).catch(() => {});
  }
}
