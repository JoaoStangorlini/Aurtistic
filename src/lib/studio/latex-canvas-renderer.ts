// Este programa é um software livre (Licença AGPLv3)
// Motor LaTeX 2D Puro e Defensivo para HTML5 Canvas (zero dependências de DOM/@/)

export const MATH_FONT_STACK =
  "'Cambria Math', 'STIX Two Math', 'Latin Modern Math', 'Times New Roman', serif";

export interface TextMetricsLike {
  width: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
}

export interface MeasureContext {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  measureText(text: string): TextMetricsLike;
  save(): void;
  restore(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
}

export type MathNode =
  | { type: 'row'; items: MathNode[] }
  | { type: 'text'; value: string; italic?: boolean; bold?: boolean; upright?: boolean }
  | { type: 'frac'; num: MathNode; den: MathNode }
  | { type: 'sqrt'; body: MathNode; index?: MathNode }
  | { type: 'supSub'; base: MathNode; sup?: MathNode; sub?: MathNode }
  | { type: 'delimited'; left: string; right: string; body: MathNode }
  | { type: 'accent'; kind: 'vec' | 'hat' | 'bar' | 'dot' | 'ddot' | 'overline'; body: MathNode }
  | { type: 'matrix'; bracket: 'paren' | 'bracket' | 'plain'; rows: MathNode[][] }
  | { type: 'bigOp'; symbol: string; sup?: MathNode; sub?: MathNode };

const SYMBOL_MAP: Record<string, string> = {
  // Alfabeto grego minúsculo
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  // Alfabeto grego maiúsculo
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Operadores físicos e matemáticos
  nabla: '∇', partial: '∂', hbar: 'ℏ', ell: 'ℓ', infty: '∞',
  approx: '≈', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  pm: '±', mp: '∓', times: '×', cdot: '·', div: '÷', ast: '∗',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', mapsto: '↦', propto: '∝',
  equiv: '≡', sim: '∼', simeq: '≃', cong: '≅',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩',
  forall: '∀', exists: '∃', empty: '∅', varnothing: '∅',
  degree: '°', circ: '°', prime: '′', perp: '⊥', parallel: '∥', angle: '∠',
  ldots: '…', cdots: '⋯',
};

const BIG_OP_MAP: Record<string, string> = {
  int: '∫', iint: '∬', iiint: '∭', oint: '∮',
  sum: '∑', prod: '∏', coprod: '∐',
  lim: 'lim', sin: 'sin', cos: 'cos', tan: 'tan',
  log: 'log', ln: 'ln', exp: 'exp', max: 'max', min: 'min',
};

function sanitizeDelimiter(raw: string): string {
  if (!raw || raw === '.') return '';
  if (raw === '\\{' || raw === '{') return '{';
  if (raw === '\\}' || raw === '}') return '}';
  if (raw === '\\|') return '‖';
  if (raw === '\\langle') return '⟨';
  if (raw === '\\rangle') return '⟩';
  return raw;
}

/**
 * Parser recursivo defensivo: nunca lança exceções e nunca entra em loop infinito.
 */
export function parseLatexAst(input: string): MathNode {
  const src = String(input || '');
  let pos = 0;
  let steps = 0;
  const maxSteps = Math.max(512, src.length * 8);

  const guard = () => {
    steps++;
    return steps <= maxSteps && pos < src.length;
  };

  const skipSpaces = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };

  const readCommandName = (): string => {
    pos++; // pula '\'
    if (pos >= src.length) return '';
    if (!/[a-zA-Z]/.test(src[pos])) {
      return src[pos++];
    }
    const start = pos;
    while (pos < src.length && /[a-zA-Z]/.test(src[pos])) pos++;
    return src.slice(start, pos);
  };

  const parseGroupOrAtom = (): MathNode => {
    skipSpaces();
    if (!guard()) return { type: 'text', value: '' };
    if (src[pos] === '{') {
      pos++;
      const inner = parseRow('}');
      if (pos < src.length && src[pos] === '}') pos++;
      return inner;
    }
    return parseAtom();
  };

