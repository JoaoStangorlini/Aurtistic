// Este programa é um software livre (Licença AGPLv3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { simplifyStrokePoints, CANONICAL_RDP_EPSILON } = require('../stroke-simplify.ts');

test('simplifyStrokePoints preserves single point and 2-point short clicks', () => {
  assert.deepEqual(simplifyStrokePoints([]), []);
  assert.deepEqual(simplifyStrokePoints([{ x: 0.5, y: 0.5 }]), [{ x: 0.5, y: 0.5 }]);
  assert.deepEqual(
    simplifyStrokePoints([
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
    ]),
    [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
    ]
  );
});

test('simplifyStrokePoints collapses collinear straight line to 2 endpoints', () => {
  const pts = Array.from({ length: 100 }, (_, i) => ({
    x: i / 99,
    y: 0.5,
  }));
  const simplified = simplifyStrokePoints(pts, CANONICAL_RDP_EPSILON);
  assert.equal(simplified.length, 2);
  assert.deepEqual(simplified[0], { x: 0, y: 0.5 });
  assert.deepEqual(simplified[1], { x: 1, y: 0.5 });
});

test('simplifyStrokePoints preserves curve geometry while reducing redundant vertices', () => {
  const curve = Array.from({ length: 200 }, (_, i) => {
    const t = i / 199;
    return {
      x: t,
      y: 0.5 + 0.25 * Math.sin(t * Math.PI * 2),
    };
  });
  const simplified = simplifyStrokePoints(curve, CANONICAL_RDP_EPSILON);
  assert.ok(simplified.length > 10, 'Curva senoidal deve manter vértices essenciais');
  assert.ok(simplified.length < curve.length * 0.6, 'Deve reduzir significativamente vértices redundantes');
  assert.deepEqual(simplified[0], curve[0]);
  assert.deepEqual(simplified[simplified.length - 1], curve[curve.length - 1]);
});
