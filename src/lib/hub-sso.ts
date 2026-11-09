// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/hub-sso.ts
import crypto from 'node:crypto';

export interface HubSsoPayload {
  hubUserId: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl?: string | null;
  isLabdiv: boolean;
  organizations: string[];
  role: string;
  iat: number;
  exp: number;
  nonce: string;
}

export interface HubConnectionData {
  hub_user_id: string;
  hub_email: string;
  hub_username: string;
  hub_full_name: string;
  hub_avatar_url?: string | null;
  is_labdiv: boolean;
  organizations: string[];
  linked_at: string;
  encrypted_link_secret?: string;
  linked_email?: string;
}

const ENCRYPTION_ALGO = 'aes-256-gcm';

/**
 * Assina um ticket de Single Sign-On (SSO) com HMAC-SHA256.
 */
export function signHubSsoTicket(
  data: Omit<HubSsoPayload, 'iat' | 'exp' | 'nonce'>,
  secret: string,
  expiresInSeconds: number = 300
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: HubSsoPayload = {
    ...data,
    iat: now,
    exp: now + expiresInSeconds,
    nonce: crypto.randomBytes(12).toString('hex'),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Valida a integridade e expiração de um ticket SSO do HUB LabDiv.
 */
export function verifyHubSsoTicket(
  ticket: string,
  secret: string
): { valid: boolean; payload?: HubSsoPayload; error?: string } {
  if (!ticket || typeof ticket !== 'string' || !ticket.includes('.')) {
    return { valid: false, error: 'Formato de ticket inválido.' };
  }

  const [payloadB64, providedSig] = ticket.split('.');
  if (!payloadB64 || !providedSig) {
    return { valid: false, error: 'Ticket incompleto.' };
  }

  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const providedBuf = Buffer.from(providedSig, 'utf8');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return { valid: false, error: 'Assinatura criptográfica do ticket inválida.' };
    }

    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as HubSsoPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return { valid: false, error: 'Ticket SSO expirado. Inicie o login novamente.' };
    }

    return { valid: true, payload };
  } catch (err: unknown) {
    return { valid: false, error: err instanceof Error ? err.message : 'Falha na validação do ticket.' };
  }
}

/**
 * Cifra uma credencial local para vinculação SSO de 1 toque usando AES-256-GCM.
 */
export function encryptLinkSecret(plainSecret: string, keyString: string): string {
  const key = crypto.createHash('sha256').update(keyString).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  const tag = cipher.getAuthTag().toString('base64url');
  return `${iv.toString('base64url')}.${tag}.${encrypted}`;
}

/**
 * Decifra uma credencial local vinculada com AES-256-GCM.
 */
export function decryptLinkSecret(cipherPayload: string, keyString: string): string | null {
  try {
    const [ivB64, tagB64, encryptedB64] = cipherPayload.split('.');
    if (!ivB64 || !tagB64 || !encryptedB64) return null;
    const key = crypto.createHash('sha256').update(keyString).digest();
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedB64, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}