  const parseMatrix = (env: string): MathNode => {
    const endMarker = `\\end{${env}}`;
    const endIdx = src.indexOf(endMarker, pos);
    const body = endIdx >= 0 ? src.slice(pos, endIdx) : src.slice(pos);
    pos = endIdx >= 0 ? endIdx + endMarker.length : src.length;
    const rawRows = body.split('\\\\').slice(0, 12);
    const rows = rawRows.map((r) =>
      r.split('&').slice(0, 12).map((cell) => parseLatexAst(cell.trim()))
    );
    const bracket: 'paren' | 'bracket' | 'plain' =
      env === 'pmatrix' ? 'paren' : env === 'bmatrix' ? 'bracket' : 'plain';
    return { type: 'matrix', bracket, rows };
  };

  const parseAtom = (): MathNode => {
    skipSpaces();
    if (!guard()) return { type: 'text', value: '' };
    const ch = src[pos];

    if (ch === '{') {
      pos++;
      const inner = parseRow('}');
      if (pos < src.length && src[pos] === '}') pos++;
      return inner;
    }

    if (ch === '\\') {
      const cmd = readCommandName();
      if (!cmd) return { type: 'text', value: '' };
      if (cmd === '{' || cmd === '}' || cmd === '%' || cmd === '&' || cmd === '$') {
        return { type: 'text', value: cmd, upright: true };
      }
      if (cmd === ' ' || cmd === ',' || cmd === ';' || cmd === 'quad') {
        return { type: 'text', value: ' ', upright: true };
      }
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const num = parseGroupOrAtom();
        const den = parseGroupOrAtom();
        return { type: 'frac', num, den };
      }
      if (cmd === 'sqrt') {
        skipSpaces();
        let index: MathNode | undefined;
        if (pos < src.length && src[pos] === '[') {
          pos++;
          const closeIdx = src.indexOf(']', pos);
          const rawIdx = closeIdx >= 0 ? src.slice(pos, closeIdx) : '';
          pos = closeIdx >= 0 ? closeIdx + 1 : src.length;
          if (rawIdx.trim()) index = parseLatexAst(rawIdx);
        }
        const body = parseGroupOrAtom();
        return { type: 'sqrt', body, index };
      }
      if (cmd === 'left') {
        skipSpaces();
        let leftRaw = '';
        if (pos < src.length) {
          leftRaw = src[pos] === '\\' ? `\\${readCommandName()}` : src[pos++];
        }
        const body = parseRow('\\right');
        let rightRaw = '';
        if (src.slice(pos).startsWith('\\right')) {
          pos += 6;
          skipSpaces();
          if (pos < src.length) {
            rightRaw = src[pos] === '\\' ? `\\${readCommandName()}` : src[pos++];
          }
        }
        return {
          type: 'delimited',
          left: sanitizeDelimiter(leftRaw),
          right: sanitizeDelimiter(rightRaw),
          body,
        };
      }
      if (cmd === 'vec' || cmd === 'hat' || cmd === 'bar' || cmd === 'dot' || cmd === 'ddot' || cmd === 'overline') {
        return { type: 'accent', kind: cmd, body: parseGroupOrAtom() };
      }
      if (cmd === 'text' || cmd === 'mathrm' || cmd === 'mathbf') {
        const inner = parseGroupOrAtom();
        const applyStyle = (node: MathNode): MathNode => {
          if (node.type === 'text') return { ...node, upright: true, bold: cmd === 'mathbf', italic: false };
          if (node.type === 'row') return { type: 'row', items: node.items.map(applyStyle) };
          return node;
        };
        return applyStyle(inner);
      }
      if (cmd === 'begin') {
        skipSpaces();
        if (pos < src.length && src[pos] === '{') {
          pos++;
          const endBrace = src.indexOf('}', pos);
          const env = endBrace >= 0 ? src.slice(pos, endBrace).trim() : '';
          pos = endBrace >= 0 ? endBrace + 1 : src.length;
          if (env === 'pmatrix' || env === 'bmatrix' || env === 'matrix') {
            return parseMatrix(env);
          }
        }
        return { type: 'text', value: '' };
      }
      if (BIG_OP_MAP[cmd]) {
        return { type: 'bigOp', symbol: BIG_OP_MAP[cmd] };
      }
      if (SYMBOL_MAP[cmd]) {
        return { type: 'text', value: SYMBOL_MAP[cmd], upright: true };
      }
      return { type: 'text', value: cmd, upright: true };
    }

