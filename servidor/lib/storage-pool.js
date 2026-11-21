// Este programa é um software livre (Licença AGPLv3)
'use strict';

const fs = require('fs');
const path = require('path');

const MIN_RESERVE_BYTES = 512 * 1024 * 1024; // 512 MB de margem de segurança

function getVolumeStatsSafe(dirPath) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(dirPath);
      const bsize = Number(st.bsize || 4096);
      const totalBytes = Number(st.blocks || 0) * bsize;
      const freeBytes = Number(st.bavail ?? st.bfree ?? 0) * bsize;
      return { totalBytes, freeBytes };
    }
  } catch {}
  return { totalBytes: 0, freeBytes: 0 };
}

function isDirWritableSafe(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function discoverStorageVolumes(primaryStorageDir) {
  const candidates = new Set();
  if (primaryStorageDir) candidates.add(path.resolve(primaryStorageDir));

  const envList = [process.env.STORAGE_VOLUMES || '', process.env.EXTRA_STORAGE_DIRS || '']
    .join(':')
    .split(/[:,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of envList) {
    candidates.add(path.resolve(p));
  }

  // Auto-descoberta de volumes montados em /storage/* (Android / Fire TV)
  try {
    if (fs.existsSync('/storage')) {
      for (const entry of fs.readdirSync('/storage')) {
        if (entry === 'emulated' || entry === 'self') continue;
        const full = path.join('/storage', entry);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory() && isDirWritableSafe(full)) {
            candidates.add(path.resolve(full));
          }
        } catch {}
      }
    }
  } catch {}

  const volumes = [];
  let idx = 0;
  for (const rootDir of candidates) {
    const online = fs.existsSync(rootDir);
    const writable = online ? isDirWritableSafe(rootDir) : false;
    const { totalBytes, freeBytes } = online ? getVolumeStatsSafe(rootDir) : { totalBytes: 0, freeBytes: 0 };
    const isPrimary = primaryStorageDir ? path.resolve(primaryStorageDir) === rootDir : idx === 0;
    const id = isPrimary ? 'primary' : `vol-${idx}-${path.basename(rootDir) || 'disk'}`;
    volumes.push({
      id,
      label: path.basename(rootDir) || id,
      rootDir,
      tenantBaseDir: rootDir,
      portfolioDir: path.join(rootDir, 'portfolio'),
      writable,
      online,
      totalBytes,
      freeBytes,
      isPrimary,
    });
    idx++;
  }

  return volumes;
}

function resolveTenantFileAcrossVolumes(volumes, namespaceSubPath, relPath) {
  const cleanRel = String(relPath || '').replace(/^\/+/, '');
  let best = null;
  for (const vol of volumes) {
    if (!vol.online) continue;
    const candidate = path.join(vol.tenantBaseDir, namespaceSubPath, cleanRel);
    try {
      const st = fs.statSync(candidate);
      if (!best || st.mtimeMs > best.mtimeMs) {
        best = { volume: vol, filePath: candidate, stat: st, mtimeMs: st.mtimeMs };
      }
    } catch {}
  }
  return best;
}

function pickWriteVolume(volumes, requiredBytes = 0, existingFilePath = null) {
  if (existingFilePath) {
    const resolvedExisting = path.resolve(existingFilePath);
    const ownerVol = volumes.find((v) => resolvedExisting.startsWith(path.resolve(v.rootDir) + path.sep));
    if (ownerVol && ownerVol.online && ownerVol.writable) return ownerVol;
  }

  const writableVols = volumes.filter((v) => v.online && v.writable);
  if (writableVols.length === 0) return volumes[0] || null;

  // Ordena por maior espaço livre
  const sorted = [...writableVols].sort((a, b) => b.freeBytes - a.freeBytes);
  const withMargin = sorted.find((v) => v.freeBytes >= requiredBytes + MIN_RESERVE_BYTES);
  return withMargin || sorted[0];
}

async function moveAcrossVolumesOrRename(srcPath, destPath) {
  try {
    await fs.promises.rename(srcPath, destPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      const tmpDest = `${destPath}.exdev.tmp`;
      await fs.promises.copyFile(srcPath, tmpDest);
      const fd = await fs.promises.open(tmpDest, 'r+');
      try {
        await fd.sync();
      } finally {
        await fd.close();
      }
      await fs.promises.rename(tmpDest, destPath);
      await fs.promises.unlink(srcPath);
    } else {
      throw err;
    }
  }
}

function getAggregatedTelemetry(volumes) {
  let totalBytes = 0;
  let freeBytes = 0;
  let degraded = false;
  const mapped = volumes.map((v) => {
    if (!v.online) degraded = true;
    totalBytes += v.totalBytes || 0;
    freeBytes += v.freeBytes || 0;
    return {
      id: v.id,
      label: v.label,
      mountPath: v.rootDir,
      totalBytes: v.totalBytes || 0,
      freeBytes: v.freeBytes || 0,
      writable: Boolean(v.writable),
      online: Boolean(v.online),
    };
  });
  return {
    totalBytes,
    freeBytes,
    degraded,
    volumes: mapped,
  };
}

module.exports = {
  discoverStorageVolumes,
  resolveTenantFileAcrossVolumes,
  pickWriteVolume,
  moveAcrossVolumesOrRename,
  getAggregatedTelemetry,
};
