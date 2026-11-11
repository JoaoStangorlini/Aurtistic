// Este programa é um software livre (Licença AGPLv3)
/*!
 * Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal v2.0
 * Copyright (C) 2026 João Paulo Stangorlini de Carvalho
 *
 * Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo
 * sob os termos da Licença Pública Geral Affero GNU (AGPLv3) conforme
 * publicada pela Free Software Foundation.
 *
 * Este programa é distribuído na esperança de que seja útil, mas SEM
 * QUALQUER GARANTIA; sem mesmo a garantia implícita de COMERCIALIZAÇÃO
 * ou ADEQUAÇÃO A UM DETERMINADO FIM.
 */

'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { execFile, execFileSync } = require('child_process');
const cors = require('cors');
const { normalizeFolderScopeKey, createVirtualShortcut, removeVirtualShortcut, syncShortcutsCascade, mergeShortcutsAfterScan } = require('./lib/shortcut-manager');
const { searchCatalogItems } = require('./lib/search-engine');
const { atomicWriteFile } = require('./lib/atomic-store');
const TrashManager = require('./lib/trash-manager');
const { hashPin, verifyPin } = require('./lib/pin-vault');
const { findDuplicates } = require('./lib/deduplicator');
const ShareManager = require('./lib/share-manager');
const { streamDirectoryAsZip } = require('./lib/zip-exporter');
const WebdavServer = require('./lib/webdav-server');
let fflate;
try {
  fflate = require('fflate');
} catch {
  try {
    fflate = require(path.join(__dirname, 'node_modules', 'fflate'));
  } catch (err) {
    console.warn('[Server] fflate não carregado:', err.message);
  }
}
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ============================================================================
// 1. CONFIGURAÇÃO DE DIRETÓRIOS E AMBIENTE (TERMUX EXT4 + HD USB FUSE)
// ============================================================================
const PORT = Number(process.env.PORT) || 8080;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

function resolveActiveStorageDir() {
  // 1. Caminhos conhecidos de HDs externos USB conectados via OTG no Fire Stick
  const knownUsbCandidates = [
    process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : null,
    '/storage/32AB-1915/Android/data/com.termux/files/hub_data',
    '/storage/31E0-19FD/Android/data/com.termux/files/hub_data',
  ].filter(Boolean);

  for (const candidate of knownUsbCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. Se estiver no Fire Stick / Android, escaneia dinamicamente /storage por HDs USB reais
  try {
    if (fs.existsSync('/storage')) {
      const entries = fs.readdirSync('/storage', { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name === 'emulated' || ent.name === 'self') continue;

        // Tenta o diretório privado do Termux no HD USB (permissão total de leitura e escrita sem SAF)
        const candidateHub = path.join('/storage', ent.name, 'Android/data/com.termux/files/hub_data');
        if (fs.existsSync(candidateHub)) {
          return candidateHub;
        }

        // Se o HD acabou de ser formatado, cria automaticamente a pasta do Termux no HD
        try {
          fs.mkdirSync(candidateHub, { recursive: true });
          if (fs.existsSync(candidateHub)) {
            console.log(`[StorageDiscovery] HD USB inicializado com sucesso em: ${candidateHub}`);
            return candidateHub;
          }
        } catch {}

        // Tenta pasta raiz hub_data
        const candidateRoot = path.join('/storage', ent.name, 'hub_data');
        if (fs.existsSync(candidateRoot)) {
          return candidateRoot;
        }
        try {
          fs.mkdirSync(candidateRoot, { recursive: true });
          if (fs.existsSync(candidateRoot)) {
            return candidateRoot;
          }
        } catch {}

        // Tenta pasta portfolio ou raiz do drive
        const portDir = path.join('/storage', ent.name, 'portfolio');
        if (fs.existsSync(portDir)) {
          return path.join('/storage', ent.name);
        }

        // Se o drive estiver montado e acessível, usa o próprio ponto de montagem
        try {
          fs.accessSync(path.join('/storage', ent.name), fs.constants.R_OK);
          return path.join('/storage', ent.name);
        } catch {}
      }
    }
  } catch {}

  // 3. Fallback seguro para contingência local ou ambiente dev
  const fallback = path.join(__dirname, 'storage');
  try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
  return fallback;
}

let STORAGE_DIR = resolveActiveStorageDir();

function refreshStorageDir() {
  const detected = resolveActiveStorageDir();
  if (detected !== STORAGE_DIR) {
    console.log(`[StorageDiscovery] Ponto de montagem alterado: ${STORAGE_DIR} -> ${detected}`);
    STORAGE_DIR = detected;
  }
  return STORAGE_DIR;
}

// Watchdog de hotplug USB a cada 3 segundos
setInterval(refreshStorageDir, 3000);

function isExternalStorageMounted() {
  if (process.platform !== 'android') {
    return true;
  }
  refreshStorageDir();
  const current = STORAGE_DIR;
  const isInternal =
    current.startsWith('/data/data/') ||
    current.startsWith('/data/user/') ||
    current.startsWith('/storage/emulated') ||
    current.startsWith('/sdcard') ||
    current === path.join(__dirname, 'storage');
  return !isInternal && fs.existsSync(current);
}
const trashManager = new TrashManager(STORAGE_DIR);
const INTERNAL_DATA_DIR = path.resolve(process.env.INTERNAL_DATA_DIR || path.join(__dirname, 'data'));
const INTERNAL_THUMBS_DIR = path.join(INTERNAL_DATA_DIR, 'thumbs');
const SHARES_FILE_PATH = path.join(INTERNAL_DATA_DIR, 'shares.json');
const shareManager = new ShareManager(SHARES_FILE_PATH);

function resolvePortfolioDir() {
  if (process.env.PORTFOLIO_DIR) {
    const custom = path.resolve(process.env.PORTFOLIO_DIR);
    try { fs.mkdirSync(custom, { recursive: true }); } catch {}
    if (fs.existsSync(custom)) return custom;
  }
  const vaultPortI = path.join(STORAGE_DIR, 'vault/Stangorlini/portifolio');
  const vaultPortE = path.join(STORAGE_DIR, 'vault/Stangorlini/portfolio');
  if (fs.existsSync(vaultPortI)) return vaultPortI;
  if (fs.existsSync(vaultPortE)) return vaultPortE;

  const defaultPort = path.join(STORAGE_DIR, 'portfolio');
  try { fs.mkdirSync(defaultPort, { recursive: true }); } catch {}
  return defaultPort;
}

// 3 Zonas Físicas (por padrão dentro de STORAGE_DIR, mas podem ser mapeadas para HDs diferentes)
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(STORAGE_DIR, 'media'));
const PORTFOLIO_DIR = resolvePortfolioDir();
const PORTFOLIO_ORIGINALS_DIR = path.join(PORTFOLIO_DIR, 'originals');
const PORTFOLIO_THUMBS_DIR = path.join(PORTFOLIO_DIR, 'thumbs');
const PORTFOLIO_BACKUP_CATALOG = path.join(PORTFOLIO_DIR, 'catalog.json');
const VAULT_DIR = path.resolve(process.env.VAULT_DIR || path.join(STORAGE_DIR, 'vault'));

function isPortfolioRelatedRelPath(p) {
  if (!p) return false;
  const n = String(p).toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
  return (
    n.startsWith('portfolio') ||
    n.startsWith('portifolio') ||
    n.startsWith('stangorlini/portfolio') ||
    n.startsWith('stangorlini/portifolio')
  );
}

// Garante auto-criação inicial das zonas essenciais
for (const dir of [
  INTERNAL_DATA_DIR,
  INTERNAL_THUMBS_DIR,
  STORAGE_DIR,
  MEDIA_DIR,
  PORTFOLIO_DIR,
  PORTFOLIO_ORIGINALS_DIR,
  PORTFOLIO_THUMBS_DIR,
  VAULT_DIR,
]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

// Índice Primário no ext4 interno rápido do Termux (evita spin-up do HD e bugs FUSE)
const PRIMARY_CATALOG_PATH = path.join(INTERNAL_DATA_DIR, 'catalog.json');
const PUBLIC_WEB_DIR = path.join(__dirname, 'public');

const API_SECRET_KEY = process.env.API_SECRET_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || API_SECRET_KEY || '';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`${API_SECRET_KEY}:firestick-session:${__dirname}`).digest('hex');

const DEFAULT_PORTFOLIO_TITLE = process.env.PORTFOLIO_TITLE || 'João Stangorlini';
const DEFAULT_PORTFOLIO_SUBTITLE =
  process.env.PORTFOLIO_SUBTITLE ||
  'Ensaios visuais, registros de rua, ciência em movimento e experimentos ópticos.';
const DEFAULT_PORTFOLIO_ACCENT_TAG = 'Comunicador - fotógrafo - desenvolvedor';
const THUMB_SIG_INDEX_PATH = path.join(INTERNAL_THUMBS_DIR, 'sig_index.json');

// Limite de 98 MB por requisição (abaixo do teto de 100 MB do Cloudflare Tunnel)
const MAX_SINGLE_UPLOAD_BYTES = 98 * 1024 * 1024;
const SESSION_COOKIE_NAME = 'fs_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

for (const dir of [
  INTERNAL_DATA_DIR,
  INTERNAL_THUMBS_DIR,
  MEDIA_DIR,
  PORTFOLIO_DIR,
  PORTFOLIO_ORIGINALS_DIR,
  PORTFOLIO_THUMBS_DIR,
  VAULT_DIR,
]) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`[Aviso] Diretório inicial inacessível ${dir}:`, err.message);
  }
}

// ============================================================================
// 2. UTILITÁRIOS DE SEGURANÇA, MIME E ANTI-PATH TRAVERSAL
// ============================================================================
const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
};

function getMimeType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function classifyFileKind(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg', '.bmp'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.txt', '.md', '.json', '.csv', '.js', '.css', '.py', '.sh'].includes(ext)) return 'text';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
  return 'other';
}

function sanitizeFilename(rawName) {
  const base = path.basename(String(rawName || 'arquivo')).replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').trim();
  if (!base || base === '.' || base === '..') return `arquivo_${Date.now()}`;
  return base.slice(0, 180);
}

function sanitizeAlbumName(rawAlbum) {
  const cleaned = String(rawAlbum || '')
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned.toLowerCase() === 'originals' || cleaned.toLowerCase() === 'thumbs') {
    return 'Destaques';
  }
  return cleaned;
}

function sanitizeSubalbumPath(rawSub) {
  if (!rawSub) return null;
  const parts = String(rawSub)
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) =>
      seg
        .replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
    )
    .filter((seg) => seg && seg !== '.' && seg !== '..' && seg.toLowerCase() !== 'originals' && seg.toLowerCase() !== 'thumbs')
    .slice(0, 3);
  return parts.length > 0 ? parts.join('/') : null;
}

async function moveFileSafe(src, dest) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if (err && (err.code === 'EXDEV' || err.code === 'EPERM' || err.code === 'EBUSY')) {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src).catch(() => {});
    } else {
      throw err;
    }
  }
}

async function moveDirectoryContentsRecursive(srcDir, destDir) {
  await fs.promises.mkdir(destDir, { recursive: true });
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(srcDir, ent.name);
    const destPath = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      await moveDirectoryContentsRecursive(srcPath, destPath);
      await fs.promises.rm(srcPath, { recursive: true, force: true }).catch(() => {});
    } else if (ent.isFile()) {
      await moveFileSafe(srcPath, destPath);
    }
  }
  await fs.promises.rm(srcDir, { recursive: true, force: true }).catch(() => {});
}

// Renomeação segura em sistemas FAT32/exFAT case-insensitive e Android FUSE
async function renameDirectorySafeFAT32(oldDir, newDir) {
  if (!fs.existsSync(oldDir) || path.resolve(oldDir) === path.resolve(newDir)) return;
  await fs.promises.mkdir(path.dirname(newDir), { recursive: true });

  const isCaseOnlyRename =
    path.resolve(oldDir).toLowerCase() === path.resolve(newDir).toLowerCase() &&
    path.resolve(oldDir) !== path.resolve(newDir);

  if (isCaseOnlyRename) {
    const tempDir = `${oldDir}__tmp_${Date.now()}`;
    try {
      await fs.promises.rename(oldDir, tempDir);
      await fs.promises.rename(tempDir, newDir);
      return;
    } catch {
      if (fs.existsSync(tempDir)) {
        await moveDirectoryContentsRecursive(tempDir, newDir);
        return;
      }
    }
  }

  if (!fs.existsSync(newDir)) {
    try {
      await fs.promises.rename(oldDir, newDir);
      return;
    } catch {}
  }

  await moveDirectoryContentsRecursive(oldDir, newDir);
}

function resolveSafeChildPath(rootDir, unsafeRelative = '') {
  const raw = String(unsafeRelative || '');
  if (raw.includes('\0')) {
    const err = new Error('Caminho inválido.');
    err.statusCode = 400;
    throw err;
  }
  const normalizedRel = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, normalizedRel);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    const err = new Error('Acesso fora do diretório permitido bloqueado.');
    err.statusCode = 400;
    throw err;
  }
  return resolvedTarget;
}

function timingSafeMatch(candidate, secret) {
  if (!candidate || !secret) return false;
  const hashA = crypto.createHash('sha256').update(String(candidate)).digest();
  const hashB = crypto.createHash('sha256').update(String(secret)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function parseCookies(cookieHeader) {
  const map = {};
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        map[k] = decodeURIComponent(v);
      } catch {
        map[k] = v;
      }
    }
  }
  return map;
}

function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiresStr, nonce, sig] = parts;
  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${expiresStr}.${nonce}`).digest('hex');
  return timingSafeMatch(sig, expected);
}

function isRequestAuthenticatedAdmin(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (verifySessionToken(cookies[SESSION_COOKIE_NAME])) return true;
  const authHeader = req.headers['authorization'];
  const bearerToken =
    authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
  const apiKey =
    req.headers['x-deploy-key'] ||
    req.headers['x-storage-key'] ||
    bearerToken ||
    req.query.key;
  if (!apiKey || typeof apiKey !== 'string') return false;

  const deployToken = process.env.DEPLOY_KEY || process.env.REMOTE_DEPLOY_TOKEN || '';
  if (deployToken && timingSafeMatch(apiKey, deployToken)) return true;
  if (API_SECRET_KEY && timingSafeMatch(apiKey, API_SECRET_KEY)) return true;
  if (ADMIN_PASSWORD && timingSafeMatch(apiKey, ADMIN_PASSWORD)) return true;
  return false;
}

function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null) ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Rate limit em memória para login (máx 5 falhas / 15 min por IP)
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  const recent = entry.filter((ts) => now - ts < LOGIN_WINDOW_MS);
  if (recent.length === 0) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  loginAttempts.set(ip, recent);
  if (recent.length >= LOGIN_MAX_FAILS) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (now - recent[0])) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

function recordLoginFailure(ip) {
  const list = loginAttempts.get(ip) || [];
  list.push(Date.now());
  loginAttempts.set(ip, list);
}

// ============================================================================
// 3. AJUSTE 1: CATALOG STORE (RAM + EXT4 INTERNO + MIRROR ASSÍNCRONO SEM RENAME)
// ============================================================================
const IGNORED_PORTFOLIO_DIRS = new Set([
  'originals',
  'thumbs',
  'lost+found',
  'LOST.DIR',
  '$RECYCLE.BIN',
  'System Volume Information',
  '.Trash-1000',
  'node_modules',
]);

const ALLOWED_PHOTO_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
  '.bmp',
]);

let memoryCatalog = {
  settings: {
    title: DEFAULT_PORTFOLIO_TITLE,
    subtitle: DEFAULT_PORTFOLIO_SUBTITLE,
    accentTag: 'ARCHIVE & PORTFOLIO',
  },
  albums: [],
  items: [],
};

let catalogWriteMutex = Promise.resolve();
let isSyncingPortfolio = false;

// ============================================================================
// PARSER BINÁRIO DE DIMENSÕES & ORIENTAÇÃO EXIF (BUFFER 256 KB • SEM SCAN LINEAR CEGO)
// ============================================================================
async function readImageDimensionsAndOrientation(filePath) {
  let fd = null;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    if (bytesRead < 16) return null;

    // 1. JPEG (0xFFD8)
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2;
      let orientation = 1;
      let width = null;
      let height = null;
      const exif = {};

      while (offset < bytesRead - 1) {
        if (buf[offset] !== 0xFF) {
          offset++;
          continue;
        }
        while (buf[offset] === 0xFF && offset < bytesRead) {
          offset++;
        }
        if (offset >= bytesRead) break;
        const marker = buf[offset++];

        if (marker === 0xD9 || marker === 0xDA) break; // EOI ou SOS (início do fluxo codificado)
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue; // TEM ou RSTn

        if (offset + 2 > bytesRead) break;
        const segLength = buf.readUInt16BE(offset);
        if (segLength < 2) break;

        // Se for bloco APP1 (0xE1), inspeciona cabeçalho EXIF (Little Endian II e Big Endian MM)
        if (marker === 0xE1 && offset + segLength <= bytesRead) {
          const exifHeader = buf.subarray(offset + 2, offset + 8).toString('ascii');
          if (exifHeader === 'Exif\0\0') {
            const tiffStart = offset + 8;
            if (tiffStart + 8 <= bytesRead) {
              const byteOrder = buf.subarray(tiffStart, tiffStart + 2).toString('ascii');
              const isLE = byteOrder === 'II';
              const isBE = byteOrder === 'MM';
              if (isLE || isBE) {
                const readU16 = (pos) => (isLE ? buf.readUInt16LE(pos) : buf.readUInt16BE(pos));
                const readU32 = (pos) => (isLE ? buf.readUInt32LE(pos) : buf.readUInt32BE(pos));

                const readString = (pos, count) => {
                  if (count <= 0) return '';
                  let strOffset = pos + 8;
                  if (count > 4) {
                    strOffset = tiffStart + readU32(pos + 8);
                  }
                  if (strOffset + count > bytesRead) return '';
                  return buf.subarray(strOffset, strOffset + count).toString('ascii').replace(/\0.*$/, '').trim();
                };

                const readRational = (pos) => {
                  const rOffset = tiffStart + readU32(pos + 8);
                  if (rOffset + 8 > bytesRead) return null;
                  const num = readU32(rOffset);
                  const den = readU32(rOffset + 4);
                  if (den === 0) return null;
                  return { num, den, val: num / den };
                };

                const parseDirectory = (ifdOffset, isSubIfd = false) => {
                  if (ifdOffset + 2 > bytesRead) return;
                  const numEntries = readU16(ifdOffset);
                  let entryPos = ifdOffset + 2;
                  for (let i = 0; i < numEntries && entryPos + 12 <= bytesRead; i++, entryPos += 12) {
                    const tag = readU16(entryPos);
                    const type = readU16(entryPos + 2);
                    const count = readU32(entryPos + 4);

                    if (tag === 0x0112) {
                      orientation = readU16(entryPos + 8);
                    } else if (tag === 0x010F) { // Make
                      exif.make = readString(entryPos, count);
                    } else if (tag === 0x0110) { // Model
                      exif.model = readString(entryPos, count);
                    } else if (tag === 0x8769 && !isSubIfd) { // ExifIFD pointer
                      const subOffset = tiffStart + readU32(entryPos + 8);
                      parseDirectory(subOffset, true);
                    } else if (tag === 0x829A) { // ExposureTime
                      const r = readRational(entryPos);
                      if (r) {
                        if (r.val < 1 && r.val > 0) {
                          exif.shutter = `1/${Math.round(1 / r.val)}s`;
                        } else {
                          exif.shutter = `${+r.val.toFixed(2)}s`;
                        }
                      }
                    } else if (tag === 0x829D) { // FNumber
                      const r = readRational(entryPos);
                      if (r) {
                        exif.aperture = `f/${+r.val.toFixed(1)}`;
                      }
                    } else if (tag === 0x8827) { // ISO
                      const isoVal = type === 3 ? readU16(entryPos + 8) : readU32(entryPos + 8);
                      if (isoVal) exif.iso = `ISO ${isoVal}`;
                    } else if (tag === 0x920A) { // FocalLength
                      const r = readRational(entryPos);
                      if (r) {
                        exif.focal = `${Math.round(r.val)}mm`;
                      }
                    } else if (tag === 0xA434) { // LensModel
                      exif.lens = readString(entryPos, count);
                    }
                  }
                };

                const firstIfd = readU32(tiffStart + 4);
                parseDirectory(tiffStart + firstIfd, false);
              }
            }
          }
        }

        // Marcadores SOF da imagem principal
        const isSOF = (
          marker === 0xC0 || marker === 0xC1 || marker === 0xC2 || marker === 0xC3 ||
          marker === 0xC5 || marker === 0xC6 || marker === 0xC7 ||
          marker === 0xC9 || marker === 0xCA || marker === 0xCB
        );

        if (isSOF && offset + 7 <= bytesRead) {
          height = buf.readUInt16BE(offset + 3);
          width = buf.readUInt16BE(offset + 5);
          break; // Dimensões da imagem principal capturadas com sucesso!
        }

        // Pula o segmento inteiro via salto do offset
        offset += segLength;
      }

      if (width && height) {
        // Se orientação for 5, 6, 7 ou 8 (rotação 90° ou 270°), inverte width e height para a proporção real
        if (orientation >= 5 && orientation <= 8) {
          return { width: height, height: width, orientation, exif, rawWidth: width, rawHeight: height };
        }
        return { width, height, orientation, exif, rawWidth: width, rawHeight: height };
      }
    }

    // 2. PNG (89 50 4E 47)
    if (bytesRead >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      if (buf.subarray(12, 16).toString('ascii') === 'IHDR') {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        return { width, height, orientation: 1, exif: {}, rawWidth: width, rawHeight: height };
      }
    }

    // 3. WebP (RIFF .... WEBP)
    if (bytesRead >= 30 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
      const format = buf.subarray(12, 16).toString('ascii');
      if (format === 'VP8 ' && bytesRead >= 30) {
        const width = buf.readUInt16LE(26) & 0x3FFF;
        const height = buf.readUInt16LE(28) & 0x3FFF;
        return { width, height, orientation: 1, exif: {}, rawWidth: width, rawHeight: height };
      } else if (format === 'VP8L' && bytesRead >= 25) {
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        const width = 1 + (((b1 & 0x3F) << 8) | b0);
        const height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
        return { width, height, orientation: 1, exif: {}, rawWidth: width, rawHeight: height };
      } else if (format === 'VP8X' && bytesRead >= 30) {
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width, height, orientation: 1, exif: {}, rawWidth: width, rawHeight: height };
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    if (fd) await fd.close().catch(() => {});
  }
}

const readImageHeaderAndExif = readImageDimensionsAndOrientation;

// ============================================================================
// FILA DE GERAÇÃO DE MINIATURAS (CONCORRÊNCIA MÁXIMA: 2)
// ============================================================================
let activeThumbWorkers = 0;
const thumbWaitQueue = [];

function acquireThumbWorker() {
  if (activeThumbWorkers < 2) {
    activeThumbWorkers++;
    return Promise.resolve();
  }
  return new Promise((resolve) => thumbWaitQueue.push(resolve));
}

function releaseThumbWorker() {
  activeThumbWorkers--;
  if (thumbWaitQueue.length > 0) {
    activeThumbWorkers++;
    const next = thumbWaitQueue.shift();
    next();
  }
}

async function generateThumbnailWebP(sourcePath, targetPath, maxDim = 640, format = 'webp') {
  const safeDim = Math.max(320, Math.min(1440, parseInt(maxDim, 10) || 640));
  await acquireThumbWorker();
  try {
    const isAvif = format === 'avif' || targetPath.endsWith('.avif');
    const imCmd = 'magick';
    const imFallback = 'convert';

    // Blindagem de memória e concorrência: 1 thread e 128 MB max para não disparar o LMK no Fire Stick
    const imLimits = ['-limit', 'thread', '1', '-limit', 'memory', '128MiB', '-limit', 'map', '256MiB'];
    const imArgs = isAvif
      ? [...imLimits, sourcePath, '-auto-orient', '-thumbnail', `${safeDim}x>`, '-quality', '65', '-define', 'heic:speed=6', targetPath]
      : [...imLimits, sourcePath, '-auto-orient', '-thumbnail', `${safeDim}x>`, '-quality', '72', '-define', 'webp:method=4', targetPath];

    // 1. Tenta ImageMagick v7 (magick) ou v6 (convert)
    let ok = await new Promise((resolve) => {
      execFile(imCmd, imArgs, { timeout: 15000 }, (err) => {
        if (!err) return resolve(true);
        execFile(imFallback, imArgs, { timeout: 15000 }, (err2) => resolve(!err2));
      });
    });
    if (ok && fs.existsSync(targetPath)) return true;

    // 2. Fallback: Python PIL com exif_transpose
    const usePython = await new Promise((resolve) => {
      const pyCode = `
import sys
from PIL import Image, ImageOps
try:
    dim = int(sys.argv[3])
    im = Image.open(sys.argv[1])
    im = ImageOps.exif_transpose(im)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')
    im.thumbnail((dim, dim))
    fmt = 'AVIF' if sys.argv[2].endswith('.avif') else 'WEBP'
    im.save(sys.argv[2], fmt, quality=65)
    sys.exit(0)
except Exception:
    sys.exit(1)