    // Número ou variável simples
    pos++;
    if (/[0-9.,]/.test(ch)) {
      let num = ch;
      while (pos < src.length && /[0-9.,]/.test(src[pos])) num += src[pos++];
      return { type: 'text', value: num, upright: true };
    }
    if (/[a-zA-Z]/.test(ch)) {
      return { type: 'text', value: ch, italic: true };
    }
    return { type: 'text', value: ch, upright: true };
  };

  const parseFactor = (): MathNode => {
    const base = parseAtom();
    let sup: MathNode | undefined;
    let sub: MathNode | undefined;

    while (guard()) {
      skipSpaces();
      if (src[pos] === '^' && !sup) {
        pos++;
        sup = parseGroupOrAtom();
      } else if (src[pos] === '_' && !sub) {
        pos++;
        sub = parseGroupOrAtom();
      } else {
        break;
      }
    }

    if (!sup && !sub) return base;
    if (base.type === 'bigOp') {
      return { ...base, sup: sup || base.sup, sub: sub || base.sub };
    }
    return { type: 'supSub', base, sup, sub };
  };

  const parseRow = (stopAt?: string): MathNode => {
    const items: MathNode[] = [];
    while (guard()) {
      skipSpaces();
      if (pos >= src.length) break;
      if (stopAt === '}' && src[pos] === '}') break;
      if (stopAt === '\\right' && src.slice(pos).startsWith('\\right')) break;
      if (src[pos] === '}' && !stopAt) {
        pos++;
        continue;
      }
      const prevPos = pos;
      items.push(parseFactor());
      if (pos === prevPos) pos++; // garantia absoluta contra loop infinito
    }
    return { type: 'row', items };
  };

  return parseRow();
}

export interface MathBox {
  node: MathNode;
  fontSize: number;
  width: number;
  ascent: number;
  descent: number;
  height: number;
  children?: MathBox[];
  extra?: Record<string, unknown>;
}

function measureTextBox(ctx: MeasureContext, text: string, font: string, fontSize: number): { width: number; ascent: number; descent: number } {
  ctx.font = font;
  const m = ctx.measureText(text || ' ');
  const width = Math.max(text ? 2 : 0, Number.isFinite(m.width) ? m.width : text.length * fontSize * 0.52);
  const ascent =
    typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0
      ? m.actualBoundingBoxAscent
      : fontSize * 0.78;
  const descent =
    typeof m.actualBoundingBoxDescent === 'number' && m.actualBoundingBoxDescent >= 0
      ? m.actualBoundingBoxDescent
      : fontSize * 0.22;
  return { width, ascent, descent };
}

