// Este programa é um software livre (Licença AGPLv3)
// Motor Unificado MD × LaTeX e Destaques Multi-Cor para HTML5 Canvas 2D

import type { OrgBrandTokens } from './org-brand-tokens';
import { layoutLatexFormula, renderLatexFormula } from './studio/latex-canvas-renderer';
import {
  parseMarkdownBlockLine,
  tokenizeMarkdownAndLatexLine,
  type BlockKind,
} from './studio/md-latex-tokenizer';

export { parseMarkdownBlockLine, tokenizeMarkdownAndLatexLine };

export interface StyledWordToken {
  kind: 'word' | 'latex' | 'code';
  text: string;
  fillColor: string;
  glowColor: string | null;
  glowBlur: number;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  font: string;
  fontSize: number;
  width: number;
  ascent: number;
  descent: number;
}

export interface TokenizedTextRenderOptions {
  text: string;
  mode: 'title' | 'body';
  tokens: OrgBrandTokens;
  boxCenterX: number;
  boxTopY: number;
  maxBoxWidth: number;
  boxHeight?: number;
  fontSize: number;
  lineHeightMultiplier?: number;
  align?: 'left' | 'center' | 'right';
  customColorOverride?: string | null;
  tricolorAuto?: boolean;
}

const TAG_COLOR_MAP: Record<string, string> = {
  r: '#ff1e1e',
  b: '#0066ff',
  g: '#00ff44',
  y: '#ffcc00',
  c: '#06b6d4',
  p: '#9d4edd',
  w: '#ffffff',
};

function blockScale(kind: BlockKind): number {
  if (kind === 'h1') return 1.55;
  if (kind === 'h2') return 1.32;
  if (kind === 'h3') return 1.16;
  return 1;
}

function buildStyledTokensForLine(
  ctx: CanvasRenderingContext2D,
  lineContent: string,
  blockKind: BlockKind,
  opts: TokenizedTextRenderOptions
): StyledWordToken[] {
  const { mode, tokens, fontSize, customColorOverride, tricolorAuto } = opts;
  const effFontSize = Math.round(fontSize * blockScale(blockKind));
  const isHeading = blockKind === 'h1' || blockKind === 'h2' || blockKind === 'h3';

  const spans = tokenizeMarkdownAndLatexLine(lineContent);
  const fontFamily = mode === 'title' || isHeading ? tokens.fontDisplay : tokens.fontBody;
  const baseColor = customColorOverride || (mode === 'title' ? '#ffffff' : tokens.textPrimary);
  const accentColor = tokens.accents[0] || tokens.secondaryColor;
  const tricolorPalette = tokens.accents.length >= 3 ? tokens.accents.slice(0, 3) : ['#ff1e1e', '#0066ff', '#00ff44'];

  const result: StyledWordToken[] = [];
  let wordCounter = 0;

  for (const span of spans) {
    if (span.kind === 'latex' || span.kind === 'latex_block') {
      const m = layoutLatexFormula(ctx, span.text, effFontSize);
      result.push({
        kind: 'latex',
        text: span.text,
        fillColor: baseColor,
        glowColor: null,
        glowBlur: 0,
        bold: false,
        italic: false,
        strike: false,
        font: `400 ${effFontSize}px serif`,
        fontSize: effFontSize,
        width: m.width,
        ascent: m.ascent,
        descent: m.descent,
      });
      continue;
    }

    if (span.kind === 'code') {
      const codeSize = Math.max(10, Math.round(effFontSize * 0.88));
      const font = `600 ${codeSize}px "JetBrains Mono", monospace`;
      ctx.font = font;
      const w = ctx.measureText(span.text).width + codeSize * 0.5;
      result.push({
        kind: 'code',
        text: span.text,
        fillColor: baseColor,
        glowColor: null,
        glowBlur: 0,
        bold: false,
        italic: false,
        strike: false,
        font,
        fontSize: codeSize,
        width: w,
        ascent: codeSize * 0.85,
        descent: codeSize * 0.25,
      });
      continue;
    }

    const rawText = mode === 'title' && tokens.uppercaseTitles ? span.text.toUpperCase() : span.text;
    const words = rawText.split(/\s+/).filter(Boolean);

    for (const word of words) {
      const bold = mode === 'title' || isHeading || Boolean(span.bold) || Boolean(span.colorCode);
      const italic = Boolean(span.italic);
      const strike = Boolean(span.strike);
      const font = `${italic ? 'italic ' : ''}${bold ? '800 ' : '500 '}${effFontSize}px ${fontFamily}`;

      let fillColor = baseColor;
      let glowColor: string | null = null;
      let glowBlur = 0;

      if (span.colorCode && TAG_COLOR_MAP[span.colorCode]) {
        fillColor = TAG_COLOR_MAP[span.colorCode];
        glowColor = fillColor;
        glowBlur = 18 * Math.max(0.5, tokens.glowIntensity);
      } else if (span.isAccent && !span.italic) {
        fillColor = accentColor;
        glowColor = accentColor;
        glowBlur = 14 * Math.max(0.4, tokens.glowIntensity);
      } else if (mode === 'title' && tricolorAuto && !customColorOverride) {
        const neon = tricolorPalette[wordCounter % tricolorPalette.length];
        fillColor = neon;
        glowColor = neon;
        glowBlur = 22 * Math.max(0.5, tokens.glowIntensity);
      } else if (mode === 'title' && tokens.glowIntensity > 0.3) {
        glowColor = customColorOverride || tokens.primaryColor;
        glowBlur = 18 * tokens.glowIntensity;
      }

      ctx.font = font;
      const tm = ctx.measureText(word);
      const ascent = tm.actualBoundingBoxAscent && tm.actualBoundingBoxAscent > 0 ? tm.actualBoundingBoxAscent : effFontSize * 0.78;
      const descent = tm.actualBoundingBoxDescent && tm.actualBoundingBoxDescent >= 0 ? tm.actualBoundingBoxDescent : effFontSize * 0.22;

      result.push({
        kind: 'word',
        text: word,
        fillColor,
        glowColor,
        glowBlur,
        bold,
        italic,
        strike,
        font,
        fontSize: effFontSize,
        width: tm.width,
        ascent,
        descent,
      });
      wordCounter++;
    }
  }

  return result;
}

