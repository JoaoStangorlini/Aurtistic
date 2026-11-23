// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/webdav-tokens.js
 * Gerenciador de credenciais revogáveis por dispositivo para o WebDAV Multi-Tenant.
 * - Persistência atômica com mutex + throttle de lastUsedAt (evita write amplification no flash).
 * - Cache LRU em memória com verificador HMAC-SHA256 efêmero (scrypt roda apenas no cache miss).
 * - Rate-limit por IP real (CF-Connecting-IP apenas quando atrás de loopback/túnel) apenas em falhas.
 * - Revalidação dinâmica de permissões e cota (pull curto + push imediato).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteFile } = require('./atomic-store');

const DEFAULT_CACHE_TTL_MS = 3 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 500;
const DEFAULT_LAST_USED_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_RATE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_RATE_MAX_FAILURES = 10;
const DEFAULT_MAX_RATE_ENTRIES = 2000;
const DEFAULT_MAX_TOKENS_PER_SCOPE = 20;
const USER_OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;
const ORG_OFFLINE_WRITE_GRACE_MS = 15 * 60 * 1000;

function extractClientIpForRateLimit(req) {
  const remote = String(req?.socket?.remoteAddress || req?.ip || '').trim();
  const isTunnelLoopback =
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote === '::ffff:127.0.0.1';
  if (isTunnelLoopback) {
    const cfIp = String(req?.headers?.['cf-connecting-ip'] || '').trim();
    if (cfIp) return cfIp;
  }
  return remote || 'unknown';
}

