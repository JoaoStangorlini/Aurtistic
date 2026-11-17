// Este programa é um software livre (Licença AGPLv3)
// Motor de Texto Tokenizado Multi-Cor e Destaques Compostos para HTML5 Canvas 2D

import type { OrgBrandTokens } from './org-brand-tokens';

export interface StyledWordToken {
  text: string;
  fillColor: string;
  glowColor: string | null;
  glowBlur: number;
  bold: boolean;
  font: string;
  width: number;
}

export interface TokenizedTextRenderOptions {
  text: string;
  mode: 'title' | 'body';
  tokens: OrgBrandTokens;
  boxCenterX: number;
  boxTopY: number;
  maxBoxWidth: number;
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

interface RawSpan {
  text: string;
  color: string | null;
  isAccent: boolean;
}

/**
 * Passo 1: Processa marcadores `[r:...]` e `*destaques compostos*` ANTES de quebrar por espaços,
 * garantindo que termos compostos (ex: `*Marie Curie*`, `*dois Prêmios Nobel*`) herdem estilo
 * em todas as palavras ao quebrar de linha.
 */
function parseRawSpans(input: string): RawSpan[] {
  const spans: RawSpan[] = [];
  const regex = /(\[(r|b|g|y|c|p|w):([^\]]+)\])|(\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: input.slice(lastIndex, match.index), color: null, isAccent: false });
    }
    if (match[1]) {
      const code = match[2];
      spans.push({ text: match[3], color: TAG_COLOR_MAP[code] || null, isAccent: true });
    } else if (match[4]) {
      spans.push({ text: match[5], color: null, isAccent: true });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    spans.push({ text: input.slice(lastIndex), color: null, isAccent: false });
  }
  return spans;
}

function buildWordTokensForParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  opts: TokenizedTextRenderOptions
): StyledWordToken[] {
  const { mode, tokens, fontSize, customColorOverride, tricolorAuto } = opts;
  const displayParagraph = mode === 'title' && tokens.uppercaseTitles ? paragraph.toUpperCase() : paragraph;
  const spans = parseRawSpans(displayParagraph);

  const fontFamily = mode === 'title' ? tokens.fontDisplay : tokens.fontBody;
  const baseColor = customColorOverride || (mode === 'title' ? '#ffffff' : tokens.textPrimary);
  const accentColor = tokens.accents[0] || tokens.secondaryColor;
  const tricolorPalette = tokens.accents.length >= 3 ? tokens.accents.slice(0, 3) : ['#ff1e1e', '#0066ff', '#00ff44'];

  const wordTokens: StyledWordToken[] = [];
  let wordCounter = 0;

  for (const span of spans) {
    const words = span.text.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const bold = mode === 'title' || span.isAccent;
      const font = `${bold ? '800' : '500'} ${fontSize}px ${fontFamily}`;

      let fillColor = baseColor;
      let glowColor: string | null = null;
      let glowBlur = 0;

      if (span.color) {
        fillColor = span.color;
        glowColor = span.color;
        glowBlur = 18 * Math.max(0.5, tokens.glowIntensity);
      } else if (span.isAccent) {
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
      const width = ctx.measureText(word).width;
      wordTokens.push({ text: word, fillColor, glowColor, glowBlur, bold, font, width });
      wordCounter++;
    }
  }

  return wordTokens;
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
    fontSize,
    lineHeightMultiplier = 1.24,
    align = 'center',
  } = opts;

  if (!text.trim()) return { totalHeight: 0 };

  const paragraphs = text.split('\n');
  const lineHeight = fontSize * lineHeightMultiplier;
  let cursorY = boxTopY + fontSize;

  ctx.save();
  // Isolamento obrigatório: filtros da foto (exposição/contraste) nunca podem escurecer o neon da IDV
  ctx.filter = 'none';
  ctx.textBaseline = 'alphabetic';

  for (const para of paragraphs) {
    const tokens = buildWordTokensForParagraph(ctx, para, opts);
    if (tokens.length === 0) {
      cursorY += lineHeight * 0.6;
      continue;
    }

    ctx.font = tokens[0].font;
    const spaceWidth = ctx.measureText(' ').width;

    // Passo 2: Quebra automática de linha respeitando maxBoxWidth
    const lines: { items: StyledWordToken[]; totalWidth: number }[] = [];
    let currentLine: StyledWordToken[] = [];
    let currentWidth = 0;

    for (const token of tokens) {
      const added = currentLine.length === 0 ? token.width : spaceWidth + token.width;
      if (currentLine.length > 0 && currentWidth + added > maxBoxWidth) {
        lines.push({ items: currentLine, totalWidth: currentWidth });
        currentLine = [token];
        currentWidth = token.width;
      } else {
        currentLine.push(token);
        currentWidth += added;
      }
    }
    if (currentLine.length > 0) {
      lines.push({ items: currentLine, totalWidth: currentWidth });
    }

    // Passo 3: Desenho posicional token a token com 2 passes de Outer Glow
    const boxLeftX = boxCenterX - maxBoxWidth / 2;
    const boxRightX = boxCenterX + maxBoxWidth / 2;

    for (const line of lines) {
      let cursorX = boxCenterX - line.totalWidth / 2;
      if (align === 'left') cursorX = boxLeftX;
      if (align === 'right') cursorX = boxRightX - line.totalWidth;

      for (const token of line.items) {
        ctx.save();
        ctx.filter = 'none';
        ctx.font = token.font;
        ctx.textBaseline = 'alphabetic';

        if (token.glowColor && token.glowBlur > 0) {
          // 1º Passe: Halo Neon Externo Difuso
          ctx.shadowColor = token.glowColor;
          ctx.shadowBlur = token.glowBlur * 1.6;
          ctx.fillStyle = token.glowColor;
          ctx.fillText(token.text, cursorX, cursorY);

          // 2º Passe: Núcleo Nítido
          ctx.shadowBlur = token.glowBlur * 0.5;
          ctx.fillStyle = token.fillColor;
          ctx.fillText(token.text, cursorX, cursorY);
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = token.fillColor;
          ctx.fillText(token.text, cursorX, cursorY);
        }

        ctx.restore();
        cursorX += token.width + spaceWidth;
      }

      cursorY += lineHeight;
    }
  }

  ctx.restore();
  return { totalHeight: cursorY - boxTopY };
}

