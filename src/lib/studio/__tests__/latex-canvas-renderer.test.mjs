// Este programa é um software livre (Licença AGPLv3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { layoutLatexFormula, parseLatexAst } = require('../latex-canvas-renderer.ts');
const { parseMarkdownBlockLine, tokenizeMarkdownAndLatexLine } = require('../md-latex-tokenizer.ts');

function createMockMeasureContext() {
  let font = '16px serif';
  return {
    get font() {
      return font;
    },
    set font(v) {
      font = v;
    },
    fillStyle: '#ffffff',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    measureText(text) {
      const m = /(\d+(?:\.\d+)?)px/.exec(font);
      const px = m ? Number(m[1]) : 16;
      return {
        width: Math.max(1, text.length * px * 0.55),
        actualBoundingBoxAscent: px * 0.78,
        actualBoundingBoxDescent: px * 0.22,
      };
    },
    save() {},
    restore() {},
    fillText() {},
    strokeText() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect() {},
    translate() {},
    scale() {},
  };
}

test('LaTeX nested fractions produce valid AST and finite positive metrics', () => {
  const ctx = createMockMeasureContext();
  const res = layoutLatexFormula(ctx, '\\frac{1}{1+\\frac{1}{x}}', 36);
  assert.ok(Number.isFinite(res.width) && res.width > 0);
  assert.ok(Number.isFinite(res.ascent) && res.ascent > 0);
  assert.ok(Number.isFinite(res.descent) && res.descent > 0);
  assert.ok(res.height > 36, 'Nested fraction should exceed base fontSize');
});

test('LaTeX simultaneous sub+superscripts and big operators (int, sum)', () => {
  const ctx = createMockMeasureContext();
  for (const expr of ['x_i^2', '\\int_a^b f(x) dx', '\\sum_{n=0}^{\\infty} \\frac{1}{n!}']) {
    const ast = parseLatexAst(expr);
    assert.equal(ast.type, 'row');
    const res = layoutLatexFormula(ctx, expr, 32);
    assert.ok(Number.isFinite(res.width) && res.width > 0);
    assert.ok(Number.isFinite(res.height) && res.height > 0);
  }
});

test('LaTeX auto-scaled delimiters and matrix environments', () => {
  const ctx = createMockMeasureContext();
  const delim = layoutLatexFormula(ctx, '\\left( \\frac{a}{b} \\right)', 30);
  assert.ok(delim.width > 20 && delim.height > 30);

  const matrix = layoutLatexFormula(ctx, '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 28);
  assert.ok(matrix.width > 30 && matrix.height > 40);
});

test('Unified MD x LaTeX single-pass tokenizer avoids $x_i * y_j$ italic collision', () => {
  const tokens = tokenizeMarkdownAndLatexLine('Equação $x_i * y_j$ com **negrito** e *itálico* e `código`.');
  const latexTok = tokens.find((t) => t.kind === 'latex');
  assert.ok(latexTok, 'Should extract inline LaTeX token');
  assert.equal(latexTok?.text, 'x_i * y_j');

  assert.ok(tokens.some((t) => t.kind === 'text' && t.bold && t.text.includes('negrito')));
  assert.ok(tokens.some((t) => t.kind === 'text' && t.italic && t.text.includes('itálico')));
  assert.ok(tokens.some((t) => t.kind === 'code' && t.text === 'código'));

  const h1 = parseMarkdownBlockLine('# Título Principal');
  assert.equal(h1.blockKind, 'h1');
  assert.equal(h1.content, 'Título Principal');

  // $ solto (ex.: R$ 10,00) e \$ escapado não engolem a linha
  const priceTokens = tokenizeMarkdownAndLatexLine('Ingresso R$ 10,00 ou \\$5 em *oferta*');
  assert.equal(priceTokens.some((t) => t.kind === 'latex'), false);
  assert.ok(priceTokens.some((t) => t.kind === 'text' && t.italic && t.text === 'oferta'));
});

test('Physics operators (oint, neq, leq, geq, times, cdot, ^circ) render with finite metrics', () => {
  const ctx = createMockMeasureContext();
  const res = layoutLatexFormula(ctx, '\\oint \\vec{B}\\cdot d\\vec{l} \\neq 0 \\leq 90^\\circ \\geq 10 \\times 2', 28);
  assert.ok(Number.isFinite(res.width) && res.width > 0);
  assert.ok(Number.isFinite(res.height) && res.height > 0);
});

test('Fuzzing incomplete/malformed LaTeX never throws and returns finite positive metrics', () => {
  const ctx = createMockMeasureContext();
  const malformedInputs = [
    '',
    '\\',
    '\\frac{a',
    '\\frac{}{',
    'x_',
    'x^',
    '\\left(a+b',
    '{{{',
    '}}}',
    '\\sqrt[3]{',
    '\\begin{pmatrix} a &',
    '\\unknowncmd{abc}',
  ];

  for (const input of malformedInputs) {
    assert.doesNotThrow(() => {
      const layout = layoutLatexFormula(ctx, input, 24);
      assert.ok(Number.isFinite(layout.width) && layout.width > 0);
      assert.ok(Number.isFinite(layout.ascent) && layout.ascent > 0);
      assert.ok(Number.isFinite(layout.descent) && layout.descent >= 0);
    });
  }
});
