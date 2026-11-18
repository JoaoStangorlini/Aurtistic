// Este programa é um software livre (Licença AGPLv3)
import type { CurvePoint, StudioLayerFilterConfig } from '@/components/organizacoes/studio/types';

export interface CompositeLut {
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  hasCustomLut: boolean;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Interpola pontos monotônicos de uma curva Bézier/linear para uma LUT de 256 bytes.
 */
function buildCurveTable(points?: CurvePoint[]): Uint8Array | null {
  if (!points || points.length < 2) return null;
  const isIdentity = points.every((p) => Math.abs(p.x - p.y) <= 1);
  if (isIdentity) return null;

  const table = new Uint8Array(256);
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < points.length - 2 && x > points[seg + 1].x) {
      seg++;
    }
    const p0 = points[seg];
    const p1 = points[seg + 1];
    const span = Math.max(1, p1.x - p0.x);
    const t = Math.max(0, Math.min(1, (x - p0.x) / span));
    // Interpolação Hermite suave (smoothstep) mantendo monotonicidade
    const smoothT = t * t * (3 - 2 * t);
    table[x] = clamp255(p0.y + (p1.y - p0.y) * smoothT);
  }
  return table;
}

/**
 * Constrói uma LUT única composta (Uint8Array(256) por canal R, G, B)
 * unindo Exposição, Brilho, Luminância, Contraste, Destaques/Sombras,
 * Ponto Branco/Negro, Temperatura, Tint e Curvas Bézier.
 */
export function buildCompositeLut(f?: StudioLayerFilterConfig): CompositeLut {
  const r = new Uint8Array(256);
  const g = new Uint8Array(256);
  const b = new Uint8Array(256);

  if (!f) {
    for (let i = 0; i < 256; i++) {
      r[i] = i;
      g[i] = i;
      b[i] = i;
    }
    return { r, g, b, hasCustomLut: false };
  }

  const rgbCurve = buildCurveTable(f.curves?.rgb);
  const rCurve = buildCurveTable(f.curves?.r);
  const gCurve = buildCurveTable(f.curves?.g);
  const bCurve = buildCurveTable(f.curves?.b);

  const highlights = (f.highlights ?? 0) / 100;
  const shadows = (f.shadows ?? 0) / 100;
  const whitePt = (f.whitePoint ?? 0) * 1.2;
  const blackPt = (f.blackPoint ?? 0) * 1.2;
  const clarity = (f.clarity ?? 0) / 100;

  const hasTonal =
    highlights !== 0 ||
    shadows !== 0 ||
    whitePt !== 0 ||
    blackPt !== 0 ||
    clarity !== 0 ||
    Boolean(rgbCurve || rCurve || gCurve || bCurve);

  if (!hasTonal) {
    for (let i = 0; i < 256; i++) {
      r[i] = i;
      g[i] = i;
      b[i] = i;
    }
    return { r, g, b, hasCustomLut: false };
  }

  for (let i = 0; i < 256; i++) {
    let val = i;

    // 1. Ponto Negro & Ponto Branco
    val = ((val - blackPt) / Math.max(10, 255 - blackPt + whitePt)) * 255;
    val = clamp255(val);

    // 2. Dinâmica Tonal (Sombras / Destaques) e Claridade S-curve
    const norm = val / 255;
    if (shadows !== 0 && norm < 0.5) {
      const weight = (1 - norm * 2) ** 1.5;
      val = clamp255(val + shadows * 55 * weight);
    }
    if (highlights !== 0 && norm > 0.5) {
      const weight = ((norm - 0.5) * 2) ** 1.5;
      val = clamp255(val + highlights * 55 * weight);
    }
    if (clarity !== 0) {
      const sCurve = Math.sin((norm - 0.5) * Math.PI) * clarity * 18;
      val = clamp255(val + sCurve);
    }

    // 3. Curva RGB Master
    if (rgbCurve) val = rgbCurve[val];

    // 4. Curvas Individuais por Canal
    r[i] = rCurve ? rCurve[val] : val;
    g[i] = gCurve ? gCurve[val] : val;
    b[i] = bCurve ? bCurve[val] : val;
  }

  return { r, g, b, hasCustomLut: true };
}

export function applyCompositeLutToContext(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lut: CompositeLut
): void {
  if (!lut.hasCustomLut || w <= 0 || h <= 0) return;
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const { r, g, b } = lut;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      data[i] = r[data[i]];
      data[i + 1] = g[data[i + 1]];
      data[i + 2] = b[data[i + 2]];
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Proteção silenciosa caso imagem externa esteja sem CORS
  }
}

// ─── Pool Estático Reaproveitável + Cache por Dirty Flag de Camada ──────────

let reusableBlurCanvas: HTMLCanvasElement | null = null;
let reusableSharpCanvas: HTMLCanvasElement | null = null;
const layerProcessedCache = new Map<string, { signature: string; canvas: HTMLCanvasElement }>();

export function getReusableCanvas(slot: 'blur' | 'sharp', w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const targetW = Math.max(1, Math.round(w));
  const targetH = Math.max(1, Math.round(h));
  let canvas = slot === 'blur' ? reusableBlurCanvas : reusableSharpCanvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    if (slot === 'blur') reusableBlurCanvas = canvas;
    else reusableSharpCanvas = canvas;
  }
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, targetW, targetH);
  return { canvas, ctx };
}

export function getCachedLayerCanvas(layerId: string, signature: string): HTMLCanvasElement | null {
  const entry = layerProcessedCache.get(layerId);
  if (entry && entry.signature === signature) {
    return entry.canvas;
  }
  return null;
}

export function setCachedLayerCanvas(
  layerId: string,
  signature: string,
  source: HTMLCanvasElement
): void {
  let entry = layerProcessedCache.get(layerId);
  if (!entry) {
    const c = document.createElement('canvas');
    entry = { signature, canvas: c };
    layerProcessedCache.set(layerId, entry);
  }
  entry.signature = signature;
  if (entry.canvas.width !== source.width) entry.canvas.width = source.width;
  if (entry.canvas.height !== source.height) entry.canvas.height = source.height;
  const ctx = entry.canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(source, 0, 0);
  }
}

/**
 * Descarte explícito de buffers (canvas.width = 0; canvas.height = 0)
 * para evitar memory leaks ao trocar slides ou rascunhos.
 */
export function clearStudioRenderCache(): void {
  if (reusableBlurCanvas) {
    reusableBlurCanvas.width = 0;
    reusableBlurCanvas.height = 0;
    reusableBlurCanvas = null;
  }
  if (reusableSharpCanvas) {
    reusableSharpCanvas.width = 0;
    reusableSharpCanvas.height = 0;
    reusableSharpCanvas = null;
  }
  for (const entry of layerProcessedCache.values()) {
    entry.canvas.width = 0;
    entry.canvas.height = 0;
  }
  layerProcessedCache.clear();
}