`;
      execFile('python3', ['-c', pyCode, sourcePath, targetPath, String(safeDim)], { timeout: 15000 }, (err) => {
        resolve(!err);
      });
    });
    if (usePython && fs.existsSync(targetPath)) return true;

    return false;
  } catch {
    return false;
  } finally {
    releaseThumbWorker();
  }
}

// ============================================================================
// SISTEMA DE MOCK EXCLUSIVO PARA DESENVOLVIMENTO LOCALHOST (OFFLINE)
// ============================================================================
function isLocalhostDevMode(req) {
  if (process.platform === 'android') return false; // NUNCA no Fire Stick
  const host = String(req.headers.host || req.hostname || '').toLowerCase().split(':')[0];
  if (host === 'storage.hublabdiv.com.br' || host.includes('hublabdiv.com.br')) return false;
  const ip = getClientIp(req);
  const isLoopbackIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1';
  return isLoopbackHost || isLoopbackIp;
}

const PUBLIC_MOCK_DIR = path.join(__dirname, 'public', 'mock');

const MOCK_ITEMS = [
  // 1. Natureza & Vida Selvagem (4 fotos)
  {
    id: 'mock_fauna_1',
    album: 'Natureza & Vida Selvagem',
    title: 'Casal de Tucanos no Galho',
    description: 'Registro da avifauna brasileira em repouso no dossel com bokeh suave.',
    originalFile: 'mock_10_toucans.jpg',
    thumbFile: 'mock_10_toucans.webp',
    width: 678,
    height: 452,
    sizeBytes: 34916,
    thumbBytes: 26624,
    exif: { camera: 'Canon EOS R5', lens: 'RF 100-500mm f/4.5-7.1 L IS USM', focalLength: '400mm', aperture: 'f/5.6', shutter: '1/800s', iso: 'ISO 400' },
  },
  {
    id: 'mock_fauna_2',
    album: 'Natureza & Vida Selvagem',
    title: 'Araras-Vermelhas em Voo na Cachoeira',
    description: 'Voo sincronizado sobre o paredão de rocha e cascata com plumagem vibrante.',
    originalFile: 'mock_08_macaws.jpg',
    thumbFile: 'mock_08_macaws.webp',
    width: 678,
    height: 452,
    sizeBytes: 20040,
    thumbBytes: 17408,
    exif: { camera: 'Sony A1', lens: 'FE 200-600mm f/5.6-6.3 G OSS', focalLength: '300mm', aperture: 'f/6.3', shutter: '1/2000s', iso: 'ISO 640' },
  },
  {
    id: 'mock_natureza_1',
    album: 'Natureza & Vida Selvagem',
    title: 'Folha de Outono & Clave Musical',
    description: 'Arte botânica e musical com recortes precisos em folha avermelhada.',
    originalFile: 'mock_02_leaf_music.jpg',
    thumbFile: 'mock_02_leaf_music.webp',
    width: 612,
    height: 326,
    sizeBytes: 17169,
    thumbBytes: 14336,
    exif: { camera: 'Canon EOS R6', lens: 'RF 100mm f/2.8 L Macro IS USM', focalLength: '100mm', aperture: 'f/2.8', shutter: '1/320s', iso: 'ISO 100' },
  },
  {
    id: 'mock_natureza_2',
    album: 'Natureza & Vida Selvagem',
    title: 'Dossel Florestal e Vórtice Solar',
    description: 'Perspectiva zenital das copas arbóreas com feixe de luz difusa atravessando o verde.',
    originalFile: 'mock_06_canopy.jpg',
    thumbFile: 'mock_06_canopy.webp',
    width: 547,
    height: 365,
    sizeBytes: 89501,
    thumbBytes: 95232,
    exif: { camera: 'Sony A7R V', lens: 'FE 14mm f/1.8 GM', focalLength: '14mm', aperture: 'f/8.0', shutter: '1/125s', iso: 'ISO 160' },
  },

  // 2. Paisagens & Horizontes (4 fotos)
  {
    id: 'mock_paisagem_1',
    album: 'Paisagens & Horizontes',
    title: 'Cataratas do Iguaçu em Queda Livre',
    description: "Enquadramento vertical capturando a força das quedas d'água e arco-íris frontal.",
    originalFile: 'mock_04_iguazu.jpg',
    thumbFile: 'mock_04_iguazu.webp',
    width: 415,
    height: 739,
    sizeBytes: 46616,
    thumbBytes: 34816,
    exif: { camera: 'Nikon Z8', lens: 'Nikkor Z 14-30mm f/4 S', focalLength: '18mm', aperture: 'f/8.0', shutter: '1/250s', iso: 'ISO 64' },
  },
  {
    id: 'mock_paisagem_2',
    album: 'Paisagens & Horizontes',
    title: 'Alvorecer Dourado na Cordilheira',
    description: 'Primeira luz do sol iluminando encostas verdejantes e relevo montanhoso.',
    originalFile: 'mock_09_mountains.jpg',
    thumbFile: 'mock_09_mountains.webp',
    width: 565,
    height: 353,
    sizeBytes: 48922,
    thumbBytes: 45056,
    exif: { camera: 'Fujifilm GFX 100S', lens: 'GF 32-64mm f/4 R LM WR', focalLength: '35mm', aperture: 'f/11', shutter: '1/30s', iso: 'ISO 100' },
  },
  {
    id: 'mock_paisagem_3',
    album: 'Paisagens & Horizontes',
    title: 'Raios de Sol na Praia Crepuscular',
    description: 'Crepúsculo costeiro com raios crepusculares projetados sobre as águas calmas.',
    originalFile: 'mock_05_beach_sunset.jpg',
    thumbFile: 'mock_05_beach_sunset.webp',
    width: 236,
    height: 423,
    sizeBytes: 16960,
    thumbBytes: 21504,
    exif: { camera: 'Sony A7 IV', lens: 'FE 24-70mm f/2.8 GM', focalLength: '28mm', aperture: 'f/5.6', shutter: '1/160s', iso: 'ISO 200' },
  },
  {
    id: 'mock_paisagem_4',
    album: 'Paisagens & Horizontes',
    title: 'Escadaria Costeira Rumo ao Oceano',
    description: 'Passarela de madeira rústica descendo a encosta em direção ao mar crepuscular.',
    originalFile: 'mock_07_stairs_sunset.jpg',
    thumbFile: 'mock_07_stairs_sunset.webp',
    width: 494,
    height: 619,
    sizeBytes: 48273,
    thumbBytes: 47104,
    exif: { camera: 'Nikon Z7 II', lens: 'Nikkor Z 24-70mm f/2.8 S', focalLength: '24mm', aperture: 'f/4.0', shutter: '1/125s', iso: 'ISO 400' },
  },

  // 3. Viagens & Ensaios (3 fotos)
  {
    id: 'mock_viagem_1',
    album: 'Viagens & Ensaios',
    title: 'Gôndola no Grande Canal de Veneza',
    description: 'Arquitetura histórica veneziana iluminada ao anoitecer com reflexos na água.',
    originalFile: 'mock_03_venice.jpg',
    thumbFile: 'mock_03_venice.webp',
    width: 525,
    height: 380,
    sizeBytes: 61359,
    thumbBytes: 58368,
    exif: { camera: 'Leica Q2', lens: 'Summilux 28mm f/1.7 ASPH', focalLength: '28mm', aperture: 'f/2.0', shutter: '1/60s', iso: 'ISO 1600' },
  },
  {
    id: 'mock_ensaio_1',
    album: 'Viagens & Ensaios',
    title: 'Companheirismo no Campo Dourado',
    description: 'Momento de conexão ao entardecer com luz suave contraluz e gramíneas.',
    originalFile: 'mock_11_dog_sunset.jpg',
    thumbFile: 'mock_11_dog_sunset.webp',
    width: 638,
    height: 480,
    sizeBytes: 38983,
    thumbBytes: 35840,
    exif: { camera: 'Canon EOS R5', lens: 'RF 85mm f/1.2 L USM', focalLength: '85mm', aperture: 'f/1.4', shutter: '1/1000s', iso: 'ISO 100' },
  },
  {
    id: 'mock_ensaio_2',
    album: 'Viagens & Ensaios',
    title: 'Expedição em Águas Turquesas',
    description: 'Vista aérea zênite de caiaques coloridos flutuando em enseada costeira translúcida.',
    originalFile: 'mock_01_kayaks.jpg',
    thumbFile: 'mock_01_kayaks.webp',
    width: 481,
    height: 360,
    sizeBytes: 40464,
    thumbBytes: 48128,
    exif: { camera: 'DJI Mavic 3 Pro', lens: 'Hasselblad 24mm f/2.8', focalLength: '24mm', aperture: 'f/2.8', shutter: '1/800s', iso: 'ISO 100' },
  },
];

let thumbSigIndex = {};

function loadThumbSigIndex() {
  try {
    if (fs.existsSync(THUMB_SIG_INDEX_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(THUMB_SIG_INDEX_PATH, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        thumbSigIndex = parsed;
      }
    }
  } catch (err) {
    console.warn('[ThumbSigIndex] Aviso ao ler sig_index.json:', err.message);
  }
}

async function persistThumbSigIndex() {
  try {
    await fs.promises.mkdir(INTERNAL_THUMBS_DIR, { recursive: true });
    await fs.promises.writeFile(THUMB_SIG_INDEX_PATH, JSON.stringify(thumbSigIndex), 'utf8');
  } catch (err) {
    console.warn('[ThumbSigIndex] Aviso ao salvar sig_index.json:', err.message);
  }
}

async function migrateThumbCacheKey(oldHash, newHash, fileSig = null) {
  if (!oldHash || !newHash) return;
  if (oldHash !== newHash) {
    for (const w of [640, 960, 1080, 540]) {
      for (const ext of ['avif', 'webp']) {
        const oldPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${oldHash}_${w}.${ext}`);
        const newPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${newHash}_${w}.${ext}`);
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
          try {
            await fs.promises.copyFile(oldPath, newPath);
          } catch {}
        }
      }
    }
  }
  if (fileSig) {
    thumbSigIndex[fileSig] = newHash;
  }
}

function normalizeLayoutSettings(rawLayout) {
  const l = rawLayout && typeof rawLayout === 'object' ? rawLayout : {};
  const validModes = new Set(['masonry', 'bento', 'justified']);
  const validFits = new Set(['natural', 'cover', 'contain', '1:1', '4:5', '3:2', '16:9']);
  const validAspects = new Set(['auto', '1:1', '4:5', '3:2', '16:9', '4/5', '3/2', '16/9', '1/1', '2/3']);
  const gapRaw = l.gapPx !== undefined ? l.gapPx : l.gridGap;
  const radiusRaw = l.borderRadiusPx !== undefined ? l.borderRadiusPx : l.cardRadius;
  const colsRaw = l.columnsDesktop !== undefined ? l.columnsDesktop : l.defaultColumns;
  const gapPx = Math.max(0, Math.min(48, Number.isFinite(Number(gapRaw)) ? Number(gapRaw) : 18));
  const borderRadiusPx = Math.max(0, Math.min(28, Number.isFinite(Number(radiusRaw)) ? Number(radiusRaw) : 14));
  const columnsDesktop = Math.max(1, Math.min(6, parseInt(colsRaw, 10) || 4));
  const freeColsRaw = l.freeViewColsCount !== undefined ? l.freeViewColsCount : 3;
  const freeViewColsCount = Math.max(1, Math.min(5, parseInt(freeColsRaw, 10) || 3));
  const rawSections = l.sections && typeof l.sections === 'object' && !Array.isArray(l.sections) ? l.sections : {};
  const rawFolderMeta = l.folderMeta && typeof l.folderMeta === 'object' && !Array.isArray(l.folderMeta) ? l.folderMeta : {};
  return {
    gridMode: validModes.has(l.gridMode) ? l.gridMode : 'masonry',
    defaultFit: validFits.has(l.defaultFit) ? l.defaultFit : 'natural',
    defaultAspect: validAspects.has(l.defaultAspect) ? l.defaultAspect : 'auto',
    gapPx,
    borderRadiusPx,
    columnsDesktop,
    gridGap: gapPx,
    cardRadius: borderRadiusPx,
    defaultColumns: columnsDesktop,
    freeViewColsCount,
    sections: rawSections,
    folderMeta: rawFolderMeta,
  };
}

function normalizeItemVisualProps(item, fallbackOrder = 0) {
  const validSpans = new Set(['1x1', '2x1', '1x2', '2x2']);
  const validFits = new Set(['inherit', 'auto', 'natural', 'cover', 'contain']);
  const validAspects = new Set(['auto', '1:1', '4:5', '3:2', '16:9', '4/5', '3/2', '16/9', '1/1', '2/3']);
  const fp = item?.focalPoint && typeof item.focalPoint === 'object' ? item.focalPoint : {};

  // Garante que o thumbUrl aponte SEMPRE para a rota de miniatura comprimida com suporte a subpastas
  let thumbUrl = item?.thumbUrl;
  const rel = item?.relativePath || (item?.album && item?.originalFile ? `${item.album}/${item.originalFile}` : '');
  if (!thumbUrl || thumbUrl.startsWith('/portfolio-media/content/')) {
    if (rel) {
      const encodedRel = rel.split('/').map(encodeURIComponent).join('/');
      thumbUrl = `/portfolio-media/thumb/${encodedRel}`;
    }
  }

  let derivedSubalbum = item?.subalbum || null;
  if (!derivedSubalbum && rel && rel.includes('/')) {
    const relParts = rel.split('/').filter(Boolean);
    if (relParts.length >= 3) {
      derivedSubalbum = relParts.slice(1, -1).join('/');
    }
  }

  return {
    ...item,
    featured: Boolean(item?.featured),
    subalbum: derivedSubalbum,
    fileSig: item?.fileSig || (item?.originalFile && item?.sizeBytes ? `${item.originalFile}_${item.sizeBytes}` : null),
    thumbUrl: thumbUrl || item?.thumbUrl,
    order: typeof item?.order === 'number' && Number.isFinite(item.order) ? item.order : fallbackOrder,
    span: validSpans.has(item?.span) ? item.span : '1x1',
    fit: validFits.has(item?.fit) ? (item.fit === 'auto' ? 'inherit' : item.fit) : 'inherit',
    aspectRatioOverride: validAspects.has(item?.aspectRatioOverride)
      ? item.aspectRatioOverride.replace('/', ':')
      : 'auto',
    focalPoint: {
      x: typeof fp.x === 'number' && Number.isFinite(fp.x) ? Math.max(0, Math.min(100, Math.round(fp.x))) : 50,
      y: typeof fp.y === 'number' && Number.isFinite(fp.y) ? Math.max(0, Math.min(100, Math.round(fp.y))) : 50,
    },
    // Sprint 1: Favoritos, Tags e Atalhos Virtuais
    isFavorite: Boolean(item?.isFavorite),
    tags: Array.isArray(item?.tags) ? item.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    isShortcut: Boolean(item?.isShortcut),
    targetId: item?.targetId ? String(item.targetId) : null,
    targetRelativePath: item?.targetRelativePath ? String(item.targetRelativePath) : null,
  };
}

function sortAlbumsByOrder(albumsArray, albumOrderArray = []) {
  const unique = Array.from(new Set((albumsArray || []).map((a) => String(a).trim()).filter(Boolean)));
  const orderList = Array.isArray(albumOrderArray)
    ? albumOrderArray.map((a) => String(a).trim()).filter(Boolean)
    : [];
  const orderMap = new Map(orderList.map((name, idx) => [name, idx]));
  return unique.sort((a, b) => {
    const hasA = orderMap.has(a);
    const hasB = orderMap.has(b);
    if (hasA && hasB) return orderMap.get(a) - orderMap.get(b);
    if (hasA) return -1;
    if (hasB) return 1;
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  });
}

function getMockCatalog() {
  const settings = memoryCatalog?.settings || {};
  const mockOverrides = settings.mockOverrides && typeof settings.mockOverrides === 'object' ? settings.mockOverrides : {};

  const mockItems = MOCK_ITEMS.filter((it) => !mockOverrides[it.id]?.deleted).map((it, idx) => {
    const ov = mockOverrides[it.id] || {};
    const album = ov.album ? sanitizeAlbumName(ov.album) : it.album;
    return normalizeItemVisualProps(
      {
        id: it.id,
        title: ov.title || it.title,
        album,
        description: ov.description !== undefined ? ov.description : it.description,
        originalFile: it.originalFile,
        relativePath: `${album}/${it.originalFile}`,
        originalUrl: `/portfolio-media/mock/original/${it.id}`,
        thumbUrl: `/portfolio-media/mock/thumb/${it.id}`,
        width: it.width,
        height: it.height,
        sizeBytes: it.sizeBytes,
        thumbBytes: it.thumbBytes,
        exif: it.exif,
        featured: Boolean(ov.featured !== undefined ? ov.featured : it.featured),
        order: ov.order !== undefined ? ov.order : idx,
        span: ov.span || '1x1',
        fit: ov.fit || 'auto',
        aspectRatioOverride: ov.aspectRatioOverride || 'auto',
        focalPoint: ov.focalPoint || { x: 50, y: 50 },
        createdAt: new Date().toISOString(),
      },
      idx
    );
  });

  const realItems = Array.isArray(memoryCatalog?.items)
    ? memoryCatalog.items.map((it, idx) => normalizeItemVisualProps(it, idx))
    : [];

  const combinedItems = (realItems.length > 0 ? realItems : mockItems).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const customAlbums = (memoryCatalog?.albums || []).filter(
    (a) => a !== 'Destaques' || combinedItems.some((it) => it.album === 'Destaques') || fs.existsSync(path.join(PORTFOLIO_DIR, 'Destaques'))
  );
  const rawAlbums = [
    ...customAlbums,
    ...(settings.albumOrder || []),
    ...combinedItems.map((it) => it.album),
  ];
  const albums = sortAlbumsByOrder(rawAlbums, settings.albumOrder);

  return {
    settings: {
      title: settings.title || DEFAULT_PORTFOLIO_TITLE,
      subtitle: settings.subtitle || DEFAULT_PORTFOLIO_SUBTITLE,
      accentTag: settings.accentTag || DEFAULT_PORTFOLIO_ACCENT_TAG,
      layout: normalizeLayoutSettings(settings.layout),
      albumOrder: albums,
    },
    albums,
    items: combinedItems,
  };
}

function buildMockSvg(item, isOriginal) {
  const w = item.width;
  const h = item.height;
  const ratio = (w / h).toFixed(2);
  let orientationLabel = 'QUADRADA 1:1';
  if (w > h * 1.8) orientationLabel = 'PANORÂMICA 21:9';
  else if (w > h * 1.2) orientationLabel = 'HORIZONTAL ' + (Math.abs(w / h - 16 / 9) < 0.1 ? '16:9' : '3:2');
  else if (h > w * 1.5) orientationLabel = 'VERTICAL ' + (Math.abs(h / w - 16 / 9) < 0.1 ? '9:16' : '2:3');
  else if (h > w) orientationLabel = 'VERTICAL ' + (Math.abs(h / w - 5 / 4) < 0.1 ? '4:5' : '3:4');

  const themeColors = {
    'Astrofotografia & Cosmos': ['#090518', '#190a36', '#3b126d', '#ffd700', '#00f0ff'],
    'Arquitetura & Geometria': ['#0d0d12', '#1a1824', '#2d273a', '#e5c07b', '#98c379'],
    'Ensaios Retrato': ['#140714', '#260b24', '#47143f', '#ffb86c', '#ff79c6'],
    'Assembleia & Fotojornalismo': ['#080c18', '#0f182e', '#192b4f', '#f1fa8c', '#ff5555'],
    'Natureza & Macro': ['#05120d', '#0b2419', '#143d2c', '#50fa7b', '#8be9fd'],
  }[item.album] || ['#0d0818', '#1c1033', '#321959', '#ffd700', '#bd93f9'];

  const [c1, c2, c3, gold, accent] = themeColors;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="50%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <pattern id="gridMajor" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="${gold}" stroke-opacity="0.14" stroke-width="1.2"/>
      <circle cx="0" cy="0" r="2" fill="${gold}" fill-opacity="0.3"/>
    </pattern>
    ${
      isOriginal
        ? `<pattern id="gridMinor" width="16" height="16" patternUnits="userSpaceOnUse">
      <path d="M 16 0 L 0 0 0 16" fill="none" stroke="${accent}" stroke-opacity="0.08" stroke-width="0.6"/>
    </pattern>`
        : ''
    }
  </defs>

  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  ${isOriginal ? '<rect width="100%" height="100%" fill="url(#gridMinor)"/>' : ''}
  <rect width="100%" height="100%" fill="url(#gridMajor)"/>

  <rect x="16" y="16" width="${w - 32}" height="${h - 32}" fill="none" stroke="${gold}" stroke-opacity="0.35" stroke-width="1.5"/>

  <line x1="${w / 3}" y1="0" x2="${w / 3}" y2="${h}" stroke="${gold}" stroke-opacity="0.12" stroke-dasharray="6,6"/>
  <line x1="${(w * 2) / 3}" y1="0" x2="${(w * 2) / 3}" y2="${h}" stroke="${gold}" stroke-opacity="0.12" stroke-dasharray="6,6"/>
  <line x1="0" y1="${h / 3}" x2="${w}" y2="${h / 3}" stroke="${gold}" stroke-opacity="0.12" stroke-dasharray="6,6"/>
  <line x1="0" y1="${(h * 2) / 3}" x2="${w}" y2="${(h * 2) / 3}" stroke="${gold}" stroke-opacity="0.12" stroke-dasharray="6,6"/>

  <g transform="translate(${w / 2}, ${h / 2})">
    <circle r="180" fill="none" stroke="${gold}" stroke-opacity="0.25" stroke-width="1.5"/>
    <circle r="120" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5"/>
    <circle r="60" fill="none" stroke="${gold}" stroke-opacity="0.5" stroke-width="1.5"/>
    <circle r="20" fill="none" stroke="${accent}" stroke-opacity="0.8" stroke-width="1.5"/>
    <circle r="4" fill="${gold}"/>
    <line x1="-220" y1="0" x2="220" y2="0" stroke="${gold}" stroke-opacity="0.4"/>
    <line x1="0" y1="-220" x2="0" y2="220" stroke="${gold}" stroke-opacity="0.4"/>
  </g>

  <text x="${w / 2}" y="${h / 2 - 70}" fill="${gold}" font-family="sans-serif" font-size="${Math.max(20, Math.round(w / 38))}" font-weight="800" text-anchor="middle" letter-spacing="1">${item.title.toUpperCase()}</text>
  <text x="${w / 2}" y="${h / 2 - 35}" fill="${accent}" font-family="monospace" font-size="${Math.max(14, Math.round(w / 60))}" font-weight="700" text-anchor="middle">${orientationLabel} • ${w} × ${h} PX (RATIO ${ratio})</text>
  
  <text x="${w / 2}" y="${h / 2 + 65}" fill="#ffffff" fill-opacity="0.9" font-family="monospace" font-size="${Math.max(13, Math.round(w / 64))}" text-anchor="middle">${item.exif.camera} • ${item.exif.lens}</text>
  <text x="${w / 2}" y="${h / 2 + 95}" fill="${gold}" fill-opacity="0.85" font-family="monospace" font-size="${Math.max(12, Math.round(w / 70))}" text-anchor="middle">${item.exif.focalLength} • ${item.exif.aperture} • ${item.exif.shutter} • ${item.exif.iso}</text>
  
  <text x="32" y="${h - 32}" fill="${gold}" fill-opacity="0.6" font-family="monospace" font-size="12">JOÃO PAULO STANGORLINI // ${item.album.toUpperCase()}</text>
  <text x="${w - 32}" y="${h - 32}" fill="${accent}" fill-opacity="0.7" font-family="monospace" font-size="12" text-anchor="end">${isOriginal ? 'ORIGINAL ALTA RESOLUÇÃO (TESTE ZOOM ATÉ 25X)' : 'PREVIEW COMPRIMIDO 960PX'}</text>
</svg>
  `.trim();
}

function normalizeCatalogShape(raw) {
  const settings = raw && typeof raw.settings === 'object' ? raw.settings : {};
  const items = Array.isArray(raw?.items)
    ? raw.items.map((it, idx) => normalizeItemVisualProps(it, idx)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  const itemAlbumsSet = new Set(items.map((it) => it.album).filter(Boolean));
  const preferredMainOrder = [
    'POLÍTICAS',
    'EVENTOS',
    'FESTAS',
    'SHOW DE FISICA',
    'STREET-TRILHAS',
    'USP',
    'BAHIA',
    'CIENTEC',
  ];
  const rawAlbumOrder = Array.isArray(settings.albumOrder)
    ? settings.albumOrder.map((a) => String(a).trim()).filter(Boolean)
    : [];
  const rawAlbums = Array.isArray(raw?.albums) && raw.albums.length > 0
    ? raw.albums.map((a) => String(a).trim()).filter(Boolean)
    : [];
  const effectiveOrder =
    rawAlbumOrder.length > 0 && preferredMainOrder.includes(rawAlbumOrder[0])
      ? rawAlbumOrder
      : [...preferredMainOrder, ...rawAlbumOrder];
  const allCandidateAlbums = [...rawAlbums, ...effectiveOrder].filter(
    (a) => itemAlbumsSet.size === 0 || itemAlbumsSet.has(a) || fs.existsSync(path.join(PORTFOLIO_DIR, a))
  );
  const albums = sortAlbumsByOrder(
    allCandidateAlbums.length > 0 ? allCandidateAlbums : [...rawAlbums, ...effectiveOrder],
    effectiveOrder
  );
  const subalbums = raw?.subalbums && typeof raw.subalbums === 'object' ? raw.subalbums : {};

  let cleanTitle = String(settings.title || DEFAULT_PORTFOLIO_TITLE).trim();
  if (
    cleanTitle === 'JOÃO PAULO STANGORLINI — PORTFOLIO' ||
    cleanTitle === 'JOÃO PAULO STANGORLINI'
  ) {
    cleanTitle = DEFAULT_PORTFOLIO_TITLE;
  }

  let cleanSubtitle = String(settings.subtitle ?? DEFAULT_PORTFOLIO_SUBTITLE).trim();
  if (
    cleanSubtitle === 'Fotografia, Ciência & Registro Visual' ||
    cleanSubtitle === 'Comunicador - fotógrafo - desenvolvedor'
  ) {
    cleanSubtitle = DEFAULT_PORTFOLIO_SUBTITLE;
  }

  let cleanAccentTag = String(settings.accentTag || DEFAULT_PORTFOLIO_ACCENT_TAG).trim();
  if (cleanAccentTag === 'ARCHIVE & PORTFOLIO') {
    cleanAccentTag = DEFAULT_PORTFOLIO_ACCENT_TAG;
  }

  return {
    settings: {
      title: cleanTitle.slice(0, 120),
      subtitle: cleanSubtitle.slice(0, 220),
      accentTag: cleanAccentTag.slice(0, 60),
      layout: normalizeLayoutSettings(settings.layout),
      albumOrder: albums,
      mockOverrides: settings.mockOverrides && typeof settings.mockOverrides === 'object' ? settings.mockOverrides : {},
    },
    albums,
    subalbums,
    items,
  };
}

async function syncPortfolioFromDiskAsync(options = {}) {
  const force = Boolean(options && (options.force || options.forceResetIfEmpty));
  if (isSyncingPortfolio) return memoryCatalog;
  isSyncingPortfolio = true;

  try {
    if (!fs.existsSync(PORTFOLIO_DIR)) {
      return memoryCatalog;
    }

    const dirEntries = await fs.promises.readdir(PORTFOLIO_DIR, { withFileTypes: true });
    const albumDirs = dirEntries
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !IGNORED_PORTFOLIO_DIRS.has(d.name))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    // Mapa de itens existentes por relativePath, id ou fileSig (para preservar metadados e miniaturas ao mover pastas)
    const existingMap = new Map();
    const existingBySig = new Map();
    for (const item of memoryCatalog.items || []) {
      const key = item.relativePath || (item.album && item.originalFile ? `${item.album}/${item.originalFile}` : item.id);
      existingMap.set(key, item);
      if (item.id) existingMap.set(item.id, item);
      const sig = item.fileSig || (item.originalFile && item.sizeBytes ? `${item.originalFile}_${item.sizeBytes}` : null);
      if (sig && !existingBySig.has(sig)) {
        existingBySig.set(sig, item);
      }
    }

    const newItems = [];
    const discoveredAlbums = new Set(albumDirs);
    const subalbumsMap = {};
    for (const a of albumDirs) {
      subalbumsMap[a] = [];
    }

    let runningOrder = 0;
    let sigIndexDirty = false;

    // Escaneamento recursivo seguro (suporta até 3 níveis de subpastas/subálbuns)
    async function scanDirectoryRecursive(dirPath, relPrefix, rootAlbum, currentSubalbum = null, depth = 0) {
      let entries = [];
      try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;

        if (ent.isDirectory()) {
          if (IGNORED_PORTFOLIO_DIRS.has(ent.name) || depth >= 3) continue;
          const nextSubalbum = currentSubalbum ? `${currentSubalbum}/${ent.name}` : ent.name;
          if (subalbumsMap[rootAlbum] && !subalbumsMap[rootAlbum].includes(nextSubalbum)) {
            subalbumsMap[rootAlbum].push(nextSubalbum);
          }
          await scanDirectoryRecursive(
            path.join(dirPath, ent.name),
            `${relPrefix}/${ent.name}`,
            rootAlbum,
            nextSubalbum,
            depth + 1
          );
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase();
          if (!ALLOWED_PHOTO_EXTS.has(ext)) continue;

          const relPath = `${relPrefix}/${ent.name}`;
          const cacheKey = crypto.createHash('md5').update(relPath).digest('hex');
          const id = `pf_${cacheKey.slice(0, 16)}`;
          let existing = existingMap.get(relPath) || existingMap.get(id);

          let sizeBytes = existing?.sizeBytes || 0;
          let createdAt = existing?.createdAt || null;
          let mtimeMs = Date.now();

          const fullPath = path.join(dirPath, ent.name);
          if (!existing || !sizeBytes) {
            try {
              const st = await fs.promises.stat(fullPath);
              sizeBytes = st.size;
              createdAt = st.mtime.toISOString();
              mtimeMs = st.mtimeMs || st.mtime.getTime();
            } catch {}
          } else if (existing) {
            try {
              const st = await fs.promises.stat(fullPath);
              mtimeMs = st.mtimeMs || st.mtime.getTime();
            } catch {}
          }

          const fileSig = sizeBytes > 0 ? `${ent.name}_${sizeBytes}` : null;
          if (!existing && fileSig && existingBySig.has(fileSig)) {
            existing = existingBySig.get(fileSig);
          }

          // Migração automática de miniatura .avif por assinatura fileSig caso o arquivo tenha mudado de pasta
          if (fileSig) {
            const prevHash = thumbSigIndex[fileSig] || (existing?.relativePath ? crypto.createHash('md5').update(existing.relativePath).digest('hex') : null);
            if (prevHash && prevHash !== cacheKey) {
              await migrateThumbCacheKey(prevHash, cacheKey, fileSig);
              sigIndexDirty = true;
            } else if (!thumbSigIndex[fileSig]) {
              thumbSigIndex[fileSig] = cacheKey;
              sigIndexDirty = true;
            }
          }

          let width = existing?.width;
          let height = existing?.height;
          let exif = existing?.exif;
          let exifMtimeMs = existing?.exifMtimeMs;

          if (!width || !height || (width === 1600 && height === 1067) || !exif || exifMtimeMs !== mtimeMs) {
            const dims = await readImageDimensionsAndOrientation(fullPath);
            if (dims && dims.width && dims.height) {
              width = dims.width;
              height = dims.height;
            } else {
              width = width || 1600;
              height = height || 1067;
            }
            if (dims && dims.exif) {
              exif = dims.exif;
            } else {
              exif = exif || {};
            }
            exifMtimeMs = mtimeMs;
          }

          const baseName = path.basename(ent.name, path.extname(ent.name));
          const encodedRel = relPath.split('/').map(encodeURIComponent).join('/');
          const contentUrl = `/portfolio-media/content/${encodedRel}`;
          const thumbUrl = `/portfolio-media/thumb/${encodedRel}?v=${Math.floor(mtimeMs)}`;

          newItems.push(
            normalizeItemVisualProps(
              {
                id,
                title: existing?.title || baseName,
                album: rootAlbum,
                subalbum: currentSubalbum,
                description: existing?.description || '',
                originalFile: ent.name,
                relativePath: relPath,
                fileSig,
                originalUrl: contentUrl,
                thumbUrl: thumbUrl,
                width,
                height,
                sizeBytes,
                thumbBytes: existing?.thumbBytes || 0,
                exif: exif || {},
                exifMtimeMs: exifMtimeMs || mtimeMs,
                featured: Boolean(existing?.featured),
                visibility: existing?.visibility || 'public',
                order: existing?.order !== undefined ? existing.order : runningOrder,
                span: existing?.span || '1x1',
                fit: existing?.fit || 'auto',
                aspectRatioOverride: existing?.aspectRatioOverride || 'auto',
                focalPoint: existing?.focalPoint || { x: 50, y: 50 },
                createdAt: createdAt || new Date().toISOString(),
              },
              runningOrder
            )
          );
          runningOrder++;
        }
      }
    }

    for (const albumName of albumDirs) {
      await scanDirectoryRecursive(path.join(PORTFOLIO_DIR, albumName), albumName, albumName, null, 0);
    }

    // Se houver fotos na pasta legada originals/ que não estão em álbuns
    if (fs.existsSync(PORTFOLIO_ORIGINALS_DIR)) {
      try {
        const origFiles = await fs.promises.readdir(PORTFOLIO_ORIGINALS_DIR, { withFileTypes: true });
        for (const f of origFiles) {
          if (!f.isFile() || f.name.startsWith('.')) continue;
          const ext = path.extname(f.name).toLowerCase();
          if (!ALLOWED_PHOTO_EXTS.has(ext)) continue;
          const key = `originals/${f.name}`;
          const existing = existingMap.get(key) || existingMap.get(f.name);
          if (existing && !newItems.some((it) => it.id === existing.id)) {
            newItems.push(normalizeItemVisualProps(existing, runningOrder++));
            if (existing.album) discoveredAlbums.add(existing.album);
          }
        }
      } catch {}
    }

    // Se nenhuma foto física for encontrada no disco:
    // Se force for true ou se não existirem pastas de álbuns no disco, o catálogo é atualizado para 0 itens (acervo limpo)
    if (newItems.length === 0) {
      if (force || albumDirs.length === 0) {
        console.log('[PortfolioSync] Acervo vazio no disco físico (0 fotos encontradas). Atualizando catálogo para 0 itens.');
        memoryCatalog.items = [];
        memoryCatalog.albums = [];
        memoryCatalog.subalbums = {};
        dirStatsCache.portfolio = { bytes: 0, count: 0 };
        await persistCatalog();
        return memoryCatalog;
      }
      console.log(`[PortfolioSync] Disco físico sem fotos (0 encontradas). Preservando catálogo em memória com ${memoryCatalog.items.length} itens.`);
      return memoryCatalog;
    }

    // Preserva Atalhos Virtuais válidos cujo targetId ainda exista nos itens físicos escaneados
    const mergedWithShortcuts = mergeShortcutsAfterScan(memoryCatalog.items || [], newItems);
    mergedWithShortcuts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Garante que catalog.albums contenha APENAS os nomes dos álbuns principais raiz
    const cleanDiscoveredRoots = Array.from(discoveredAlbums)
      .map((a) => String(a).split('/')[0].trim())
      .filter(Boolean);
    memoryCatalog.albums = sortAlbumsByOrder(Array.from(new Set(cleanDiscoveredRoots)), memoryCatalog.settings?.albumOrder);

    if (memoryCatalog.settings) {
      const prevOrder = Array.isArray(memoryCatalog.settings.albumOrder) ? memoryCatalog.settings.albumOrder : [];
      const validMockSet = new Set(MOCK_ITEMS.map((it) => it.album));
      const validDiscoveredSet = new Set(memoryCatalog.albums);
      const filteredPrev = prevOrder.filter((a) => validDiscoveredSet.has(a) || validMockSet.has(a));
      memoryCatalog.settings.albumOrder = Array.from(new Set([...filteredPrev, ...memoryCatalog.albums]));
    }
    memoryCatalog.subalbums = subalbumsMap;
    memoryCatalog.items = mergedWithShortcuts;
    if (sigIndexDirty) {
      persistThumbSigIndex();
    }
    await persistCatalog();

    // Atualiza contadores de telemetria da zona portfolio
    let totalPortfolioBytes = 0;
    for (const it of newItems) {
      totalPortfolioBytes += it.sizeBytes || 0;
    }
    dirStatsCache.portfolio = {
      bytes: totalPortfolioBytes,
      count: newItems.length,
    };
  } catch (err) {
    console.warn('[PortfolioSync] Erro ao sincronizar pastas do disco:', err.message);
  } finally {
    isSyncingPortfolio = false;
    scheduleThumbPregeneration();
  }

  return memoryCatalog;
}

// ============================================================================
// FILA DE PRÉ-GERAÇÃO DE MINIATURAS (REDE DE SEGURANÇA)
// Caminho principal: miniaturas WebP geradas no navegador durante o upload.
// Esta fila só gera o que estiver faltando (ex.: fotos copiadas direto no HD).
// ============================================================================
const THUMB_PREGEN_START_DELAY_MS = 20000; // dá tempo das miniaturas client-side chegarem
const THUMB_PREGEN_GAP_MS = 400; // respiro entre itens para não saturar CPU/RAM do Fire Stick
let thumbPregenTimer = null;
let thumbPregenRunning = false;
let thumbPregenRerun = false;

function portfolioThumbCachePath(relPath, ext = 'webp') {
  const key = crypto.createHash('md5').update(relPath).digest('hex');
  return path.join(INTERNAL_THUMBS_DIR, `thumb_${key}_640.${ext}`);
}

function hasCachedPortfolioThumb(relPath) {
  return fs.existsSync(portfolioThumbCachePath(relPath, 'webp')) || fs.existsSync(portfolioThumbCachePath(relPath, 'avif'));
}

function scheduleThumbPregeneration(delayMs = THUMB_PREGEN_START_DELAY_MS) {
  if (thumbPregenRunning) {
    thumbPregenRerun = true;
    return;
  }
  if (thumbPregenTimer) clearTimeout(thumbPregenTimer);
  thumbPregenTimer = setTimeout(() => {
    thumbPregenTimer = null;
    runThumbPregeneration().catch((err) => console.warn('[ThumbPregen] Erro:', err.message));
  }, delayMs);
}

async function runThumbPregeneration() {
  if (thumbPregenRunning) return;
  thumbPregenRunning = true;
  let generated = 0;
  try {
    const items = Array.isArray(memoryCatalog.items) ? memoryCatalog.items.slice() : [];
    for (const it of items) {
      const rel = it && it.relativePath;
      if (!rel || hasCachedPortfolioThumb(rel)) continue;
      let original;
      try {
        original = resolveSafeChildPath(PORTFOLIO_DIR, rel);
      } catch {
        continue;
      }
      if (!fs.existsSync(original)) continue;
      const ok = await generateThumbnailWebP(original, portfolioThumbCachePath(rel, 'webp'), 640, 'webp');
      if (ok) generated++;
      await new Promise((r) => setTimeout(r, THUMB_PREGEN_GAP_MS));
    }
    if (generated > 0) console.log(`[ThumbPregen] ${generated} miniatura(s) faltante(s) gerada(s) no servidor.`);
  } finally {
    thumbPregenRunning = false;
    if (thumbPregenRerun) {
      thumbPregenRerun = false;
      scheduleThumbPregeneration(5000);
    }
  }
}

// ============================================================================
// MONITOR DE HOTPLUG INTELIGENTE via /proc/mounts (ZERO STAT NO HD EM STANDBY)
// ============================================================================
let lastUsbMountState = false;

function checkUsbMountFromProcMounts() {
  try {
    if (fs.existsSync('/proc/mounts')) {
      const mounts = fs.readFileSync('/proc/mounts', 'utf8');
      if (
        mounts.includes('31E0-19FD') ||
        (STORAGE_DIR.startsWith('/storage/') && mounts.includes(STORAGE_DIR.split('/').slice(0, 3).join('/')))
      ) {
        return true;
      }
      return false;
    }
  } catch {}
  return fs.existsSync(PORTFOLIO_DIR);
}

function startSmartHotplugMonitor() {
  lastUsbMountState = checkUsbMountFromProcMounts();

  setInterval(() => {
    const isMountedNow = checkUsbMountFromProcMounts();
    if (isMountedNow && !lastUsbMountState) {
      console.log('[HotplugMonitor] Transição detectada em /proc/mounts (Desconectado -> Conectado)! Sincronizando portfólio...');
      lastUsbMountState = true;
      setTimeout(() => {
        syncPortfolioFromDiskAsync().catch((err) => {
          console.warn('[HotplugMonitor] Erro na sincronização pós-hotplug:', err.message);
        });
      }, 1500);
    } else if (!isMountedNow && lastUsbMountState) {
      console.log('[HotplugMonitor] HD USB desconectado. Servindo miniaturas do cache interno ext4.');
      lastUsbMountState = false;
    }
  }, 8000);
}

function initCatalogStore() {
  loadThumbSigIndex();
  let loaded = null;

  // 1. Tenta carregar do ext4 interno rápido do Termux
  if (fs.existsSync(PRIMARY_CATALOG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(PRIMARY_CATALOG_PATH, 'utf8'));
      if (Array.isArray(data?.items)) {
        loaded = data;
      }
    } catch (err) {
      console.warn('[CatalogStore] Falha ao ler catalog.json primário (ext4):', err.message);
    }
  }

  // 2. Auto-recovery do backup no HD USB caso o ext4 não exista
  if (!loaded && fs.existsSync(PORTFOLIO_BACKUP_CATALOG)) {
    try {
      const backup = JSON.parse(fs.readFileSync(PORTFOLIO_BACKUP_CATALOG, 'utf8'));
      if (Array.isArray(backup?.items)) {
        loaded = backup;
        console.log('[CatalogStore] Catálogo restaurado a partir do backup no HD USB.');
      }
    } catch (err) {
      console.warn('[CatalogStore] Falha ao ler backup catalog.json no HD USB:', err.message);
    }
  }

  // 3. Fallback adicional para storage/portfolio/catalog.json local relativo a __dirname
  const localPortfolioCatalog = path.join(__dirname, 'storage', 'portfolio', 'catalog.json');
  if (!loaded && fs.existsSync(localPortfolioCatalog)) {
    try {
      const pCatalog = JSON.parse(fs.readFileSync(localPortfolioCatalog, 'utf8'));
      if (Array.isArray(pCatalog?.items)) {
        loaded = pCatalog;
        console.log('[CatalogStore] Catálogo restaurado a partir de storage/portfolio/catalog.json.');
      }
    } catch (err) {
      console.warn('[CatalogStore] Falha ao ler storage/portfolio/catalog.json:', err.message);
    }
  }

  // 4. Fallback para data/catalog.json relativo a __dirname
  const localDataCatalog = path.join(__dirname, 'data', 'catalog.json');
  if (!loaded && fs.existsSync(localDataCatalog)) {
    try {
      const dCatalog = JSON.parse(fs.readFileSync(localDataCatalog, 'utf8'));
      if (Array.isArray(dCatalog?.items)) {
        loaded = dCatalog;
        console.log('[CatalogStore] Catálogo restaurado a partir de data/catalog.json.');
      }
    } catch (err) {
      console.warn('[CatalogStore] Falha ao ler data/catalog.json:', err.message);
    }
  }

  if (loaded && Array.isArray(loaded.items)) {
    memoryCatalog = normalizeCatalogShape(loaded);
    // Se o primário não existia, persiste no ext4 imediatamente
    try {
      if (!fs.existsSync(PRIMARY_CATALOG_PATH)) {
        fs.writeFileSync(PRIMARY_CATALOG_PATH, JSON.stringify(memoryCatalog, null, 2), 'utf8');
        console.log(`[CatalogStore] ${memoryCatalog.items.length} itens gravados em PRIMARY_CATALOG_PATH.`);
      }
    } catch {}
  }

  // Sincroniza automaticamente com as pastas presentes no disco se montado
  if (checkUsbMountFromProcMounts()) {
    syncPortfolioFromDiskAsync().catch((e) => {
      console.warn('[CatalogStore] Falha ao auto-sincronizar disco:', e.message);
    });
  }

  startSmartHotplugMonitor();
}

function persistCatalog() {
  const snapshotJson = JSON.stringify(memoryCatalog, null, 2);

  catalogWriteMutex = catalogWriteMutex
    .then(async () => {
      // Gravação direta no ext4 interno (sem acordar o HD na leitura)
      await fs.promises.writeFile(PRIMARY_CATALOG_PATH, snapshotJson, 'utf8');

      // Espelhamento assíncrono no HD USB apenas se estiver montado em /proc/mounts
      if (checkUsbMountFromProcMounts()) {
        try {
          await fs.promises.writeFile(PORTFOLIO_BACKUP_CATALOG, snapshotJson, 'utf8');
        } catch (usbErr) {
          console.warn('[CatalogStore] Aviso ao espelhar catalog.json no FUSE USB:', usbErr.message);
        }
      }
    })
    .catch((err) => {
      console.error('[CatalogStore] Erro na fila de persistência:', err.message);
    });

  return catalogWriteMutex;
}

const saveCatalogToFile = persistCatalog;

// ============================================================================
// 4. AJUSTE 2: TELEMETRY CACHE O(1) EM MEMÓRIA (ZERO THRASHING DE DISCO)
// ============================================================================
const dirStatsCache = {
  media: { bytes: 0, count: 0 },
  portfolio: { bytes: 0, count: 0 },
  vault: { bytes: 0, count: 0 },
  lastCalculatedAt: null,
  isScanning: false,
};

let zoneMutationEpoch = 0;
let activeScanPromise = null;

function adjustZoneStats(zone, deltaBytes, deltaCount) {
  zoneMutationEpoch += 1;
  const slot = dirStatsCache[zone];
  if (!slot) return;
  slot.bytes = Math.max(0, slot.bytes + (Number(deltaBytes) || 0));
  slot.count = Math.max(0, slot.count + (Number(deltaCount) || 0));
}

async function scanDirectoryRecursiveAsync(targetDir, ignoreFilename = null) {
  let totalBytes = 0;
  let totalCount = 0;

  async function walk(currentDir) {
    let dirHandle;
    try {
      dirHandle = await fs.promises.opendir(currentDir);
    } catch {
      return;
    }
    for await (const dirent of dirHandle) {
      if (ignoreFilename && dirent.name === ignoreFilename) continue;
      const fullPath = path.join(currentDir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(fullPath);
      } else if (dirent.isFile()) {
        try {
          const st = await fs.promises.stat(fullPath);
          totalBytes += st.size;
          totalCount += 1;
        } catch {}
      }
    }
  }

  await walk(targetDir);
  return { bytes: totalBytes, count: totalCount };
}

async function recalculateAllZonesAsync() {
  if (activeScanPromise) return activeScanPromise;
  dirStatsCache.isScanning = true;

  activeScanPromise = (async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const epochBefore = zoneMutationEpoch;
        const [mediaStats, portfolioStats, vaultStats] = await Promise.all([
          scanDirectoryRecursiveAsync(MEDIA_DIR),
          scanDirectoryRecursiveAsync(PORTFOLIO_DIR, 'catalog.json'),
          scanDirectoryRecursiveAsync(VAULT_DIR),
        ]);
        if (zoneMutationEpoch === epochBefore || attempt === 2) {
          dirStatsCache.media = mediaStats;
          dirStatsCache.portfolio = portfolioStats;
          dirStatsCache.vault = vaultStats;
          dirStatsCache.lastCalculatedAt = new Date().toISOString();
          break;
        }
      }
    } catch (err) {
      console.warn('[TelemetryCache] Erro ao escanear diretórios:', err.message);
    } finally {
      dirStatsCache.isScanning = false;
      activeScanPromise = null;
    }
    return dirStatsCache;
  })();

  return activeScanPromise;
}