function scryptAsync(secret, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

class WebdavTokenManager {
  constructor(options = {}) {
    this.storePath = path.resolve(options.storePath);
    this.maxTokensPerScope = options.maxTokensPerScope ?? DEFAULT_MAX_TOKENS_PER_SCOPE;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.lastUsedThrottleMs = options.lastUsedThrottleMs ?? DEFAULT_LAST_USED_THROTTLE_MS;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_WINDOW_MS;
    this.rateLimitMaxFailures = options.rateLimitMaxFailures ?? DEFAULT_RATE_MAX_FAILURES;
    this.maxRateLimitEntries = options.maxRateLimitEntries ?? DEFAULT_MAX_RATE_ENTRIES;
    this.resolveEntitlement = typeof options.resolveEntitlement === 'function' ? options.resolveEntitlement : null;

    this.cacheHmacKey = crypto.randomBytes(32);
    this.authCache = new Map();
    this.rateLimitMap = new Map();
    this.lastPersistedUsageAt = new Map();
    this._mutex = Promise.resolve();
    this._flushTimer = null;

    this.tokens = {};
    this._loadSync();
  }

  _loadSync() {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
        if (raw && typeof raw.tokens === 'object' && raw.tokens !== null) {
          this.tokens = raw.tokens;
        }
      }
    } catch {
      this.tokens = {};
    }
  }

  _enqueuePersist() {
    this._mutex = this._mutex
      .then(async () => {
        const payload = JSON.stringify({ tokens: this.tokens }, null, 2);
        await atomicWriteFile(this.storePath, payload, 'utf8');
        await fs.promises.chmod(this.storePath, 0o600).catch(() => {});
      })
      .catch(() => {});
    return this._mutex;
  }

  _scheduleUsageFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      void this._enqueuePersist();
    }, 10_000);
    if (typeof this._flushTimer.unref === 'function') {
      this._flushTimer.unref();
    }
  }

  _computeHmacVerifier(tokenId, secret) {
    return crypto.createHmac('sha256', this.cacheHmacKey).update(`${tokenId}:${secret}`).digest();
  }

  _isRateLimited(clientIp, tokenId) {
    const now = Date.now();
    for (const key of [`${clientIp}|${tokenId || '_'}`, `${clientIp}|*`]) {
      const entry = this.rateLimitMap.get(key);
      if (!entry) continue;
      if (now >= entry.resetAt) {
        this.rateLimitMap.delete(key);
        continue;
      }
      if (entry.failures >= this.rateLimitMaxFailures) {
        return true;
      }
    }
    return false;
  }

  _recordAuthFailure(clientIp, tokenId) {
    const now = Date.now();
    if (this.rateLimitMap.size >= this.maxRateLimitEntries) {
      for (const [k, v] of this.rateLimitMap.entries()) {
        if (now >= v.resetAt) this.rateLimitMap.delete(k);
        if (this.rateLimitMap.size < this.maxRateLimitEntries) break;
      }
      if (this.rateLimitMap.size >= this.maxRateLimitEntries) {
        const firstKey = this.rateLimitMap.keys().next().value;
        if (firstKey) this.rateLimitMap.delete(firstKey);
      }
    }
    for (const key of [`${clientIp}|${tokenId || '_'}`, `${clientIp}|*`]) {
      const prev = this.rateLimitMap.get(key);
      if (!prev || now >= prev.resetAt) {
        this.rateLimitMap.set(key, { failures: 1, resetAt: now + this.rateLimitWindowMs });
      } else {
        prev.failures += 1;
      }
    }
  }

  _setCache(tokenId, secret, effectiveMeta) {
    if (this.authCache.has(tokenId)) {
      this.authCache.delete(tokenId);
    } else if (this.authCache.size >= this.maxCacheEntries) {
      const oldestKey = this.authCache.keys().next().value;
      if (oldestKey) this.authCache.delete(oldestKey);
    }
    this.authCache.set(tokenId, {
      hmacVerifier: this._computeHmacVerifier(tokenId, secret),
      expiresAt: Date.now() + this.cacheTtlMs,
      effectiveMeta,
    });
  }

  _scopeMatches(record, filter) {
    if (!record || !filter) return false;
    if (filter.userId && record.userId !== filter.userId) return false;
    if (filter.scopeType && record.scopeType !== filter.scopeType) return false;
    if (filter.orgSlug !== undefined && (record.orgSlug || null) !== (filter.orgSlug || null)) return false;
    return true;
  }

  async createToken(input) {
    const userId = String(input.userId || '').trim();
    const scopeType = input.scopeType === 'org' ? 'org' : 'user';
    const organizationId = scopeType === 'org' ? String(input.organizationId || '').trim() || null : null;
    const orgSlug = scopeType === 'org' ? String(input.orgSlug || '').trim().toLowerCase() || null : null;
    if (!userId) {
      const err = new Error('userId obrigatório.');
      err.statusCode = 400;
      throw err;
    }
    if (scopeType === 'org' && !orgSlug) {
      const err = new Error('orgSlug obrigatório para credencial de organização.');
      err.statusCode = 400;
      throw err;
    }

    const rawTtl = input.ttlDays === undefined ? 90 : input.ttlDays;
    let ttlDays = 90;
    if (rawTtl === null || rawTtl === 0 || rawTtl === 'never') {
      if (scopeType === 'org') {
        const err = new Error('Credenciais de organização exigem validade de 30 ou 90 dias.');
        err.statusCode = 400;
        throw err;
      }
      ttlDays = null;
    } else if (Number(rawTtl) === 30) {
      ttlDays = 30;
    } else if (Number(rawTtl) === 90) {
      ttlDays = 90;
    } else {
      const err = new Error('Validade permitida: 30 dias, 90 dias ou Sem expiração (apenas Pessoal).');
      err.statusCode = 400;
      throw err;
    }

    const now = Date.now();
    const activeInScope = Object.values(this.tokens).filter(
      (t) =>
        this._scopeMatches(t, { userId, scopeType, orgSlug }) &&
        (!t.expiresAt || Date.parse(t.expiresAt) > now)
    );
    if (activeInScope.length >= this.maxTokensPerScope) {
      const err = new Error(`Limite máximo de ${this.maxTokensPerScope} dispositivos ativos neste escopo atingido.`);
      err.statusCode = 400;
      throw err;
    }

    const tokenId = `wd_${crypto.randomBytes(6).toString('hex')}`;
    const secret = `aurt_wd_${crypto.randomBytes(24).toString('base64url')}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(secret, salt);

    const readOnlyRequested = Boolean(input.callerReadOnly || input.readOnly);
    const label = String(input.label || 'Dispositivo WebDAV').trim().slice(0, 64) || 'Dispositivo WebDAV';
    const createdAt = new Date(now).toISOString();
    const expiresAt = ttlDays ? new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString() : null;

    const record = {
      tokenId,
      salt,
      secretHash: derived.toString('hex'),
      userId,
      scopeType,
      organizationId,
      orgSlug,
      readOnlyRequested,
      label,
      createdAt,
      expiresAt,
      lastUsedAt: null,
      lastUsedIp: null,
      lastKnownRole: input.role === 'admin' ? 'admin' : 'member',
      lastKnownQuotaBytes: Math.max(0, Number(input.quotaLimitBytes) || 0),
      entitlementValidatedAt: now,
    };

    this.tokens[tokenId] = record;
    await this._enqueuePersist();

    return {
      tokenId,
      secret,
      tokenMeta: this._sanitizeToken(record),
    };
  }

  _sanitizeToken(record) {
    return {
      tokenId: record.tokenId,
      userId: record.userId,
      scopeType: record.scopeType,
      organizationId: record.organizationId,
      orgSlug: record.orgSlug,
      readOnly: Boolean(record.readOnlyRequested),
      label: record.label,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      lastUsedIp: record.lastUsedIp,
    };
  }

  listTokens(filter) {
    const now = Date.now();
    return Object.values(this.tokens)
      .filter((t) => this._scopeMatches(t, filter) && (!t.expiresAt || Date.parse(t.expiresAt) > now))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((t) => this._sanitizeToken(t));
  }

  async revokeToken(tokenId, filter) {
    const rec = this.tokens[tokenId];
    if (!rec || (filter && !this._scopeMatches(rec, filter))) {
      return false;
    }
    delete this.tokens[tokenId];
    this.authCache.delete(tokenId);
    this.lastPersistedUsageAt.delete(tokenId);
    await this._enqueuePersist();
    return true;
  }

  async invalidateCache(filter = {}) {
    let mutatedStore = false;
    for (const [tokenId, rec] of Object.entries(this.tokens)) {
      const matchUser = !filter.userId || rec.userId === filter.userId;
      const matchOrg =
        (!filter.organizationId && !filter.orgSlug) ||
        (filter.organizationId && rec.organizationId === filter.organizationId) ||
        (filter.orgSlug && rec.orgSlug === String(filter.orgSlug).toLowerCase());
      if (matchUser && matchOrg) {
        this.authCache.delete(tokenId);
        if (filter.revokeAll) {
          delete this.tokens[tokenId];
          mutatedStore = true;
        }
      }
    }
    if (mutatedStore) {
      await this._enqueuePersist();
    }
  }

  _recordUsage(tokenId, clientIp) {
    const rec = this.tokens[tokenId];
    if (!rec) return;
    const now = Date.now();
    rec.lastUsedAt = new Date(now).toISOString();
    rec.lastUsedIp = clientIp;
    const lastFlush = this.lastPersistedUsageAt.get(tokenId) || 0;
    if (now - lastFlush >= this.lastUsedThrottleMs) {
      this.lastPersistedUsageAt.set(tokenId, now);
      this._scheduleUsageFlush();
    }
  }

  async verifyBasicCredentials(tokenId, secret, clientIp = 'unknown') {
    if (this._isRateLimited(clientIp, tokenId)) {
      return {
        ok: false,
        status: 429,
        error: 'Muitas tentativas de autenticação falhas. Aguarde alguns minutos.',
      };
    }

    const record = this.tokens[tokenId];
    if (!record || !secret) {
      this._recordAuthFailure(clientIp, tokenId);
      return { ok: false, status: 401, error: 'Credencial WebDAV inválida.' };
    }
    if (record.expiresAt && Date.now() > Date.parse(record.expiresAt)) {
      this._recordAuthFailure(clientIp, tokenId);
      return { ok: false, status: 401, error: 'Credencial WebDAV expirada.' };
    }

    const now = Date.now();
    const cached = this.authCache.get(tokenId);
    if (cached && now < cached.expiresAt) {
      const incomingHmac = this._computeHmacVerifier(tokenId, secret);
      if (
        incomingHmac.length !== cached.hmacVerifier.length ||
        !crypto.timingSafeEqual(incomingHmac, cached.hmacVerifier)
      ) {
        this._recordAuthFailure(clientIp, tokenId);
        return { ok: false, status: 401, error: 'Credencial WebDAV inválida.' };
      }
      // Refresh LRU order
      this.authCache.delete(tokenId);
      this.authCache.set(tokenId, cached);
      this._recordUsage(tokenId, clientIp);
      return { ok: true, token: record, effective: cached.effectiveMeta };
    }

    // Cache miss: verifica scrypt
    const expectedBuf = Buffer.from(record.secretHash, 'hex');
    const actualBuf = await scryptAsync(secret, record.salt);
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      this._recordAuthFailure(clientIp, tokenId);
      return { ok: false, status: 401, error: 'Credencial WebDAV inválida.' };
    }

    // Revalidação dinâmica de entitlements
    let effective = {
      role: record.lastKnownRole || 'member',
      readOnly: Boolean(record.readOnlyRequested),
      quotaLimitBytes: Math.max(0, Number(record.lastKnownQuotaBytes) || 0),
    };

    if (this.resolveEntitlement) {
      let ent;
      try {
        ent = await this.resolveEntitlement(record);
      } catch {
        ent = { offline: true };
      }

      if (ent && ent.active === false) {
        delete this.tokens[tokenId];
        this.authCache.delete(tokenId);
        await this._enqueuePersist();
        return { ok: false, status: 403, error: 'Acesso ao cofre revogado ou suspenso.' };
      }

      if (ent && ent.ok && ent.active) {
        effective = {
          role: ent.role === 'admin' ? 'admin' : 'member',
          readOnly: Boolean(record.readOnlyRequested || !ent.canWrite),
          quotaLimitBytes: Math.max(0, Number(ent.quotaLimitBytes) || 0),
        };
        record.lastKnownRole = effective.role;
        record.lastKnownQuotaBytes = effective.quotaLimitBytes;
        record.entitlementValidatedAt = now;
      } else if (ent && ent.offline) {
        const lastValidated = record.entitlementValidatedAt || Date.parse(record.createdAt) || now;
        const elapsed = now - lastValidated;
        if (elapsed > USER_OFFLINE_GRACE_MS) {
          return { ok: false, status: 503, error: 'Validação de permissões indisponível (grace period expirado).' };
        }
        if (record.scopeType === 'org' && elapsed > ORG_OFFLINE_WRITE_GRACE_MS) {
          // Fail-closed para escrita em organização quando validação online estiver indisponível
          effective.readOnly = true;
        }
      }
    }

    this._setCache(tokenId, secret, effective);
    this._recordUsage(tokenId, clientIp);
    return { ok: true, token: record, effective };
  }
}

module.exports = {
  WebdavTokenManager,
  extractClientIpForRateLimit,
};