export function layoutMathNode(ctx: MeasureContext, node: MathNode, fontSize: number): MathBox {
  const safeSize = Math.max(8, fontSize);

  switch (node.type) {
    case 'text': {
      const style = `${node.italic ? 'italic ' : ''}${node.bold ? '700 ' : '400 '}${safeSize}px ${MATH_FONT_STACK}`;
      const m = measureTextBox(ctx, node.value, style, safeSize);
      return { node, fontSize: safeSize, width: m.width, ascent: m.ascent, descent: m.descent, height: m.ascent + m.descent };
    }

    case 'row': {
      const children = node.items.map((it) => layoutMathNode(ctx, it, safeSize));
      const gap = safeSize * 0.06;
      const width = children.reduce((acc, c, idx) => acc + c.width + (idx > 0 ? gap : 0), 0);
      const ascent = children.reduce((acc, c) => Math.max(acc, c.ascent), safeSize * 0.72);
      const descent = children.reduce((acc, c) => Math.max(acc, c.descent), safeSize * 0.2);
      return { node, fontSize: safeSize, width: Math.max(2, width), ascent, descent, height: ascent + descent, children };
    }

    case 'frac': {
      const subSize = Math.max(8, safeSize * 0.76);
      const numBox = layoutMathNode(ctx, node.num, subSize);
      const denBox = layoutMathNode(ctx, node.den, subSize);
      const padX = safeSize * 0.16;
      const barGap = safeSize * 0.14;
      const midAxis = safeSize * 0.28;
      const width = Math.max(numBox.width, denBox.width) + padX * 2;
      const ascent = midAxis + barGap + numBox.height;
      const descent = Math.max(safeSize * 0.22, denBox.height + barGap - midAxis);
      return {
        node,
        fontSize: safeSize,
        width,
        ascent,
        descent,
        height: ascent + descent,
        children: [numBox, denBox],
        extra: { midAxis, barGap },
      };
    }

    case 'sqrt': {
      const bodyBox = layoutMathNode(ctx, node.body, safeSize);
      const idxBox = node.index ? layoutMathNode(ctx, node.index, Math.max(8, safeSize * 0.56)) : undefined;
      const radicalW = safeSize * 0.55 + (idxBox ? idxBox.width * 0.6 : 0);
      const topPad = safeSize * 0.18;
      const width = radicalW + bodyBox.width + safeSize * 0.12;
      const ascent = bodyBox.ascent + topPad;
      const descent = bodyBox.descent + safeSize * 0.06;
      return {
        node,
        fontSize: safeSize,
        width,
        ascent,
        descent,
        height: ascent + descent,
        children: idxBox ? [bodyBox, idxBox] : [bodyBox],
        extra: { radicalW, topPad },
      };
    }

    case 'supSub': {
      const baseBox = layoutMathNode(ctx, node.base, safeSize);
      const scriptSize = Math.max(8, safeSize * 0.65);
      const supBox = node.sup ? layoutMathNode(ctx, node.sup, scriptSize) : undefined;
      const subBox = node.sub ? layoutMathNode(ctx, node.sub, scriptSize) : undefined;
      const scriptW = Math.max(supBox?.width ?? 0, subBox?.width ?? 0);
      const width = baseBox.width + scriptW + safeSize * 0.04;
      const ascent = Math.max(baseBox.ascent, baseBox.ascent * 0.55 + (supBox ? supBox.height : 0));
      const descent = Math.max(baseBox.descent, baseBox.descent * 0.4 + (subBox ? subBox.height : 0));
      return {
        node,
        fontSize: safeSize,
        width,
        ascent,
        descent,
        height: ascent + descent,
        children: [baseBox, ...(supBox ? [supBox] : []), ...(subBox ? [subBox] : [])],
        extra: { hasSup: Boolean(supBox), hasSub: Boolean(subBox) },
      };
    }

    case 'delimited': {
      const bodyBox = layoutMathNode(ctx, node.body, safeSize);
      const delimW = (node.left ? safeSize * 0.36 : 0) + (node.right ? safeSize * 0.36 : 0);
      const width = bodyBox.width + delimW + safeSize * 0.1;
      const ascent = Math.max(bodyBox.ascent, safeSize * 0.8) + safeSize * 0.08;
      const descent = Math.max(bodyBox.descent, safeSize * 0.24) + safeSize * 0.08;
      return { node, fontSize: safeSize, width, ascent, descent, height: ascent + descent, children: [bodyBox] };
    }

    case 'accent': {
      const bodyBox = layoutMathNode(ctx, node.body, safeSize);
      const accentH = safeSize * 0.26;
      return {
        node,
        fontSize: safeSize,
        width: Math.max(bodyBox.width, safeSize * 0.4),
        ascent: bodyBox.ascent + accentH,
        descent: bodyBox.descent,
        height: bodyBox.height + accentH,
        children: [bodyBox],
        extra: { accentH },
      };
    }

    case 'bigOp': {
      const opSize = node.symbol.length === 1 ? safeSize * 1.25 : safeSize;
      const opFont = `400 ${opSize}px ${MATH_FONT_STACK}`;
      const opM = measureTextBox(ctx, node.symbol, opFont, opSize);
      const limSize = Math.max(8, safeSize * 0.6);
      const supBox = node.sup ? layoutMathNode(ctx, node.sup, limSize) : undefined;
      const subBox = node.sub ? layoutMathNode(ctx, node.sub, limSize) : undefined;
      const width = Math.max(opM.width, supBox?.width ?? 0, subBox?.width ?? 0) + safeSize * 0.14;
      const ascent = opM.ascent + (supBox ? supBox.height + safeSize * 0.06 : 0);
      const descent = opM.descent + (subBox ? subBox.height + safeSize * 0.06 : 0);
      return {
        node,
        fontSize: safeSize,
        width,
        ascent,
        descent,
        height: ascent + descent,
        children: [...(supBox ? [supBox] : []), ...(subBox ? [subBox] : [])],
        extra: { opW: opM.width, opAscent: opM.ascent, opDescent: opM.descent, opSize, hasSup: Boolean(supBox), hasSub: Boolean(subBox) },
      };
    }

    case 'matrix': {
      const cellSize = Math.max(8, safeSize * 0.85);
      const rowBoxes = node.rows.map((r) => r.map((c) => layoutMathNode(ctx, c, cellSize)));
      const numCols = rowBoxes.reduce((m, r) => Math.max(m, r.length), 1);
      const colWidths = Array.from({ length: numCols }, (_, ci) =>
        rowBoxes.reduce((m, r) => Math.max(m, r[ci]?.width ?? 0), cellSize * 0.5)
      );
      const colGap = safeSize * 0.45;
      const rowGap = safeSize * 0.25;
      const totalInnerW = colWidths.reduce((a, b) => a + b, 0) + Math.max(0, numCols - 1) * colGap;
      const rowHeights = rowBoxes.map((r) => {
        const a = r.reduce((m, c) => Math.max(m, c.ascent), cellSize * 0.7);
        const d = r.reduce((m, c) => Math.max(m, c.descent), cellSize * 0.2);
        return { a, d, h: a + d };
      });
      const totalInnerH = rowHeights.reduce((a, b) => a + b.h, 0) + Math.max(0, rowHeights.length - 1) * rowGap;
      const bracketW = node.bracket === 'plain' ? 0 : safeSize * 0.65;
      const width = totalInnerW + bracketW;
      const ascent = totalInnerH / 2 + safeSize * 0.28;
      const descent = Math.max(safeSize * 0.2, totalInnerH / 2 - safeSize * 0.28);
      return {
        node,
        fontSize: safeSize,
        width,
        ascent,
        descent,
        height: ascent + descent,
        extra: { rowBoxes, colWidths, rowHeights, colGap, rowGap, totalInnerH, bracketW },
      };
    }
  }
}

