// Este programa é um software livre (Licença AGPLv3)
// Assinatura binária trailer anti-loop para proxies comprimidos locais (Web + Android)

export const PROXY_SIGNATURE_PREFIX = 'AURTISTIC_PROXY_OF:';

/**
 * Anexa o trailer `AURTISTIC_PROXY_OF:<originalSha256>:<originalSizeBytes>` ao final do Blob comprimido,
 * garantindo detecção mesmo quando `canvas.toBlob('image/webp')` remove metadados EXIF.
 */
export function appendProxySignatureTrailer(
  compressedBlob: Blob,
  originalSha256: string,
  originalSizeBytes: number
): Blob {
  const marker = `\n${PROXY_SIGNATURE_PREFIX}${originalSha256}:${originalSizeBytes}`;
  return new Blob([compressedBlob, marker], { type: compressedBlob.type || 'image/webp' });
}

/**
 * Verifica os primeiros 64 KB e os últimos 64 KB (ou buffer completo se < 2 MB) de um File/Blob
 * para detectar se já é um proxy comprimido local e evitar loop de re-upload.
 */
export async function hasProxySignatureMarker(file: Blob): Promise<boolean> {
  try {
    const encoder = new TextDecoder('latin1');
    if (file.size <= 2 * 1024 * 1024) {
      const buf = await file.arrayBuffer();
      return encoder.decode(buf).includes(PROXY_SIGNATURE_PREFIX);
    }

    const headSlice = await file.slice(0, 65536).arrayBuffer();
    if (encoder.decode(headSlice).includes(PROXY_SIGNATURE_PREFIX)) return true;

    const tailSlice = await file.slice(Math.max(0, file.size - 65536), file.size).arrayBuffer();
    return encoder.decode(tailSlice).includes(PROXY_SIGNATURE_PREFIX);
  } catch {
    return false;
  }
}

export async function computeFileSha256(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

