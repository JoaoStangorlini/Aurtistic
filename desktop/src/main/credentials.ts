// Este programa é um software livre (Licença AGPLv3)
import fs from 'node:fs';
import path from 'node:path';

export interface SecretCipherAdapter {
  isAvailable(): boolean;
  getBackendName?(): string;
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
}

export interface StoredDeviceCredential {
  scopeKey: string;
  tokenId: string;
  secret: string;
  updatedAt: string;
}

export class DesktopCredentialStore {
  private readonly storePath: string;
  private readonly cipher: SecretCipherAdapter;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataDir: string, cipher: SecretCipherAdapter) {
    this.storePath = path.join(userDataDir, 'credentials.enc.json');
    this.cipher = cipher;
  }

  getSecurityStatus(): { secureAvailable: boolean; backend: string; reason?: string } {
    const backend = this.cipher.getBackendName?.() || 'unknown';
    if (backend === 'basic_text') {
      return {
        secureAvailable: false,
        backend,
        reason: 'Chaveiro do sistema (GNOME Keyring/libsecret) indisponível ou bloqueado; armazenamento basic_text recusado.',
      };
    }
    if (!this.cipher.isAvailable()) {
      return {
        secureAvailable: false,
        backend,
        reason: 'safeStorage indisponível neste ambiente.',
      };
    }
    return { secureAvailable: true, backend };
  }

  private async readMap(): Promise<Record<string, { tokenId: string; encryptedSecretB64: string; updatedAt: string }>> {
    try {
      const raw = await fs.promises.readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeMap(map: Record<string, { tokenId: string; encryptedSecretB64: string; updatedAt: string }>): Promise<void> {
    const content = JSON.stringify(map, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await fs.promises.mkdir(path.dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmp, content, { mode: 0o600 });
      await fs.promises.rename(tmp, this.storePath);
    });
    return this.writeChain;
  }

  async saveCredential(scopeKey: string, tokenId: string, secret: string): Promise<void> {
    const status = this.getSecurityStatus();
    if (!status.secureAvailable) {
      throw new Error(status.reason || 'safeStorage indisponível para cifrar credenciais.');
    }
    const cleanScope = String(scopeKey || 'personal').trim() || 'personal';
    const encBuf = this.cipher.encryptString(secret);
    const map = await this.readMap();
    map[cleanScope] = {
      tokenId: String(tokenId).trim(),
      encryptedSecretB64: encBuf.toString('base64'),
      updatedAt: new Date().toISOString(),
    };
    await this.writeMap(map);
  }

  async getCredential(scopeKey: string): Promise<StoredDeviceCredential | null> {
    const cleanScope = String(scopeKey || 'personal').trim() || 'personal';
    const map = await this.readMap();
    const entry = map[cleanScope];
    if (!entry) return null;
    const status = this.getSecurityStatus();
    if (!status.secureAvailable) {
      throw new Error(status.reason || 'safeStorage indisponível para decifrar credencial.');
    }
    const secret = this.cipher.decryptString(Buffer.from(entry.encryptedSecretB64, 'base64'));
    return {
      scopeKey: cleanScope,
      tokenId: entry.tokenId,
      secret,
      updatedAt: entry.updatedAt,
    };
  }

  async getBasicAuthHeader(scopeKey: string): Promise<string | null> {
    const cred = await this.getCredential(scopeKey);
    if (!cred) return null;
    return `Basic ${Buffer.from(`${cred.tokenId}:${cred.secret}`, 'utf8').toString('base64')}`;
  }

  async clearCredential(scopeKey: string): Promise<void> {
    const cleanScope = String(scopeKey || 'personal').trim() || 'personal';
    const map = await this.readMap();
    if (cleanScope in map) {
      delete map[cleanScope];
      await this.writeMap(map);
    }
  }
}
