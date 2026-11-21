// Este programa é um software livre (Licença AGPLv3)
import type { StudioLayer } from '@/components/organizacoes/studio/types';

export type ResizeHandleType = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

export interface NormalizedRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SmartSpacingGuide {
  axis: 'x' | 'y';
  pxLabel: number;
  segments: { x1: number; y1: number; x2: number; y2: number }[];
}

export function getRotatedLayerAabb(layer: Pick<StudioLayer, 'x' | 'y' | 'width' | 'height' | 'rotation'>): NormalizedRect {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rad = ((layer.rotation || 0) * Math.PI) / 180;
  if (Math.abs(rad) < 0.0001) {
    return {
      minX: layer.x,
      maxX: layer.x + layer.width,
      minY: layer.y,
      maxY: layer.y + layer.height,
    };
  }
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = layer.width / 2;
  const hh = layer.height / 2;

  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [lx, ly] of corners) {
    const wx = cx + lx * cos - ly * sin;
    const wy = cy + lx * sin + ly * cos;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }

  return { minX, maxX, minY, maxY };
}

export function stageAspect(w: number, h: number): number {
  return w / h;
}

export function rectsIntersect(a: NormalizedRect, b: NormalizedRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function isPointInRotatedLayer(
  px: number,
  py: number,
  layer: Pick<StudioLayer, 'x' | 'y' | 'width' | 'height' | 'rotation'>
): boolean {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rad = -((layer.rotation || 0) * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= layer.width / 2 && Math.abs(ly) <= layer.height / 2;
}

/**
 * Converte coordenada normalizada do palco [0..1] para coordenada local [0..1]
 * de uma camada de desenho movida, redimensionada, rotacionada ou espelhada.
 */
export function stagePointToDrawingLayerLocal(
  px: number,
  py: number,
  layer: Pick<StudioLayer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipH' | 'flipV'>
): { x: number; y: number } {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rad = -((layer.rotation || 0) * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const rotX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const rotY = dx * Math.sin(rad) + dy * Math.cos(rad);
  const unflippedX = layer.flipH ? -rotX : rotX;
  const unflippedY = layer.flipV ? -rotY : rotY;
  return {
    x: (unflippedX + layer.width / 2) / Math.max(0.005, layer.width),
    y: (unflippedY + layer.height / 2) / Math.max(0.005, layer.height),
  };
}

/**
 * Redimensionamento com rotação mantendo o vértice/aresta oposto matematicamente ancorado.
 */
export function computeRotatedResize(params: {
  handle: ResizeHandleType;
  deltaScreenX: number;
  deltaScreenY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  rotation: number;
  layerAspect: number;
  freeAspect?: boolean;
}): { x: number; y: number; width: number; height: number } {
  const { handle, deltaScreenX, deltaScreenY, origX, origY, origW, origH, rotation, layerAspect, freeAspect } = params;
  const MIN_SIZE = 0.04;
  const rad = (rotation * Math.PI) / 180;
  const cosInv = Math.cos(-rad);
  const sinInv = Math.sin(-rad);
  const localDx = deltaScreenX * cosInv - deltaScreenY * sinInv;
  const localDy = deltaScreenX * sinInv + deltaScreenY * cosInv;

  let nextW = origW;
  let nextH = origH;
  let localShiftX = 0;
  let localShiftY = 0;

  switch (handle) {
    case 'se':
      nextW = Math.max(MIN_SIZE, origW + localDx);
      nextH = freeAspect ? Math.max(MIN_SIZE, origH + localDy) : Math.max(MIN_SIZE, nextW / Math.max(0.05, layerAspect));
      localShiftX = (nextW - origW) / 2;
      localShiftY = (nextH - origH) / 2;
      break;
    case 'sw':
      nextW = Math.max(MIN_SIZE, origW - localDx);
      nextH = freeAspect ? Math.max(MIN_SIZE, origH + localDy) : Math.max(MIN_SIZE, nextW / Math.max(0.05, layerAspect));
      localShiftX = -(nextW - origW) / 2;
      localShiftY = (nextH - origH) / 2;
      break;
    case 'ne':
      nextW = Math.max(MIN_SIZE, origW + localDx);
      nextH = freeAspect ? Math.max(MIN_SIZE, origH - localDy) : Math.max(MIN_SIZE, nextW / Math.max(0.05, layerAspect));
      localShiftX = (nextW - origW) / 2;
      localShiftY = -(nextH - origH) / 2;
      break;
    case 'nw':
      nextW = Math.max(MIN_SIZE, origW - localDx);
      nextH = freeAspect ? Math.max(MIN_SIZE, origH - localDy) : Math.max(MIN_SIZE, nextW / Math.max(0.05, layerAspect));
      localShiftX = -(nextW - origW) / 2;
      localShiftY = -(nextH - origH) / 2;
      break;
    case 'e':
      nextW = Math.max(MIN_SIZE, origW + localDx);
      localShiftX = (nextW - origW) / 2;
      break;
    case 'w':
      nextW = Math.max(MIN_SIZE, origW - localDx);
      localShiftX = -(nextW - origW) / 2;
      break;
    case 's':
      nextH = Math.max(MIN_SIZE, origH + localDy);
      localShiftY = (nextH - origH) / 2;
      break;
    case 'n':
      nextH = Math.max(MIN_SIZE, origH - localDy);
      localShiftY = -(nextH - origH) / 2;
      break;
  }

  const cosFwd = Math.cos(rad);
  const sinFwd = Math.sin(rad);
  const origCx = origX + origW / 2;
  const origCy = origY + origH / 2;
  const newCx = origCx + localShiftX * cosFwd - localShiftY * sinFwd;
  const newCy = origCy + localShiftX * sinFwd + localShiftY * cosFwd;

  return {
    x: Math.max(-0.25, Math.min(1.25, newCx - nextW / 2)),
    y: Math.max(-0.25, Math.min(1.25, newCy - nextH / 2)),
    width: Math.max(MIN_SIZE, Math.min(1.5, nextW)),
    height: Math.max(MIN_SIZE, Math.min(1.5, nextH)),
  };
}

/**
 * Detecta espaçamento igual em pixels na escala canônica (1080px) entre vizinhos.
 */
export function computeSmartSpacing(params: {
  movingRect: { x: number; y: number; width: number; height: number };
  others: StudioLayer[];
  canonicalW: number;
  canonicalH: number;
}): { snapX?: number; snapY?: number; guides: SmartSpacingGuide[] } {
  const { movingRect, others, canonicalW, canonicalH } = params;
  const guides: SmartSpacingGuide[] = [];
  let snapX: number | undefined;
  let snapY: number | undefined;

  const TOL_PX = 4;

  // Eixo X: vizinhos com sobreposição vertical
  const yOverlaps = others.filter(
    (o) => o.visible && o.y < movingRect.y + movingRect.height && o.y + o.height > movingRect.y
  );
  const leftNeighbors = yOverlaps
    .filter((o) => o.x + o.width <= movingRect.x + 0.01)
    .sort((a, b) => b.x + b.width - (a.x + a.width));
  const rightNeighbors = yOverlaps
    .filter((o) => o.x >= movingRect.x + movingRect.width - 0.01)
    .sort((a, b) => a.x - b.x);

  if (leftNeighbors[0] && rightNeighbors[0]) {
    const l = leftNeighbors[0];
    const r = rightNeighbors[0];
    const gapLeftPx = (movingRect.x - (l.x + l.width)) * canonicalW;
    const gapRightPx = (r.x - (movingRect.x + movingRect.width)) * canonicalW;
    if (gapLeftPx > 2 && gapRightPx > 2 && Math.abs(gapLeftPx - gapRightPx) <= TOL_PX) {
      const equalGap = (r.x - (l.x + l.width) - movingRect.width) / 2;
      const targetX = l.x + l.width + equalGap;
      snapX = targetX;
      const midY = movingRect.y + movingRect.height / 2;
      guides.push({
        axis: 'x',
        pxLabel: Math.round(equalGap * canonicalW),
        segments: [
          { x1: l.x + l.width, y1: midY, x2: targetX, y2: midY },
          { x1: targetX + movingRect.width, y1: midY, x2: r.x, y2: midY },
        ],
      });
    }
  }

  // Eixo Y: vizinhos com sobreposição horizontal
  const xOverlaps = others.filter(
    (o) => o.visible && o.x < movingRect.x + movingRect.width && o.x + o.width > movingRect.x
  );
  const topNeighbors = xOverlaps
    .filter((o) => o.y + o.height <= movingRect.y + 0.01)
    .sort((a, b) => b.y + b.height - (a.y + a.height));
  const bottomNeighbors = xOverlaps
    .filter((o) => o.y >= movingRect.y + movingRect.height - 0.01)
    .sort((a, b) => a.y - b.y);

  if (topNeighbors[0] && bottomNeighbors[0]) {
    const t = topNeighbors[0];
    const b = bottomNeighbors[0];
    const gapTopPx = (movingRect.y - (t.y + t.height)) * canonicalH;
    const gapBottomPx = (b.y - (movingRect.y + movingRect.height)) * canonicalH;
    if (gapTopPx > 2 && gapBottomPx > 2 && Math.abs(gapTopPx - gapBottomPx) <= TOL_PX) {
      const equalGap = (b.y - (t.y + t.height) - movingRect.height) / 2;
      const targetY = t.y + t.height + equalGap;
      snapY = targetY;
      const midX = movingRect.x + movingRect.width / 2;
      guides.push({
        axis: 'y',
        pxLabel: Math.round(equalGap * canonicalH),
        segments: [
          { x1: midX, y1: t.y + t.height, x2: midX, y2: targetY },
          { x1: midX, y1: targetY + movingRect.height, x2: midX, y2: b.y },
        ],
      });
    }
  }

  return { snapX, snapY, guides };
}
