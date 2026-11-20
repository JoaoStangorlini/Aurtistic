// Este programa é um software livre (Licença AGPLv3)
// Simplificação Ramer-Douglas-Peucker 100% pura para traços de pincel (zero DOM / zero @/)

export interface StrokePoint {
  x: number;
  y: number;
}

/** Epsilon padrão equivalente a ~0.8px na escala canônica de 1080px */
export const CANONICAL_RDP_EPSILON = 0.8 / 1080;

function perpendicularDistance(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(lenSq);
}

/**
 * Reduz vértices redundantes preservando o primeiro e o último ponto.
 * Trata com segurança cliques curtos / ponto único (length <= 2).
 */
export function simplifyStrokePoints(
  points: readonly StrokePoint[],
  epsilon: number = CANONICAL_RDP_EPSILON
): StrokePoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }));

  const safeEps = Math.max(0, Number.isFinite(epsilon) ? epsilon : CANONICAL_RDP_EPSILON);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Pilha iterativa para evitar stack overflow em traços muito longos
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start <= 1) continue;

    let maxDist = -1;
    let maxIdx = -1;
    const a = points[start];
    const b = points[end];

    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxIdx > start && maxDist > safeEps) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }

  const out: StrokePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push({ x: points[i].x, y: points[i].y });
  }
  return out;
}