export function layoutLatexFormula(
  ctx: MeasureContext,
  latex: string,
  fontSize: number
): { box: MathBox; width: number; ascent: number; descent: number; height: number } {
  const ast = parseLatexAst(latex);
  const box = layoutMathNode(ctx, ast, fontSize);
  return { box, width: box.width, ascent: box.ascent, descent: box.descent, height: box.height };
}

function drawBox(ctx: MeasureContext, box: MathBox, x: number, baselineY: number, color: string): void {
  const node = box.node;
  const s = box.fontSize;

  switch (node.type) {
    case 'text': {
      ctx.font = `${node.italic ? 'italic ' : ''}${node.bold ? '700 ' : '400 '}${s}px ${MATH_FONT_STACK}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(node.value, x, baselineY);
      return;
    }

    case 'row': {
      const gap = s * 0.06;
      let cx = x;
      for (const child of box.children || []) {
        drawBox(ctx, child, cx, baselineY, color);
        cx += child.width + gap;
      }
      return;
    }

    case 'frac': {
      const [numBox, denBox] = box.children || [];
      if (!numBox || !denBox) return;
      const midAxis = (box.extra?.midAxis as number) ?? s * 0.28;
      const barGap = (box.extra?.barGap as number) ?? s * 0.14;
      const barY = baselineY - midAxis;

      const numX = x + (box.width - numBox.width) / 2;
      const numBaseline = barY - barGap - numBox.descent;
      drawBox(ctx, numBox, numX, numBaseline, color);

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.05, barY);
      ctx.lineTo(x + box.width - s * 0.05, barY);
      ctx.stroke();

      const denX = x + (box.width - denBox.width) / 2;
      const denBaseline = barY + barGap + denBox.ascent;
      drawBox(ctx, denBox, denX, denBaseline, color);
      return;
    }

    case 'sqrt': {
      const [bodyBox, idxBox] = box.children || [];
      if (!bodyBox) return;
      const radicalW = (box.extra?.radicalW as number) ?? s * 0.55;
      const topY = baselineY - box.ascent + s * 0.08;
      const botY = baselineY + bodyBox.descent;

      if (idxBox) {
        drawBox(ctx, idxBox, x, baselineY - bodyBox.ascent * 0.45, color);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, s * 0.065);
      ctx.beginPath();
      ctx.moveTo(x + radicalW * 0.1, baselineY - bodyBox.ascent * 0.35);
      ctx.lineTo(x + radicalW * 0.42, botY);
      ctx.lineTo(x + radicalW * 0.85, topY);
      ctx.lineTo(x + box.width - s * 0.04, topY);
      ctx.stroke();

      drawBox(ctx, bodyBox, x + radicalW, baselineY, color);
      return;
    }

    case 'supSub': {
      const children = box.children || [];
      const baseBox = children[0];
      if (!baseBox) return;
      let idx = 1;
      const supBox = box.extra?.hasSup ? children[idx++] : undefined;
      const subBox = box.extra?.hasSub ? children[idx] : undefined;

      drawBox(ctx, baseBox, x, baselineY, color);
      const sx = x + baseBox.width + s * 0.03;
      if (supBox) {
        drawBox(ctx, supBox, sx, baselineY - baseBox.ascent * 0.55 - supBox.descent * 0.2, color);
      }
      if (subBox) {
        drawBox(ctx, subBox, sx, baselineY + baseBox.descent * 0.4 + subBox.ascent * 0.45, color);
      }
      return;
    }

    case 'delimited': {
      const bodyBox = box.children?.[0];
      if (!bodyBox) return;
      const totalH = box.height;
      const scaleY = Math.max(1, totalH / Math.max(1, s * 1.1));
      const centerY = baselineY - box.ascent + totalH / 2;

      let cx = x;
      if (node.left) {
        ctx.save();
        ctx.translate(cx, centerY);
        ctx.scale(1, scaleY);
        ctx.font = `400 ${s}px ${MATH_FONT_STACK}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.left, 0, 0);
        ctx.restore();
        cx += s * 0.38;
      }

      drawBox(ctx, bodyBox, cx, baselineY, color);
      cx += bodyBox.width + s * 0.04;

      if (node.right) {
        ctx.save();
        ctx.translate(cx, centerY);
        ctx.scale(1, scaleY);
        ctx.font = `400 ${s}px ${MATH_FONT_STACK}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.right, 0, 0);
        ctx.restore();
      }
      return;
    }

    case 'accent': {
      const bodyBox = box.children?.[0];
      if (!bodyBox) return;
      drawBox(ctx, bodyBox, x, baselineY, color);
      const topY = baselineY - bodyBox.ascent - s * 0.1;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, s * 0.055);
      if (node.kind === 'vec') {
        ctx.beginPath();
        ctx.moveTo(x + s * 0.04, topY);
        ctx.lineTo(x + bodyBox.width - s * 0.04, topY);
        ctx.lineTo(x + bodyBox.width - s * 0.18, topY - s * 0.1);
        ctx.stroke();
      } else if (node.kind === 'bar' || node.kind === 'overline') {
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x + bodyBox.width, topY);
        ctx.stroke();
      } else if (node.kind === 'hat') {
        const midX = x + bodyBox.width / 2;
        ctx.beginPath();
        ctx.moveTo(x + s * 0.04, topY + s * 0.06);
        ctx.lineTo(midX, topY - s * 0.1);
        ctx.lineTo(x + bodyBox.width - s * 0.04, topY + s * 0.06);
        ctx.stroke();
      } else {
        const midX = x + bodyBox.width / 2;
        ctx.font = `700 ${s * 0.7}px ${MATH_FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(node.kind === 'ddot' ? '..' : '.', midX, topY + s * 0.05);
      }
      return;
    }

    case 'bigOp': {
      const opSize = (box.extra?.opSize as number) ?? s;
      const opW = (box.extra?.opW as number) ?? s;
      const opAscent = (box.extra?.opAscent as number) ?? s * 0.8;
      const opDescent = (box.extra?.opDescent as number) ?? s * 0.25;
      const children = box.children || [];
      let idx = 0;
      const supBox = box.extra?.hasSup ? children[idx++] : undefined;
      const subBox = box.extra?.hasSub ? children[idx] : undefined;

      ctx.font = `400 ${opSize}px ${MATH_FONT_STACK}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(node.symbol, x + (box.width - opW) / 2, baselineY);

      if (supBox) {
        drawBox(ctx, supBox, x + (box.width - supBox.width) / 2, baselineY - opAscent - supBox.descent - s * 0.04, color);
      }
      if (subBox) {
        drawBox(ctx, subBox, x + (box.width - subBox.width) / 2, baselineY + opDescent + subBox.ascent + s * 0.04, color);
      }
      return;
    }

    case 'matrix': {
      const rowBoxes = (box.extra?.rowBoxes as MathBox[][]) || [];
      const colWidths = (box.extra?.colWidths as number[]) || [];
      const rowHeights = (box.extra?.rowHeights as { a: number; d: number; h: number }[]) || [];
      const colGap = (box.extra?.colGap as number) ?? s * 0.45;
      const rowGap = (box.extra?.rowGap as number) ?? s * 0.25;
      const bracketW = (box.extra?.bracketW as number) ?? 0;

      const topY = baselineY - box.ascent;
      const botY = baselineY + box.descent;
      if (node.bracket !== 'plain') {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.2, s * 0.06);
        const lip = s * 0.18;
        ctx.beginPath();
        ctx.moveTo(x + lip, topY);
        ctx.lineTo(x + s * 0.05, topY);
        ctx.lineTo(x + s * 0.05, botY);
        ctx.lineTo(x + lip, botY);
        ctx.moveTo(x + box.width - lip, topY);
        ctx.lineTo(x + box.width - s * 0.05, topY);
        ctx.lineTo(x + box.width - s * 0.05, botY);
        ctx.lineTo(x + box.width - lip, botY);
        ctx.stroke();
      }

      let cy = topY;
      rowBoxes.forEach((row, ri) => {
        const rh = rowHeights[ri];
        const rowBaseline = cy + rh.a;
        let cx = x + bracketW / 2;
        row.forEach((cell, ci) => {
          const cw = colWidths[ci] ?? cell.width;
          drawBox(ctx, cell, cx + (cw - cell.width) / 2, rowBaseline, color);
          cx += cw + colGap;
        });
        cy += rh.h + rowGap;
      });
    }
  }
}

export function renderLatexFormula(
  ctx: MeasureContext,
  latex: string,
  x: number,
  baselineY: number,
  fontSize: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left'
): { width: number; ascent: number; descent: number; height: number } {
  const layout = layoutLatexFormula(ctx, latex, fontSize);
  const startX =
    align === 'center' ? x - layout.width / 2 : align === 'right' ? x - layout.width : x;
  ctx.save();
  drawBox(ctx, layout.box, startX, baselineY, color);
  ctx.restore();
  return { width: layout.width, ascent: layout.ascent, descent: layout.descent, height: layout.height };
}