function formatCommercialDiskSize(totalBytes) {
  if (!totalBytes || totalBytes <= 0) return '';
  const gb = Math.round(totalBytes / 1e9);
  if (gb >= 900 && gb <= 1100) return '1 TB comercial';
  if (gb >= 680 && gb <= 780) return '750 GB comercial';
  if (gb >= 450 && gb <= 550) return '500 GB comercial';
  if (gb >= 220 && gb <= 260) return '250 GB comercial';
  return `${gb} GB comercial`;
}

const DISK_SNAPSHOT_FILE = path.join(INTERNAL_DATA_DIR, 'disk_snapshot.json');
let lastKnownDiskCapacity = null;
try {
  if (fs.existsSync(DISK_SNAPSHOT_FILE)) {
    lastKnownDiskCapacity = JSON.parse(fs.readFileSync(DISK_SNAPSHOT_FILE, 'utf8'));
  }
} catch {}

function saveDiskCapacitySnapshot(cap) {
  if (cap && cap.totalBytes > 0) {
    lastKnownDiskCapacity = { ...cap, cachedAt: new Date().toISOString() };
    try {
      fs.writeFileSync(DISK_SNAPSHOT_FILE, JSON.stringify(lastKnownDiskCapacity), 'utf8');
    } catch {}
  }
}

function getRealMemInfo() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    let totalKb = 0;
    let freeKb = 0;
    let availableKb = 0;
    let buffersKb = 0;
    let cachedKb = 0;

    for (const line of meminfo.split('\n')) {
      const parts = line.split(':');
      if (parts.length < 2) continue;
      const key = parts[0].trim();
      const val = parseInt(parts[1].trim(), 10) || 0;
      if (key === 'MemTotal') totalKb = val;
      else if (key === 'MemFree') freeKb = val;
      else if (key === 'MemAvailable') availableKb = val;
      else if (key === 'Buffers') buffersKb = val;
      else if (key === 'Cached') cachedKb = val;
    }

    if (totalKb > 0) {
      const effectiveFreeKb = availableKb > 0 ? availableKb : (freeKb + buffersKb + cachedKb);
      const usedKb = Math.max(0, totalKb - effectiveFreeKb);
      return {
        totalBytes: totalKb * 1024,
        freeBytes: effectiveFreeKb * 1024,
        usedBytes: usedKb * 1024,
        percentUsed: Number(((usedKb / totalKb) * 100).toFixed(1)),
        isProcMemInfo: true,
      };
    }
  } catch {}

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  return {
    totalBytes: totalMem,
    freeBytes: freeMem,
    usedBytes: usedMem,
    percentUsed: totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(1)) : 0,
    isProcMemInfo: false,
  };
}

function getDiskCapacitySync(targetPath) {
  try {
    // Garante que o diretório alvo ou seu pai exista para evitar ENOENT
    if (!fs.existsSync(targetPath)) {
      try { fs.mkdirSync(targetPath, { recursive: true }); } catch {}
    }

    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(targetPath);
      const bsize = Number(s.bsize) || 4096;
      const totalBytes = Number(s.blocks) * bsize;
      const availBytes = Number(s.bavail) * bsize;
      const freeAllBytes = Number(s.bfree) * bsize;
      if (totalBytes > 0) {
        const usedBytes = Math.max(0, totalBytes - freeAllBytes);
        const res = {
          totalBytes,
          usedBytes,
          freeBytes: availBytes,
          percentUsed: Number(((usedBytes / totalBytes) * 100).toFixed(2)),
          commercialSize: formatCommercialDiskSize(totalBytes),
          isCachedSnapshot: false,
        };
        saveDiskCapacitySnapshot(res);
        return res;
      }
    }
  } catch {}

  // Fallback via comando POSIX df -k caso FUSE/Termux bloqueie statfsSync
  try {
    const out = execFileSync('df', ['-k', targetPath], { encoding: 'utf8', timeout: 2500 });
    const lines = out.trim().split('\n');
    const cols = lines[lines.length - 1].trim().split(/\s+/);
    if (cols.length >= 4) {
      const totalBytes = Number(cols[1]) * 1024;
      const usedBytes = Number(cols[2]) * 1024;
      const freeBytes = Number(cols[3]) * 1024;
      if (totalBytes > 0) {
        const res = {
          totalBytes,
          usedBytes,
          freeBytes,
          percentUsed: Number(((usedBytes / totalBytes) * 100).toFixed(2)),
          commercialSize: formatCommercialDiskSize(totalBytes),
          isCachedSnapshot: false,
        };
        saveDiskCapacitySnapshot(res);
        return res;
      }
    }
  } catch {}

  // Se o disco estiver desconectado temporariamente, usa o snapshot real persistido
  if (lastKnownDiskCapacity && lastKnownDiskCapacity.totalBytes > 0) {
    return {
      ...lastKnownDiskCapacity,
      isCachedSnapshot: true,
    };
  }

  return { totalBytes: 0, usedBytes: 0, freeBytes: 0, percentUsed: 0, commercialSize: '' };
}

// ============================================================================
// 5. AJUSTE 5: STREAMING HTTP 206 PARTIAL CONTENT (CHUNKS DE 64 KB)
// ============================================================================
async function streamFileWithRange(req, res, filePath, options = {}) {
  let st;
  try {
    st = await fs.promises.stat(filePath);
    if (!st.isFile()) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
  } catch {
    return res.status(404).json({ error: 'Arquivo não encontrado.' });
  }

  const fileSize = st.size;
  const filename = path.basename(filePath);
  const mimeType = getMimeType(filename);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', options.cacheControl || 'private, max-age=0, must-revalidate');

  const dispositionType = options.download ? 'attachment' : 'inline';
  res.setHeader(
    'Content-Disposition',
    `${dispositionType}; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    if (!match) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (!match[1] && match[2]) {
      const suffixLen = parseInt(match[2], 10);
      start = Math.max(0, fileSize - suffixLen);
      end = fileSize - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    end = Math.min(end, fileSize - 1);
    const chunkLength = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(chunkLength));

    const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });
    req.on('close', () => stream.destroy());
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    return stream.pipe(res);
  }

  res.status(200);
  res.setHeader('Content-Length', String(fileSize));
  const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  req.on('close', () => stream.destroy());
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  return stream.pipe(res);
}

// ============================================================================
// 6. INICIALIZAÇÃO DO SERVIDOR EXPRESS & MIDDLEWARES
// ============================================================================
const app = express();
app.disable('x-powered-by');

const webdavServer = new WebdavServer(STORAGE_DIR, {
  authenticate: (_user, pass) => pass === ADMIN_PASSWORD,
  trashManager,
});
app.use(webdavServer.middleware());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed =
        origin === 'https://aurtistic.vercel.app' ||
        origin.endsWith('.vercel.app') ||
        origin === 'https://storage.hublabdiv.com.br' ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://192.168.') ||
        origin === 'capacitor://localhost' ||
        origin === 'https://localhost';
      return cb(null, allowed ? origin : true);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',
      'x-tenant-ticket',
      'x-deploy-key',
      'x-storage-key',
    ],
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Disposition',
    ],
  })
);
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *;');
  next();
});
app.use(express.json({ limit: '2mb' }));

const activeUnlockedFoldersByToken = new Map();

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME] || 'default';
  const isAdmin = isRequestAuthenticatedAdmin(req);
  if (!activeUnlockedFoldersByToken.has(token)) {
    activeUnlockedFoldersByToken.set(token, new Set());
  }
  const unlockedSet = activeUnlockedFoldersByToken.get(token);

  req.session = {
    user: isAdmin ? 'adm' : null,
    unlockedFolders: {
      has: (scope) => unlockedSet.has(scope),
      add: (scope) => unlockedSet.add(scope),
      delete: (scope) => unlockedSet.delete(scope),
      clear: () => unlockedSet.clear(),
      includes: (scope) => unlockedSet.has(scope),
      push: (scope) => unlockedSet.add(scope),
      filter: (cb) => {
        for (const item of Array.from(unlockedSet)) {
          if (!cb(item)) unlockedSet.delete(item);
        }
        return Array.from(unlockedSet);
      },
      [Symbol.iterator]: function* () {
        for (const val of unlockedSet) yield val;
      }
    }
  };
  next();
});

function requireHubOrAdmin(req, res, next) {
  if (isRequestAuthenticatedAdmin(req)) return next();
  return res.status(401).json({ error: 'Acesso não autorizado: chave de API ou sessão inválida.' });
}

function requireAdminSession(req, res, next) {
  if (isRequestAuthenticatedAdmin(req)) return next();
  return res.status(401).json({ error: 'Sessão administrativa necessária.' });
}

// Multer: Zona 3 (HUB Media)
const hubMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 12);
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`;
    cb(null, safeName);
  },
});

const uploadHubMedia = multer({
  storage: hubMediaStorage,
  limits: { fileSize: MAX_SINGLE_UPLOAD_BYTES },
});

// Multer: Zona 1 (Portfólio: original + thumb)
const portfolioStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'thumb') return cb(null, PORTFOLIO_THUMBS_DIR);
    return cb(null, PORTFOLIO_ORIGINALS_DIR);
  },
  filename: (req, file, cb) => {
    if (!req._portfolioIdSeed) {
      req._portfolioIdSeed = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }
    const ext =
      file.fieldname === 'thumb'
        ? '.webp'
        : (path.extname(file.originalname || '').toLowerCase().slice(0, 10) || '.jpg');
    cb(null, `${req._portfolioIdSeed}${ext}`);
  },
});

const uploadPortfolio = multer({
  storage: portfolioStorage,
  limits: { fileSize: MAX_SINGLE_UPLOAD_BYTES },
});

// Multer: Zona 2 (Cofre Pessoal / Vault com preservação de nome legível na raiz do HD)
const VAULT_ROOT_DIR = STORAGE_DIR;

const vaultStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const targetFolder = resolveSafeChildPath(VAULT_ROOT_DIR, req.query.folder || '');
      fs.mkdirSync(targetFolder, { recursive: true });
      req._vaultTargetDir = targetFolder;
      cb(null, targetFolder);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const clean = sanitizeFilename(file.originalname);
    const ext = path.extname(clean);
    const stem = path.basename(clean, ext);
    const dir = req._vaultTargetDir || VAULT_ROOT_DIR;

    let candidate = clean;
    let counter = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${stem} (${counter})${ext}`;
      counter++;
    }
    cb(null, candidate);
  },
});

const uploadVault = multer({
  storage: vaultStorage,
  limits: { fileSize: MAX_SINGLE_UPLOAD_BYTES },
});

// ============================================================================
// 7. GRUPO A: ROTAS LEGADAS DO HUB LABDIV (100% RETROCOMPATÍVEIS)
// ============================================================================
app.get(['/api/status', '/health'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const storageEntries = [];
  try {
    if (fs.existsSync('/storage')) {
      const ents = fs.readdirSync('/storage');
      storageEntries.push(...ents);
    }
  } catch {}

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    device: process.platform === 'android' ? 'FireTV-Termux' : 'Host-Linux',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    hdConnected: isExternalStorageMounted(),
    storageDir: STORAGE_DIR,
    storageEntries,
  });
});

// ============================================================================
// DEPLOY REMOTO AUTOMÁTICO VIA HTTPS (ZERO DEPENDÊNCIA DE REDE LOCAL)
// ============================================================================
app.post('/api/admin/remote-deploy', async (req, res) => {
  if (!isRequestAuthenticatedAdmin(req)) {
    return res.status(401).json({
      error: 'Não autorizado: token de deploy inválido ou ausente.',
      hint: 'Envie o cabeçalho x-deploy-key, x-storage-key ou Bearer token.',
    });
  }

  const tmpDir = path.join(INTERNAL_DATA_DIR, 'tmp_deploy');
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const bundlePath = path.join(tmpDir, `deploy-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tar.gz`);
  const writeStream = fs.createWriteStream(bundlePath);

  let totalBytes = 0;
  let aborted = false;
  const MAX_DEPLOY_BYTES = 98 * 1024 * 1024; // 98 MB
  const skipRestart = req.query.restart === '0' || req.headers['x-no-restart'] === '1';

  req.on('data', (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_DEPLOY_BYTES) {
      aborted = true;
      req.destroy();
      writeStream.destroy();
      try { fs.unlinkSync(bundlePath); } catch {}
      if (!res.headersSent) {
        return res.status(413).json({ error: 'Pacote de deploy excede o limite de 98 MB.' });
      }
    }
  });

  req.pipe(writeStream);

  writeStream.on('finish', async () => {
    if (aborted) return;
    try {
      if (totalBytes === 0) {
        try { fs.unlinkSync(bundlePath); } catch {}
        return res.status(400).json({ error: 'Nenhum dado recebido no pacote de deploy.' });
      }

      const { execFile, spawn } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);

      // 1. Validação de integridade do pacote tar.gz
      try {
        await execFileAsync('tar', ['-tzf', bundlePath]);
      } catch (err) {
        try { fs.unlinkSync(bundlePath); } catch {}
        return res.status(400).json({
          error: 'Pacote tar.gz corrompido ou formato inválido.',
          details: err.message,
        });
      }

      // 2. Backup de segurança da versão atual
      const backupDir = path.join(__dirname, '.deploy_backup');
      await fs.promises.mkdir(backupDir, { recursive: true });
      const currentServer = path.join(__dirname, 'server.js');
      const backupServer = path.join(backupDir, 'server.js.bak');
      if (fs.existsSync(currentServer)) {
        await fs.promises.copyFile(currentServer, backupServer);
      }

      // 3. Extrai os arquivos atualizados na raiz da aplicação
      await execFileAsync('tar', ['-xzf', bundlePath, '-C', __dirname]);
      try { await fs.promises.unlink(bundlePath); } catch {}

      if (skipRestart) {
        loadThumbSigIndex();
        if (fs.existsSync(PRIMARY_CATALOG_PATH)) {
          try {
            memoryCatalog = normalizeCatalogShape(JSON.parse(fs.readFileSync(PRIMARY_CATALOG_PATH, 'utf8')));
          } catch {}
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
          success: true,
          message: 'Pacote sincronizado com sucesso (sem restart).',
          bytesReceived: totalBytes,
          timestamp: new Date().toISOString(),
        });
      }

      // 4. Validação sintática do novo server.js no Node.js local
      try {
        await execFileAsync('node', ['--check', currentServer]);
      } catch (checkErr) {
        if (fs.existsSync(backupServer)) {
          await fs.promises.copyFile(backupServer, currentServer);
        }
        return res.status(500).json({
          error: 'Erro de sintaxe no novo server.js. Rollback automático efetuado.',
          details: checkErr.message,
        });
      }

      // 5. Envia resposta 200 OK antes de reiniciar o processo
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        message: 'Deploy remoto aplicado com sucesso! Reiniciando processo Node.js...',
        bytesReceived: totalBytes,
        timestamp: new Date().toISOString(),
      });

      // 6. Agenda reinicialização desacoplada do processo (Compatível com Termux/Android e Linux)
      setTimeout(() => {
        try {
          const nodeBin = process.execPath;
          const serverScript = path.join(__dirname, 'server.js');
          const logFile = path.join(__dirname, 'server.log');
          const out = fs.openSync(logFile, 'a');
          const err = fs.openSync(logFile, 'a');

          const child = spawn(nodeBin, ['--max-old-space-size=160', serverScript], {
            detached: true,
            stdio: ['ignore', out, err],
            cwd: __dirname,
            env: process.env,
          });
          child.unref();
        } catch (e) {
          console.error('[RestartError]', e);
        }
        process.exit(0);
      }, 350);
    } catch (deployErr) {
      console.error('[RemoteDeployError]', deployErr);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Falha durante o processamento do deploy.',
          details: deployErr.message,
        });
      }
    }
  });

  writeStream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro de gravação do pacote temporário.', details: err.message });
    }
  });
});

app.post('/api/upload', requireHubOrAdmin, uploadHubMedia.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }
  adjustZoneStats('media', req.file.size, 1);

  const fileUrl = `/media/${req.file.filename}`;
  return res.status(201).json({
    success: true,
    filename: req.file.filename,
    url: fileUrl,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

app.use(
  '/media',
  (_req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(MEDIA_DIR, { acceptRanges: true })
);

app.delete('/api/media/:filename', requireHubOrAdmin, async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  const targetPath = path.join(MEDIA_DIR, filename);

  try {
    const st = await fs.promises.stat(targetPath);
    await fs.promises.unlink(targetPath);
    adjustZoneStats('media', -st.size, -1);
    return res.json({ success: true, message: 'Arquivo removido com sucesso.' });
  } catch {
    return res.status(404).json({ error: 'Arquivo não encontrado.' });
  }
});

// ============================================================================
// 8. GRUPO B: AUTENTICAÇÃO DO CONSOLE ADMIN (COOKIE HTTPONLY HMAC)
// ============================================================================
app.get('/api/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    authenticated: isRequestAuthenticatedAdmin(req),
  });
});

app.post('/api/auth/login', (req, res) => {
  const ip = getClientIp(req);
  const rate = checkLoginRateLimit(ip);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Muitas tentativas incorretas. Aguarde ${rate.retryAfterSec}s.`,
    });
  }

  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD não configurada no servidor.' });
  }

  if (!timingSafeMatch(password, ADMIN_PASSWORD)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Senha administrativa incorreta.' });
  }

  loginAttempts.delete(ip);
  const token = createSessionToken();
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) cookieParts.push('Secure');

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  return res.json({ success: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );
  res.json({ success: true });
});

// ============================================================================
// 9. GRUPO C: ZONA 1 — PORTFÓLIO FOTOGRÁFICO (PASTA ISOLADA portfolio/)
// ============================================================================
const REMOTE_HUB_ORIGIN = process.env.REMOTE_HUB_ORIGIN || 'https://storage.hublabdiv.com.br';

function fetchRemoteCatalogFallback() {
  if (process.platform === 'android') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = `${REMOTE_HUB_ORIGIN}/api/portfolio`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 firestick-dev-proxy' } }, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

app.get('/api/portfolio', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  if (!memoryCatalog.items || memoryCatalog.items.length === 0) {
    await syncPortfolioFromDiskAsync();
  }
  const isAdmin = isRequestAuthenticatedAdmin(req);
  // Fallback inteligente para desenvolvimento local no PC: se o HD do Fire Stick não estiver montado neste PC
  if (process.platform !== 'android' && !fs.existsSync('/storage/31E0-19FD')) {
    if (!memoryCatalog.items || memoryCatalog.items.length === 0) {
      const remote = await fetchRemoteCatalogFallback();
      if (remote && Array.isArray(remote.items) && remote.items.length > 0) {
        memoryCatalog = normalizeCatalogShape(remote);
        persistCatalog();
        const sendItems = isAdmin ? memoryCatalog.items : (memoryCatalog.items || []).filter(it => it.visibility !== 'private');
        return res.json({ ...memoryCatalog, items: sendItems });
      }
    }
    if (isLocalhostDevMode(req)) {
      const mock = getMockCatalog();
      const sendItems = isAdmin ? mock.items : (mock.items || []).filter(it => it.visibility !== 'private');
      return res.json({ ...mock, items: sendItems });
    }
  }
  const sendItems = isAdmin ? memoryCatalog.items : (memoryCatalog.items || []).filter(it => it.visibility !== 'private');
  res.json({
    ...memoryCatalog,
    items: sendItems,
    isStorageMounted: fs.existsSync(PORTFOLIO_DIR),
  });
});

app.post('/api/portfolio/sync', requireAdminSession, async (req, res) => {
  const force = req.query.force === '1' || req.body?.force === true;
  const updated = await syncPortfolioFromDiskAsync({ force });
  if (process.platform !== 'android' && !fs.existsSync('/storage/31E0-19FD') && !force) {
    if (!updated.items || updated.items.length === 0) {
      const remote = await fetchRemoteCatalogFallback();
      if (remote && Array.isArray(remote.items) && remote.items.length > 0) {
        memoryCatalog = normalizeCatalogShape(remote);
        persistCatalog();
        return res.json({ success: true, count: memoryCatalog.items.length, albums: memoryCatalog.albums });
      }
    }
    if (isLocalhostDevMode(req)) {
      const mockCat = getMockCatalog();
      return res.json({ success: true, count: mockCat.items.length, albums: mockCat.albums });
    }
  }
  res.json({ success: true, count: updated.items ? updated.items.length : 0, albums: updated.albums || [] });
});

app.post('/api/portfolio/reset', requireAdminSession, async (req, res) => {
  memoryCatalog = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    albums: [],
    subalbums: {},
    items: [],
  };
  dirStatsCache.portfolio = { bytes: 0, count: 0 };
  await persistCatalog();
  console.log('[PortfolioReset] Catálogo de portfólio zerado pelo Administrador.');
  res.json({ success: true, count: 0, albums: [] });
});

function generatePhotoPlaceholderSvg(title = 'Fotografia', album = '') {
  const safeTitle = String(title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeAlbum = String(album).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const subtitle = safeAlbum ? `${safeAlbum} • HD USB Offline` : 'HD USB Offline • Reconecte o disco';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
  <defs>
    <linearGradient id="svgBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#141422"/>
      <stop offset="100%" stop-color="#0b0c14"/>
    </linearGradient>
    <linearGradient id="svgGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#svgBg)" rx="14"/>
  <rect x="10" y="10" width="580" height="380" fill="none" stroke="rgba(245, 158, 11, 0.2)" stroke-width="1.5" stroke-dasharray="6 4" rx="10"/>
  <g transform="translate(300, 160)" text-anchor="middle">
    <circle cx="0" cy="0" r="44" fill="#1b1b2a" stroke="url(#svgGold)" stroke-width="2.2"/>
    <path d="M-18 -8 L-12 -16 L12 -16 L18 -8 L24 -8 C26.2 -8 28 -6.2 28 -4 L28 18 C28 20.2 26.2 22 24 22 L-24 22 C-26.2 22 -28 20.2 -28 18 L-28 -4 C-28 -6.2 -26.2 -8 -24 -8 Z" fill="none" stroke="url(#svgGold)" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="0" cy="7" r="9" fill="none" stroke="url(#svgGold)" stroke-width="2.5"/>
    <circle cx="16" cy="-2" r="2.5" fill="#f59e0b"/>
    <text y="74" fill="#f1f5f9" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600">${safeTitle}</text>
    <text y="96" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="400">${subtitle}</text>
  </g>
</svg>`;
}

// ============================================================================
// SEMÁFORO DE LEITURA PARA CONTEÚDO ORIGINAL NO HD MECÂNICO (MÁX 2 CONCORRENTES)
// ============================================================================
let activeContentReaders = 0;
const contentReaderQueue = [];

function acquireContentReader() {
  if (activeContentReaders < 2) {
    activeContentReaders++;
    return Promise.resolve();
  }
  return new Promise((resolve) => contentReaderQueue.push(resolve));
}

function releaseContentReader() {
  activeContentReaders--;
  if (contentReaderQueue.length > 0) {
    activeContentReaders++;
    const next = contentReaderQueue.shift();
    next();
  }
}

// Endpoint de Miniaturas Comprimidas Rápidas com suporte a subpastas e cache ext4 interno prioritário
app.use('/portfolio-media/thumb', async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let raw = req.path.replace(/^\/+/, '');
  raw = raw.split('?')[0];
  let relPath = '';
  try {
    relPath = decodeURIComponent(raw);
  } catch {
    relPath = raw;
  }

  relPath = relPath.replace(/^(\.\.[\/\\])+/, ''); // sanitização contra path traversal
  if (!relPath) return res.status(400).send('Caminho de miniatura ausente');

  const cleanRel = relPath.replace(/^\/+|\/+$/g, '');
  const isPrivateThumb = memoryCatalog.items?.some((it) => {
    if (it.visibility !== 'private') return false;
    return it.relativePath === cleanRel || it.originalFile === path.basename(cleanRel);
  });
  if (isPrivateThumb && !isRequestAuthenticatedAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito: este item é privado.' });
  }

  const targetWidth = req.query.w ? Math.max(320, Math.min(1440, parseInt(req.query.w, 10) || 640)) : 640;
  const acceptHeader = String(req.headers.accept || '').toLowerCase();
  const requestedAvif = req.query.fmt === 'avif' || (acceptHeader.includes('image/avif') && req.query.fmt !== 'webp');
  const thumbExt = requestedAvif ? 'avif' : 'webp';
  const mimeType = requestedAvif ? 'image/avif' : 'image/webp';

  const cacheKey = crypto.createHash('md5').update(relPath).digest('hex');

  // 1. BLINDAGEM ZERO-TOUCH NO /storage:
  // Se a miniatura já existe no cache ext4 interno rápido, serve IMEDIATAMENTE sem tocar no HD USB
  const candidatePaths = [
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_${targetWidth}.${thumbExt}`),
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_640.${thumbExt}`),
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_${targetWidth}.avif`),
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_640.avif`),
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_${targetWidth}.webp`),
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_640.webp`),
  ];

  try {
    for (const testPath of candidatePaths) {
      if (fs.existsSync(testPath)) {
        const thumbStat = await fs.promises.stat(testPath);
        if (thumbStat.size > 0) {
          const isRealAvif = testPath.endsWith('.avif');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('Content-Type', isRealAvif ? 'image/avif' : 'image/webp');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return fs.createReadStream(testPath).pipe(res);
        }
      }
    }

    // 1.1. Fallback de assinatura (fileSig) no cache interno ext4 (Zero-Touch no /storage)
    const catalogItem = (memoryCatalog.items || []).find((it) => it.relativePath === relPath);
    const sig = catalogItem?.fileSig || (catalogItem?.originalFile && catalogItem?.sizeBytes ? `${catalogItem.originalFile}_${catalogItem.sizeBytes}` : null);
    const sigHash = sig ? thumbSigIndex[sig] : null;
    if (sigHash && sigHash !== cacheKey) {
      const sigPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${sigHash}_640.avif`);
      if (fs.existsSync(sigPath)) {
        await migrateThumbCacheKey(sigHash, cacheKey, sig);
        persistThumbSigIndex();
        const migratedPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_640.avif`);
        const servePath = fs.existsSync(migratedPath) ? migratedPath : sigPath;
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', 'image/avif');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return fs.createReadStream(servePath).pipe(res);
      }
    }
  } catch {}

  // 2. Resolve o arquivo original físico no disco
  let localOriginal;
  try {
    localOriginal = resolveSafeChildPath(PORTFOLIO_DIR, relPath);
  } catch (err) {
    return res.status(400).send('Caminho inválido');
  }

  // 3. Se o arquivo original não existir fisicamente no disco local
  if (!fs.existsSync(localOriginal)) {
    // Se for desenvolvimento local no PC e o HD estiver no Fire Stick, faz proxy transparente
    if (process.platform !== 'android' && !fs.existsSync('/storage/31E0-19FD')) {
      const qs = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
      const remoteUrl = `${REMOTE_HUB_ORIGIN}/portfolio-media/thumb/${relPath.split('/').map(encodeURIComponent).join('/')}${qs}`;
      const proxyReq = https.get(
        remoteUrl,
        { headers: { 'User-Agent': 'Mozilla/5.0 firestick-dev-proxy' } },
        (proxyRes) => {
          if (proxyRes.statusCode === 200 || proxyRes.statusCode === 206) {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            return proxyRes.pipe(res);
          }
          const baseName = path.basename(relPath, path.extname(relPath));
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.setHeader('CDN-Cache-Control', 'no-store');
          res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
          return res.send(generatePhotoPlaceholderSvg(baseName, path.dirname(relPath)));
        }
      );
      proxyReq.on('error', () => {
        const baseName = path.basename(relPath, path.extname(relPath));
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
        res.send(generatePhotoPlaceholderSvg(baseName, path.dirname(relPath)));
      });
      return;
    }

    // No Fire Stick ou servidor: se o HD estiver desconectado/em sleep, exibe SVG estilizado em vez de quebrar a tela
    const baseName = path.basename(relPath, path.extname(relPath));
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    return res.send(generatePhotoPlaceholderSvg(baseName, path.dirname(relPath)));
  }

  // 4. Se o original existe, gera miniatura ultraleve e armazena no cache interno
  try {
    if (!fs.existsSync(INTERNAL_THUMBS_DIR)) {
      fs.mkdirSync(INTERNAL_THUMBS_DIR, { recursive: true });
    }

    const cachedThumbPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_${targetWidth}.${thumbExt}`);
    const fallbackThumbPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_${targetWidth}.webp`);

    const ok = await generateThumbnailWebP(localOriginal, cachedThumbPath, targetWidth, thumbExt);
    if (ok && fs.existsSync(cachedThumbPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return fs.createReadStream(cachedThumbPath).pipe(res);
    }

    // Tenta fallback para WebP se AVIF falhar
    if (requestedAvif) {
      const okFallback = await generateThumbnailWebP(localOriginal, fallbackThumbPath, targetWidth, 'webp');
      if (okFallback && fs.existsSync(fallbackThumbPath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return fs.createReadStream(fallbackThumbPath).pipe(res);
      }
    }

    // Proteção: NUNCA envie o original de 10 MB como miniatura (evita thrashing no HD e saturação do túnel)
    const baseName = path.basename(relPath, path.extname(relPath));
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    return res.send(generatePhotoPlaceholderSvg(baseName, path.dirname(relPath)));
  } catch (err) {
    console.warn(`[ThumbError] Falha ao servir miniatura ${relPath}:`, err.message);
    const baseName = path.basename(relPath, path.extname(relPath));
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    return res.send(generatePhotoPlaceholderSvg(baseName, path.dirname(relPath)));
  }
});

// Endpoint de Mocks para Desenvolvimento Localhost
app.get('/portfolio-media/mock/:type/:id', (req, res) => {
  if (!isLocalhostDevMode(req)) {
    return res.status(404).send('Not Found');
  }

  const { type, id } = req.params;
  const item = MOCK_ITEMS.find((it) => it.id === id);
  if (!item) {
    return res.status(404).send('Mock not found');
  }

  // 1. Se o item possui miniatura WebP pré-gerada em public/mock/thumbs/
  if (type === 'thumb' && item.thumbFile) {
    const thumbPath = path.join(PUBLIC_MOCK_DIR, 'thumbs', item.thumbFile);
    if (fs.existsSync(thumbPath)) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(thumbPath);
    }
  }

  // 2. Se o item possui imagem original JPEG em public/mock/
  if (type === 'original' && item.originalFile) {
    const origPath = path.join(PUBLIC_MOCK_DIR, item.originalFile);
    if (fs.existsSync(origPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(origPath);
    }
  }

  // 3. Fallback SVG caso algum arquivo físico falte
  const isOriginal = type === 'original';
  const svg = buildMockSvg(item, isOriginal);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

app.use('/portfolio-media/content', async (req, res, next) => {
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch {
    decodedPath = req.path;
  }
  const cleanPath = decodedPath.replace(/^\/+|\/+$/g, '');
  const isPrivateContent = memoryCatalog.items?.some((it) => {
    if (it.visibility !== 'private') return false;
    return it.relativePath === cleanPath || it.originalFile === path.basename(cleanPath);
  });
  if (isPrivateContent && !isRequestAuthenticatedAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito: este item é privado.' });
  }

  const localFilePath = path.join(PORTFOLIO_DIR, decodedPath);

  // 1. Se o arquivo existir fisicamente no HD local, serve com streaming estático 60fps sob semáforo
  try {
    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
      await acquireContentReader();
      let released = false;
      const releaseOnce = () => {
        if (!released) {
          released = true;
          releaseContentReader();
        }
      };
      res.on('finish', releaseOnce);
      res.on('close', releaseOnce);
      res.on('error', releaseOnce);

      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return express.static(PORTFOLIO_DIR, { acceptRanges: true, dotfiles: 'ignore' })(req, res, next);
    }
  } catch {}

  // 2. Se for ambiente local no PC e o arquivo estiver no HD do Fire Stick, faz proxy streaming transparente
  if (process.platform !== 'android' && !fs.existsSync('/storage/31E0-19FD')) {
    const remoteUrl = `${REMOTE_HUB_ORIGIN}/portfolio-media/content${req.url}`;
    const proxyReq = https.get(remoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0 firestick-dev-proxy' } }, (proxyRes) => {
      if (proxyRes.statusCode === 200 || proxyRes.statusCode === 206) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        return proxyRes.pipe(res);
      }
      return res.status(proxyRes.statusCode || 404).end();
    });
    proxyReq.on('error', () => {
      res.status(404).json({ error: 'Fotografia não encontrada no HD local nem no servidor remoto.' });
    });
    return;
  }

  next();
});

app.use(
  '/portfolio-media/thumbs',
  (_req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(PORTFOLIO_THUMBS_DIR, { acceptRanges: true })
);

app.use(
  '/portfolio-media/originals',
  (_req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(PORTFOLIO_ORIGINALS_DIR, { acceptRanges: true })
);

// Sincronia 1:1 no Upload: cria a pasta física storage/portfolio/<albumName>/ e move com proteção EXDEV
app.post(
  '/api/portfolio/upload',
  requireAdminSession,
  uploadPortfolio.fields([
    { name: 'original', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ]),
  async (req, res) => {
    const origFile = req.files?.original?.[0];
    const thumbFile = req.files?.thumb?.[0];

    if (!origFile) {
      return res.status(400).json({ error: 'Arquivo original da fotografia é obrigatório.' });
    }

    let parsedExif = {};
    if (req.body.exif) {
      try {
        parsedExif = JSON.parse(req.body.exif);
      } catch {}
    }

    const albumName = sanitizeAlbumName(req.body.album || 'Destaques');
    let albumDir;
    try {
      albumDir = resolveSafeChildPath(PORTFOLIO_DIR, albumName);
      await fs.promises.mkdir(albumDir, { recursive: true });
    } catch (err) {
      return res.status(400).json({ error: 'Nome de álbum inválido.' });
    }

    if (!memoryCatalog.albums.includes(albumName)) {
      memoryCatalog.albums.push(albumName);
    }
    if (!Array.isArray(memoryCatalog.settings.albumOrder)) {
      memoryCatalog.settings.albumOrder = [...memoryCatalog.albums];
    } else if (!memoryCatalog.settings.albumOrder.includes(albumName)) {
      memoryCatalog.settings.albumOrder.push(albumName);
    }

    const cleanOrigName = sanitizeFilename(origFile.originalname || origFile.filename);
    const rawExt = path.extname(cleanOrigName).toLowerCase();
    const ext = ALLOWED_PHOTO_EXTS.has(rawExt) ? rawExt : '.jpg';
    const baseName = path.basename(cleanOrigName, path.extname(cleanOrigName)) || `foto_${Date.now()}`;
    let finalFileName = `${baseName}${ext}`;
    let destOrigPath = path.join(albumDir, finalFileName);
    if (fs.existsSync(destOrigPath)) {
      finalFileName = `${baseName}_${Date.now().toString(36)}${ext}`;
      destOrigPath = path.join(albumDir, finalFileName);
    }

    try {
      await moveFileSafe(origFile.path, destOrigPath);
    } catch (moveErr) {
      return res.status(500).json({ error: `Falha ao gravar foto na pasta do álbum: ${moveErr.message}` });
    }

    const relPath = `${albumName}/${finalFileName}`;
    const cacheKey = crypto.createHash('md5').update(relPath).digest('hex');
    if (!fs.existsSync(INTERNAL_THUMBS_DIR)) {
      await fs.promises.mkdir(INTERNAL_THUMBS_DIR, { recursive: true });
    }
    const cachedThumbPath = path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_960.webp`);
    let thumbSize = 0;

    try {
      if (thumbFile && fs.existsSync(thumbFile.path)) {
        await moveFileSafe(thumbFile.path, cachedThumbPath);
        const st = await fs.promises.stat(cachedThumbPath);
        thumbSize = st.size;
      } else {
        await generateThumbnailWebP(destOrigPath, cachedThumbPath, 960);
        if (fs.existsSync(cachedThumbPath)) {
          const st = await fs.promises.stat(cachedThumbPath);
          thumbSize = st.size;
        }
      }
    } catch {}

    let width = Math.max(1, parseInt(req.body.width, 10) || 1600);
    let height = Math.max(1, parseInt(req.body.height, 10) || 1067);
    const parsedDims = await readImageDimensionsAndOrientation(destOrigPath);
    if (parsedDims && parsedDims.width && parsedDims.height) {
      width = parsedDims.width;
      height = parsedDims.height;
    }

    const rawTitle = String(req.body.title || '').trim();
    const fallbackTitle = path.basename(origFile.originalname || finalFileName, path.extname(origFile.originalname || finalFileName));
    const mtimeMs = Date.now();
    const encodedAlbum = encodeURIComponent(albumName);
    const encodedFile = encodeURIComponent(finalFileName);

    const newItem = normalizeItemVisualProps(
      {
        id: `pf_${cacheKey.slice(0, 16)}`,
        title: (rawTitle || fallbackTitle).slice(0, 140),
        album: albumName,
        description: String(req.body.description || '').trim().slice(0, 500),
        originalFile: finalFileName,
        relativePath: relPath,
        originalUrl: `/portfolio-media/content/${encodedAlbum}/${encodedFile}`,
        thumbUrl: `/portfolio-media/thumb/${encodedAlbum}/${encodedFile}?v=${mtimeMs}`,
        width,
        height,
        sizeBytes: origFile.size,
        thumbBytes: thumbSize,
        exif: parsedExif,
        order: 0,
        span: '1x1',
        fit: 'auto',
        aspectRatioOverride: 'auto',
        focalPoint: { x: 50, y: 50 },
        createdAt: new Date().toISOString(),
      },
      0
    );

    // Desloca order dos itens existentes do mesmo álbum para que a nova foto entre no início
    for (const it of memoryCatalog.items) {
      if (it.album === albumName) {
        it.order = (typeof it.order === 'number' ? it.order : 0) + 1;
      }
    }

    memoryCatalog.items.unshift(newItem);
    adjustZoneStats('portfolio', origFile.size, 1);
    await persistCatalog();

    return res.status(201).json({ success: true, item: newItem, albums: memoryCatalog.albums });
  }
);

