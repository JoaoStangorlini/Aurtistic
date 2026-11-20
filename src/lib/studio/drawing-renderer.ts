// Este programa é um software livre (Licença AGPLv3)
// Renderizador de Camadas de Desenho Livre + Borracha Isolada em 1 Único Offscreen Reutilizável

import type { StudioBrushStroke, StudioDrawingLayer } from '@/components/organizacoes/studio/types';

let sharedDrawingCanvas: HTMLCanvasElement | null = null;
let sharedDrawingCtx: CanvasRenderingContext2D | null = null;

function getReusableDrawingBuffer(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === 'undefined') return null;
  if (!sharedDrawingCanvas) {
    sharedDrawingCanvas = document.createElement('canvas');
    sharedDrawingCtx = sharedDrawingCanvas.getContext('2d');
  }
  if (!sharedDrawingCtx) return null;
  if (sharedDrawingCanvas.width !== w || sharedDrawingCanvas.height !== h) {
    sharedDrawingCanvas.width = w;
    sharedDrawingCanvas.height = h;
  } else {
    sharedDrawingCtx.clearRect(0, 0, w, h);
  }
  return { canvas: sharedDrawingCanvas, ctx: sharedDrawingCtx };
}

/** PRNG determinístico Mulberry32 para Spray sem flicker */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSmoothPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], w: number, h: number) {
  if (pts.length === 0) return;
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x * w, pts[0].y * h, Math.max(1, ctx.lineWidth / 2), 0, Math.PI * 2);
    return;
  }
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x * w, pts[1].y * h);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = ((pts[i].x + pts[i + 1].x) / 2) * w;
    const midY = ((pts[i].y + pts[i + 1].y) / 2) * h;
    ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x * w, last.y * h);
}

export function drawSingleBrushStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StudioBrushStroke,
  layerW: number,
  layerH: number,
  canonicalScale: number
): void {
  if (!stroke.points || stroke.points.length === 0) return;

  const lineW = Math.max(1.5, stroke.size * canonicalScale);
  ctx.save();
  ctx.lineCap = stroke.brush === 'marker' ? 'square' : 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineW;

  if (stroke.brush === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke.points[0].x * layerW, stroke.points[0].y * layerH, lineW / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      buildSmoothPath(ctx, stroke.points, layerW, layerH);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = 'source-over';
  const alpha = Math.max(0.05, Math.min(1, stroke.opacity));

  if (stroke.brush === 'spray') {
    const rand = mulberry32(stroke.seed ?? 1337);
    const radius = lineW * 1.15;
    const dotsPerPoint = Math.max(8, Math.round(lineW * 0.8));
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = alpha * 0.45;
    for (const pt of stroke.points) {
      const px = pt.x * layerW;
      const py = pt.y * layerH;
      for (let d = 0; d < dotsPerPoint; d++) {
        const ang = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * radius;
        const dotSize = Math.max(1, lineW * 0.1 * (0.5 + rand()));
        ctx.fillRect(px + Math.cos(ang) * r, py + Math.sin(ang) * r, dotSize, dotSize);
      }
    }
    ctx.restore();
    return;
  }

  if (stroke.brush === 'highlighter') {
    ctx.globalAlpha = Math.min(0.45, alpha * 0.45);
    ctx.lineCap = 'butt';
  } else if (stroke.brush === 'marker') {
    ctx.globalAlpha = Math.min(0.88, alpha * 0.88);
  } else {
    ctx.globalAlpha = alpha;
  }

  if (stroke.brush === 'dashed') {
    ctx.setLineDash([lineW * 1.8, lineW * 1.3]);
  }

  if (stroke.points.length === 1) {
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(stroke.points[0].x * layerW, stroke.points[0].y * layerH, lineW / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (stroke.brush === 'neon') {
    // Passe 1: halo externo difuso
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = lineW * 1.4;
    ctx.strokeStyle = stroke.color;
    buildSmoothPath(ctx, stroke.points, layerW, layerH);
    ctx.stroke();

    // Passe 2: núcleo brilhante
    ctx.shadowBlur = lineW * 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, lineW * 0.42);
    buildSmoothPath(ctx, stroke.points, layerW, layerH);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.strokeStyle = stroke.color;
  buildSmoothPath(ctx, stroke.points, layerW, layerH);
  ctx.stroke();
  ctx.restore();
}

export function renderDrawingLayer(
  ctx: CanvasRenderingContext2D,
  layer: StudioDrawingLayer,
  canvasW: number,
  canvasH: number
): void {
  if (!layer.strokes || layer.strokes.length === 0) return;

  const lx = layer.x * canvasW;
  const ly = layer.y * canvasH;
  const lw = Math.max(1, layer.width * canvasW);
  const lh = Math.max(1, layer.height * canvasH);
  const canonicalScale = lw / 1080;

  // Renderiza em 1 único offscreen reutilizado para isolar a Borracha (destination-out) sem furar fotos abaixo
  const bufW = Math.max(1, Math.round(lw));
  const bufH = Math.max(1, Math.round(lh));
  const buf = getReusableDrawingBuffer(bufW, bufH);

  if (buf) {
    for (const stroke of layer.strokes) {
      drawSingleBrushStroke(buf.ctx, stroke, bufW, bufH, canonicalScale);
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(lx + lw / 2, ly + lh / 2);
    if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
    if (layer.flipH || layer.flipV) ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
    ctx.drawImage(buf.canvas, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
    return;
  }

  // Fallback caso document não exista
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(lx + lw / 2, ly + lh / 2);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(-lw / 2, -lh / 2);
  for (const stroke of layer.strokes) {
    drawSingleBrushStroke(ctx, stroke, lw, lh, canonicalScale);
  }
  ctx.restore();
}