export function renderTokenizedRichTextCanvas(
  ctx: CanvasRenderingContext2D,
  opts: TokenizedTextRenderOptions
): { totalHeight: number } {
  const {
    text,
    boxCenterX,
    boxTopY,
    maxBoxWidth,
    boxHeight,
    fontSize,
    lineHeightMultiplier = 1.24,
    align = 'center',
    customColorOverride,
    tokens,
  } = opts;

  if (!text.trim()) return { totalHeight: 0 };

  // Suporta blocos $$...$$ multi-linha antes de dividir em parágrafos
  const normalizedMultiLine = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq: string) => {
    const single = eq.replace(/\s*\n+\s*/g, ' ').trim();
    return `\n$$${single}$$\n`;
  });
  const paragraphs = normalizedMultiLine.split('\n');
  const boxLeftX = boxCenterX - maxBoxWidth / 2;
  const boxRightX = boxCenterX + maxBoxWidth / 2;

  type PreparedEntry =
    | { kind: 'math_block'; content: string; baselineOffset: number; advance: number }
    | { kind: 'empty'; advance: number }
    | {
        kind: 'line';
        blockKind: BlockKind;
        indentPx: number;
        items: StyledWordToken[];
        totalWidth: number;
        ascent: number;
        descent: number;
        ascentBoost: number;
        advance: number;
      };

  const prepared: PreparedEntry[] = [];
  let cursorRelY = fontSize;

  ctx.save();
  ctx.filter = 'none';
  ctx.textBaseline = 'alphabetic';

  // Fase 1: Layout completo para medir totalContentHeight exato antes de desenhar
  for (const para of paragraphs) {
    const block = parseMarkdownBlockLine(para);

    if (block.blockKind === 'math_block') {
      const m = layoutLatexFormula(ctx, block.content, fontSize * 1.15);
      const boost = Math.max(0, m.ascent - fontSize * 0.8);
      const advance = Math.max(fontSize * lineHeightMultiplier, m.ascent + m.descent + fontSize * 0.3);
      prepared.push({
        kind: 'math_block',
        content: block.content,
        baselineOffset: cursorRelY + boost,
        advance,
      });
      cursorRelY += boost + advance;
      continue;
    }

    const lineContent = block.prefixLabel ? `${block.prefixLabel} ${block.content}` : block.content;
    const styledTokens = buildStyledTokensForLine(ctx, lineContent, block.blockKind, opts);

    if (styledTokens.length === 0) {
      const emptyAdv = fontSize * lineHeightMultiplier * 0.6;
      prepared.push({ kind: 'empty', advance: emptyAdv });
      cursorRelY += emptyAdv;
      continue;
    }

    ctx.font = styledTokens[0].font;
    const spaceWidth = ctx.measureText(' ').width;
    const indentPx = block.blockKind === 'quote' ? fontSize * 0.7 : 0;
    const availWidth = Math.max(40, maxBoxWidth - indentPx);

    const lines: { items: StyledWordToken[]; totalWidth: number; ascent: number; descent: number }[] = [];
    let currentLine: StyledWordToken[] = [];
    let currentWidth = 0;
    let maxAscent = fontSize * 0.78;
    let maxDescent = fontSize * 0.22;

    for (const token of styledTokens) {
      const added = currentLine.length === 0 ? token.width : spaceWidth + token.width;
      if (currentLine.length > 0 && currentWidth + added > availWidth) {
        lines.push({ items: currentLine, totalWidth: currentWidth, ascent: maxAscent, descent: maxDescent });
        currentLine = [token];
        currentWidth = token.width;
        maxAscent = token.ascent;
        maxDescent = token.descent;
      } else {
        currentLine.push(token);
        currentWidth += added;
        maxAscent = Math.max(maxAscent, token.ascent);
        maxDescent = Math.max(maxDescent, token.descent);
      }
    }
    if (currentLine.length > 0) {
      lines.push({ items: currentLine, totalWidth: currentWidth, ascent: maxAscent, descent: maxDescent });
    }

    for (const line of lines) {
      const ascentBoost = line.ascent > fontSize * 0.9 ? line.ascent - fontSize * 0.9 : 0;
      const dynamicAdvance = Math.max(
        fontSize * lineHeightMultiplier,
        line.ascent + line.descent + fontSize * 0.22
      );
      prepared.push({
        kind: 'line',
        blockKind: block.blockKind,
        indentPx,
        items: line.items,
        totalWidth: line.totalWidth,
        ascent: line.ascent,
        descent: line.descent,
        ascentBoost,
        advance: dynamicAdvance,
      });
      cursorRelY += ascentBoost + dynamicAdvance;
    }
  }

  const totalContentHeight = Math.max(0, cursorRelY - fontSize * 0.2);
  const verticalOffset =
    boxHeight && boxHeight > totalContentHeight ? (boxHeight - totalContentHeight) / 2 : 0;

  // Fase 2: Renderização centralizada verticalmente dentro de [boxTopY, boxTopY + boxHeight]
  let drawBaselineY = boxTopY + fontSize + verticalOffset;
  const baseMathColor = customColorOverride || tokens.textPrimary || '#ffffff';

  for (const entry of prepared) {
    if (entry.kind === 'empty') {
      drawBaselineY += entry.advance;
      continue;
    }

    if (entry.kind === 'math_block') {
      const baselineY = boxTopY + verticalOffset + entry.baselineOffset;
      renderLatexFormula(ctx, entry.content, boxCenterX, baselineY, fontSize * 1.15, baseMathColor, 'center');
      drawBaselineY = baselineY + entry.advance;
      continue;
    }

    drawBaselineY += entry.ascentBoost;

    let cursorX = boxCenterX - entry.totalWidth / 2;
    if (align === 'left') cursorX = boxLeftX + entry.indentPx;
    if (align === 'right') cursorX = boxRightX - entry.totalWidth;

    if (entry.blockKind === 'quote') {
      ctx.save();
      ctx.fillStyle = tokens.primaryColor || '#FFCC00';
      ctx.fillRect(boxLeftX, drawBaselineY - entry.ascent, 4, entry.ascent + entry.descent);
      ctx.restore();
    }

    ctx.font = entry.items[0].font;
    const spaceWidth = ctx.measureText(' ').width;

    for (const token of entry.items) {
      ctx.save();
      ctx.filter = 'none';

      if (token.kind === 'latex') {
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 4;
        renderLatexFormula(ctx, token.text, cursorX, drawBaselineY, token.fontSize, token.fillColor, 'left');
      } else if (token.kind === 'code') {
        const padX = token.fontSize * 0.22;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(cursorX, drawBaselineY - token.ascent - 2, token.width, token.ascent + token.descent + 4);
        ctx.font = token.font;
        ctx.fillStyle = token.fillColor;
        ctx.fillText(token.text, cursorX + padX, drawBaselineY);
      } else {
        ctx.font = token.font;
        ctx.textBaseline = 'alphabetic';
        if (token.glowColor && token.glowBlur > 0) {
          ctx.shadowColor = token.glowColor;
          ctx.shadowBlur = token.glowBlur * 1.6;
          ctx.fillStyle = token.glowColor;
          ctx.fillText(token.text, cursorX, drawBaselineY);

          ctx.shadowBlur = token.glowBlur * 0.5;
          ctx.fillStyle = token.fillColor;
          ctx.fillText(token.text, cursorX, drawBaselineY);
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = token.fillColor;
          ctx.fillText(token.text, cursorX, drawBaselineY);
        }

        if (token.strike) {
          ctx.strokeStyle = token.fillColor;
          ctx.lineWidth = Math.max(1.5, token.fontSize * 0.06);
          ctx.beginPath();
          ctx.moveTo(cursorX, drawBaselineY - token.ascent * 0.36);
          ctx.lineTo(cursorX + token.width, drawBaselineY - token.ascent * 0.36);
          ctx.stroke();
        }
      }

      ctx.restore();
      cursorX += token.width + spaceWidth;
    }

    drawBaselineY += entry.advance;
  }

  ctx.restore();
  return { totalHeight: totalContentHeight };
}