// Helper para migrar referências de pastas/subpastas no catálogo e miniaturas .avif
async function migrateCatalogFolderPrefix(oldRelPrefix, newRelPrefix) {
  const cleanOld = String(oldRelPrefix || '').replace(/^\/+|\/+$/g, '');
  const cleanNew = String(newRelPrefix || '').replace(/^\/+|\/+$/g, '');
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

  const newParts = cleanNew.split('/');
  const newRootAlbum = newParts[0];

  for (const it of memoryCatalog.items || []) {
    const rel = it.relativePath || (it.album && it.originalFile ? `${it.album}/${it.originalFile}` : '');
    if (rel === cleanOld || rel.startsWith(`${cleanOld}/`)) {
      const suffix = rel.slice(cleanOld.length).replace(/^\/+/, '');
      const newRel = suffix ? `${cleanNew}/${suffix}` : cleanNew;
      const oldHash = crypto.createHash('md5').update(rel).digest('hex');
      const newHash = crypto.createHash('md5').update(newRel).digest('hex');
      const sig = it.fileSig || (it.originalFile && it.sizeBytes ? `${it.originalFile}_${it.sizeBytes}` : null);

      await migrateThumbCacheKey(oldHash, newHash, sig);

      const relSegments = newRel.split('/');
      const fileName = relSegments[relSegments.length - 1];
      const subParts = relSegments.slice(1, -1);

      const oldId = it.id;
      it.album = newRootAlbum;
      it.subalbum = subParts.length > 0 ? subParts.join('/') : null;
      it.relativePath = newRel;
      it.id = `pf_${newHash.slice(0, 16)}`;
      const encodedNewRel = newRel.split('/').map(encodeURIComponent).join('/');
      it.originalUrl = `/portfolio-media/content/${encodedNewRel}`;
      it.thumbUrl = `/portfolio-media/thumb/${encodedNewRel}?v=${Date.now()}`;

      // Propaga sincronização em cascata para atalhos virtuais apontando para este item físico
      syncShortcutsCascade(memoryCatalog, oldId, newRel, it.thumbUrl, it.originalUrl);
      // Se o ID mudou, sincroniza targetId também
      for (const sc of memoryCatalog.items || []) {
        if (sc.isShortcut && sc.targetId === oldId) {
          sc.targetId = it.id;
        }
      }
    }
  }

  // Migra metadados de pastas (folderMeta) com scopeKey antigo (ALBUM ou ALBUM::SUBALBUM)
  const fMeta = memoryCatalog.settings?.layout?.folderMeta;
  if (fMeta && typeof fMeta === 'object') {
    const oldScope = cleanOld.includes('/') ? cleanOld.replace(/\//g, '::') : cleanOld;
    const newScope = cleanNew.includes('/') ? cleanNew.replace(/\//g, '::') : cleanNew;
    for (const key of Object.keys(fMeta)) {
      if (key === oldScope || key.startsWith(`${oldScope}::`)) {
        const suffix = key.slice(oldScope.length);
        const nextScope = `${newScope}${suffix}`;
        fMeta[nextScope] = fMeta[key];
        if (nextScope !== key) delete fMeta[key];
      }
    }
  }

  // Migra chaves de seções (Window Manager Tiles) em settings.layout.sections
  const sections = memoryCatalog.settings?.layout?.sections;
  if (sections && typeof sections === 'object') {
    for (const key of Object.keys(sections)) {
      if (key === cleanOld || key.startsWith(`${cleanOld}/`)) {
        const suffix = key.slice(cleanOld.length);
        const nextKey = `${cleanNew}${suffix}`;
        sections[nextKey] = sections[key];
        if (nextKey !== key) delete sections[key];
      }
    }
  }
}

// Endpoint para criar nova pasta ou subpasta/subálbum físico no HD
app.post(['/api/portfolio/album', '/api/portfolio/folder/create'], requireAdminSession, async (req, res) => {
  const rawName = String(req.body?.name || '').trim();
  const parentAlbum = String(req.body?.parentAlbum || '').trim();
  if (!rawName) {
    return res.status(400).json({ error: 'Informe um nome para a nova pasta/álbum.' });
  }

  if (parentAlbum) {
    const cleanParent = sanitizeAlbumName(parentAlbum);
    const cleanSub = sanitizeSubalbumPath(rawName);
    if (!cleanSub) {
      return res.status(400).json({ error: 'Nome de subpasta inválido.' });
    }
    try {
      const subDir = resolveSafeChildPath(PORTFOLIO_DIR, `${cleanParent}/${cleanSub}`);
      await fs.promises.mkdir(subDir, { recursive: true });
    } catch (err) {
      return res.status(400).json({ error: 'Não foi possível criar a subpasta do álbum.' });
    }

    if (!memoryCatalog.subalbums || typeof memoryCatalog.subalbums !== 'object') {
      memoryCatalog.subalbums = {};
    }
    if (!Array.isArray(memoryCatalog.subalbums[cleanParent])) {
      memoryCatalog.subalbums[cleanParent] = [];
    }
    if (!memoryCatalog.subalbums[cleanParent].includes(cleanSub)) {
      memoryCatalog.subalbums[cleanParent].push(cleanSub);
    }
    await persistCatalog();
    return res.status(201).json({
      success: true,
      album: cleanParent,
      subalbum: cleanSub,
      albums: memoryCatalog.albums,
      subalbums: memoryCatalog.subalbums,
    });
  }

  const albumName = sanitizeAlbumName(rawName);
  try {
    const albumDir = resolveSafeChildPath(PORTFOLIO_DIR, albumName);
    await fs.promises.mkdir(albumDir, { recursive: true });
  } catch (err) {
    return res.status(400).json({ error: 'Não foi possível criar a pasta do álbum.' });
  }

  if (!memoryCatalog.albums.includes(albumName)) {
    memoryCatalog.albums.push(albumName);
  }
  if (!Array.isArray(memoryCatalog.settings.albumOrder)) {
    memoryCatalog.settings.albumOrder = [...memoryCatalog.albums];
  } else if (!memoryCatalog.settings.albumOrder.includes(albumName)) {
    memoryCatalog.settings.albumOrder.push(albumName);
  }

  await persistCatalog();
  const activeAlbums =
    isLocalhostDevMode(req) && !fs.existsSync('/storage/31E0-19FD')
      ? getMockCatalog().albums
      : memoryCatalog.albums;

  return res.status(201).json({ success: true, album: albumName, albums: activeAlbums, subalbums: memoryCatalog.subalbums || {} });
});

// Endpoint para renomear pasta raiz ou subpasta diretamente no HD (FAT32 Case-Insensitive Safe)
app.post('/api/portfolio/folder/rename', requireAdminSession, async (req, res) => {
  const rawAlbum = String(req.body?.album || req.body?.oldName || '').trim();
  const rawSubalbum = String(req.body?.subalbum || '').trim();
  const rawNewName = String(req.body?.newName || '').trim();

  if (!rawAlbum || !rawNewName) {
    return res.status(400).json({ error: 'Informe a pasta de origem e o novo nome.' });
  }

  const cleanAlbum = sanitizeAlbumName(rawAlbum);
  if (!memoryCatalog.subalbums || typeof memoryCatalog.subalbums !== 'object') {
    memoryCatalog.subalbums = {};
  }

  // Caso 1: Renomeando uma subpasta dentro de um álbum raiz
  if (rawSubalbum) {
    const cleanOldSub = sanitizeSubalbumPath(rawSubalbum);
    const cleanNewSub = sanitizeSubalbumPath(rawNewName);
    if (!cleanOldSub || !cleanNewSub) {
      return res.status(400).json({ error: 'Nome de subpasta inválido.' });
    }
    const oldPrefix = `${cleanAlbum}/${cleanOldSub}`;
    const newPrefix = `${cleanAlbum}/${cleanNewSub}`;
    if (oldPrefix === newPrefix) {
      return res.json({ success: true, album: cleanAlbum, subalbum: cleanNewSub, catalog: memoryCatalog });
    }

    try {
      const oldDir = resolveSafeChildPath(PORTFOLIO_DIR, oldPrefix);
      const newDir = resolveSafeChildPath(PORTFOLIO_DIR, newPrefix);
      await renameDirectorySafeFAT32(oldDir, newDir);
    } catch (err) {
      return res.status(500).json({ error: `Falha ao renomear subpasta no HD: ${err.message}` });
    }

    await migrateCatalogFolderPrefix(oldPrefix, newPrefix);

    const subs = Array.isArray(memoryCatalog.subalbums[cleanAlbum]) ? memoryCatalog.subalbums[cleanAlbum] : [];
    memoryCatalog.subalbums[cleanAlbum] = Array.from(
      new Set(
        subs.map((s) => {
          if (s === cleanOldSub) return cleanNewSub;
          if (s.startsWith(`${cleanOldSub}/`)) return `${cleanNewSub}${s.slice(cleanOldSub.length)}`;
          return s;
        })
      )
    );
    if (!memoryCatalog.subalbums[cleanAlbum].includes(cleanNewSub)) {
      memoryCatalog.subalbums[cleanAlbum].push(cleanNewSub);
    }

    persistThumbSigIndex();
    await persistCatalog();
    return res.json({
      success: true,
      album: cleanAlbum,
      subalbum: cleanNewSub,
      albums: memoryCatalog.albums,
      subalbums: memoryCatalog.subalbums,
      catalog: memoryCatalog,
    });
  }

  // Caso 2: Renomeando uma pasta/categoria raiz
  const cleanNewAlbum = sanitizeAlbumName(rawNewName);
  if (cleanAlbum === cleanNewAlbum) {
    return res.json({ success: true, album: cleanNewAlbum, catalog: memoryCatalog });
  }

  try {
    const oldDir = resolveSafeChildPath(PORTFOLIO_DIR, cleanAlbum);
    const newDir = resolveSafeChildPath(PORTFOLIO_DIR, cleanNewAlbum);
    await renameDirectorySafeFAT32(oldDir, newDir);
  } catch (err) {
    return res.status(500).json({ error: `Falha ao renomear pasta no HD: ${err.message}` });
  }

  await migrateCatalogFolderPrefix(cleanAlbum, cleanNewAlbum);

  memoryCatalog.albums = (memoryCatalog.albums || []).map((a) => (a === cleanAlbum ? cleanNewAlbum : a));
  memoryCatalog.albums = Array.from(new Set(memoryCatalog.albums));
  if (Array.isArray(memoryCatalog.settings?.albumOrder)) {
    memoryCatalog.settings.albumOrder = Array.from(
      new Set(memoryCatalog.settings.albumOrder.map((a) => (a === cleanAlbum ? cleanNewAlbum : a)))
    );
  }

  if (memoryCatalog.subalbums[cleanAlbum]) {
    const existingDestSubs = Array.isArray(memoryCatalog.subalbums[cleanNewAlbum])
      ? memoryCatalog.subalbums[cleanNewAlbum]
      : [];
    memoryCatalog.subalbums[cleanNewAlbum] = Array.from(
      new Set([...existingDestSubs, ...memoryCatalog.subalbums[cleanAlbum]])
    );
    if (cleanAlbum !== cleanNewAlbum) {
      delete memoryCatalog.subalbums[cleanAlbum];
    }
  }

  persistThumbSigIndex();
  await persistCatalog();
  return res.json({
    success: true,
    oldAlbum: cleanAlbum,
    album: cleanNewAlbum,
    albums: memoryCatalog.albums,
    subalbums: memoryCatalog.subalbums,
    catalog: memoryCatalog,
  });
});

// Endpoint para mover fotografias em lote entre pastas e subpastas físicas do HD
app.post('/api/portfolio/items/move', requireAdminSession, async (req, res) => {
  const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
  const rawTargetAlbum = String(req.body?.targetAlbum || '').trim();
  const rawTargetSubalbum = String(req.body?.targetSubalbum || '').trim();

  if (itemIds.length === 0 || !rawTargetAlbum) {
    return res.status(400).json({ error: 'Selecione ao menos uma foto e a pasta de destino.' });
  }

  const targetAlbum = sanitizeAlbumName(rawTargetAlbum);
  const targetSubalbum = sanitizeSubalbumPath(rawTargetSubalbum);
  const targetPrefix = targetSubalbum ? `${targetAlbum}/${targetSubalbum}` : targetAlbum;

  let targetDir;
  try {
    targetDir = resolveSafeChildPath(PORTFOLIO_DIR, targetPrefix);
    await fs.promises.mkdir(targetDir, { recursive: true });
  } catch (err) {
    return res.status(400).json({ error: 'Pasta de destino inválida.' });
  }

  const idSet = new Set(itemIds.map(String));
  let movedCount = 0;

  for (const it of memoryCatalog.items || []) {
    if (!idSet.has(String(it.id))) continue;
    const fileName = it.originalFile || path.basename(it.relativePath || '');
    if (!fileName) continue;

    const oldRel = it.relativePath || (it.subalbum ? `${it.album}/${it.subalbum}/${fileName}` : `${it.album}/${fileName}`);
    const newRel = `${targetPrefix}/${fileName}`;
    if (oldRel === newRel) continue;

    try {
      const oldPath = resolveSafeChildPath(PORTFOLIO_DIR, oldRel);
      const newPath = resolveSafeChildPath(PORTFOLIO_DIR, newRel);
      if (fs.existsSync(oldPath)) {
        await moveFileSafe(oldPath, newPath);
      }

      const oldHash = crypto.createHash('md5').update(oldRel).digest('hex');
      const newHash = crypto.createHash('md5').update(newRel).digest('hex');
      const sig = it.fileSig || (fileName && it.sizeBytes ? `${fileName}_${it.sizeBytes}` : null);
      await migrateThumbCacheKey(oldHash, newHash, sig);

      const oldId = it.id;
      it.album = targetAlbum;
      it.subalbum = targetSubalbum || null;
      it.relativePath = newRel;
      it.id = `pf_${newHash.slice(0, 16)}`;
      const encodedNewRel = newRel.split('/').map(encodeURIComponent).join('/');
      it.originalUrl = `/portfolio-media/content/${encodedNewRel}`;
      it.thumbUrl = `/portfolio-media/thumb/${encodedNewRel}?v=${Date.now()}`;
      movedCount++;

      // Atualiza atalhos em cascata
      syncShortcutsCascade(memoryCatalog, oldId, newRel, it.thumbUrl, it.originalUrl);
      for (const sc of memoryCatalog.items || []) {
        if (sc.isShortcut && sc.targetId === oldId) {
          sc.targetId = it.id;
        }
      }
    } catch (err) {
      console.warn(`[ItemsMove] Falha ao mover ${oldRel} -> ${newRel}:`, err.message);
    }
  }

  if (!memoryCatalog.albums.includes(targetAlbum)) {
    memoryCatalog.albums.push(targetAlbum);
  }
  if (!Array.isArray(memoryCatalog.settings.albumOrder)) {
    memoryCatalog.settings.albumOrder = [...memoryCatalog.albums];
  } else if (!memoryCatalog.settings.albumOrder.includes(targetAlbum)) {
    memoryCatalog.settings.albumOrder.push(targetAlbum);
  }

  if (targetSubalbum) {
    if (!memoryCatalog.subalbums || typeof memoryCatalog.subalbums !== 'object') {
      memoryCatalog.subalbums = {};
    }
    if (!Array.isArray(memoryCatalog.subalbums[targetAlbum])) {
      memoryCatalog.subalbums[targetAlbum] = [];
    }
    if (!memoryCatalog.subalbums[targetAlbum].includes(targetSubalbum)) {
      memoryCatalog.subalbums[targetAlbum].push(targetSubalbum);
    }
  }

  persistThumbSigIndex();
  await persistCatalog();
  return res.json({
    success: true,
    movedCount,
    album: targetAlbum,
    subalbum: targetSubalbum,
    catalog: memoryCatalog,
  });
});

// Endpoint: Mover ou aninhar uma pasta inteira no Portfólio sem perder miniaturas
app.post('/api/portfolio/folder/move', requireAdminSession, async (req, res) => {
  const { srcPath, destParentPath, destParent } = req.body || {};
  if (!srcPath || typeof srcPath !== 'string') {
    return res.status(400).json({ error: 'srcPath obrigatório.' });
  }

  const cleanSrc = srcPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  const rawDestParent = typeof destParentPath === 'string' ? destParentPath : (typeof destParent === 'string' ? destParent : '');
  const cleanDestParent = rawDestParent.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  const folderName = path.basename(cleanSrc);

  if (!folderName) {
    return res.status(400).json({ error: 'Nome de pasta inválido.' });
  }

  const newRelPrefix = cleanDestParent ? `${cleanDestParent}/${folderName}` : folderName;
  if (cleanSrc === newRelPrefix) {
    return res.json({ success: true, message: 'Origem e destino são iguais.', catalog: memoryCatalog });
  }

  try {
    // 1. Validação estrita de Path Traversal contra PORTFOLIO_DIR
    const oldPhysicalDir = path.resolve(PORTFOLIO_DIR, cleanSrc);
    const newPhysicalDir = path.resolve(PORTFOLIO_DIR, newRelPrefix);

    const portfolioWithSep = PORTFOLIO_DIR.endsWith(path.sep) ? PORTFOLIO_DIR : PORTFOLIO_DIR + path.sep;
    if (!oldPhysicalDir.startsWith(portfolioWithSep)) {
      return res.status(403).json({ error: 'Acesso negado: pasta de origem fora do diretório do portfólio.' });
    }
    if (!newPhysicalDir.startsWith(portfolioWithSep)) {
      return res.status(403).json({ error: 'Acesso negado: pasta de destino fora do diretório do portfólio.' });
    }
    if (newPhysicalDir === oldPhysicalDir || newPhysicalDir.startsWith(oldPhysicalDir + path.sep)) {
      return res.status(400).json({ error: 'Não é possível mover uma pasta para dentro de si mesma.' });
    }

    // 2. Trava estrita de profundidade (apenas 2 níveis: album e subalbum)
    const destParts = newRelPrefix.split('/').filter(Boolean);
    if (destParts.length > 2) {
      return res.status(400).json({ error: 'Limite de profundidade excedido: o portfólio suporta apenas 2 níveis (Álbum / Subpasta).' });
    }

    if (destParts.length === 2 && fs.existsSync(oldPhysicalDir)) {
      const subEntries = await fs.promises.readdir(oldPhysicalDir, { withFileTypes: true });
      const hasChildDirs = subEntries.some((e) => e.isDirectory() && !e.name.startsWith('.'));
      if (hasChildDirs) {
        return res.status(400).json({ error: 'Esta pasta possui subpastas e não pode ser movida para dentro de outra pasta (limite de 2 níveis).' });
      }
    }

    if (fs.existsSync(oldPhysicalDir)) {
      const parentDir = path.dirname(newPhysicalDir);
      await fs.promises.mkdir(parentDir, { recursive: true });
      await renameDirectorySafeFAT32(oldPhysicalDir, newPhysicalDir);
    }

    // Migra todos os itens no memoryCatalog
    let updatedCount = 0;
    const srcPrefixWithSlash = `${cleanSrc}/`;

    for (const it of memoryCatalog.items || []) {
      const curRel = it.relativePath || (it.subalbum ? `${it.album}/${it.subalbum}/${it.originalFile}` : `${it.album}/${it.originalFile}`);
      if (curRel && (curRel === cleanSrc || curRel.startsWith(srcPrefixWithSlash))) {
        const subRest = curRel.slice(cleanSrc.length).replace(/^\/+/, '');
        const newRel = subRest ? `${newRelPrefix}/${subRest}` : newRelPrefix;

        const oldHash = crypto.createHash('md5').update(curRel).digest('hex');
        const newHash = crypto.createHash('md5').update(newRel).digest('hex');
        const sig = it.fileSig || (it.originalFile && it.sizeBytes ? `${it.originalFile}_${it.sizeBytes}` : null);
        await migrateThumbCacheKey(oldHash, newHash, sig);

        const parts = newRel.split('/').filter(Boolean);
        it.album = parts[0] || 'Destaques';
        it.subalbum = parts.length > 2 ? parts.slice(1, -1).join('/') : null;
        it.relativePath = newRel;
        it.id = `pf_${newHash.slice(0, 16)}`;
        const encodedNewRel = newRel.split('/').map(encodeURIComponent).join('/');
        it.originalUrl = `/portfolio-media/content/${encodedNewRel}`;
        it.thumbUrl = `/portfolio-media/thumb/${encodedNewRel}?v=${Date.now()}`;
        updatedCount++;
      }
    }

    // Atualiza lista de álbuns e subálbuns
    await syncPortfolioFromDiskAsync();
    persistThumbSigIndex();
    await persistCatalog();

    return res.json({
      success: true,
      updatedCount,
      srcPath: cleanSrc,
      destPath: newRelPrefix,
      catalog: memoryCatalog,
    });
  } catch (err) {
    console.warn(`[FolderMove] Erro ao mover pasta ${cleanSrc} -> ${newRelPrefix}:`, err.message);
    return res.status(500).json({ error: `Erro ao mover pasta: ${err.message}` });
  }
});

// Endpoint Completo do Studio "Editar Visualização" (Diretrizes 1, 2, 3, 6)
app.put('/api/portfolio/layout', requireAdminSession, async (req, res) => {
  const { settings, layout, albums, albumOrder, items, createdAlbums, renamedAlbums } = req.body || {};

  // 1. Atualiza configurações de cabeçalho e layout global
  if (settings && typeof settings === 'object') {
    if (typeof settings.title === 'string' && settings.title.trim()) {
      memoryCatalog.settings.title = settings.title.trim().slice(0, 120);
    }
    if (typeof settings.subtitle === 'string') {
      memoryCatalog.settings.subtitle = settings.subtitle.trim().slice(0, 220);
    }
    if (typeof settings.accentTag === 'string' && settings.accentTag.trim()) {
      memoryCatalog.settings.accentTag = settings.accentTag.trim().slice(0, 60);
    }
    if (settings.layout && typeof settings.layout === 'object') {
      memoryCatalog.settings.layout = normalizeLayoutSettings({
        ...(memoryCatalog.settings.layout || {}),
        ...settings.layout,
      });
    }
  }
  if (layout && typeof layout === 'object') {
    memoryCatalog.settings.layout = normalizeLayoutSettings({
      ...(memoryCatalog.settings.layout || {}),
      ...layout,
    });
  }

  if (!memoryCatalog.settings.mockOverrides || typeof memoryCatalog.settings.mockOverrides !== 'object') {
    memoryCatalog.settings.mockOverrides = {};
  }

  // 2. Cria fisicamente pastas recém-adicionadas pelo Studio
  if (Array.isArray(createdAlbums)) {
    for (const rawAlbum of createdAlbums) {
      const cleanName = sanitizeAlbumName(rawAlbum);
      try {
        const dirPath = resolveSafeChildPath(PORTFOLIO_DIR, cleanName);
        await fs.promises.mkdir(dirPath, { recursive: true });
      } catch {}
    }
  }

  // 3. Processa renomeação de pastas com migração segura no HD e no catalog.json (FAT32 safe + recursivo)
  if (renamedAlbums && typeof renamedAlbums === 'object') {
    for (const [oldRaw, newRaw] of Object.entries(renamedAlbums)) {
      const oldAlbum = sanitizeAlbumName(oldRaw);
      const newAlbum = sanitizeAlbumName(newRaw);
      if (!oldAlbum || !newAlbum || oldAlbum === newAlbum) continue;

      try {
        const oldDir = resolveSafeChildPath(PORTFOLIO_DIR, oldAlbum);
        const newDir = resolveSafeChildPath(PORTFOLIO_DIR, newAlbum);
        await renameDirectorySafeFAT32(oldDir, newDir);
      } catch (err) {
        console.warn(`[LayoutRename] Erro ao mover pasta ${oldAlbum} -> ${newAlbum}:`, err.message);
      }

      await migrateCatalogFolderPrefix(oldAlbum, newAlbum);
      if (memoryCatalog.subalbums && memoryCatalog.subalbums[oldAlbum]) {
        memoryCatalog.subalbums[newAlbum] = memoryCatalog.subalbums[oldAlbum];
        if (oldAlbum !== newAlbum) delete memoryCatalog.subalbums[oldAlbum];
      }
    }
  }

  // 4. Atualiza ordem das pastas/álbuns
  const incomingAlbums = Array.isArray(albumOrder) ? albumOrder : albums;
  if (Array.isArray(incomingAlbums)) {
    const cleanAlbums = Array.from(
      new Set(incomingAlbums.map((a) => sanitizeAlbumName(a)).filter(Boolean))
    );
    if (cleanAlbums.length > 0) {
      memoryCatalog.albums = cleanAlbums;
      memoryCatalog.settings.albumOrder = [...cleanAlbums];
    }
  }

  // 5. Atualiza cada fotografia (ordem, span, fit, aspectRatioOverride, focalPoint e mudança de pasta/subpasta)
  if (Array.isArray(items)) {
    const existingById = new Map(memoryCatalog.items.map((it) => [it.id, it]));
    const existingByRel = new Map(
      memoryCatalog.items.filter((it) => it.relativePath).map((it) => [it.relativePath, it])
    );

    for (let idx = 0; idx < items.length; idx++) {
      const inc = items[idx];
      if (!inc || !inc.id) continue;

      const normalized = normalizeItemVisualProps(inc, idx);
      const targetAlbum = sanitizeAlbumName(inc.album || 'Destaques');
      const targetSubalbum = sanitizeSubalbumPath(inc.subalbum);

      // Se for item de mock (apenas em localhost dev)
      if (String(inc.id).startsWith('mock_')) {
        memoryCatalog.settings.mockOverrides[inc.id] = {
          ...(memoryCatalog.settings.mockOverrides[inc.id] || {}),
          title: typeof inc.title === 'string' && inc.title.trim() ? inc.title.trim().slice(0, 140) : undefined,
          description: typeof inc.description === 'string' ? inc.description.trim().slice(0, 500) : undefined,
          album: targetAlbum,
          order: normalized.order,
          span: normalized.span,
          fit: normalized.fit,
          aspectRatioOverride: normalized.aspectRatioOverride,
          focalPoint: normalized.focalPoint,
        };
        continue;
      }

      // Item real no HD
      const target = existingById.get(inc.id) || (inc.relativePath ? existingByRel.get(inc.relativePath) : null);
      if (!target) continue;

      if (typeof inc.title === 'string' && inc.title.trim()) {
        target.title = inc.title.trim().slice(0, 140);
      }
      if (typeof inc.description === 'string') {
        target.description = inc.description.trim().slice(0, 500);
      }
      if (inc.featured !== undefined) {
        target.featured = Boolean(inc.featured);
      }

      target.order = normalized.order;
      target.span = normalized.span;
      target.fit = normalized.fit;
      target.aspectRatioOverride = normalized.aspectRatioOverride;
      target.focalPoint = normalized.focalPoint;

      const currentSub = target.subalbum || null;
      const desiredSub = targetSubalbum !== undefined ? targetSubalbum : currentSub;
      if (targetAlbum && (targetAlbum !== target.album || desiredSub !== currentSub)) {
        const fileName = target.originalFile || path.basename(target.relativePath || '');
        if (fileName) {
          const oldRel = target.relativePath || (currentSub ? `${target.album}/${currentSub}/${fileName}` : `${target.album}/${fileName}`);
          const newPrefix = desiredSub ? `${targetAlbum}/${desiredSub}` : targetAlbum;
          const newRel = `${newPrefix}/${fileName}`;
          try {
            const oldFilePath = resolveSafeChildPath(PORTFOLIO_DIR, oldRel);
            const newAlbumDir = resolveSafeChildPath(PORTFOLIO_DIR, newPrefix);
            await fs.promises.mkdir(newAlbumDir, { recursive: true });
            const newFilePath = path.join(newAlbumDir, fileName);

            if (fs.existsSync(oldFilePath)) {
              await moveFileSafe(oldFilePath, newFilePath);
            }

            const oldHash = crypto.createHash('md5').update(oldRel).digest('hex');
            const newHash = crypto.createHash('md5').update(newRel).digest('hex');
            const sig = target.fileSig || (fileName && target.sizeBytes ? `${fileName}_${target.sizeBytes}` : null);
            await migrateThumbCacheKey(oldHash, newHash, sig);

            target.album = targetAlbum;
            target.subalbum = desiredSub || null;
            target.relativePath = newRel;
            target.id = `pf_${newHash.slice(0, 16)}`;
            const encodedNewRel = newRel.split('/').map(encodeURIComponent).join('/');
            target.originalUrl = `/portfolio-media/content/${encodedNewRel}`;
            target.thumbUrl = `/portfolio-media/thumb/${encodedNewRel}?v=${Date.now()}`;
          } catch (moveErr) {
            console.warn(`[LayoutMove] Falha ao mover arquivo entre álbuns:`, moveErr.message);
            target.album = targetAlbum;
          }
        } else {
          target.album = targetAlbum;
        }

        if (!memoryCatalog.albums.includes(targetAlbum)) {
          memoryCatalog.albums.push(targetAlbum);
        }
      }
    }

    memoryCatalog.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  persistThumbSigIndex();
  await persistCatalog();

  const responseCatalog =
    isLocalhostDevMode(req) && !fs.existsSync('/storage/31E0-19FD')
      ? getMockCatalog()
      : memoryCatalog;

  return res.json({ success: true, catalog: responseCatalog });
});

app.post(['/api/portfolio/folder-meta', '/api/portfolio/folder/meta'], requireAdminSession, async (req, res) => {
  const { scopeKey, deviceType, color, icon, isFavorite, tags, customOrder } = req.body || {};
  if (!scopeKey || typeof scopeKey !== 'string') {
    return res.status(400).json({ error: 'scopeKey obrigatório.' });
  }
  if (!memoryCatalog.settings.layout) {
    memoryCatalog.settings.layout = normalizeLayoutSettings({});
  }
  if (!memoryCatalog.settings.layout.folderMeta) {
    memoryCatalog.settings.layout.folderMeta = {};
  }
  const cleanScope = normalizeFolderScopeKey(scopeKey) || scopeKey.trim();
  const current = memoryCatalog.settings.layout.folderMeta[cleanScope] || {};

  memoryCatalog.settings.layout.folderMeta[cleanScope] = {
    ...current,
    deviceType: deviceType === 'phone' ? 'phone' : deviceType === 'camera' ? 'camera' : null,
    color: typeof color === 'string' && color.trim() ? color.trim().slice(0, 30) : current.color || null,
    icon: typeof icon === 'string' && icon.trim() ? icon.trim().slice(0, 40) : current.icon || null,
    isFavorite: isFavorite !== undefined ? Boolean(isFavorite) : Boolean(current.isFavorite),
    tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : Array.isArray(current.tags) ? current.tags : [],
    customOrder: Array.isArray(customOrder) ? customOrder.map(String) : Array.isArray(current.customOrder) ? current.customOrder : [],
  };
  await persistCatalog();
  return res.json({ success: true, folderMeta: memoryCatalog.settings.layout.folderMeta });
});

// Endpoint Sprint 1: Atualização em lote de metadados de itens (Favoritos e Tags)
app.patch('/api/portfolio/items/meta', requireAdminSession, async (req, res) => {
  const { itemIds, paths, isFavorite, tags, addTags, removeTags } = req.body || {};
  const ids = Array.isArray(itemIds) ? itemIds.map(String) : [];
  const rawPaths = Array.isArray(paths) ? paths.map(String) : [];

  if (ids.length === 0 && rawPaths.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um itemId em itemIds ou caminho em paths.' });
  }

  if (!memoryCatalog.settings) memoryCatalog.settings = {};
  if (!memoryCatalog.settings.vaultFileMeta) memoryCatalog.settings.vaultFileMeta = {};

  const idSet = new Set(ids);
  const pathSet = new Set(rawPaths.map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')));
  let updatedCount = 0;

  for (const it of memoryCatalog.items || []) {
    const itRel = (it.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const itWithPort = `portfolio/${itRel}`;
    const matchesId = idSet.has(String(it.id));
    const matchesPath = pathSet.has(itRel) || pathSet.has(itWithPort) || pathSet.has(it.originalFile);

    if (matchesId || matchesPath) {
      if (isFavorite !== undefined) {
        it.isFavorite = Boolean(isFavorite);
      }
      if (Array.isArray(tags)) {
        it.tags = tags.map((t) => String(t).trim()).filter(Boolean);
      } else {
        if (!Array.isArray(it.tags)) it.tags = [];
        if (Array.isArray(addTags)) {
          for (const t of addTags) {
            const cleanT = String(t).trim();
            if (cleanT && !it.tags.includes(cleanT)) it.tags.push(cleanT);
          }
        }
        if (Array.isArray(removeTags)) {
          const removeSet = new Set(removeTags.map((t) => String(t).trim()));
          it.tags = it.tags.filter((t) => !removeSet.has(t));
        }
      }
      updatedCount++;
    }
  }

  // Suporte a arquivos fora do portfólio (vault/*, media/*, etc.)
  for (const p of rawPaths) {
    const cleanP = p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const isPort = cleanP.startsWith('portfolio/') || (memoryCatalog.items || []).some((it) => it.relativePath === cleanP);
    if (!isPort) {
      const cur = memoryCatalog.settings.vaultFileMeta[cleanP] || {};
      let finalTags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : (Array.isArray(cur.tags) ? [...cur.tags] : []);
      if (Array.isArray(addTags)) {
        for (const t of addTags) {
          const cleanT = String(t).trim();
          if (cleanT && !finalTags.includes(cleanT)) finalTags.push(cleanT);
        }
      }
      if (Array.isArray(removeTags)) {
        const removeSet = new Set(removeTags.map((t) => String(t).trim()));
        finalTags = finalTags.filter((t) => !removeSet.has(t));
      }
      memoryCatalog.settings.vaultFileMeta[cleanP] = {
        ...cur,
        isFavorite: isFavorite !== undefined ? Boolean(isFavorite) : Boolean(cur.isFavorite),
        tags: finalTags,
      };
      updatedCount++;
    }
  }

  await persistCatalog();
  return res.json({ success: true, updatedCount, catalog: memoryCatalog });
});

// Endpoint Sprint 1: Criação de Atalho Virtual (Zero Bytes no HD)
app.post('/api/portfolio/shortcuts', requireAdminSession, async (req, res) => {
  const { targetItemId, targetAlbum, targetSubalbum, aliasTitle } = req.body || {};
  if (!targetItemId || !targetAlbum) {
    return res.status(400).json({ error: 'Informe targetItemId e targetAlbum de destino.' });
  }

  try {
    const shortcut = createVirtualShortcut(memoryCatalog, {
      targetItemId: String(targetItemId),
      targetAlbum: String(targetAlbum),
      targetSubalbum: targetSubalbum ? String(targetSubalbum) : null,
      aliasTitle: aliasTitle ? String(aliasTitle) : null,
    });
    await persistCatalog();
    return res.json({ success: true, shortcut, catalog: memoryCatalog });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Endpoint Sprint 1: Remoção de Atalho Virtual (Zero lixeira, remoção direta do catálogo)
app.delete('/api/portfolio/shortcuts', requireAdminSession, async (req, res) => {
  const shortcutId = String(req.body?.shortcutId || req.query?.shortcutId || '').trim();
  if (!shortcutId) {
    return res.status(400).json({ error: 'Informe shortcutId.' });
  }

  const removed = removeVirtualShortcut(memoryCatalog, shortcutId);
  if (!removed) {
    return res.status(404).json({ error: 'Atalho virtual não encontrado.' });
  }

  await persistCatalog();
  return res.json({ success: true, removedShortcutId: shortcutId });
});

// Endpoint Sprint 1: Busca e Descoberta Avançada em Memória
app.get('/api/search', (req, res) => {
  const folderMeta = memoryCatalog.settings?.layout?.folderMeta || {};
  const results = searchCatalogItems(memoryCatalog.items || [], folderMeta, req.query);
  return res.json({
    success: true,
    count: results.length,
    results,
  });
});

app.post('/api/portfolio/items/feature', requireAdminSession, async (req, res) => {
  const { itemId, itemIds, featured } = req.body || {};
  const ids = Array.isArray(itemIds) ? itemIds : itemId ? [itemId] : [];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Informe itemId ou itemIds.' });
  }
  const nextFeatured = Boolean(featured);
  const idSet = new Set(ids.map((id) => String(id).trim()).filter(Boolean));
  let updatedCount = 0;

  if (!memoryCatalog.settings.mockOverrides || typeof memoryCatalog.settings.mockOverrides !== 'object') {
    memoryCatalog.settings.mockOverrides = {};
  }

  for (const id of idSet) {
    if (id.startsWith('mock_')) {
      memoryCatalog.settings.mockOverrides[id] = {
        ...(memoryCatalog.settings.mockOverrides[id] || {}),
        featured: nextFeatured,
      };
      updatedCount++;
    }
  }

  for (const it of memoryCatalog.items || []) {
    if (idSet.has(it.id) || (it.relativePath && idSet.has(it.relativePath))) {
      it.featured = nextFeatured;
      updatedCount++;
    }
  }

  await persistCatalog();
  return res.json({
    success: true,
    featured: nextFeatured,
    updatedCount,
  });
});

app.patch('/api/portfolio/settings', requireAdminSession, async (req, res) => {
  const { title, subtitle, accentTag, albums, layout } = req.body || {};

  if (typeof title === 'string' && title.trim()) {
    memoryCatalog.settings.title = title.trim().slice(0, 120);
  }
  if (typeof subtitle === 'string') {
    memoryCatalog.settings.subtitle = subtitle.trim().slice(0, 220);
  }
  if (typeof accentTag === 'string' && accentTag.trim()) {
    memoryCatalog.settings.accentTag = accentTag.trim().slice(0, 60);
  }
  if (layout && typeof layout === 'object') {
    memoryCatalog.settings.layout = normalizeLayoutSettings(layout);
  }
  if (Array.isArray(albums)) {
    const cleanAlbums = Array.from(
      new Set(albums.map((a) => sanitizeAlbumName(a)).filter(Boolean))
    );
    if (cleanAlbums.length > 0) {
      memoryCatalog.albums = cleanAlbums;
      memoryCatalog.settings.albumOrder = [...cleanAlbums];
    }
  }

  await persistCatalog();
  return res.json({ success: true, settings: memoryCatalog.settings, albums: memoryCatalog.albums });
});

app.patch('/api/portfolio/item/:id', requireAdminSession, async (req, res) => {
  const { title, album, description, span, fit, aspectRatioOverride, focalPoint, order } = req.body || {};

  if (String(req.params.id).startsWith('mock_') && isLocalhostDevMode(req)) {
    if (!memoryCatalog.settings.mockOverrides) memoryCatalog.settings.mockOverrides = {};
    const prev = memoryCatalog.settings.mockOverrides[req.params.id] || {};
    memoryCatalog.settings.mockOverrides[req.params.id] = {
      ...prev,
      ...(typeof title === 'string' && title.trim() ? { title: title.trim().slice(0, 140) } : {}),
      ...(typeof description === 'string' ? { description: description.trim().slice(0, 500) } : {}),
      ...(typeof album === 'string' && album.trim() ? { album: sanitizeAlbumName(album) } : {}),
      ...(span ? { span } : {}),
      ...(fit ? { fit } : {}),
      ...(aspectRatioOverride ? { aspectRatioOverride } : {}),
      ...(focalPoint ? { focalPoint } : {}),
      ...(typeof order === 'number' ? { order } : {}),
    };
    await persistCatalog();
    return res.json({ success: true, item: memoryCatalog.settings.mockOverrides[req.params.id] });
  }

  const item = memoryCatalog.items.find((it) => it.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Fotografia não encontrada no catálogo.' });

  if (typeof title === 'string' && title.trim()) item.title = title.trim().slice(0, 140);
  if (typeof description === 'string') item.description = description.trim().slice(0, 500);
  if (span) item.span = span;
  if (fit) item.fit = fit;
  if (aspectRatioOverride) item.aspectRatioOverride = aspectRatioOverride;
  if (focalPoint) item.focalPoint = focalPoint;
  if (typeof order === 'number') item.order = order;

  if (typeof album === 'string' && album.trim()) {
    const cleanAlbum = sanitizeAlbumName(album);
    if (cleanAlbum !== item.album && item.originalFile) {
      try {
        const oldPath = resolveSafeChildPath(PORTFOLIO_DIR, `${item.album}/${item.originalFile}`);
        const newDir = resolveSafeChildPath(PORTFOLIO_DIR, cleanAlbum);
        await fs.promises.mkdir(newDir, { recursive: true });
        const newPath = path.join(newDir, item.originalFile);
        if (fs.existsSync(oldPath)) {
          await moveFileSafe(oldPath, newPath);
        }
        const newRel = `${cleanAlbum}/${item.originalFile}`;
        const newHash = crypto.createHash('md5').update(newRel).digest('hex');
        item.relativePath = newRel;
        item.id = `pf_${newHash.slice(0, 16)}`;
        item.originalUrl = `/portfolio-media/content/${encodeURIComponent(cleanAlbum)}/${encodeURIComponent(item.originalFile)}`;
        item.thumbUrl = `/portfolio-media/thumb/${encodeURIComponent(cleanAlbum)}/${encodeURIComponent(item.originalFile)}?v=${Date.now()}`;
      } catch {}
    }
    item.album = cleanAlbum;
    if (!memoryCatalog.albums.includes(cleanAlbum)) {
      memoryCatalog.albums.push(cleanAlbum);
    }
  }

  await persistCatalog();
  return res.json({ success: true, item });
});

app.delete('/api/portfolio/item/:id', requireAdminSession, async (req, res) => {
  if (String(req.params.id).startsWith('mock_') && isLocalhostDevMode(req)) {
    if (!memoryCatalog.settings.mockOverrides) memoryCatalog.settings.mockOverrides = {};
    memoryCatalog.settings.mockOverrides[req.params.id] = {
      ...(memoryCatalog.settings.mockOverrides[req.params.id] || {}),
      deleted: true,
    };
    await persistCatalog();
    return res.json({ success: true });
  }

  const idx = memoryCatalog.items.findIndex((it) => it.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item não encontrado.' });

  const [removed] = memoryCatalog.items.splice(idx, 1);

  // Se o item deletado for um Atalho Virtual, NUNCA deleta o arquivo físico do disco
  if (removed.isShortcut) {
    await persistCatalog();
    return res.json({ success: true, isShortcut: true, freedBytes: 0, freedCount: 0 });
  }

  // Se for arquivo físico real, remove também atalhos virtuais que apontavam para ele
  memoryCatalog.items = memoryCatalog.items.filter((it) => !(it.isShortcut && it.targetId === removed.id));

  let freedBytes = 0;
  let freedCount = 0;

  if (removed.relativePath) {
    const fullRelPath = path.join(PORTFOLIO_DIR, removed.relativePath);
    try {
      const st = await fs.promises.stat(fullRelPath);
      await fs.promises.unlink(fullRelPath);
      freedBytes += st.size;
      freedCount += 1;
    } catch {}
  }

  if (removed.originalFile) {
    const origPath = path.join(PORTFOLIO_ORIGINALS_DIR, path.basename(removed.originalFile));
    try {
      const st = await fs.promises.stat(origPath);
      await fs.promises.unlink(origPath);
      freedBytes += st.size;
      freedCount += 1;
    } catch {}
  }

  if (removed.thumbFile) {
    const thumbPath = path.join(PORTFOLIO_THUMBS_DIR, path.basename(removed.thumbFile));
    try {
      const st = await fs.promises.stat(thumbPath);
      await fs.promises.unlink(thumbPath);
      freedBytes += st.size;
      freedCount += 1;
    } catch {}
  }

  adjustZoneStats('portfolio', -freedBytes, -freedCount);
  await persistCatalog();
  return res.json({ success: true });
});

// ============================================================================
// 10. GRUPO D: COFRE PESSOAL (EXPLORER COMPLETO NA RAIZ DO HD STORAGE_DIR & MULTI-DRIVE)
// ============================================================================
let sharpInstance = null;
try {
  sharpInstance = require('sharp');
  sharpInstance.cache(false);
  sharpInstance.concurrency(1);
} catch {}

function discoverConnectedDrives() {
  const drives = [];
  const seenPaths = new Set();

  // 1. Primary Drive (STORAGE_DIR)
  const primaryStats = getDiskCapacitySync(STORAGE_DIR);
  drives.push({
    id: 'primary',
    name: path.basename(STORAGE_DIR) || 'HD Principal',
    path: STORAGE_DIR,
    isPrimary: true,
    isOnline: fs.existsSync(STORAGE_DIR),
    totalBytes: primaryStats.totalBytes,
    freeBytes: primaryStats.freeBytes,
    usedBytes: primaryStats.usedBytes,
    mountPoint: STORAGE_DIR,
  });
  seenPaths.add(path.resolve(STORAGE_DIR));

  // 2. Scan /proc/mounts
  try {
    if (fs.existsSync('/proc/mounts')) {
      const content = fs.readFileSync('/proc/mounts', 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) continue;
        const [device, mountPoint, fstype] = parts;
        if (!mountPoint) continue;
        const resolvedMount = path.resolve(mountPoint);
        if (seenPaths.has(resolvedMount)) continue;

        const isCandidate =
          mountPoint.startsWith('/storage/') ||
          mountPoint.startsWith('/media/') ||
          mountPoint.startsWith('/mnt/') ||
          (device.startsWith('/dev/sd') && !mountPoint.startsWith('/boot'));

        const isSystem =
          mountPoint === '/storage/emulated' ||
          mountPoint === '/storage/self' ||
          mountPoint.includes('/docker') ||
          mountPoint.includes('/var/lib') ||
          mountPoint.includes('/snap') ||
          ['tmpfs', 'devtmpfs', 'proc', 'sysfs', 'cgroup', 'squashfs'].includes(fstype);

        if (isCandidate && !isSystem && fs.existsSync(mountPoint)) {
          seenPaths.add(resolvedMount);
          const stats = getDiskCapacitySync(mountPoint);
          const baseName = path.basename(mountPoint);
          drives.push({
            id: `drive_${crypto.createHash('md5').update(mountPoint).digest('hex').slice(0, 8)}`,
            name: baseName || device,
            path: mountPoint,
            isPrimary: false,
            isOnline: true,
            totalBytes: stats.totalBytes,
            freeBytes: stats.freeBytes,
            usedBytes: stats.usedBytes,
            mountPoint,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[Drives] Erro ao ler /proc/mounts:', err.message);
  }

  // 3. Scan /storage directory directly (Android / Fire Stick USB mount points)
  try {
    if (fs.existsSync('/storage')) {
      const entries = fs.readdirSync('/storage', { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name === 'emulated' || ent.name === 'self') continue;
        const dirPath = path.resolve('/storage', ent.name);
        if (seenPaths.has(dirPath)) continue;
        seenPaths.add(dirPath);
        const stats = getDiskCapacitySync(dirPath);
        drives.push({
          id: `drive_${crypto.createHash('md5').update(dirPath).digest('hex').slice(0, 8)}`,
          name: ent.name,
          path: dirPath,
          isPrimary: false,
          isOnline: fs.existsSync(dirPath),
          totalBytes: stats.totalBytes,
          freeBytes: stats.freeBytes,
          usedBytes: stats.usedBytes,
          mountPoint: dirPath,
        });
      }
    }
  } catch {}

  return drives;
}

function resolveDriveRoot(driveId) {
  if (!driveId || driveId === 'primary') return VAULT_ROOT_DIR;
  const drives = discoverConnectedDrives();
  const found = drives.find((d) => d.id === driveId || d.path === driveId);
  if (found && found.isOnline && fs.existsSync(found.path)) {
    return found.path;
  }
  return VAULT_ROOT_DIR;
}

app.get('/api/vault/drives', requireAdminSession, (_req, res) => {
  return res.json({ drives: discoverConnectedDrives() });
});

const IGNORED_VAULT_DIRS = new Set([
  'node_modules', '.git', 'lost+found', 'LOST.DIR', '$RECYCLE.BIN',
  'System Volume Information', '.Trash-1000', '.android_secure',
  'Alarms', 'Android', 'Audiobooks', 'DCIM', 'Documents', 'Download',
  'Movies', 'Music', 'Notifications', 'Pictures', 'Podcasts',
  'Recordings', 'Ringtones', '__MACOSX', '.DS_Store', 'Thumbs.db',
  '.trash', '.tmp', 'originals', 'thumbs'
]);

const IGNORED_VAULT_FILES = new Set([
  'trash_manifest.json',
  'catalog.json',
  'shares.json',
  'trash.json',
  'audit.jsonl',
  'aurtistic_beta_list.json',
  '.DS_Store',
  'Thumbs.db',
  '.gitkeep'
]);

/**
 * Resolução de caminhos lógicos do Vault:
 * Mapeia de forma transparente a raiz virtual 'stangorlini' para o armazenamento físico,
 * encontrando pastas existentes em storage/portfolio/*, storage/vault/* e storage/stangorlini/*.
 */
function resolveVaultLogicalPath(driveRoot, unsafeRel = '') {
  const isPrimary = !driveRoot || driveRoot === VAULT_ROOT_DIR;
  let clean = String(unsafeRel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (clean === 'stangorlini') clean = '';
  if (clean.startsWith('stangorlini/')) clean = clean.slice('stangorlini/'.length);

  if (!clean) return driveRoot;

  if (isPrimary) {
    // 1. Testa caminho direto
    const directCandidate = resolveSafeChildPath(driveRoot, clean);
    if (fs.existsSync(directCandidate)) return directCandidate;

    // 2. Testa dentro de portfolio/ (ex: 'BAHIA' -> 'storage/portfolio/BAHIA')
    if (!clean.startsWith('portfolio/')) {
      const portCandidate = resolveSafeChildPath(driveRoot, `portfolio/${clean}`);
      if (fs.existsSync(portCandidate)) return portCandidate;
    }

    // 3. Testa dentro de vault/
    if (!clean.startsWith('vault/')) {
      const vaultCandidate = resolveSafeChildPath(driveRoot, `vault/${clean}`);
      if (fs.existsSync(vaultCandidate)) return vaultCandidate;
    }

    // 4. Testa dentro de stangorlini/
    const stanCandidate = resolveSafeChildPath(driveRoot, `stangorlini/${clean}`);
    if (fs.existsSync(stanCandidate)) return stanCandidate;

    return directCandidate;
  }

  return resolveSafeChildPath(driveRoot, clean);
}

function buildPortfolioVirtualDirectoryTree() {
  const albumMap = new Map();
  for (const albumName of memoryCatalog?.albums || []) {
    if (!albumName) continue;
    albumMap.set(albumName, new Set(memoryCatalog?.subalbums?.[albumName] || []));
  }
  for (const item of memoryCatalog?.items || []) {
    if (!item?.album) continue;
    if (!albumMap.has(item.album)) {
      albumMap.set(item.album, new Set());
    }
    if (item.subalbum) {
      albumMap.get(item.album).add(item.subalbum);
    }
  }
  return albumMap;
}

app.get('/api/vault/tree', requireAdminSession, async (req, res) => {
  try {
    const mode = String(req.query.mode || 'vault').toLowerCase(); // 'vault' | 'portfolio'
    const driveRoot = resolveDriveRoot(req.query.drive);
    const isPrimary = !req.query.drive || req.query.drive === 'primary' || driveRoot === VAULT_ROOT_DIR;
    const unlockedFolders = req.session?.unlockedFolders ? new Set(req.session.unlockedFolders) : new Set();

    let rootName = 'stangorlini';
    let baseScanDir = driveRoot;

    if (mode === 'portfolio' && isPrimary) {
      rootName = 'Pastas do Portfólio';
      baseScanDir = PORTFOLIO_DIR;
    } else if (isPrimary) {
      rootName = 'stangorlini';
      baseScanDir = driveRoot;
    } else {
      rootName = path.basename(driveRoot) || 'HD Externo';
    }

    async function buildTree(dir, rel = '', depth = 0) {
      if (depth > 6) return [];
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
      const childMap = new Map();

      for (const d of dirents) {
        if (!d.isDirectory()) continue;
        if (IGNORED_VAULT_DIRS.has(d.name)) continue;

        // Na raiz do Cofre, oculta subdivisões internas do sistema
        if (isPrimary && mode === 'vault' && (!rel || rel === '')) {
          if (d.name === 'portfolio' || d.name === 'vault' || d.name === 'media' || d.name === 'stangorlini' || d.name === '.trash') {
            continue;
          }
        }

        const childRel = rel ? `${rel}/${d.name}` : d.name;
        const scopeKey = normalizeFolderScopeKey(childRel);
        const fMeta = memoryCatalog?.settings?.layout?.folderMeta?.[scopeKey] || {};
        const isLocked = Boolean(fMeta.isLocked);
        const isUnlocked = isLocked ? unlockedFolders.has(scopeKey) : true;
        const inPort = Boolean(mode === 'portfolio' || fMeta.inPortfolio === true);

        const subChildren = isLocked && !isUnlocked ? [] : await buildTree(path.join(dir, d.name), childRel, depth + 1);

        childMap.set(d.name, {
          name: d.name,
          path: childRel,
          isLocked,
          isUnlocked,
          color: fMeta.color || null,
          icon: fMeta.icon || null,
          isFavorite: Boolean(fMeta.isFavorite),
          inPortfolio: inPort,
          children: subChildren,
        });
      }

      // No modo portfólio primário, agrega os álbuns declarados no catálogo
      if (mode === 'portfolio' && isPrimary && (!rel || rel === '')) {
        const virtualMap = buildPortfolioVirtualDirectoryTree();
        for (const [albumName, subSet] of virtualMap.entries()) {
          if (!albumName || IGNORED_VAULT_DIRS.has(albumName)) continue;
          const scopeKey = normalizeFolderScopeKey(albumName);
          const fMeta = memoryCatalog?.settings?.layout?.folderMeta?.[scopeKey] || {};
          const isLocked = Boolean(fMeta.isLocked);
          const isUnlocked = isLocked ? unlockedFolders.has(scopeKey) : true;

          const existingAlbumNode = childMap.get(albumName) || {
            name: albumName,
            path: albumName,
            isLocked,
            isUnlocked,
            color: fMeta.color || null,
            icon: fMeta.icon || null,
            isFavorite: Boolean(fMeta.isFavorite),
            inPortfolio: true,
            children: [],
          };

          if (!isLocked || isUnlocked) {
            const subChildMap = new Map((existingAlbumNode.children || []).map((c) => [c.name, c]));
            for (const subPath of subSet) {
              const topSub = String(subPath).split('/')[0];
              if (topSub && !subChildMap.has(topSub)) {
                const subScope = `${albumName}::${topSub}`;
                const subMeta = memoryCatalog?.settings?.layout?.folderMeta?.[subScope] || {};
                subChildMap.set(topSub, {
                  name: topSub,
                  path: `${albumName}/${topSub}`,
                  isLocked: Boolean(subMeta.isLocked),
                  isUnlocked: subMeta.isLocked ? unlockedFolders.has(subScope) : true,
                  color: subMeta.color || null,
                  icon: subMeta.icon || null,
                  isFavorite: Boolean(subMeta.isFavorite),
                  inPortfolio: true,
                  children: [],
                });
              }
            }
            existingAlbumNode.children = Array.from(subChildMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name, 'pt-BR')
            );
          }
          childMap.set(albumName, existingAlbumNode);
        }
      }

      // Na raiz do usuário ('stangorlini'), garante as 3 seções fixas padrão: Portfólio, Lixeira e Cofre
      if (mode === 'vault' && isPrimary && (!rel || rel === '')) {
        // 1. Portfólio
        if (!childMap.has('portfolio')) {
          const portChildren = await buildTree(PORTFOLIO_DIR, 'portfolio', depth + 1);
          childMap.set('portfolio', {
            name: 'Portfólio',
            path: 'portfolio',
            isLocked: false,
            isUnlocked: true,
            color: '#FFB703',
            icon: 'photo_library',
            isFavorite: false,
            inPortfolio: true,
            isFixed: true,
            children: portChildren,
          });
        }

        // 2. Cofre (com First-Time Setup e proteção PIN)
        if (!childMap.has('vault')) {
          const vaultDir = path.join(driveRoot, 'vault');
          if (!fs.existsSync(vaultDir)) {
            try { fs.mkdirSync(vaultDir, { recursive: true }); } catch {}
          }
          const vaultScope = normalizeFolderScopeKey('vault');
          const vaultMeta = memoryCatalog?.settings?.layout?.folderMeta?.[vaultScope] || {};
          const isVaultLocked = Boolean(vaultMeta.isLocked);
          const isVaultUnlocked = isVaultLocked ? unlockedFolders.has(vaultScope) : true;
          const vaultChildren = isVaultUnlocked ? await buildTree(vaultDir, 'vault', depth + 1) : [];

          childMap.set('vault', {
            name: 'Cofre',
            path: 'vault',
            isLocked: isVaultLocked,
            isUnlocked: isVaultUnlocked,
            color: '#5A189A',
            icon: 'lock',
            isFavorite: false,
            inPortfolio: false,
            isFixed: true,
            children: vaultChildren,
          });
        }

        // 3. Lixeira
        if (!childMap.has('__trash__')) {
          childMap.set('__trash__', {
            name: 'Lixeira',
            path: '__trash__',
            isLocked: false,
            isUnlocked: true,
            color: '#E0FBFC',
            icon: 'delete',
            isFavorite: false,
            inPortfolio: false,
            isTrash: true,
            isFixed: true,
            children: [],
          });
        }
      }

      const children = Array.from(childMap.values());
      children.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return children;
    }

    const tree = await buildTree(baseScanDir);
    return res.json({ rootName, tree, mode, drive: req.query.drive || 'primary' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/vault/list', requireAdminSession, async (req, res) => {
  try {
    const mode = String(req.query.mode || 'vault').toLowerCase();
    let rawFolder = String(req.query.folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (rawFolder === 'stangorlini') rawFolder = '';
    if (rawFolder.startsWith('stangorlini/')) rawFolder = rawFolder.slice('stangorlini/'.length);

    const driveRoot = resolveDriveRoot(req.query.drive);
    const isPrimary = !req.query.drive || req.query.drive === 'primary' || driveRoot === VAULT_ROOT_DIR;

    let targetDir;
    if (mode === 'portfolio' && isPrimary) {
      targetDir = rawFolder ? resolveSafeChildPath(PORTFOLIO_DIR, rawFolder) : PORTFOLIO_DIR;
    } else {
      targetDir = resolveVaultLogicalPath(driveRoot, rawFolder);
    }

    // Checagem de PIN
    const currentScopeKey = normalizeFolderScopeKey(rawFolder);
    const unlockedFolders = req.session?.unlockedFolders ? new Set(req.session.unlockedFolders) : new Set();
    const folderMetaCurrent = memoryCatalog?.settings?.layout?.folderMeta?.[currentScopeKey] || {};
    const isCurrentLocked = Boolean(folderMetaCurrent.isLocked);
    const isCurrentUnlocked = isCurrentLocked ? unlockedFolders.has(currentScopeKey) : true;

    if (isCurrentLocked && !isCurrentUnlocked) {
      const rootLabel = mode === 'portfolio' ? 'Pastas do Portfólio' : (isPrimary ? 'stangorlini' : (path.basename(driveRoot) || 'HD Externo'));
      const breadcrumbs = [
        { name: rootLabel, path: '' },
        ...(rawFolder
          ? rawFolder.split('/').map((seg, i, arr) => ({
              name: seg,
              path: arr.slice(0, i + 1).join('/'),
            }))
          : []),
      ];
      return res.json({
        currentFolder: rawFolder,
        breadcrumbs,
        folders: [],
        files: [],
        isLocked: true,
        error: 'Pasta protegida por PIN. Desbloqueie para visualizar.',
        drive: req.query.drive || 'primary',
      });
    }

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ error: 'Pasta não encontrada.' });
    }

    const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true }).catch(() => []);
    const folderMap = new Map();
    const fileMap = new Map();
    const driveQs = req.query.drive ? `&drive=${encodeURIComponent(req.query.drive)}` : '';

    for (const d of dirents) {
      if (IGNORED_VAULT_DIRS.has(d.name) || IGNORED_VAULT_FILES.has(d.name)) continue;

      // Oculta pastas internas de sistema na raiz do Cofre
      if (isPrimary && mode === 'vault' && !rawFolder) {
        if (d.name === 'portfolio' || d.name === 'vault' || d.name === 'media' || d.name === 'stangorlini' || d.name === '.trash') {
          continue;
        }
      }

      const fullPath = path.join(targetDir, d.name);
      const relPath = rawFolder ? `${rawFolder}/${d.name}` : d.name;
      try {
        const st = await fs.promises.stat(fullPath);
        if (d.isDirectory()) {
          const subScopeKey = normalizeFolderScopeKey(relPath);
          const subMeta = memoryCatalog?.settings?.layout?.folderMeta?.[subScopeKey] || {};
          const inPort = Boolean(mode === 'portfolio' || subMeta.inPortfolio === true);
          folderMap.set(d.name, {
            name: d.name,
            path: relPath,
            modifiedAt: st.mtime.toISOString(),
            isLocked: Boolean(subMeta.isLocked),
            isUnlocked: subMeta.isLocked ? unlockedFolders.has(subScopeKey) : true,
            color: subMeta.color || null,
            icon: subMeta.icon || null,
            isFavorite: Boolean(subMeta.isFavorite),
            inPortfolio: inPort,
          });
        } else if (d.isFile()) {
          const kind = classifyFileKind(d.name);
          const portRelMatch = relPath.replace(/^portfolio\/?/, '');
          const portItem = (memoryCatalog?.items || []).find(
            (it) => it.relativePath === portRelMatch || it.relativePath === relPath || it.originalFile === d.name
          );

          const vaultMeta = memoryCatalog?.settings?.vaultFileMeta?.[relPath] || {};
          const isFav = portItem ? Boolean(portItem.isFavorite) : Boolean(vaultMeta.isFavorite);
          const tags = portItem
            ? (Array.isArray(portItem.tags) ? portItem.tags : [])
            : (Array.isArray(vaultMeta.tags) ? vaultMeta.tags : []);

          fileMap.set(d.name, {
            name: d.name,
            path: relPath,
            sizeBytes: st.size,
            kind,
            mimeType: getMimeType(d.name),
            modifiedAt: st.mtime.toISOString(),
            streamUrl: `/api/vault/stream?path=${encodeURIComponent(relPath)}${driveQs}`,
            downloadUrl: `/api/vault/stream?path=${encodeURIComponent(relPath)}&download=1${driveQs}`,
            thumbUrl: kind === 'image' ? (portItem?.thumbUrl || `/api/vault/thumb?path=${encodeURIComponent(relPath)}${driveQs}`) : null,
            isFavorite: isFav,
            tags,
            isShortcut: portItem ? Boolean(portItem.isShortcut) : false,
            targetId: portItem?.targetId || null,
          });
        }
      } catch {}
    }

    let folders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const files = Array.from(fileMap.values()).sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

    // Na raiz do Cofre ('stangorlini'), garante as 3 seções padrão fixas no topo da listagem
    if (mode === 'vault' && isPrimary && !rawFolder) {
      const fixedFolders = [];
      const vaultScope = normalizeFolderScopeKey('vault');
      const vaultMeta = memoryCatalog?.settings?.layout?.folderMeta?.[vaultScope] || {};
      const isVaultLocked = Boolean(vaultMeta.isLocked);
      const isVaultUnlocked = isVaultLocked ? unlockedFolders.has(vaultScope) : true;

      fixedFolders.push({
        name: 'Portfólio',
        relativePath: 'portfolio',
        path: 'portfolio',
        isDirectory: true,
        kind: 'folder',
        modifiedAt: new Date().toISOString(),
        isLocked: false,
        isUnlocked: true,
        color: '#FFB703',
        icon: 'photo_library',
        isFavorite: false,
        inPortfolio: true,
        isFixed: true,
      });

      fixedFolders.push({
        name: 'Cofre',
        path: 'vault',
        modifiedAt: new Date().toISOString(),
        isLocked: isVaultLocked,
        isUnlocked: isVaultUnlocked,
        color: '#5A189A',
        icon: 'lock',
        isFavorite: false,
        inPortfolio: false,
        isFixed: true,
      });

      fixedFolders.push({
        name: 'Lixeira',
        path: '__trash__',
        modifiedAt: new Date().toISOString(),
        isLocked: false,
        isUnlocked: true,
        color: '#E0FBFC',
        icon: 'delete',
        isFavorite: false,
        inPortfolio: false,
        isTrash: true,
        isFixed: true,
      });

      folders = [...fixedFolders, ...folders.filter(f => f.path !== 'portfolio' && f.path !== 'vault' && f.path !== '__trash__')];
    }

    const rootLabel = mode === 'portfolio' ? 'Pastas do Portfólio' : (isPrimary ? 'stangorlini' : (path.basename(driveRoot) || 'HD Externo'));
    const breadcrumbs = [
      { name: rootLabel, path: '' },
      ...(rawFolder
        ? rawFolder.split('/').map((seg, i, arr) => {
            let displayName = seg;
            if (i === 0 && seg === 'portfolio') displayName = 'Portfólio';
            if (i === 0 && seg === 'vault') displayName = 'Cofre';
            return {
              name: displayName,
              path: arr.slice(0, i + 1).join('/'),
            };
          })
        : []),
    ];

    return res.json({
      currentFolder: rawFolder,
      breadcrumbs,
      folders,
      files,
      isLocked: false,
      mode,
      drive: req.query.drive || 'primary',
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});
app.get('/api/vault/thumb', requireAdminSession, async (req, res) => {
  try {
    const relPath = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!relPath) return res.status(400).send('Parâmetro path obrigatório.');
    const driveRoot = resolveDriveRoot(req.query.drive);
    const fullPath = resolveSafeChildPath(driveRoot, relPath);

    const cacheKey = crypto.createHash('md5').update(`${req.query.drive || 'primary'}_${relPath}`).digest('hex');
    const cachedThumbPath = path.join(INTERNAL_THUMBS_DIR, `vthumb_${cacheKey}.webp`);

    // 1. Miniatura pronta no cache interno
    if (fs.existsSync(cachedThumbPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/webp');
      return fs.createReadStream(cachedThumbPath).pipe(res);
    }

    // 2. Verifica se é imagem do portfólio já indexada (AVIF ou WebP)
    const fileName = path.basename(fullPath);
    const portfolioThumb = path.join(PORTFOLIO_THUMBS_DIR, `${path.basename(fileName, path.extname(fileName))}.webp`);
    if (fs.existsSync(portfolioThumb)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/webp');
      return fs.createReadStream(portfolioThumb).pipe(res);
    }

    const portRel = relPath.replace(/^portfolio\/?/, '');
    const portCacheKey = crypto.createHash('md5').update(portRel).digest('hex');
    const portThumbAvif = path.join(INTERNAL_THUMBS_DIR, `thumb_${portCacheKey}_640.avif`);
    if (fs.existsSync(portThumbAvif)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/avif');
      return fs.createReadStream(portThumbAvif).pipe(res);
    }
    const portThumbCandidate = path.join(INTERNAL_THUMBS_DIR, `thumb_${portCacheKey}_640.webp`);
    if (fs.existsSync(portThumbCandidate)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/webp');
      return fs.createReadStream(portThumbCandidate).pipe(res);
    }

    if (!fs.existsSync(fullPath)) return res.status(404).send('Arquivo não encontrado.');

    // 3. Gera miniatura leve (400px WebP) protegendo a RAM do Fire Stick
    if (!fs.existsSync(INTERNAL_THUMBS_DIR)) {
      fs.mkdirSync(INTERNAL_THUMBS_DIR, { recursive: true });
    }

    if (sharpInstance) {
      try {
        await sharpInstance(fullPath)
          .rotate()
          .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75 })
          .toFile(cachedThumbPath);

        if (fs.existsSync(cachedThumbPath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('Content-Type', 'image/webp');
          return fs.createReadStream(cachedThumbPath).pipe(res);
        }
      } catch (sharpErr) {
        console.warn('[SharpThumb] Erro ao gerar com sharp:', sharpErr.message);
      }
    }

    const ok = await generateThumbnailWebP(fullPath, cachedThumbPath, 400, 'webp');
    if (ok && fs.existsSync(cachedThumbPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/webp');
      return fs.createReadStream(cachedThumbPath).pipe(res);
    }

    return await streamFileWithRange(req, res, fullPath, { cacheControl: 'private, max-age=3600' });
  } catch (err) {
    return res.status(err.statusCode || 500).send(err.message);
  }
});

app.post('/api/vault/folder', requireAdminSession, async (req, res) => {
  try {
    const parentFolder = String(req.body?.parentFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const cleanName = sanitizeFilename(req.body?.name || '');
    if (!cleanName) return res.status(400).json({ error: 'Nome da pasta inválido.' });

    const relPath = parentFolder ? `${parentFolder}/${cleanName}` : cleanName;
    const driveRoot = resolveDriveRoot(req.body?.drive);
    const targetDir = resolveSafeChildPath(driveRoot, relPath);

    await fs.promises.mkdir(targetDir, { recursive: true });
    if (isPortfolioRelatedRelPath(relPath)) {
      syncPortfolioFromDiskAsync().catch(() => {});
    }
    return res.status(201).json({ success: true, path: relPath, name: cleanName });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/vault/move', requireAdminSession, async (req, res) => {
  try {
    const srcRel = String(req.body?.srcPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const destFolderRel = String(req.body?.destFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!srcRel) return res.status(400).json({ error: 'Caminho de origem obrigatório.' });

    const driveRoot = resolveDriveRoot(req.body?.drive);
    const sourcePath = resolveSafeChildPath(driveRoot, srcRel);
    if (sourcePath === driveRoot) return res.status(400).json({ error: 'Operação inválida na raiz.' });

    const fileName = path.basename(sourcePath);
    const destDir = resolveSafeChildPath(driveRoot, destFolderRel);
    const destPath = path.join(destDir, fileName);

    if (fs.existsSync(destPath) && sourcePath !== destPath) {
      return res.status(409).json({ error: 'Já existe um item com esse nome no destino.' });
    }

    await fs.promises.mkdir(destDir, { recursive: true });
    const st = await fs.promises.stat(sourcePath);
    if (st.isDirectory()) {
      await renameDirectorySafeFAT32(sourcePath, destPath);
    } else {
      await moveFileSafe(sourcePath, destPath);
    }

    if (isPortfolioRelatedRelPath(srcRel) || isPortfolioRelatedRelPath(destFolderRel)) {
      syncPortfolioFromDiskAsync().catch(() => {});
    }

    return res.json({ success: true, newPath: destFolderRel ? `${destFolderRel}/${fileName}` : fileName });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Recebe miniatura WebP gerada no navegador e grava direto no cache ext4 interno
app.post(
  '/api/portfolio/client-thumb',
  requireAdminSession,
  express.raw({ type: ['image/webp', 'application/octet-stream'], limit: '1mb' }),
  async (req, res) => {
    try {
      const vaultRel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (!vaultRel) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });

      const buf = req.body;
      const isWebp =
        Buffer.isBuffer(buf) &&
        buf.length > 12 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP';
      if (!isWebp) return res.status(415).json({ error: 'Miniatura deve ser WebP válida.' });

      const driveRoot = resolveDriveRoot(req.query.drive);
      const absOriginal = resolveSafeChildPath(driveRoot, vaultRel);
      const portRel = path.relative(PORTFOLIO_DIR, absOriginal).split(path.sep).join('/');
      if (!portRel || portRel.startsWith('..') || path.isAbsolute(portRel)) {
        return res.status(400).json({ error: 'Arquivo fora da pasta do portfólio.' });
      }

      const target = portfolioThumbCachePath(portRel, 'webp');
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.tmp_${process.pid}`;
      await fs.promises.writeFile(tmp, buf);
      await fs.promises.rename(tmp, target);
      return res.status(201).json({ success: true, relativePath: portRel });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

app.post('/api/vault/upload', requireAdminSession, uploadVault.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo recebido.' });
  }
  adjustZoneStats('vault', req.file.size, 1);

  const folder = String(req.query.folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const relPath = folder ? `${folder}/${req.file.filename}` : req.file.filename;

  if (isPortfolioRelatedRelPath(relPath)) {
    syncPortfolioFromDiskAsync().catch(() => {});
  }

  const kind = classifyFileKind(req.file.filename);
  const driveQs = req.query.drive ? `&drive=${encodeURIComponent(req.query.drive)}` : '';
  return res.status(201).json({
    success: true,
    name: req.file.filename,
    path: relPath,
    sizeBytes: req.file.size,
    kind,
    streamUrl: `/api/vault/stream?path=${encodeURIComponent(relPath)}${driveQs}`,
    thumbUrl: kind === 'image' ? `/api/vault/thumb?path=${encodeURIComponent(relPath)}${driveQs}` : null,
  });
});

app.get('/api/vault/stream', requireAdminSession, async (req, res) => {
  try {
    const relPath = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });
    const driveRoot = resolveDriveRoot(req.query.drive);
    let fullPath = resolveSafeChildPath(driveRoot, relPath);
    if (fullPath === driveRoot) return res.status(400).json({ error: 'Caminho inválido.' });

    if (!fs.existsSync(fullPath) && relPath.startsWith('portfolio/')) {
      const portRel = relPath.replace(/^portfolio\/?/, '');
      const portCacheKey = crypto.createHash('md5').update(portRel).digest('hex');
      const avifCandidate = path.join(INTERNAL_THUMBS_DIR, `thumb_${portCacheKey}_640.avif`);
      const webpCandidate = path.join(INTERNAL_THUMBS_DIR, `thumb_${portCacheKey}_640.webp`);
      if (fs.existsSync(avifCandidate)) {
        fullPath = avifCandidate;
      } else if (fs.existsSync(webpCandidate)) {
        fullPath = webpCandidate;
      }
    }

    return await streamFileWithRange(req, res, fullPath, {
      download: req.query.download === '1',
      cacheControl: 'private, max-age=0, must-revalidate',
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.patch('/api/vault/rename', requireAdminSession, async (req, res) => {
  try {
    const relPath = String(req.body?.path || '');
    const newName = sanitizeFilename(req.body?.newName || '');
    if (!relPath || !newName) return res.status(400).json({ error: 'Parâmetros inválidos.' });

    const driveRoot = resolveDriveRoot(req.body?.drive);
    const sourcePath = resolveSafeChildPath(driveRoot, relPath);
    if (sourcePath === driveRoot) return res.status(400).json({ error: 'Operação inválida.' });

    const destPath = path.join(path.dirname(sourcePath), newName);
    resolveSafeChildPath(driveRoot, path.relative(driveRoot, destPath));

    if (fs.existsSync(destPath)) {
      return res.status(409).json({ error: 'Já existe um item com esse nome.' });
    }

    const st = await fs.promises.stat(sourcePath);
    if (st.isDirectory()) {
      await renameDirectorySafeFAT32(sourcePath, destPath);
    } else {
      try {
        await fs.promises.rename(sourcePath, destPath);
      } catch {
        await fs.promises.copyFile(sourcePath, destPath);
        await fs.promises.unlink(sourcePath);
      }
    }

    if (isPortfolioRelatedRelPath(relPath)) {
      syncPortfolioFromDiskAsync().catch(() => {});
    }

    return res.json({ success: true, newName });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.delete('/api/vault/entry', requireAdminSession, async (req, res) => {
  try {
    let relPath = String(req.body?.path || req.query.path || '');
    if (!relPath) return res.status(400).json({ error: 'Caminho obrigatório.' });

    const driveRoot = resolveDriveRoot(req.body?.drive || req.query.drive);
    const targetPath = resolveVaultLogicalPath(driveRoot, relPath);
    if (targetPath === driveRoot) return res.status(400).json({ error: 'Não é permitido apagar a raiz.' });

    const isPermanent = Boolean(req.body?.permanent || req.query?.permanent === '1');

    if (!isPermanent) {
      // Sprint 2: Move para a Lixeira Centralizada (.trash) com retenção de 15 dias
      const trashEntry = await trashManager.moveToTrash(targetPath, relPath, req.session?.user || 'admin');
      if (isPortfolioRelatedRelPath(relPath)) {
        syncPortfolioFromDiskAsync().catch(() => {});
      }
      return res.json({ success: true, movedToTrash: true, trashEntry });
    }

    // Exclusão definitiva permanente
    const st = await fs.promises.stat(targetPath);
    if (st.isDirectory()) {
      const subStats = await scanDirectoryRecursiveAsync(targetPath);
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      adjustZoneStats('vault', -subStats.bytes, -subStats.count);
    } else {
      await fs.promises.unlink(targetPath);
      adjustZoneStats('vault', -st.size, -1);
    }

    if (isPortfolioRelatedRelPath(relPath)) {
      syncPortfolioFromDiskAsync().catch(() => {});
    }

    return res.json({ success: true, permanent: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ============================================================================
// SPRINT 2 (V10.0): ENDPOINTS DA LIXEIRA CENTRALIZADA (15 DIAS DE RETENÇÃO)
// ============================================================================
app.get('/api/trash/list', requireAdminSession, async (_req, res) => {
  try {
    const items = trashManager.list();
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/trash/restore', requireAdminSession, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID da lixeira obrigatório.' });
    const result = await trashManager.restore(id);
    if (isPortfolioRelatedRelPath(result.originalRelPath)) {
      syncPortfolioFromDiskAsync().catch(() => {});
    }
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.delete('/api/trash/purge', requireAdminSession, async (req, res) => {
  try {
    const { id } = req.body || req.query || {};
    if (!id) return res.status(400).json({ error: 'ID da lixeira obrigatório.' });
    const ok = await trashManager.purge(id);
    return res.json({ success: ok });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trash/empty', requireAdminSession, async (_req, res) => {
  try {
    const result = await trashManager.empty();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SPRINT 2 (V10.0): DEDUPLICADOR / CAÇADOR DE CÓPIAS
// ============================================================================
app.get('/api/duplicates', requireAdminSession, async (_req, res) => {
  try {
    const duplicates = await findDuplicates(STORAGE_DIR);
    return res.json(duplicates);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/duplicates/convert-shortcut', requireAdminSession, async (req, res) => {
  try {
    const { copyRelPath, targetItemId, album, subalbum } = req.body || {};
    if (!copyRelPath || !targetItemId || !album) {
      return res.status(400).json({ error: 'Parâmetros copyRelPath, targetItemId e album obrigatórios.' });
    }

    const absCopyPath = resolveSafeChildPath(STORAGE_DIR, copyRelPath);
    if (!fs.existsSync(absCopyPath)) {
      return res.status(404).json({ error: 'Cópia física não encontrada no disco.' });
    }

    // Move a cópia física para a lixeira
    await trashManager.moveToTrash(absCopyPath, copyRelPath, 'deduplicator');

    // Cria o atalho virtual apontando para o item original
    const shortcutItem = createVirtualShortcut(memoryCatalog, {
      targetItemId,
      targetAlbum: album,
      targetSubalbum: subalbum || null,
      aliasTitle: path.basename(copyRelPath),
    });

    await saveCatalogToFile();
    return res.json({ success: true, shortcutItem });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ============================================================================
// SPRINT 2 (V10.0): COFRE ISOLADO COM PIN (crypto.scryptSync)
// ============================================================================
app.post('/api/vault/pin/set', requireAdminSession, async (req, res) => {
  try {
    const { scopeKey, pin } = req.body || {};
    if (!scopeKey) return res.status(400).json({ error: 'scopeKey obrigatório.' });

    const normalizedScope = normalizeFolderScopeKey(scopeKey);
    if (!memoryCatalog.settings.layout) memoryCatalog.settings.layout = {};
    if (!memoryCatalog.settings.layout.folderMeta) memoryCatalog.settings.layout.folderMeta = {};
    if (!memoryCatalog.settings.layout.folderMeta[normalizedScope]) {
      memoryCatalog.settings.layout.folderMeta[normalizedScope] = {};
    }

    const fMeta = memoryCatalog.settings.layout.folderMeta[normalizedScope];

    if (!pin) {
      // Remove proteção por PIN
      fMeta.isLocked = false;
      fMeta.pinHash = null;
      fMeta.pinSalt = null;
      await saveCatalogToFile();
      return res.json({ success: true, isLocked: false, scopeKey: normalizedScope });
    }

    const { pinHash, pinSalt } = hashPin(pin);
    fMeta.isLocked = true;
    fMeta.pinHash = pinHash;
    fMeta.pinSalt = pinSalt;

    // Desbloqueia automaticamente para a sessão atual de quem acabou de definir
    if (!req.session.unlockedFolders) req.session.unlockedFolders = [];
    if (!req.session.unlockedFolders.includes(normalizedScope)) {
      req.session.unlockedFolders.push(normalizedScope);
    }

    await saveCatalogToFile();
    return res.json({ success: true, isLocked: true, scopeKey: normalizedScope });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/vault/pin/unlock', requireAdminSession, async (req, res) => {
  try {
    const { scopeKey, pin } = req.body || {};
    if (!scopeKey || !pin) return res.status(400).json({ error: 'scopeKey e PIN obrigatórios.' });

    const normalizedScope = normalizeFolderScopeKey(scopeKey);
    const fMeta = memoryCatalog?.settings?.layout?.folderMeta?.[normalizedScope] || {};

    if (!fMeta.isLocked || !fMeta.pinHash || !fMeta.pinSalt) {
      return res.json({ success: true, unlocked: true, message: 'Pasta não possui bloqueio por PIN.' });
    }

    const isValid = verifyPin(pin, fMeta.pinHash, fMeta.pinSalt);
    if (!isValid) {
      return res.status(401).json({ error: 'PIN incorreto. Tente novamente.' });
    }

    if (!req.session.unlockedFolders) req.session.unlockedFolders = [];
    if (!req.session.unlockedFolders.includes(normalizedScope)) {
      req.session.unlockedFolders.push(normalizedScope);
    }

    return res.json({ success: true, unlocked: true, scopeKey: normalizedScope });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/vault/pin/lock', requireAdminSession, async (req, res) => {
  try {
    const { scopeKey } = req.body || {};
    if (!scopeKey) return res.status(400).json({ error: 'scopeKey obrigatório.' });

    const normalizedScope = normalizeFolderScopeKey(scopeKey);
    if (req.session.unlockedFolders) {
      req.session.unlockedFolders = req.session.unlockedFolders.filter((s) => s !== normalizedScope);
    }

    return res.json({ success: true, locked: true, scopeKey: normalizedScope });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get('/api/vault/pin/status', requireAdminSession, (req, res) => {
  const scopeKey = normalizeFolderScopeKey(req.query.scopeKey || 'vault');
  const unlockedFolders = req.session?.unlockedFolders ? new Set(req.session.unlockedFolders) : new Set();
  const fMeta = memoryCatalog?.settings?.layout?.folderMeta?.[scopeKey] || {};
  const hasPin = Boolean(fMeta.pinHash && fMeta.pinSalt);
  const isLocked = Boolean(fMeta.isLocked);
  const isUnlocked = hasPin ? unlockedFolders.has(scopeKey) : true;
  return res.json({
    scopeKey,
    hasPin,
    isLocked,
    isUnlocked,
  });
});

app.post('/api/vault/pin/setup', requireAdminSession, async (req, res) => {
  try {
    const { scopeKey = 'vault', pin, confirmPin } = req.body || {};
    if (!pin || !confirmPin) {
      return res.status(400).json({ error: 'Informe o PIN e a confirmação.' });
    }
    if (String(pin).trim() !== String(confirmPin).trim()) {
      return res.status(400).json({ error: 'A confirmação de PIN não confere.' });
    }

    const normalizedScope = normalizeFolderScopeKey(scopeKey);
    const { pinHash, pinSalt } = hashPin(pin);

    if (!memoryCatalog.settings.layout) memoryCatalog.settings.layout = {};
    if (!memoryCatalog.settings.layout.folderMeta) memoryCatalog.settings.layout.folderMeta = {};
    if (!memoryCatalog.settings.layout.folderMeta[normalizedScope]) {
      memoryCatalog.settings.layout.folderMeta[normalizedScope] = {};
    }

    const fMeta = memoryCatalog.settings.layout.folderMeta[normalizedScope];
    fMeta.isLocked = true;
    fMeta.pinHash = pinHash;
    fMeta.pinSalt = pinSalt;

    if (!req.session.unlockedFolders) req.session.unlockedFolders = [];
    if (!req.session.unlockedFolders.includes(normalizedScope)) {
      req.session.unlockedFolders.push(normalizedScope);
    }

    await saveCatalogToFile();
    return res.json({ success: true, isLocked: true, unlocked: true, scopeKey: normalizedScope });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get('/api/vault/read-text', requireAdminSession, async (req, res) => {
  try {
    const relPath = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });

    const driveRoot = resolveDriveRoot(req.query.drive);
    const fullPath = resolveSafeChildPath(driveRoot, relPath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }

    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'O caminho especificado não é um arquivo.' });
    }

    if (stat.size > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'Arquivo muito grande para edição no navegador (limite: 8 MB).' });
    }

    const fileContent = await fs.promises.readFile(fullPath, 'utf8');
    return res.json({
      success: true,
      path: relPath,
      name: path.basename(relPath),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      content: fileContent,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/vault/save-text', requireAdminSession, async (req, res) => {
  try {
    const { path: relPath, content = '' } = req.body || {};
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });

    const driveRoot = resolveDriveRoot(req.query.drive);
    const fullPath = resolveSafeChildPath(driveRoot, relPath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado para salvar.' });
    }

    await fs.promises.writeFile(fullPath, content, 'utf8');
    return res.json({ success: true, message: 'Arquivo salvo com sucesso!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/network/info', requireAdminSession, (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
    if (localIp !== '127.0.0.1') break;
  }

  const port = process.env.PORT || 8080;
  return res.json({
    localIp,
    port,
    webdavUrl: `http://${localIp}:${port}/webdav`,
    hostname: os.hostname(),
    platform: process.platform,
    uptime: os.uptime(),
  });
});

app.post('/api/vault/create-txt', requireAdminSession, async (req, res) => {
  try {
    let { folder = '', filename, content = '' } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'Nome do arquivo é obrigatório.' });

    let safeName = path.basename(filename).trim();
    if (!safeName.toLowerCase().endsWith('.txt')) {
      safeName += '.txt';
    }

    const driveRoot = resolveDriveRoot(req.query.drive);
    let targetBase;
    let cleanFolder = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (cleanFolder === 'stangorlini') cleanFolder = '';
    if (cleanFolder.startsWith('stangorlini/')) cleanFolder = cleanFolder.slice('stangorlini/'.length);

    if (cleanFolder === 'portfolio' || cleanFolder.startsWith('portfolio/')) {
      const portRel = cleanFolder.replace(/^portfolio\/?/, '');
      targetBase = portRel ? resolveSafeChildPath(PORTFOLIO_DIR, portRel) : PORTFOLIO_DIR;
    } else {
      targetBase = resolveVaultLogicalPath(driveRoot, cleanFolder);
    }

    if (!fs.existsSync(targetBase)) {
      await fs.promises.mkdir(targetBase, { recursive: true });
    }

    const filePath = path.join(targetBase, safeName);
    await fs.promises.writeFile(filePath, content, 'utf8');

    const relFilePath = cleanFolder ? `${cleanFolder}/${safeName}` : safeName;
    return res.json({
      success: true,
      filename: safeName,
      path: relFilePath,
      message: `Arquivo ${safeName} criado com sucesso!`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SPRINT 3 (V11.0): COMPARTILHAMENTO TEMPORÁRIO, CLIENT PROOFING & STREAMING ZIP
// ============================================================================

app.post('/api/shares/create', requireAdminSession, async (req, res) => {
  try {
    const { targetPath, title, mode, expiresInHours, allowZip, watermark } = req.body || {};
    if (targetPath === undefined || targetPath === null) {
      return res.status(400).json({ error: 'Caminho de destino obrigatório.' });
    }

    const share = shareManager.createShare({
      targetPath,
      title,
      mode,
      expiresInHours,
      allowZip,
      watermark,
      createdBy: req.session?.user || 'adm',
    });

    return res.json({ success: true, share });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/shares/list', requireAdminSession, (req, res) => {
  try {
    const shares = shareManager.listShares();
    return res.json({ success: true, shares });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shares/:id', requireAdminSession, (req, res) => {
  try {
    const deleted = shareManager.deleteShare(req.params.id);
    return res.json({ success: deleted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/s/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

app.get('/api/shares/:token/meta', async (req, res) => {
  try {
    const { valid, error, share } = shareManager.getShare(req.params.token);
    if (!valid) {
      return res.status(404).json({ error });
    }

    shareManager.recordAccess(req.params.token);

    let targetDir;
    const cleanTarget = (share.targetPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!cleanTarget || cleanTarget === 'portfolio' || cleanTarget.startsWith('portfolio/')) {
      const portRel = cleanTarget.replace(/^portfolio\/?/, '');
      targetDir = portRel ? resolveSafeChildPath(PORTFOLIO_DIR, portRel) : PORTFOLIO_DIR;
    } else {
      targetDir = resolveVaultLogicalPath(VAULT_ROOT_DIR, cleanTarget);
    }

    let items = [];
    if (fs.existsSync(targetDir)) {
      const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true }).catch(() => []);
      for (const d of dirents) {
        if (!d.isFile() || IGNORED_VAULT_FILES.has(d.name) || d.name.startsWith('.')) continue;
        const kind = classifyFileKind(d.name);
        const rel = cleanTarget ? `${cleanTarget}/${d.name}` : d.name;
        const portItem = (memoryCatalog?.items || []).find((it) => it.relativePath === rel || it.originalFile === d.name);

        items.push({
          name: d.name,
          path: rel,
          kind,
          thumbUrl: kind === 'image' ? (portItem?.thumbUrl || `/api/vault/thumb?path=${encodeURIComponent(rel)}`) : null,
          streamUrl: `/api/vault/stream?path=${encodeURIComponent(rel)}`,
          isFavorite: portItem ? Boolean(portItem.isFavorite) : false,
        });
      }
    }

    return res.json({
      success: true,
      share: {
        id: share.id,
        title: share.title,
        mode: share.mode,
        expiresAt: share.expiresAt,
        allowZip: share.allowZip,
        watermark: share.watermark,
        selectedItems: share.selectedItems || [],
        clientNotes: share.clientNotes || '',
      },
      items,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/shares/:token/feedback', async (req, res) => {
  try {
    const { selectedItems = [], clientNotes = '' } = req.body || {};
    const updatedShare = shareManager.saveClientFeedback(req.params.token, selectedItems, clientNotes);

    if (Array.isArray(selectedItems) && selectedItems.length > 0) {
      let catalogModified = false;
      const selectedSet = new Set(selectedItems.map((s) => String(s).toLowerCase()));

      for (const it of memoryCatalog?.items || []) {
        const itemRel = (it.relativePath || it.originalFile || '').toLowerCase();
        if (selectedSet.has(itemRel) || selectedSet.has(path.basename(itemRel))) {
          if (!Array.isArray(it.tags)) it.tags = [];
          if (!it.tags.includes('#selecionadas')) {
            it.tags.push('#selecionadas');
            catalogModified = true;
          }
        }
      }

      if (catalogModified) {
        await saveCatalogToFile();
      }
    }

    return res.json({ success: true, share: updatedShare });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

const uploadShareTemp = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_SINGLE_UPLOAD_BYTES } });

app.post('/api/shares/:token/upload', uploadShareTemp.array('files'), async (req, res) => {
  try {
    const { valid, error, share } = shareManager.getShare(req.params.token);
    if (!valid) return res.status(403).json({ error });
    if (share.mode !== 'upload_only') {
      return res.status(403).json({ error: 'Este link não aceita uploads de arquivos.' });
    }

    let targetDir;
    const cleanTarget = (share.targetPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!cleanTarget || cleanTarget === 'portfolio' || cleanTarget.startsWith('portfolio/')) {
      const portRel = cleanTarget.replace(/^portfolio\/?/, '');
      targetDir = portRel ? resolveSafeChildPath(PORTFOLIO_DIR, portRel) : PORTFOLIO_DIR;
    } else {
      targetDir = resolveVaultLogicalPath(VAULT_ROOT_DIR, cleanTarget);
    }

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    const savedFiles = [];
    for (const f of req.files || []) {
      const safeBaseName = path.basename(f.originalname).replace(/[^a-zA-Z0-9_\u00C0-\u017F\s.-]/g, '_');
      let destPath = path.join(targetDir, safeBaseName);
      if (fs.existsSync(destPath)) {
        const ext = path.extname(safeBaseName);
        const base = path.basename(safeBaseName, ext);
        destPath = path.join(targetDir, `${base}_${Date.now()}${ext}`);
      }

      await fs.promises.rename(f.path, destPath);
      savedFiles.push(path.basename(destPath));
    }

    return res.json({ success: true, count: savedFiles.length, files: savedFiles });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/zip', async (req, res) => {
  try {
    const { token, folder, drive } = req.query || {};
    let targetDir;
    let zipName = 'download.zip';

    if (token) {
      const { valid, error, share } = shareManager.getShare(token);
      if (!valid) return res.status(403).json({ error });
      if (!share.allowZip || share.watermark) {
        return res.status(403).json({ error: 'Download do álbum em .ZIP não permitido para este link.' });
      }

      const cleanTarget = (share.targetPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (!cleanTarget || cleanTarget === 'portfolio' || cleanTarget.startsWith('portfolio/')) {
        const portRel = cleanTarget.replace(/^portfolio\/?/, '');
        targetDir = portRel ? resolveSafeChildPath(PORTFOLIO_DIR, portRel) : PORTFOLIO_DIR;
      } else {
        targetDir = resolveVaultLogicalPath(VAULT_ROOT_DIR, cleanTarget);
      }
      zipName = `${share.title || 'album'}.zip`;
    } else {
      if (!req.session?.user) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }

      const driveRoot = resolveDriveRoot(drive);
      let cleanFolder = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (cleanFolder === 'stangorlini') cleanFolder = '';
      if (cleanFolder.startsWith('stangorlini/')) cleanFolder = cleanFolder.slice('stangorlini/'.length);

      if (cleanFolder === 'portfolio' || cleanFolder.startsWith('portfolio/')) {
        const portRel = cleanFolder.replace(/^portfolio\/?/, '');
        targetDir = portRel ? resolveSafeChildPath(PORTFOLIO_DIR, portRel) : PORTFOLIO_DIR;
      } else {
        targetDir = resolveVaultLogicalPath(driveRoot, cleanFolder);
      }
      zipName = `${path.basename(cleanFolder || 'arquivos')}.zip`;
    }

    return await streamDirectoryAsZip(targetDir, req, res, zipName);
  } catch (err) {
    console.error('[API ZIP] Erro ao exportar ZIP:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PORTFÓLIO OPCIONAL & INCLUSÃO DE PASTAS
// ============================================================================
app.post('/api/portfolio/settings', requireAdminSession, async (req, res) => {
  try {
    const { portfolioEnabled } = req.body || {};
    if (portfolioEnabled !== undefined) {
      memoryCatalog.settings.portfolioEnabled = Boolean(portfolioEnabled);
      await saveCatalogToFile();
    }
    return res.json({ success: true, portfolioEnabled: memoryCatalog.settings.portfolioEnabled !== false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/portfolio/folder-inclusion', requireAdminSession, async (req, res) => {
  try {
    const { scopeKey, inPortfolio } = req.body || {};
    if (!scopeKey) return res.status(400).json({ error: 'scopeKey obrigatório.' });

    const normalizedScope = normalizeFolderScopeKey(scopeKey);
    if (!memoryCatalog.settings.layout) memoryCatalog.settings.layout = {};
    if (!memoryCatalog.settings.layout.folderMeta) memoryCatalog.settings.layout.folderMeta = {};
    if (!memoryCatalog.settings.layout.folderMeta[normalizedScope]) {
      memoryCatalog.settings.layout.folderMeta[normalizedScope] = {};
    }

    memoryCatalog.settings.layout.folderMeta[normalizedScope].inPortfolio = Boolean(inPortfolio);
    await saveCatalogToFile();
    return res.json({
      success: true,
      scopeKey: normalizedScope,
      inPortfolio: Boolean(inPortfolio),
      folderMeta: memoryCatalog.settings.layout.folderMeta,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/vault/curate', requireAdminSession, async (req, res) => {
  try {
    const { path: targetPath, visibility, album, subalbum, isFolder } = req.body || {};
    if (!targetPath) return res.status(400).json({ error: 'Caminho obrigatório.' });

    const cleanPath = String(targetPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const cleanVisibility = visibility === 'private' ? 'private' : 'public';
    let updatedCount = 0;

    if (isFolder) {
      if (!memoryCatalog.settings.folderCuration) {
        memoryCatalog.settings.folderCuration = {};
      }
      memoryCatalog.settings.folderCuration[cleanPath] = {
        visibility: cleanVisibility,
        album: album || null,
        subalbum: subalbum || null,
        updatedAt: new Date().toISOString(),
      };

      if (Array.isArray(memoryCatalog.items)) {
        for (const item of memoryCatalog.items) {
          if (item.relativePath && (item.relativePath === cleanPath || item.relativePath.startsWith(`${cleanPath}/`))) {
            item.visibility = cleanVisibility;
            if (album) item.album = album;
            if (subalbum !== undefined) item.subalbum = subalbum;
            updatedCount++;
          }
        }
      }
    } else {
      let found = false;
      if (Array.isArray(memoryCatalog.items)) {
        for (const item of memoryCatalog.items) {
          if (item.relativePath === cleanPath || item.originalFile === path.basename(cleanPath)) {
            item.visibility = cleanVisibility;
            if (album) item.album = album;
            if (subalbum !== undefined) item.subalbum = subalbum;
            found = true;
            updatedCount++;
            break;
          }
        }
      }
      if (!found) {
        const baseName = path.basename(cleanPath, path.extname(cleanPath));
        const targetAlbum = album || 'DESTAQUES';
        const encodedRel = cleanPath.split('/').map(encodeURIComponent).join('/');
        const fullPath = path.join(STORAGE_DIR, cleanPath);
        let sizeBytes = 0;
        try { sizeBytes = fs.statSync(fullPath).size; } catch {}
        const newItem = normalizeItemVisualProps({
          id: `curated_${crypto.createHash('md5').update(cleanPath).digest('hex').slice(0, 10)}`,
          title: baseName,
          album: targetAlbum,
          subalbum: subalbum || null,
          description: '',
          originalFile: path.basename(cleanPath),
          relativePath: cleanPath,
          originalUrl: `/portfolio-media/content/${encodedRel}`,
          thumbUrl: `/portfolio-media/thumb/${encodedRel}`,
          width: 1600,
          height: 1067,
          sizeBytes,
          visibility: cleanVisibility,
          exif: {},
          order: memoryCatalog.items.length,
          createdAt: new Date().toISOString(),
        }, memoryCatalog.items.length);
        memoryCatalog.items.push(newItem);
        updatedCount++;
      }
    }

    await persistCatalog();
    return res.json({ success: true, updatedCount, visibility: cleanVisibility });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint Sprint 1: Atualização e Sincronização de Metadados via Cofre (Favoritos, Tags e Atalhos)
app.post('/api/vault/meta', requireAdminSession, async (req, res) => {
  try {
    const { paths, itemIds, isFavorite, tags, addTags, removeTags, isFolder, scopeKey, color, icon } = req.body || {};
    const pathList = Array.isArray(paths) ? paths.map(String) : [];
    const idList = Array.isArray(itemIds) ? itemIds.map(String) : [];

    // Inicializa estruturas de persistência necessárias
    if (!memoryCatalog.settings) memoryCatalog.settings = {};
    if (!memoryCatalog.settings.layout) memoryCatalog.settings.layout = normalizeLayoutSettings({});
    if (!memoryCatalog.settings.layout.folderMeta) memoryCatalog.settings.layout.folderMeta = {};
    if (!memoryCatalog.settings.vaultFileMeta) memoryCatalog.settings.vaultFileMeta = {};

    // Caso 1: Atualização de pasta (Cor, Ícone, Favorito ou Tags de pasta)
    if (isFolder || scopeKey) {
      const rawTarget = String(scopeKey || pathList[0] || '').trim();
      const cleanScope = normalizeFolderScopeKey(rawTarget) || rawTarget;
      if (!cleanScope) return res.status(400).json({ error: 'scopeKey obrigatório.' });

      const current = memoryCatalog.settings.layout.folderMeta[cleanScope] || {};
      memoryCatalog.settings.layout.folderMeta[cleanScope] = {
        ...current,
        color: color !== undefined ? color : current.color || null,
        icon: icon !== undefined ? icon : current.icon || null,
        isFavorite: isFavorite !== undefined ? Boolean(isFavorite) : Boolean(current.isFavorite),
        tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : Array.isArray(current.tags) ? current.tags : [],
      };

      await persistCatalog();
      return res.json({ success: true, scopeKey: cleanScope, folderMeta: memoryCatalog.settings.layout.folderMeta });
    }

    // Caso 2: Atualização de arquivos (Favoritos e Tags) via itemIds OU paths
    if (pathList.length === 0 && idList.length === 0) {
      return res.status(400).json({ error: 'Nenhum caminho ou ID de arquivo informado.' });
    }
    let updatedCount = 0;
    const idSet = new Set(idList);

    // 2.1 Verifica itens do portfólio (memoryCatalog.items)
    for (const it of memoryCatalog.items || []) {
      const itRel = (it.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const itWithPort = `portfolio/${itRel}`;
      const itBase = it.originalFile || path.basename(itRel);

      const matches = idSet.has(String(it.id)) || pathList.some((p) => {
        const cleanP = String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        return cleanP === itRel || cleanP === itWithPort || cleanP === itBase;
      });

      if (matches) {
        if (isFavorite !== undefined) {
          it.isFavorite = Boolean(isFavorite);
        }
        if (Array.isArray(tags)) {
          it.tags = tags.map((t) => String(t).trim()).filter(Boolean);
        } else {
          if (!Array.isArray(it.tags)) it.tags = [];
          if (Array.isArray(addTags)) {
            for (const t of addTags) {
              const cleanT = String(t).trim();
              if (cleanT && !it.tags.includes(cleanT)) it.tags.push(cleanT);
            }
          }
          if (Array.isArray(removeTags)) {
            const remSet = new Set(removeTags.map((t) => String(t).trim()));
            it.tags = it.tags.filter((t) => !remSet.has(t));
          }
        }
        updatedCount++;
      }
    }

    // 2.2 Suporte a arquivos gerais do HD fora do portfólio (vault/*, media/*, etc.)
    for (const p of pathList) {
      const cleanP = String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const isAlreadyPortfolio = (memoryCatalog.items || []).some((it) => {
        const itRel = (it.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        return cleanP === itRel || cleanP === `portfolio/${itRel}`;
      });

      if (!isAlreadyPortfolio) {
        const cur = memoryCatalog.settings.vaultFileMeta[cleanP] || {};
        let finalTags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : (Array.isArray(cur.tags) ? [...cur.tags] : []);
        if (Array.isArray(addTags)) {
          for (const t of addTags) {
            const cleanT = String(t).trim();
            if (cleanT && !finalTags.includes(cleanT)) finalTags.push(cleanT);
          }
        }
        if (Array.isArray(removeTags)) {
          const remSet = new Set(removeTags.map((t) => String(t).trim()));
          finalTags = finalTags.filter((t) => !removeSet.has(t));
        }
        memoryCatalog.settings.vaultFileMeta[cleanP] = {
          ...cur,
          isFavorite: isFavorite !== undefined ? Boolean(isFavorite) : Boolean(cur.isFavorite),
          tags: finalTags,
        };
        updatedCount++;
      }
    }

    await persistCatalog();
    return res.json({
      success: true,
      updatedCount,
      folderMeta: memoryCatalog.settings.layout.folderMeta,
      vaultFileMeta: memoryCatalog.settings.vaultFileMeta,
      catalog: memoryCatalog,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function resolvePortfolioItemDiskFile(item) {
  if (!item) return null;
  const rel = item.relativePath || (item.album && item.originalFile ? `${item.album}/${item.originalFile}` : item.originalFile);
  if (!rel) return null;

  const candidates = [
    path.join(PORTFOLIO_DIR, rel),
    path.join(PORTFOLIO_ORIGINALS_DIR, rel),
    path.join(PORTFOLIO_DIR, item.originalFile || ''),
    path.join(PORTFOLIO_ORIGINALS_DIR, item.originalFile || ''),
    path.join(STORAGE_DIR, 'portfolio', rel),
    path.join(STORAGE_DIR, rel),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        if (fs.statSync(c).isFile()) return c;
      } catch {}
    }
  }

  // Fallback para miniatura em alta resolução caso o arquivo original não resida no disco local
  const cacheKey = crypto.createHash('md5').update(rel).digest('hex');
  const thumbCandidates = [
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_640.avif`),
    path.join(INTERNAL_THUMBS_DIR, `thumb_${cacheKey}_640.webp`),
    path.join(PORTFOLIO_THUMBS_DIR, `thumb_${cacheKey}_640.avif`),
  ];
  for (const tc of thumbCandidates) {
    if (fs.existsSync(tc)) {
      try {
        if (fs.statSync(tc).isFile()) return tc;
      } catch {}
    }
  }

  return null;
}

async function collectFolderFiles(rawFolder, driveId, isAdmin) {
  const isPortfolioScope =
    rawFolder === '' ||
    rawFolder === 'portfolio' ||
    rawFolder.startsWith('portfolio/') ||
    (Array.isArray(memoryCatalog.albums) && memoryCatalog.albums.includes(rawFolder));

  const files = [];
  const seenZipRels = new Set();

  if (isPortfolioScope) {
    let targetAlbum = null;
    let targetSub = null;

    if (rawFolder === 'portfolio' || rawFolder === '') {
      targetAlbum = null;
      targetSub = null;
    } else {
      const portRel = rawFolder.replace(/^portfolio\/?/, '');
      const parts = portRel.split('/').filter(Boolean);
      targetAlbum = parts[0] || null;
      targetSub = parts.slice(1).join('/') || null;
    }

    const items = (memoryCatalog.items || []).filter((it) => {
      if (!isAdmin && it.visibility === 'private') return false;
      if (!targetAlbum) return true;
      if (it.album !== targetAlbum) return false;
      if (targetSub && it.subalbum !== targetSub) return false;
      return true;
    });

    for (const it of items) {
      const diskPath = resolvePortfolioItemDiskFile(it);
      if (!diskPath) continue;

      let zipRelPath = '';
      const baseFile = it.originalFile || path.basename(it.relativePath || 'foto.jpg');
      if (targetSub) {
        zipRelPath = baseFile;
      } else if (targetAlbum) {
        zipRelPath = it.subalbum ? `${it.subalbum}/${baseFile}` : baseFile;
      } else {
        zipRelPath = `${it.album || 'GERAL'}/${it.subalbum ? `${it.subalbum}/` : ''}${baseFile}`;
      }

      // Deduplicação de nomes dentro do zip
      let finalRel = zipRelPath;
      let counter = 1;
      const ext = path.extname(zipRelPath);
      const stem = zipRelPath.slice(0, zipRelPath.length - ext.length);
      while (seenZipRels.has(finalRel.toLowerCase())) {
        finalRel = `${stem} (${counter})${ext}`;
        counter++;
      }
      seenZipRels.add(finalRel.toLowerCase());

      const st = fs.statSync(diskPath);
      files.push({
        name: baseFile,
        relPath: finalRel,
        diskPath,
        sizeBytes: st.size,
        streamUrl: it.originalUrl || `/api/vault/stream?path=${encodeURIComponent('portfolio/' + (it.relativePath || baseFile))}`,
      });
    }
  }

  // Se a pasta existir fisicamente no disco, faz merge de quaisquer arquivos físicos adicionais
  try {
    const driveRoot = resolveDriveRoot(driveId);
    const targetDir = resolveSafeChildPath(driveRoot, rawFolder);

    async function walk(dir, rel = '', depth = 0) {
      if (depth > 12) return;
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const d of dirents) {
        if (['node_modules', '.git', 'lost+found', 'LOST.DIR', '$RECYCLE.BIN', 'System Volume Information', '.DS_Store', 'Thumbs.db'].includes(d.name)) continue;
        const fileRel = rel ? `${rel}/${d.name}` : d.name;
        const full = path.join(dir, d.name);
        if (d.isDirectory()) {
          await walk(full, fileRel, depth + 1);
        } else if (d.isFile()) {
          const zipRelLower = fileRel.toLowerCase();
          if (!seenZipRels.has(zipRelLower)) {
            seenZipRels.add(zipRelLower);
            try {
              const st = await fs.promises.stat(full);
              files.push({
                name: d.name,
                relPath: fileRel,
                diskPath: full,
                sizeBytes: st.size,
                streamUrl: `/api/vault/stream?path=${encodeURIComponent(rawFolder ? `${rawFolder}/${fileRel}` : fileRel)}${driveId ? `&drive=${encodeURIComponent(driveId)}` : ''}`,
              });
            } catch {}
          }
        }
      }
    }

    if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
      await walk(targetDir);
    }
  } catch {}

  return files;
}

app.get('/api/vault/folder-manifest', async (req, res) => {
  try {
    const rawFolder = String(req.query.folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const isAdmin = isRequestAuthenticatedAdmin(req);
    const isPortfolioScope =
      rawFolder === '' ||
      rawFolder === 'portfolio' ||
      rawFolder.startsWith('portfolio/') ||
      (Array.isArray(memoryCatalog.albums) && memoryCatalog.albums.includes(rawFolder));

    if (!isPortfolioScope && !isAdmin) {
      return res.status(401).json({ error: 'Sessão administrativa necessária para acessar esta pasta do cofre.' });
    }

    const files = await collectFolderFiles(rawFolder, req.query.drive, isAdmin);
    const totalBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

    return res.json({
      folder: rawFolder,
      files,
      totalBytes,
      fileCount: files.length,
      drive: req.query.drive || 'primary',
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get(['/api/vault/download-zip', '/api/portfolio/download-zip'], async (req, res) => {
  try {
    const rawFolder = String(req.query.folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const isAdmin = isRequestAuthenticatedAdmin(req);
    const isPortfolioScope =
      rawFolder === '' ||
      rawFolder === 'portfolio' ||
      rawFolder.startsWith('portfolio/') ||
      (Array.isArray(memoryCatalog.albums) && memoryCatalog.albums.includes(rawFolder));

    if (!isPortfolioScope && !isAdmin) {
      return res.status(401).json({ error: 'Sessão administrativa necessária para baixar arquivos do cofre.' });
    }

    const files = await collectFolderFiles(rawFolder, req.query.drive, isAdmin);

    if (files.length === 0) {
      return res.status(404).json({ error: 'Nenhum arquivo encontrado nesta pasta para download.' });
    }

    let cleanZipName = 'acervo';
    if (rawFolder) {
      const parts = rawFolder.split('/').filter(Boolean);
      cleanZipName = sanitizeFilename(parts[parts.length - 1] || 'pasta');
    } else {
      cleanZipName = 'acervo_geral';
    }

    const safeAsciiName = cleanZipName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'acervo';
    const encodedZipName = encodeURIComponent(`${cleanZipName}.zip`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiName}.zip"; filename*=UTF-8''${encodedZipName}`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let clientAborted = false;
    req.on('close', () => {
      clientAborted = true;
    });

    const zip = new fflate.Zip((err, chunk, isFinal) => {
      if (clientAborted) return;
      if (err) {
        console.warn('[ZipStream] Erro no empacotamento fflate:', err.message);
        if (!res.headersSent) res.status(500).end();
        return;
      }
      res.write(chunk);
      if (isFinal) {
        res.end();
      }
    });

    for (const f of files) {
      if (clientAborted) break;
      try {
        const pass = new fflate.ZipPassThrough(f.relPath);
        zip.add(pass);
        const readStream = fs.createReadStream(f.diskPath);
        for await (const chunk of readStream) {
          if (clientAborted) break;
          pass.push(chunk, false);
        }
        pass.push(new Uint8Array(0), true);
      } catch (streamErr) {
        console.warn(`[ZipStream] Falha ao ler arquivo ${f.relPath}:`, streamErr.message);
      }
    }

    if (!clientAborted) {
      zip.end();
    }
  } catch (err) {
    console.error('[DownloadZip] Erro geral:', err);
    if (!res.headersSent) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
});

// ============================================================================
// 11. GRUPO E: ZONA 3 — TELEMETRIA DO SERVIDOR & MÍDIAS DO HUB (media/)
// ============================================================================
function buildTelemetryPayload() {
  const disk = getDiskCapacitySync(STORAGE_DIR);

  // Mapeamento de discos secundários caso zonas residam em caminhos/HDs distintos
  const mountedDisks = [];
  const trackedRoots = new Set();
  for (const [label, dirPath] of [
    ['HD Principal', STORAGE_DIR],
    ['Zona Media (HUB)', MEDIA_DIR],
    ['Zona Portfolio', PORTFOLIO_DIR],
    ['Zona Vault (Cofre)', VAULT_DIR],
  ]) {
    const resPath = path.resolve(dirPath);
    if (!trackedRoots.has(resPath)) {
      trackedRoots.add(resPath);
      const cap = getDiskCapacitySync(resPath);
      mountedDisks.push({ label, path: resPath, ...cap });
    }
  }

  const mem = getRealMemInfo();
  const cpus = os.cpus() || [];

  const storageDevices = [];
  try {
    if (fs.existsSync('/storage')) {
      const ents = fs.readdirSync('/storage', { withFileTypes: true });
      for (const ent of ents) {
        const p = path.join('/storage', ent.name);
        let cap = null;
        let contents = [];
        try { cap = getDiskCapacitySync(p); } catch {}
        try { contents = fs.readdirSync(p).slice(0, 10); } catch (e) { contents = [e.message]; }
        storageDevices.push({ name: ent.name, isDir: ent.isDirectory(), path: p, cap, contents });
      }
    }
  } catch (e) {
    storageDevices.push({ error: e.message });
  }

  let stagingFilesCount = 0;
  let stagingTotalBytes = 0;
  try {
    if (fs.existsSync(TENANT_UPLOAD_STAGING_DIR)) {
      const sFiles = fs.readdirSync(TENANT_UPLOAD_STAGING_DIR);
      stagingFilesCount = sFiles.length;
      for (const sf of sFiles) {
        try {
          stagingTotalBytes += fs.statSync(path.join(TENANT_UPLOAD_STAGING_DIR, sf)).size;
        } catch {}
      }
    }
  } catch {}

  let procMounts = [];
  try {
    if (fs.existsSync('/proc/mounts')) {
      procMounts = fs.readFileSync('/proc/mounts', 'utf8').split('\n').filter(l => l.includes('/storage') || l.includes('/mnt') || l.includes('sd') || l.includes('fuse') || l.includes('vfat'));
    }
  } catch (e) {
    procMounts = [e.message];
  }

  let devBlocks = [];
  try {
    if (fs.existsSync('/dev/block')) {
      devBlocks = fs.readdirSync('/dev/block').slice(0, 30);
    }
  } catch (e) {
    devBlocks = [e.message];
  }

  let mntDirs = [];
  try {
    if (fs.existsSync('/mnt')) {
      mntDirs = fs.readdirSync('/mnt');
    }
  } catch (e) {
    mntDirs = [e.message];
  }

  let mediaRw = [];
  try {
    if (fs.existsSync('/mnt/media_rw')) {
      mediaRw = fs.readdirSync('/mnt/media_rw');
    }
  } catch (e) {
    mediaRw = [e.message];
  }

  const usbPathChecks = {
    '32AB_root': fs.existsSync('/storage/32AB-1915'),
    '32AB_hub': fs.existsSync('/storage/32AB-1915/Android/data/com.termux/files/hub_data'),
    '31E0_root': fs.existsSync('/storage/31E0-19FD'),
    '31E0_hub': fs.existsSync('/storage/31E0-19FD/Android/data/com.termux/files/hub_data'),
    'sdcard': fs.existsSync('/sdcard'),
    'sdcard_hub': fs.existsSync('/sdcard/Android/data/com.termux/files/hub_data'),
  };

  let usbDevices = [];
  try {
    if (fs.existsSync('/sys/bus/usb/devices')) {
      usbDevices = fs.readdirSync('/sys/bus/usb/devices');
    }
  } catch (e) {
    usbDevices = [e.message];
  }

  return {
    device: 'FireTV-Termux',
    storagePath: STORAGE_DIR,
    mediaPath: MEDIA_DIR,
    portfolioPath: PORTFOLIO_DIR,
    vaultPath: VAULT_DIR,
    envStorageDir: process.env.STORAGE_DIR || null,
    internalDataDir: INTERNAL_DATA_DIR,
    stagingDir: TENANT_UPLOAD_STAGING_DIR,
    stagingMetrics: { count: stagingFilesCount, bytes: stagingTotalBytes },
    procMounts,
    devBlocks,
    mntDirs,
    mediaRw,
    usbDevices,
    usbPathChecks,
    storageDevices,
    disk,
    disks: mountedDisks,
    zones: {
      portfolio: dirStatsCache.portfolio,
      vault: dirStatsCache.vault,
      media: dirStatsCache.media,
      isScanning: dirStatsCache.isScanning,
      lastCalculatedAt: dirStatsCache.lastCalculatedAt,
    },
    memory: {
      totalBytes: mem.totalBytes,
      freeBytes: mem.freeBytes,
      usedBytes: mem.usedBytes,
      percentUsed: mem.percentUsed,
      isProcMemInfo: mem.isProcMemInfo,
      processRssBytes: process.memoryUsage().rss,
    },
    cpu: {
      model: cpus[0]?.model || 'ARM Processor',
      cores: cpus.length || 4,
      arch: os.arch(),
      platform: os.platform(),
      loadAvg: os.loadavg(),
    },
    uptime: {
      processSec: Math.floor(process.uptime()),
      osSec: Math.floor(os.uptime()),
    },
    timestamp: new Date().toISOString(),
  };
}

app.get('/api/server/telemetry', requireAdminSession, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildTelemetryPayload());
});

app.get('/api/admin/usb-diag', requireAdminSession, async (_req, res) => {
  const { exec } = require('child_process');
  const customEnv = {
    ...process.env,
    PATH: `${process.env.PATH || ''}:/system/bin:/system/xbin:/sbin`,
  };
  const runCmd = (cmd) =>
    new Promise((resolve) => {
      exec(cmd, { env: customEnv, timeout: 4000 }, (err, stdout, stderr) => {
        resolve({
          stdout: (stdout || '').trim().slice(0, 5000),
          stderr: (stderr || '').trim().slice(0, 1000),
          code: err ? err.code : 0,
        });
      });
    });

  const [logcatVold, dfOut, getpropUsb, lsStorage, dumpsysUsb, smOut] = await Promise.all([
    runCmd('logcat -d -t 150 -s vold:* Vold:* Usb:* sdcardfs:* FUSE:*'),
    runCmd('df -h'),
    runCmd('getprop | grep -iE "usb|storage|vold"'),
    runCmd('ls -la /storage/ 2>&1'),
    runCmd('dumpsys usb 2>&1 | head -n 40 || true'),
    runCmd('sm list-disks 2>&1 || sm list-volumes 2>&1 || true'),
  ]);

  return res.json({
    logcatVold,
    dfOut,
    getpropUsb,
    lsStorage,
    dumpsysUsb,
    smOut,
  });
});

app.post('/api/server/telemetry/recalculate', requireAdminSession, async (_req, res) => {
  await recalculateAllZonesAsync();
  res.json(buildTelemetryPayload());
});

app.get('/api/hub-media/list', requireAdminSession, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim().toLowerCase();
    const filterType = String(req.query.type || 'all').toLowerCase();
    const sortBy = String(req.query.sort || 'newest').toLowerCase();

    const entries = await fs.promises.readdir(MEDIA_DIR, { withFileTypes: true });
    const items = [];

    for (const d of entries) {
      if (!d.isFile()) continue;
      if (query && !d.name.toLowerCase().includes(query)) continue;

      const kind = classifyFileKind(d.name);
      if (filterType !== 'all') {
        if (filterType === 'other' && ['image', 'pdf', 'video'].includes(kind)) continue;
        if (filterType !== 'other' && kind !== filterType) continue;
      }

      try {
        const st = await fs.promises.stat(path.join(MEDIA_DIR, d.name));
        items.push({
          filename: d.name,
          url: `/media/${encodeURIComponent(d.name)}`,
          sizeBytes: st.size,
          kind,
          mimeType: getMimeType(d.name),
          modifiedAt: st.mtime.toISOString(),
        });
      } catch {}
    }

    if (sortBy === 'largest') {
      items.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } else if (sortBy === 'name') {
      items.sort((a, b) => a.filename.localeCompare(b.filename, 'pt-BR'));
    } else {
      items.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    }

    return res.json({
      totalMatched: items.length,
      cachedZoneStats: dirStatsCache.media,
      files: items,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/hub-media/upload', requireAdminSession, uploadHubMedia.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  adjustZoneStats('media', req.file.size, 1);

  return res.status(201).json({
    success: true,
    filename: req.file.filename,
    url: `/media/${req.file.filename}`,
    sizeBytes: req.file.size,
    kind: classifyFileKind(req.file.filename),
  });
});

app.delete('/api/hub-media/:filename', requireAdminSession, async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  const targetPath = path.join(MEDIA_DIR, filename);

  try {
    const st = await fs.promises.stat(targetPath);
    await fs.promises.unlink(targetPath);
    adjustZoneStats('media', -st.size, -1);
    return res.json({ success: true });
  } catch {
    return res.status(404).json({ error: 'Arquivo não encontrado em media/.' });
  }
});

// ============================================================================
// 11B. LISTA DE ESPERA DO BETA — AURTISTIC (PERSISTÊNCIA EM DISCO)
// ============================================================================
const BETA_LIST_PATH = path.join(INTERNAL_DATA_DIR, 'aurtistic_beta_list.json');
const BETA_BACKUP_PATH = path.join(STORAGE_DIR, 'aurtistic_beta_list.json');

async function readBetaListSafe() {
  for (const p of [BETA_LIST_PATH, BETA_BACKUP_PATH]) {
    try {
      if (fs.existsSync(p)) {
        const raw = await fs.promises.readFile(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
  }
  return [];
}

async function writeBetaListSafe(list) {
  const payload = JSON.stringify(list, null, 2);
  try {
    await fs.promises.mkdir(path.dirname(BETA_LIST_PATH), { recursive: true });
    await fs.promises.writeFile(BETA_LIST_PATH, payload, 'utf8');
  } catch {}
  try {
    if (fs.existsSync(STORAGE_DIR)) {
      await fs.promises.writeFile(BETA_BACKUP_PATH, payload, 'utf8');
    }
  } catch {}
}

app.post('/api/beta-signup', express.json(), async (req, res) => {
  const rawEmail = String(req.body?.email || '').trim().toLowerCase();
  const appName = String(req.body?.app || 'aurtistic').trim().slice(0, 40);
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) || rawEmail.length > 160) {
    return res.status(400).json({ error: 'Informe um endereço de e-mail válido para entrar na lista do Beta.' });
  }

  const list = await readBetaListSafe();
  const alreadyExists = list.some((entry) => entry.email === rawEmail && entry.app === appName);
  if (!alreadyExists) {
    list.push({
      email: rawEmail,
      app: appName,
      createdAt: new Date().toISOString(),
      ip: getClientIp(req),
    });
    await writeBetaListSafe(list);
  }

  return res.status(200).json({
    success: true,
    alreadyRegistered: alreadyExists,
    message: alreadyExists
      ? 'Este e-mail já está cadastrado na lista de testes Beta do Aurtistic!'
      : 'E-mail cadastrado com sucesso na lista do Beta fechado do Aurtistic!',
    totalSignups: list.length,
  });
});

app.get('/api/admin/beta-signups', requireAdminSession, async (_req, res) => {
  const list = await readBetaListSafe();
  return res.json({ count: list.length, items: list });
});

// ============================================================================
// 11.5. PLANO DE DADOS MULTI-TENANT AURTISTIC v4.1 (/api/tenant/*)
// - Chroot lógico por usuário (/users/{userId}/ com 4 pastas padrão)
// - Segurança allowedPaths em public_media (403 p/ qualquer arquivo não assinado)
// - Ponte Zero-Copy FAT32 p/ PRIMARY_ADMIN_UUID (merge deduplicado + 2.369 fotos)
// - Reuso 100% das miniaturas .avif (data/thumbs/) e sig_index.json sem recomprimir
// - Delta exato (newBytes - prevBytes) em overwrite de uploads e notas .md
// - Ciclo completo de Lixeira (.trash) isolada por usuário
// ============================================================================
const PRIMARY_ADMIN_UUID = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
// Determine base directory for tenant roots. On FireStick USB storage the raw mount point (/storage/XXXX-XXXX) is read‑only for direct mkdir; we use the hub_data sub‑folder which Termux creates with full permissions.
function getTenantBaseDir() {
  // STORAGE_DIR is set earlier via env or discovery logic
  const base = STORAGE_DIR;
  if (base && base.startsWith('/storage/')) {
    // Prefer a writable subfolder inside hub_data if it exists, otherwise fallback to fallback internal storage
    const hubPath = path.join(base, 'hub_data');
    try {
      if (!fs.existsSync(hubPath)) fs.mkdirSync(hubPath, { recursive: true });
      return hubPath;
    } catch (e) {
      console.warn(`[TenantBase] Não pôde criar hub_data em ${base}: ${e.message}`);
      // fallback to internal safe dir
    }
  }
  // Fallback for dev or non‑USB mounts
  const fallback = path.join(__dirname, 'storage');
  try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
  return fallback;
}

// Roots for user and org tenants – use the writable base
const TENANT_BASE_DIR = getTenantBaseDir();
const USERS_ROOT_DIR = path.join(TENANT_BASE_DIR, 'users');
const ORGS_ROOT_DIR  = path.join(TENANT_BASE_DIR, 'orgs');
const DEFAULT_TENANT_SUBFOLDERS = [];
const TENANT_PINS_FILE = path.join(INTERNAL_DATA_DIR, 'tenant_folder_pins.json');
const TENANT_UPLOAD_STAGING_DIR = path.join(TENANT_BASE_DIR, 'tmp_tenant_uploads');

for (const d of [USERS_ROOT_DIR, ORGS_ROOT_DIR, TENANT_UPLOAD_STAGING_DIR]) {
  try {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  } catch (e) {
    console.warn(`[StorageInit] Não foi possível criar ${d}: ${e.message}`);
  }
}

let tenantFolderPinsStore = {};
try {
  if (fs.existsSync(TENANT_PINS_FILE)) {
    const rawPins = JSON.parse(fs.readFileSync(TENANT_PINS_FILE, 'utf8'));
    if (rawPins && typeof rawPins === 'object') tenantFolderPinsStore = rawPins;
  }
} catch {}

async function persistTenantFolderPins() {
  try {
    await atomicWriteFile(TENANT_PINS_FILE, JSON.stringify(tenantFolderPinsStore, null, 2), 'utf8');
  } catch {}
}

function resolveTenantHmacSecret() {
  const configured =
    process.env.EDGE_HMAC_SECRET ||
    process.env.STORAGE_API_KEY ||
    process.env.API_SECRET_KEY ||
    API_SECRET_KEY;
  if (configured && String(configured).trim().length >= 16) {
    return String(configured).trim();
  }
  return '9db10bd8c7ac36d7a9481c3f9fb00054e1f016bca2c3ebe9';
}

function normalizeTenantRelPath(rawPath) {
  const raw = String(rawPath || '');
  if (raw.includes('\0')) {
    const err = new Error('Caractere nulo inválido no caminho.');
    err.statusCode = 400;
    throw err;
  }
  const clean = raw
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
  if (!clean) return '';
  const parts = clean.split('/');
  for (const seg of parts) {
    if (!seg || seg === '.' || seg === '..') {
      const err = new Error('Path traversal bloqueado.');
      err.statusCode = 400;
      throw err;
    }
  }
  return parts.join('/');
}

async function ensureTenantRootProvisioned(userId) {
  const userRoot = resolveSafeChildPath(USERS_ROOT_DIR, userId);
  if (!fs.existsSync(userRoot)) {
    await fs.promises.mkdir(userRoot, { recursive: true });
  }
  for (const folderName of DEFAULT_TENANT_SUBFOLDERS) {
    const subDir = path.join(userRoot, folderName);
    if (!fs.existsSync(subDir)) {
      await fs.promises.mkdir(subDir, { recursive: true }).catch(() => {});
    }
  }
  return userRoot;
}

/**
 * [PONTE ZERO-COPY FAT32 — DETALHE OBRIGATÓRIO #1 & CORREÇÃO 4]:
 * Resolve caminhos dentro da jaula /users/{userId}/.
 * Para o PRIMARY_ADMIN_UUID em subcaminhos de "Portfolio/..." e escopo de usuário (scopeType !== 'org'),
 * se o arquivo ou subpasta não existir fisicamente em userRoot/Portfolio/..., faz fallback para PORTFOLIO_DIR/...
 */
function resolveTenantSafePath(userId, userRoot, relPath = '', options = { forWrite: false }, scopeType = 'user', role = 'member') {
  const cleanRel = normalizeTenantRelPath(relPath);
  const primaryTarget = cleanRel ? resolveSafeChildPath(userRoot, cleanRel) : userRoot;

  const isPortRel =
    cleanRel.toLowerCase() === 'portfolio' ||
    cleanRel.toLowerCase().startsWith('portfolio/') ||
    cleanRel.toLowerCase() === 'portifolio' ||
    cleanRel.toLowerCase().startsWith('portifolio/');

  if (
    !options.forWrite &&
    scopeType !== 'org' &&
    (userId === PRIMARY_ADMIN_UUID || role === 'admin') &&
    isPortRel &&
    !fs.existsSync(primaryTarget)
  ) {
    const legacySub = cleanRel.replace(/^(portfolio|portifolio)\/?/i, '');
    const legacyTarget = legacySub ? resolveSafeChildPath(PORTFOLIO_DIR, legacySub) : PORTFOLIO_DIR;
    if (fs.existsSync(legacyTarget)) {
      return legacyTarget;
    }
  }

  return primaryTarget;
}

/**
 * Retorna os diretórios físicos que compõem uma pasta lógica do tenant.
 * Para PRIMARY_ADMIN_UUID em escopo de usuário (scopeType !== 'org') dentro de "Portfolio" ou "Portfolio/*",
 * retorna tanto o diretório em userRoot/Portfolio quanto o correspondente em PORTFOLIO_DIR para merge deduplicado!
 */
function resolveTenantListingDirs(userId, userRoot, cleanRel, scopeType = 'user', role = 'member') {
  const primaryDir = cleanRel ? resolveSafeChildPath(userRoot, cleanRel) : userRoot;
  const dirs = [];
  if (fs.existsSync(primaryDir)) {
    dirs.push({ dirPath: primaryDir, isLegacyBridge: false });
  }

  const isPortRel =
    cleanRel.toLowerCase() === 'portfolio' ||
    cleanRel.toLowerCase().startsWith('portfolio/') ||
    cleanRel.toLowerCase() === 'portifolio' ||
    cleanRel.toLowerCase().startsWith('portifolio/');

  if (
    scopeType !== 'org' &&
    (userId === PRIMARY_ADMIN_UUID || role === 'admin') &&
    isPortRel
  ) {
    const legacySub = cleanRel.replace(/^(portfolio|portifolio)\/?/i, '');
    try {
      const legacyDir = legacySub ? resolveSafeChildPath(PORTFOLIO_DIR, legacySub) : PORTFOLIO_DIR;
      if (
        fs.existsSync(legacyDir) &&
        path.resolve(legacyDir) !== path.resolve(primaryDir)
      ) {
        dirs.push({ dirPath: legacyDir, isLegacyBridge: true });
      }
    } catch {}
  }

  return dirs;
}

const tenantUsedBytesCache = new Map();

async function computeDirectoryBytesRecursive(dirPath, ignoreTopNames = new Set(['.trash'])) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (ignoreTopNames && ignoreTopNames.has(ent.name)) continue;
    const full = path.join(dirPath, ent.name);
    if (ent.isDirectory()) {
      total += await computeDirectoryBytesRecursive(full, null);
    } else if (ent.isFile()) {
      try {
        const st = await fs.promises.stat(full);
        total += st.size;
      } catch {}
    }
  }
  return total;
}

/**
 * [PONTE ZERO-COPY FAT32 & CORREÇÃO 4]:
 * Soma os bytes de userRoot + os bytes reais de PORTFOLIO_DIR apenas quando scopeType !== 'org'
 * e namespaceId === PRIMARY_ADMIN_UUID. Indexado por namespaceId (org:${cleanOrgSlug} ou userId).
 */
async function getTenantUsedBytes(namespaceId, userRoot, forceRecalc = false, scopeType = 'user') {
  if (!forceRecalc && tenantUsedBytesCache.has(namespaceId)) {
    return tenantUsedBytesCache.get(namespaceId);
  }

  let total = await computeDirectoryBytesRecursive(userRoot, new Set(['.trash']));

  if (scopeType !== 'org' && namespaceId === PRIMARY_ADMIN_UUID) {
    const catalogItems = Array.isArray(memoryCatalog?.items) ? memoryCatalog.items : [];
    if (catalogItems.length > 0) {
      let legacyCatalogBytes = 0;
      for (const item of catalogItems) {
        if (item.isShortcut) continue;
        const itemRel = String(item.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const shadowInUserRoot = itemRel ? path.join(userRoot, 'Portfolio', itemRel) : null;
        if (shadowInUserRoot && fs.existsSync(shadowInUserRoot)) {
          continue; // Já contabilizado em userRoot
        }
        legacyCatalogBytes += Math.max(0, Number(item.sizeBytes) || 0);
      }
      total += legacyCatalogBytes;
    } else if (
      fs.existsSync(PORTFOLIO_DIR) &&
      path.resolve(PORTFOLIO_DIR) !== path.resolve(path.join(userRoot, 'Portfolio'))
    ) {
      total += await computeDirectoryBytesRecursive(
        PORTFOLIO_DIR,
        new Set(['originals', 'thumbs', '.trash'])
      );
    }
  }

  tenantUsedBytesCache.set(namespaceId, Math.max(0, total));
  return Math.max(0, total);
}

async function adjustTenantUsedBytes(namespaceId, userRoot, deltaBytes, scopeType = 'user') {
  const current = await getTenantUsedBytes(namespaceId, userRoot, false, scopeType);
  const updated = Math.max(0, current + (Number(deltaBytes) || 0));
  tenantUsedBytesCache.set(namespaceId, updated);
  return updated;
}

function classifyTenantEntryKind(filename, isDirectory) {
  if (isDirectory) return 'folder';
  const ext = path.extname(filename || '').toLowerCase();
  if (['.md', '.txt'].includes(ext)) return 'note';
  const baseKind = classifyFileKind(filename);
  if (baseKind === 'text') return 'note';
  return baseKind;
}

function getTenantFolderPinRecord(userId, relPath) {
  const cleanRel = normalizeTenantRelPath(relPath);
  if (!cleanRel) return null;
  const userPins = tenantFolderPinsStore[userId];
  if (!userPins || typeof userPins !== 'object') return null;
  return userPins[cleanRel] || null;
}

function isTenantPathPinProtected(userId, relPath) {
  const cleanRel = normalizeTenantRelPath(relPath);
  if (!cleanRel) return null;
  const segments = cleanRel.split('/');
  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('/');
    const rec = getTenantFolderPinRecord(userId, prefix);
    if (rec && rec.pinHash && rec.pinSalt) {
      return { lockedScope: prefix, record: rec };
    }
  }
  return null;
}

function assertFolderPinUnlockedIfRequired(req, relPath) {
  if (req.tenant.purpose === 'public_media' || req.tenant.purpose === 'share') return;
  const lockInfo = isTenantPathPinProtected(req.tenant.userId, relPath);
  if (!lockInfo) return;
  if (!req.tenant.unlockedPinsSet.has(lockInfo.lockedScope)) {
    const err = new Error('Pasta protegida por PIN. Desbloqueie para acessar.');
    err.statusCode = 423;
    err.lockedScope = lockInfo.lockedScope;
    err.pinHint = lockInfo.record.hint || '';
    throw err;
  }
}

function assertPublicMediaPathAllowed(req, normalizedRelPath) {
  const cleanRel = normalizeTenantRelPath(normalizedRelPath);
  if (req.tenant.purpose === 'public_media') {
    if (req.tenant.allowedPrefix) {
      const prefix = normalizeTenantRelPath(req.tenant.allowedPrefix);
      if (cleanRel !== prefix && !cleanRel.startsWith(`${prefix}/`)) {
        const err = new Error('Acesso negado: caminho fora da pasta autorizada para este ticket.');
        err.statusCode = 403;
        throw err;
      }
      return;
    }
    if (!req.tenant.allowedPathsSet || !req.tenant.allowedPathsSet.has(cleanRel)) {
      const err = new Error('Acesso negado: caminho não autorizado neste ticket público.');
      err.statusCode = 403;
      throw err;
    }
  }
  if (req.tenant.allowedPrefix) {
    const prefix = normalizeTenantRelPath(req.tenant.allowedPrefix);
    if (cleanRel !== prefix && !cleanRel.startsWith(`${prefix}/`)) {
      const err = new Error('Acesso negado: caminho fora da pasta compartilhada.');
      err.statusCode = 403;
      throw err;
    }
  }
}

async function buildTenantEntryDescriptorAsync(userId, fullPath, relPath, unlockedPinsSet = new Set(), scopeType = 'user') {
  const cleanRel = normalizeTenantRelPath(relPath);
  const st = await fs.promises.stat(fullPath);
  const isDirectory = st.isDirectory();
  const name = path.basename(cleanRel || fullPath);
  const kind = classifyTenantEntryKind(name, isDirectory);
  const pinRec = isDirectory ? getTenantFolderPinRecord(userId, cleanRel) : null;
  const hasPin = Boolean(pinRec && pinRec.pinHash);
  const isUnlocked = hasPin ? unlockedPinsSet.has(cleanRel) : true;

  let exifData;
  if (!isDirectory && kind === 'image') {
    const legacyPortRel = cleanRel.replace(/^Portfolio\/+/i, '');
    const catMatch =
      userId === PRIMARY_ADMIN_UUID && scopeType !== 'org'
        ? (memoryCatalog?.items || []).find((it) => it.relativePath === legacyPortRel)
        : null;
    if (catMatch && catMatch.exif) {
      exifData = catMatch.exif;
    } else {
      const parsedHeader = await readImageDimensionsAndOrientation(fullPath).catch(() => null);
      if (parsedHeader) {
        exifData = {
          ...(parsedHeader.exif || {}),
          width: parsedHeader.width,
          height: parsedHeader.height,
          orientation: parsedHeader.orientation,
        };
      }
    }
  }

  return {
    name,
    relativePath: cleanRel,
    isDirectory,
    sizeBytes: isDirectory ? 0 : st.size,
    mimeType: isDirectory ? 'inode/directory' : getMimeType(name),
    kind,
    modifiedAt: st.mtime.toISOString(),
    hasPin,
    isUnlocked,
    ...(exifData ? { exifData } : {}),
  };
}

async function verifyTenantTicket(req, res, next) {
  try {
    const rawTicket = String(
      req.headers['x-tenant-ticket'] || req.query.ticket || ''
    ).trim();
    if (!rawTicket || !rawTicket.includes('.')) {
      return res.status(401).json({ error: 'Ticket de acesso multi-tenant ausente ou malformado.' });
    }

    const [payloadB64, signature] = rawTicket.split('.');
    if (!payloadB64 || !signature) {
      return res.status(401).json({ error: 'Formato de ticket inválido.' });
    }

    const secret = resolveTenantHmacSecret();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'Assinatura criptográfica do ticket inválida.' });
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') {
      return res.status(401).json({ error: 'Payload do ticket corrompido.' });
    }

    if (!payload.exp || Date.now() > Number(payload.exp)) {
      return res.status(401).json({ error: 'Ticket de sessão expirado.' });
    }

    const userId = String(payload.userId || '').trim();
    if (!userId || !/^[a-zA-Z0-9_-]{3,80}$/.test(userId)) {
      return res.status(401).json({ error: 'Identificador de usuário inválido no ticket.' });
    }

    const purpose = payload.purpose || 'vault';
    const allowedPathsArr = Array.isArray(payload.allowedPaths)
      ? payload.allowedPaths.map((p) => normalizeTenantRelPath(p)).filter(Boolean)
      : [];

    if (purpose === 'public_media' && allowedPathsArr.length === 0 && !payload.allowedPrefix) {
      return res.status(403).json({ error: 'Ticket public_media sem allowedPaths ou allowedPrefix explícitos.' });
    }

    const scopeType = payload.scopeType === 'org' ? 'org' : 'user';
    let userRoot;
    let pinNamespaceId = userId;

    if (scopeType === 'org') {
      const cleanOrgSlug = String(payload.orgSlug || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(cleanOrgSlug)) {
        return res.status(400).json({ error: 'Slug de organização inválido no ticket.' });
      }
      userRoot = resolveSafeChildPath(ORGS_ROOT_DIR, cleanOrgSlug);
      if (!fs.existsSync(userRoot)) {
        await fs.promises.mkdir(userRoot, { recursive: true });
      }
      pinNamespaceId = `org:${cleanOrgSlug}`;
    } else {
      userRoot = await ensureTenantRootProvisioned(userId);
    }

    const unlockedPinsSet = new Set(
      Array.isArray(payload.unlockedPins)
        ? payload.unlockedPins.map((p) => normalizeTenantRelPath(p)).filter(Boolean)
        : []
    );

    req.tenant = {
      userId,
      scopeType,
      orgSlug: scopeType === 'org' ? String(payload.orgSlug).trim().toLowerCase() : null,
      organizationId: payload.organizationId || null,
      pinNamespaceId,
      role: payload.role === 'admin' ? 'admin' : 'member',
      purpose,
      quotaLimitBytes: Math.max(0, Number(payload.quotaLimitBytes) || 0),
      usedBytes: Math.max(0, Number(payload.usedBytes) || 0),
      allowedPrefix: payload.allowedPrefix ? normalizeTenantRelPath(payload.allowedPrefix) : null,
      allowedPathsSet: new Set(allowedPathsArr),
      readOnly: Boolean(payload.readOnly || purpose === 'public_media'),
      allowDownload: payload.allowDownload !== false,
      unlockedPinsSet,
      userRoot,
      resolveSafePath: (relPath, opts) => resolveTenantSafePath(userId, userRoot, relPath, opts, scopeType, payload.role),
      resolveListingDirs: (cleanRel) => resolveTenantListingDirs(userId, userRoot, cleanRel, scopeType, payload.role),
      getUsedBytes: (force) => getTenantUsedBytes(pinNamespaceId, userRoot, force, scopeType),
      adjustUsedBytes: (delta) => adjustTenantUsedBytes(pinNamespaceId, userRoot, delta, scopeType),
    };

    return next();
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Falha na validação do ticket.' });
  }
}

/**
 * Reaproveita 100% das 2.369 miniaturas .avif pré-geradas em INTERNAL_THUMBS_DIR (ext4)
 * e do índice de assinaturas thumbSigIndex (data/thumbs/sig_index.json) ANTES de tocar no HD USB!
 */
async function resolveExistingPrebuiltThumbnail(relPath, fullPath, scopeType = 'user') {
  if (scopeType === 'org') {
    return null;
  }
  const cleanRel = normalizeTenantRelPath(relPath);
  const legacyPortRel = cleanRel.replace(/^Portfolio\/+/i, '');

  const candidateKeys = [
    crypto.createHash('md5').update(legacyPortRel).digest('hex'),
    crypto.createHash('md5').update(cleanRel).digest('hex'),
  ];

  for (const key of candidateKeys) {
    for (const ext of ['avif', 'webp']) {
      for (const w of [640, 960, 540, 1080]) {
        const candidate = path.join(INTERNAL_THUMBS_DIR, `thumb_${key}_${w}.${ext}`);
        if (fs.existsSync(candidate)) {
          return { path: candidate, mimeType: ext === 'avif' ? 'image/avif' : 'image/webp' };
        }
      }
    }
  }

  try {
    const fileName = path.basename(cleanRel);
    const catalogMatch = (memoryCatalog?.items || []).find(
      (it) => it.relativePath === legacyPortRel || it.originalFile === fileName
    );
    let sig =
      catalogMatch?.fileSig ||
      (catalogMatch?.originalFile && catalogMatch?.sizeBytes
        ? `${catalogMatch.originalFile}_${catalogMatch.sizeBytes}`
        : null);

    if (!sig && fullPath && fs.existsSync(fullPath)) {
      try {
        const st = fs.statSync(fullPath);
        if (st.isFile()) sig = `${fileName}_${st.size}`;
      } catch {}
    }

    if (!sig) {
      const prefix = `${fileName}_`;
      const matchKey = Object.keys(thumbSigIndex).find((k) => k.startsWith(prefix));
      if (matchKey) sig = matchKey;
    }

    let sigHash = sig ? thumbSigIndex[sig] : null;
    if (!sigHash) {
      const prefix = `${fileName}_`;
      const matchEntry = Object.entries(thumbSigIndex).find(([k]) => k.startsWith(prefix));
      if (matchEntry) {
        sigHash = matchEntry[1];
      }
    }

    if (sigHash) {
      for (const ext of ['avif', 'webp']) {
        for (const w of [640, 960, 540, 1080]) {
          const sigThumb = path.join(INTERNAL_THUMBS_DIR, `thumb_${sigHash}_${w}.${ext}`);
          if (fs.existsSync(sigThumb)) {
            return { path: sigThumb, mimeType: ext === 'avif' ? 'image/avif' : 'image/webp' };
          }
        }
      }
    }
  } catch {}

  return null;
}

// 11.5.1. GET /api/tenant/list — Listagem com Merge Deduplicado p/ PRIMARY_ADMIN_UUID
app.get('/api/tenant/list', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.purpose === 'public_media') {
      return res.status(403).json({
        error: 'Listagem de diretórios bloqueada para tickets de escopo public_media.',
      });
    }

    const rawFolder = req.query.folder ? String(req.query.folder) : '';
    const cleanRel = normalizeTenantRelPath(rawFolder);

    if (req.tenant.allowedPrefix) {
      assertPublicMediaPathAllowed(req, cleanRel || req.tenant.allowedPrefix);
    }

    const lockInfo = isTenantPathPinProtected(req.tenant.userId, cleanRel);
    const breadcrumbs = [
      { name: 'Meus Arquivos', path: '' },
      ...(cleanRel
        ? cleanRel.split('/').map((seg, idx, arr) => ({
            name: seg,
            path: arr.slice(0, idx + 1).join('/'),
          }))
        : []),
    ];

    if (lockInfo && !req.tenant.unlockedPinsSet.has(lockInfo.lockedScope)) {
      return res.json({
        currentFolder: cleanRel,
        breadcrumbs,
        folders: [],
        files: [],
        isLocked: true,
        lockedScope: lockInfo.lockedScope,
        pinHint: lockInfo.record.hint || '',
      });
    }

    const dirTargets = resolveTenantListingDirs(
      req.tenant.userId,
      req.tenant.userRoot,
      cleanRel,
      req.tenant.scopeType,
      req.tenant.role
    );
    if (dirTargets.length === 0) {
      return res.status(404).json({ error: 'Pasta não encontrada.' });
    }

    const folderMap = new Map();
    const fileMap = new Map();

    for (const { dirPath, isLegacyBridge } of dirTargets) {
      const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
      for (const d of dirents) {
        if (
          d.name === '.trash' ||
          d.name.startsWith('.tmp') ||
          IGNORED_PORTFOLIO_DIRS.has(d.name) ||
          d.name === 'catalog.json' ||
          d.name === 'sig_index.json'
        ) {
          continue;
        }
        // userRoot tem prioridade sobre a ponte legada caso o mesmo nome exista em ambos
        if (folderMap.has(d.name) || fileMap.has(d.name)) continue;

        const entryFullPath = path.join(dirPath, d.name);
        const entryRelPath = cleanRel ? `${cleanRel}/${d.name}` : d.name;

        try {
          const descriptor = await buildTenantEntryDescriptorAsync(
            req.tenant.userId,
            entryFullPath,
            entryRelPath,
            req.tenant.unlockedPinsSet,
            req.tenant.scopeType
          );
          if (isLegacyBridge) {
            descriptor.isLegacyBridge = true;
          }
          if (descriptor.isDirectory) {
            folderMap.set(d.name, descriptor);
          } else {
            fileMap.set(d.name, descriptor);
          }
        } catch {}
      }
    }

    // Injeção da ponte virtual Portfolio na raiz limpa para o Admin em escopo pessoal
    if (
      !cleanRel &&
      req.tenant.scopeType !== 'org' &&
      (req.tenant.userId === PRIMARY_ADMIN_UUID || req.tenant.role === 'admin') &&
      PORTFOLIO_DIR &&
      fs.existsSync(PORTFOLIO_DIR) &&
      !folderMap.has('Portfolio')
    ) {
      folderMap.set('Portfolio', {
        name: 'Portfolio',
        relativePath: 'Portfolio',
        path: 'Portfolio',
        isDirectory: true,
        sizeBytes: 0,
        mimeType: 'inode/directory',
        kind: 'folder',
        modifiedAt: new Date().toISOString(),
        isLegacyBridge: true,
        isVirtualBridge: true,
        isLocked: false,
        childCount: 0,
      });
    }

    const folders = Array.from(folderMap.values()).sort((a, b) => {
      if (!cleanRel) {
        const idxA = DEFAULT_TENANT_SUBFOLDERS.indexOf(a.name);
        const idxB = DEFAULT_TENANT_SUBFOLDERS.indexOf(b.name);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
      }
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    const files = Array.from(fileMap.values()).sort(
      (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );

    const totalUsedBytes = await req.tenant.getUsedBytes();

    return res.json({
      currentFolder: cleanRel,
      breadcrumbs,
      folders,
      files,
      isLocked: false,
      total_used_bytes: totalUsedBytes,
      hdConnected: isExternalStorageMounted(),
      storageDir: STORAGE_DIR,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.2. GET /api/tenant/stream — Stream HTTP 206 com validação estrita de allowedPaths
app.get('/api/tenant/stream', verifyTenantTicket, async (req, res) => {
  try {
    const relPath = normalizeTenantRelPath(req.query.path);
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });

    assertPublicMediaPathAllowed(req, relPath);
    assertFolderPinUnlockedIfRequired(req, relPath);

    const fullPath = req.tenant.resolveSafePath(relPath, { forWrite: false });
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor.' });
    }

    if (req.query.download === '1' && req.tenant.allowDownload === false) {
      return res.status(403).json({ error: 'Download não autorizado para este ticket.' });
    }

    const wantDownload = req.query.download === '1';
    return await streamFileWithRange(req, res, fullPath, { download: wantDownload });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.3. GET /api/tenant/thumb — Miniatura ultra-rápida (reaproveita 100% dos 2.369 .avif + sig_index.json)
app.get('/api/tenant/thumb', verifyTenantTicket, async (req, res) => {
  try {
    const relPath = normalizeTenantRelPath(req.query.path);
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });

    assertPublicMediaPathAllowed(req, relPath);
    assertFolderPinUnlockedIfRequired(req, relPath);

    const fullPath = req.tenant.resolveSafePath(relPath, { forWrite: false });

    // 1. Reaproveita imediatamente miniaturas .avif / .webp pré-existentes no cache ext4 (Zero-Touch no USB)
    const prebuilt = await resolveExistingPrebuiltThumbnail(relPath, fullPath);
    if (prebuilt && fs.existsSync(prebuilt.path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', prebuilt.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return fs.createReadStream(prebuilt.path).pipe(res);
    }

    // 2. Cache específico do tenant no ext4 interno
    const tenantThumbKey = crypto
      .createHash('md5')
      .update(`${req.tenant.userId}:${relPath}`)
      .digest('hex');
    const tenantThumbPath = path.join(INTERNAL_THUMBS_DIR, `tthumb_${tenantThumbKey}.webp`);
    if (fs.existsSync(tenantThumbPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/webp');
      return fs.createReadStream(tenantThumbPath).pipe(res);
    }

    if (!fs.existsSync(fullPath)) {
      const baseName = path.basename(relPath, path.extname(relPath));
      const safeAlbum = path.dirname(relPath).replace(/^Portfolio\/?/i, '');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      return res.send(generatePhotoPlaceholderSvg(baseName, safeAlbum));
    }

    const targetW = req.query.w ? Math.max(240, Math.min(1280, parseInt(req.query.w, 10) || 480)) : 480;
    const generated = await generateThumbnailWebP(fullPath, tenantThumbPath, targetW, 'webp');
    if (generated && fs.existsSync(tenantThumbPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', 'image/webp');
      return fs.createReadStream(tenantThumbPath).pipe(res);
    }

    return await streamFileWithRange(req, res, fullPath, { cacheControl: 'private, max-age=3600' });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.4. GET & POST /api/tenant/note — Leitura e Gravação Atômica de Notas (.md/.txt) com Delta Exato
app.get('/api/tenant/note', verifyTenantTicket, async (req, res) => {
  try {
    const relPath = normalizeTenantRelPath(req.query.path);
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });

    assertPublicMediaPathAllowed(req, relPath);
    assertFolderPinUnlockedIfRequired(req, relPath);

    const fullPath = req.tenant.resolveSafePath(relPath, { forWrite: false });
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Nota não encontrada.' });
    }
    const st = await fs.promises.stat(fullPath);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo incompatível com leitura de nota de texto.' });
    }
    const content = await fs.promises.readFile(fullPath, 'utf8');
    return res.json({
      relativePath: relPath,
      content,
      modifiedAt: st.mtime.toISOString(),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/tenant/note', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
      return res.status(403).json({ error: 'Permissão de escrita indisponível nesta conta.' });
    }

    const folderRel = normalizeTenantRelPath(req.body?.folderPath || '');
    let rawFilename = sanitizeFilename(req.body?.filename || '');
    if (!/\.(md|txt)$/i.test(rawFilename)) {
      rawFilename = `${rawFilename}.md`;
    }

    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const newBytes = Buffer.byteLength(content, 'utf8');
    if (newBytes > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Nota excede o limite máximo de 2 MB.' });
    }

    const relPath = folderRel ? `${folderRel}/${rawFilename}` : rawFilename;
    assertFolderPinUnlockedIfRequired(req, relPath);
    const targetPath = req.tenant.resolveSafePath(relPath, { forWrite: true });

    let prevBytes = 0;
    try {
      const prevStat = await fs.promises.stat(targetPath);
      if (prevStat.isFile()) prevBytes = prevStat.size;
    } catch {}

    const deltaBytes = newBytes - prevBytes;
    const currentUsed = await req.tenant.getUsedBytes();
    const baseUsed = Math.max(currentUsed, req.tenant.usedBytes);
    const remainingBytes = Math.max(0, req.tenant.quotaLimitBytes - baseUsed);

    if (deltaBytes > 0 && deltaBytes > remainingBytes) {
      return res.status(413).json({
        error: 'Cota de armazenamento insuficiente para salvar esta nota.',
      });
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await atomicWriteFile(targetPath, content, 'utf8');

    const totalUsedBytes = await req.tenant.adjustUsedBytes(deltaBytes);
    const item = await buildTenantEntryDescriptorAsync(
      req.tenant.userId,
      targetPath,
      relPath,
      req.tenant.unlockedPinsSet,
      req.tenant.scopeType
    );

    return res.json({
      success: true,
      action: 'upsert',
      item,
      total_used_bytes: totalUsedBytes,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.5. POST /api/tenant/upload — Upload Multer com Verificação O(1) de Quota e Delta Exato em Overwrite
const tenantStagingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        if (!fs.existsSync(TENANT_UPLOAD_STAGING_DIR)) {
          fs.mkdirSync(TENANT_UPLOAD_STAGING_DIR, { recursive: true });
        }
      } catch {}
      cb(null, TENANT_UPLOAD_STAGING_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 15);
      cb(null, `stage_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_SINGLE_UPLOAD_BYTES },
});

app.post(
  '/api/tenant/upload',
  verifyTenantTicket,
  (req, res, next) => {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
      return res.status(403).json({
        error: 'Sua conta ainda não possui permissão de escrita ou aguarda aprovação.',
      });
    }
    // Proteção de Hardware: bloqueia uploads massivos na memória flash interna da TV se o HD estiver desplugado
    if (!isExternalStorageMounted()) {
      return res.status(507).json({
        error: 'HD Externo USB não detectado no Fire TV Stick. O servidor está restrito à memória interna de emergência da TV. Verifique se o cabo OTG está energizado com fonte externa (5V 2A+) e conectado à TV.',
      });
    }
    return tenantStagingUpload.single('file')(req, res, next);
  },
  async (req, res) => {
    const stagedPath = req.file?.path;
    try {
      if (!req.file || !stagedPath) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado no campo file.' });
      }

      // Verificação de espaço livre físico no disco
      const diskCap = getDiskCapacitySync(STORAGE_DIR);
      if (diskCap.freeBytes < req.file.size + 30 * 1024 * 1024) {
        await fs.promises.unlink(stagedPath).catch(() => {});
        return res.status(507).json({
          error: `Espaço em disco insuficiente no Fire TV Stick (${Math.round(diskCap.freeBytes / (1024 * 1024))} MB livres). Conecte o HD USB de 750 GB ou libere espaço na Lixeira.`,
        });
      }

      const rawFolder =
        req.body?.folderPath !== undefined
          ? req.body.folderPath
          : req.query.folder !== undefined
          ? req.query.folder
          : '';
      const folderRel = normalizeTenantRelPath(rawFolder || '');
      const cleanName = sanitizeFilename(req.file.originalname || 'arquivo');
      const relPath = folderRel ? `${folderRel}/${cleanName}` : cleanName;

      assertFolderPinUnlockedIfRequired(req, relPath);
      const targetPath = req.tenant.resolveSafePath(relPath, { forWrite: true });

      let prevBytes = 0;
      try {
        const prevStat = await fs.promises.stat(targetPath);
        if (prevStat.isFile()) prevBytes = prevStat.size;
      } catch {}

      const newBytes = req.file.size;
      const deltaBytes = newBytes - prevBytes;
      const currentUsed = await req.tenant.getUsedBytes();
      const effectiveUsed = Math.max(currentUsed, req.tenant.usedBytes);
      const remainingBytes = Math.max(0, req.tenant.quotaLimitBytes - effectiveUsed);

      if (deltaBytes > 0 && deltaBytes > remainingBytes) {
        await fs.promises.unlink(stagedPath).catch(() => {});
        return res.status(413).json({
          error: 'Limite de armazenamento atingido. Libere espaço na Lixeira ou solicite ampliação de quota.',
        });
      }

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await moveFileSafe(stagedPath, targetPath);

      const totalUsedBytes = await req.tenant.adjustUsedBytes(deltaBytes);
      const item = await buildTenantEntryDescriptorAsync(
        req.tenant.userId,
        targetPath,
        relPath,
        req.tenant.unlockedPinsSet,
        req.tenant.scopeType
      );

      if (isPortfolioRelatedRelPath(relPath)) {
        void syncPortfolioFromDiskAsync().catch(() => {});
      }

      return res.json({
        success: true,
        action: 'upsert',
        item,
        total_used_bytes: totalUsedBytes,
      });
    } catch (err) {
      if (stagedPath && fs.existsSync(stagedPath)) {
        await fs.promises.unlink(stagedPath).catch(() => {});
      }
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

// 11.5.6. POST /api/tenant/folder — Criar Nova Pasta
app.post('/api/tenant/folder', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
      return res.status(403).json({ error: 'Sem permissão para criar pastas.' });
    }

    const parentRel = normalizeTenantRelPath(req.body?.parentFolder || '');
    const cleanName = sanitizeFilename(req.body?.name || '');
    if (!cleanName || cleanName === '.trash') {
      return res.status(400).json({ error: 'Nome de pasta inválido.' });
    }

    const relPath = parentRel ? `${parentRel}/${cleanName}` : cleanName;
    assertFolderPinUnlockedIfRequired(req, relPath);
    const targetDir = req.tenant.resolveSafePath(relPath, { forWrite: true });

    await fs.promises.mkdir(targetDir, { recursive: true });
    const totalUsedBytes = await req.tenant.getUsedBytes();
    const item = await buildTenantEntryDescriptorAsync(
      req.tenant.userId,
      targetDir,
      relPath,
      req.tenant.unlockedPinsSet,
      req.tenant.scopeType
    );

    return res.json({
      success: true,
      action: 'upsert',
      item,
      total_used_bytes: totalUsedBytes,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.7. POST /api/tenant/rename — Renomear ou Mover Arquivo/Pasta Dentro da Jaula do Usuário
app.post('/api/tenant/rename', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
      return res.status(403).json({ error: 'Sem permissão de escrita.' });
    }

    const oldRel = normalizeTenantRelPath(req.body?.oldPath);
    const newRel = normalizeTenantRelPath(req.body?.newPath);
    if (!oldRel || !newRel) {
      return res.status(400).json({ error: 'Caminhos oldPath e newPath são obrigatórios.' });
    }
    if (DEFAULT_TENANT_SUBFOLDERS.includes(oldRel)) {
      return res.status(400).json({ error: 'As 4 pastas raiz padrão não podem ser renomeadas.' });
    }

    assertFolderPinUnlockedIfRequired(req, oldRel);
    assertFolderPinUnlockedIfRequired(req, newRel);

    const srcFull = req.tenant.resolveSafePath(oldRel, { forWrite: false });
    const destFull = req.tenant.resolveSafePath(newRel, { forWrite: true });

    if (!fs.existsSync(srcFull)) {
      return res.status(404).json({ error: 'Item de origem não encontrado.' });
    }

    const st = await fs.promises.stat(srcFull);
    if (st.isDirectory()) {
      await renameDirectorySafeFAT32(srcFull, destFull);
    } else {
      await moveFileSafe(srcFull, destFull);
    }

    const totalUsedBytes = await req.tenant.getUsedBytes();
    const item = await buildTenantEntryDescriptorAsync(
      req.tenant.userId,
      destFull,
      newRel,
      req.tenant.unlockedPinsSet,
      req.tenant.scopeType
    );

    if (isPortfolioRelatedRelPath(oldRel) || isPortfolioRelatedRelPath(newRel)) {
      void syncPortfolioFromDiskAsync({ force: true }).catch(() => {});
    }

    return res.json({
      success: true,
      action: 'rename',
      old_relative_path: oldRel,
      item,
      total_used_bytes: totalUsedBytes,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.8. CICLO COMPLETO DE LIXEIRA ISOLADA POR USUÁRIO (/users/{userId}/.trash/)
function getTenantTrashDirAndManifest(userRoot) {
  const trashDir = path.join(userRoot, '.trash');
  const manifestPath = path.join(trashDir, 'manifest.json');
  return { trashDir, manifestPath };
}

async function readTenantTrashManifest(userRoot) {
  const { manifestPath } = getTenantTrashDirAndManifest(userRoot);
  try {
    if (fs.existsSync(manifestPath)) {
      const parsed = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

async function writeTenantTrashManifest(userRoot, items) {
  const { trashDir, manifestPath } = getTenantTrashDirAndManifest(userRoot);
  await fs.promises.mkdir(trashDir, { recursive: true });
  await atomicWriteFile(manifestPath, JSON.stringify(items, null, 2), 'utf8');
}

app.delete('/api/tenant/entry', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
      return res.status(403).json({ error: 'Sem permissão para excluir arquivos.' });
    }

    const relPath = normalizeTenantRelPath(req.query.path || req.body?.path);
    if (!relPath) return res.status(400).json({ error: 'Parâmetro path obrigatório.' });
    if (DEFAULT_TENANT_SUBFOLDERS.includes(relPath)) {
      return res.status(400).json({ error: 'As 4 pastas raiz padrão não podem ser removidas.' });
    }

    assertFolderPinUnlockedIfRequired(req, relPath);
    const targetFull = req.tenant.resolveSafePath(relPath, { forWrite: false });
    if (!fs.existsSync(targetFull)) {
      return res.status(404).json({ error: 'Arquivo ou pasta não encontrado.' });
    }

    const descriptor = await buildTenantEntryDescriptorAsync(
      req.tenant.userId,
      targetFull,
      relPath,
      req.tenant.unlockedPinsSet,
      req.tenant.scopeType
    );
    const entryBytes = descriptor.isDirectory
      ? await computeDirectoryBytesRecursive(targetFull, null)
      : descriptor.sizeBytes;

    const isPermanent = req.query.permanent === '1' || req.body?.permanent === true;
    if (isPermanent) {
      await fs.promises.rm(targetFull, { recursive: true, force: true });
      const totalUsedBytes = await req.tenant.adjustUsedBytes(-entryBytes);
      if (isPortfolioRelatedRelPath(relPath)) {
        void syncPortfolioFromDiskAsync({ force: true }).catch(() => {});
      }
      return res.json({
        success: true,
        action: 'delete',
        item: descriptor,
        total_used_bytes: totalUsedBytes,
      });
    }

    const { trashDir } = getTenantTrashDirAndManifest(req.tenant.userRoot);
    await fs.promises.mkdir(trashDir, { recursive: true });
    const trashId = `tr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storedName = `${trashId}_${descriptor.name}`;
    const trashDest = path.join(trashDir, storedName);

    if (descriptor.isDirectory) {
      await renameDirectorySafeFAT32(targetFull, trashDest);
      // Assegura remoção limpa do diretório de origem caso o sistema de arquivos tenha bloqueado rmdir
      if (fs.existsSync(targetFull)) {
        await fs.promises.rm(targetFull, { recursive: true, force: true }).catch(() => {});
      }
    } else {
      await moveFileSafe(targetFull, trashDest);
    }

    const manifest = await readTenantTrashManifest(req.tenant.userRoot);
    manifest.unshift({
      trashId,
      storedName,
      name: descriptor.name,
      originalRelativePath: relPath,
      isDirectory: descriptor.isDirectory,
      sizeBytes: entryBytes,
      mimeType: descriptor.mimeType,
      deletedAt: new Date().toISOString(),
    });
    await writeTenantTrashManifest(req.tenant.userRoot, manifest);

    const totalUsedBytes = await req.tenant.getUsedBytes(true);
    if (isPortfolioRelatedRelPath(relPath)) {
      void syncPortfolioFromDiskAsync({ force: true }).catch(() => {});
    }
    return res.json({
      success: true,
      action: 'delete',
      item: descriptor,
      total_used_bytes: totalUsedBytes,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get('/api/tenant/trash', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.purpose === 'public_media') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const manifest = await readTenantTrashManifest(req.tenant.userRoot);
    const totalUsedBytes = await req.tenant.getUsedBytes();
    return res.json({ items: manifest, total_used_bytes: totalUsedBytes });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/tenant/trash/restore', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media') {
      return res.status(403).json({ error: 'Sem permissão de escrita.' });
    }
    const trashId = String(req.body?.trashId || '').trim();
    if (!trashId) return res.status(400).json({ error: 'trashId obrigatório.' });

    const { trashDir } = getTenantTrashDirAndManifest(req.tenant.userRoot);
    const manifest = await readTenantTrashManifest(req.tenant.userRoot);
    const idx = manifest.findIndex((it) => it.trashId === trashId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Item não encontrado na Lixeira.' });
    }

    const entry = manifest[idx];
    const trashFull = path.join(trashDir, entry.storedName);
    if (!fs.existsSync(trashFull)) {
      manifest.splice(idx, 1);
      await writeTenantTrashManifest(req.tenant.userRoot, manifest);
      return res.status(404).json({ error: 'Arquivo físico já havia sido removido da Lixeira.' });
    }

    const restoreRel = normalizeTenantRelPath(entry.originalRelativePath || `Arquivos/${entry.name}`);
    const restoreFull = req.tenant.resolveSafePath(restoreRel, { forWrite: true });

    if (entry.isDirectory) {
      await renameDirectorySafeFAT32(trashFull, restoreFull);
    } else {
      await moveFileSafe(trashFull, restoreFull);
    }

    manifest.splice(idx, 1);
    await writeTenantTrashManifest(req.tenant.userRoot, manifest);

    const totalUsedBytes = await req.tenant.getUsedBytes(true);
    const item = await buildTenantEntryDescriptorAsync(
      req.tenant.userId,
      restoreFull,
      restoreRel,
      req.tenant.unlockedPinsSet,
      req.tenant.scopeType
    );

    return res.json({
      success: true,
      action: 'upsert',
      item,
      total_used_bytes: totalUsedBytes,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.delete('/api/tenant/trash', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media') {
      return res.status(403).json({ error: 'Sem permissão de escrita.' });
    }

    const targetTrashId = String(req.query.trashId || req.body?.trashId || '').trim();
    const { trashDir } = getTenantTrashDirAndManifest(req.tenant.userRoot);
    const manifest = await readTenantTrashManifest(req.tenant.userRoot);

    let freedBytes = 0;
    const remaining = [];

    for (const item of manifest) {
      if (!targetTrashId || item.trashId === targetTrashId) {
        const full = path.join(trashDir, item.storedName);
        await fs.promises.rm(full, { recursive: true, force: true }).catch(() => {});
        freedBytes += Math.max(0, Number(item.sizeBytes) || 0);
      } else {
        remaining.push(item);
      }
    }

    await writeTenantTrashManifest(req.tenant.userRoot, remaining);
    const totalUsedBytes = await req.tenant.getUsedBytes(true);

    return res.json({
      success: true,
      freed_bytes: freedBytes,
      total_used_bytes: totalUsedBytes,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.9. GESTÃO DE PIN DE PASTAS POR USUÁRIO (scrypt via ./lib/pin-vault.js)
app.post('/api/tenant/pin/set', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media') {
      return res.status(403).json({ error: 'Sem permissão para configurar PIN.' });
    }
    const folderRel = normalizeTenantRelPath(req.body?.folderPath);
    if (!folderRel) return res.status(400).json({ error: 'folderPath obrigatório.' });

    const { pinHash, pinSalt } = hashPin(req.body?.pin);
    const hint = String(req.body?.hint || '').trim().slice(0, 80);

    if (!tenantFolderPinsStore[req.tenant.userId]) {
      tenantFolderPinsStore[req.tenant.userId] = {};
    }
    tenantFolderPinsStore[req.tenant.userId][folderRel] = {
      pinHash,
      pinSalt,
      hint,
      updatedAt: new Date().toISOString(),
    };
    await persistTenantFolderPins();

    return res.json({ success: true, folderPath: folderRel, hasPin: true, hint });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

const tenantPinAttemptsStore = new Map(); // attemptKey -> { attempts: number, lockedUntil: number }

app.post('/api/tenant/pin/verify', verifyTenantTicket, async (req, res) => {
  try {
    const folderRel = normalizeTenantRelPath(req.body?.folderPath);
    if (!folderRel) return res.status(400).json({ error: 'folderPath obrigatório.' });

    const attemptKey = `${req.tenant.userId}:${folderRel}`;
    const now = Date.now();
    const rateEntry = tenantPinAttemptsStore.get(attemptKey);
    if (rateEntry && rateEntry.lockedUntil > now) {
      const waitSec = Math.ceil((rateEntry.lockedUntil - now) / 1000);
      return res.status(429).json({ error: `Muitas tentativas incorretas. Aguarde ${waitSec}s antes de tentar novamente.` });
    }

    const record = getTenantFolderPinRecord(req.tenant.userId, folderRel);
    if (!record) {
      return res.json({ success: true, unlocked: true, folderPath: folderRel });
    }

    const ok = verifyPin(req.body?.pin, record.pinHash, record.pinSalt);
    if (!ok) {
      const entry = rateEntry || { attempts: 0, lockedUntil: 0 };
      entry.attempts += 1;
      if (entry.attempts >= 5) {
        entry.lockedUntil = now + 60 * 1000;
        tenantPinAttemptsStore.set(attemptKey, entry);
        return res.status(429).json({ error: '5 tentativas incorretas. Bloqueado temporariamente por 60 segundos.' });
      }
      tenantPinAttemptsStore.set(attemptKey, entry);
      return res.status(403).json({ error: `PIN incorreto para esta pasta. Tentativas restantes: ${5 - entry.attempts}` });
    }

    tenantPinAttemptsStore.delete(attemptKey);
    return res.json({ success: true, unlocked: true, folderPath: folderRel });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tenant/pin', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.readOnly || req.tenant.purpose === 'public_media') {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    const folderRel = normalizeTenantRelPath(req.query.folderPath || req.body?.folderPath);
    if (!folderRel) return res.status(400).json({ error: 'folderPath obrigatório.' });

    const record = getTenantFolderPinRecord(req.tenant.userId, folderRel);
    if (record) {
      const ok = verifyPin(req.body?.pin || req.query.pin, record.pinHash, record.pinSalt);
      if (!ok && req.tenant.role !== 'admin') {
        return res.status(403).json({ error: 'Informe o PIN atual para remover a proteção.' });
      }
      delete tenantFolderPinsStore[req.tenant.userId][folderRel];
      await persistTenantFolderPins();
    }

    return res.json({ success: true, folderPath: folderRel, hasPin: false });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 11.5.10. GET /api/tenant/zip — Exportação ZIP sob demanda (fflate)
app.get('/api/tenant/zip', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.purpose === 'public_media' || req.tenant.allowDownload === false) {
      return res.status(403).json({ error: 'Download não autorizado para este ticket.' });
    }
    const folderRel = normalizeTenantRelPath(req.query.folder || '');
    if (req.tenant.allowedPrefix) {
      assertPublicMediaPathAllowed(req, folderRel || req.tenant.allowedPrefix);
    }
    assertFolderPinUnlockedIfRequired(req, folderRel);

    const targetDir = req.tenant.resolveSafePath(folderRel, { forWrite: false });

    // Suporte a download seletivo via ?files= (JSON ou lista separada por vírgula)
    let filterSet = null;
    if (req.query.files) {
      try {
        const rawParam = String(req.query.files).trim();
        const parsedArr = rawParam.startsWith('[') ? JSON.parse(rawParam) : rawParam.split(',');
        if (Array.isArray(parsedArr) && parsedArr.length > 0) {
          filterSet = new Set(
            parsedArr
              .map((f) => normalizeTenantRelPath(String(f)).replace(/^.*\//, ''))
              .filter(Boolean)
          );
        }
      } catch {}
    }

    const zipLabel =
      filterSet && filterSet.size > 0
        ? `${path.basename(folderRel || 'selecao')}_selecionadas.zip`
        : folderRel
          ? `${path.basename(folderRel)}.zip`
          : 'meus-arquivos.zip';

    return await streamDirectoryAsZip(targetDir, req, res, zipLabel, filterSet);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11.5.11. GET /api/tenant/legacy-catalog-export — Exportação das 2.369 fotos p/ public.user_files_index
app.get('/api/tenant/legacy-catalog-export', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.userId !== PRIMARY_ADMIN_UUID || req.tenant.role !== 'admin') {
      return res.status(403).json({ error: 'Restrito ao administrador primário.' });
    }
    let rawItems = Array.isArray(memoryCatalog?.items) ? memoryCatalog.items : [];
    if (rawItems.length === 0 && fs.existsSync(PORTFOLIO_BACKUP_CATALOG)) {
      try {
        const backup = JSON.parse(fs.readFileSync(PORTFOLIO_BACKUP_CATALOG, 'utf8'));
        if (Array.isArray(backup.items) && backup.items.length > 0) {
          rawItems = backup.items;
          memoryCatalog.items = rawItems;
          if (Array.isArray(backup.albums)) memoryCatalog.albums = backup.albums;
          if (backup.subalbums) memoryCatalog.subalbums = backup.subalbums;
        }
      } catch {}
    }
    if (rawItems.length === 0) {
      const immutableSeed = path.join(__dirname, 'lib', 'catalog_seed.json');
      if (fs.existsSync(immutableSeed)) {
        try {
          const s = JSON.parse(fs.readFileSync(immutableSeed, 'utf8'));
          if (Array.isArray(s.items) && s.items.length > 0) {
            rawItems = s.items;
            memoryCatalog.items = rawItems;
            if (Array.isArray(s.albums)) memoryCatalog.albums = s.albums;
            if (s.subalbums) memoryCatalog.subalbums = s.subalbums;
          }
        } catch {}
      }
    }
    const mapped = rawItems
      .filter((it) => !it.isShortcut && it.relativePath)
      .map((it, idx) => {
        const cleanRel = String(it.relativePath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        return {
          relativePath: `Portfolio/${cleanRel}`,
          filename: it.originalFile || path.basename(cleanRel),
          mimeType: getMimeType(it.originalFile || cleanRel),
          sizeBytes: Number(it.sizeBytes) || 0,
          title: it.title || '',
          description: it.description || '',
          album: it.album || 'Geral',
          tags: Array.isArray(it.tags) ? it.tags : [],
          exifData: it.exif || {},
          isFavorite: Boolean(it.isFavorite),
          visibility: it.visibility || 'public',
          order: typeof it.order === 'number' ? it.order : idx,
        };
      });

    const totalUsedBytes = await req.tenant.getUsedBytes(true);
    return res.json({ count: mapped.length, totalUsedBytes, items: mapped });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 11.5.12. GET /api/tenant/telemetry — Telemetria Hardware ARM/RAM/Disco (Exclusivo Admin)
app.get('/api/tenant/telemetry', verifyTenantTicket, async (req, res) => {
  try {
    if (req.tenant.role !== 'admin') {
      return res.status(403).json({ error: 'Telemetria de hardware restrita ao administrador.' });
    }
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();
    const cpuCount = Math.max(1, os.cpus()?.length || 4);
    const cpuLoadPercent = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

    let tempCelsius = null;
    try {
      if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
        const rawTemp = parseInt(
          fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim(),
          10
        );
        if (!Number.isNaN(rawTemp)) {
          tempCelsius = rawTemp > 1000 ? +(rawTemp / 1000).toFixed(1) : rawTemp;
        }
      }
    } catch {}

    const adminUsedBytes = await getTenantUsedBytes(PRIMARY_ADMIN_UUID, req.tenant.userRoot);

    return res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      device: 'FireTV-Termux',
      version: '4.1.0-multi-tenant',
      hdConnected: fs.existsSync(STORAGE_DIR),
      cpuLoadPercent,
      ramUsedMb: Math.round(usedMem / (1024 * 1024)),
      ramTotalMb: Math.round(totalMem / (1024 * 1024)),
      tempCelsius,
      diskUsedBytes: adminUsedBytes,
      storageDir: STORAGE_DIR,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 12. ENTREGA DA SPA WEB (DOURADO & ROXO) + TRATAMENTO DE ERROS MULTER
// ============================================================================
app.use(
  express.static(PUBLIC_WEB_DIR, {
    index: 'index.html',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(PUBLIC_WEB_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Arquivo excede o limite de 98 MB por requisição do túnel Cloudflare.',
      });
    }
    return res.status(400).json({ error: `Erro de upload: ${err.message}` });
  }
  if (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Erro interno no servidor.' });
  }
  return res.status(404).json({ error: 'Rota não encontrada.' });
});

// ============================================================================
// 13. BOOTSTRAP ASSÍNCRONO
// ============================================================================
initCatalogStore();
setImmediate(() => {
  recalculateAllZonesAsync();
});

app.listen(PORT, BIND_HOST, () => {
  console.log(`[Portal Storage v2.0] Ativo em http://${BIND_HOST}:${PORT}`);
  console.log(`[Portal Storage v2.0] HD Externo: ${STORAGE_DIR}`);
  console.log(`[Portal Storage v2.0] Cache Interno ext4: ${PRIMARY_CATALOG_PATH}`);
});
