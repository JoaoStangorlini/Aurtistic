// Este programa é um software livre (Licença AGPLv3)
// Tokenizador Unificado Markdown × LaTeX em Passagem Única (100% puro, zero DOM/@/)

export type InlineTokenKind = 'text' | 'latex' | 'latex_block' | 'code';

export interface InlineToken {
  kind: InlineTokenKind;
  text: string;
  colorCode?: string | null;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  isAccent?: boolean;
}

export type BlockKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'quote' | 'math_block';

export interface BlockLine {
  blockKind: BlockKind;
  content: string;
  prefixLabel?: string;
}

export function parseMarkdownBlockLine(line: string): BlockLine {
  const trimmed = line.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return { blockKind: 'math_block', content: trimmed.slice(2, -2).trim() };
  }
  if (line.startsWith('### ')) {
    return { blockKind: 'h3', content: line.slice(4) };
  }
  if (line.startsWith('## ')) {
    return { blockKind: 'h2', content: line.slice(3) };
  }
  if (line.startsWith('# ')) {
    return { blockKind: 'h1', content: line.slice(2) };
  }
  if (/^[-•]\s+/.test(line)) {
    return { blockKind: 'bullet', content: line.replace(/^[-•]\s+/, ''), prefixLabel: '•' };
  }
  const ordMatch = /^(\d+\.)\s+(.*)$/.exec(line);
  if (ordMatch) {
    return { blockKind: 'ordered', content: ordMatch[2], prefixLabel: ordMatch[1] };
  }
  if (line.startsWith('> ')) {
    return { blockKind: 'quote', content: line.slice(2) };
  }
  return { blockKind: 'paragraph', content: line };
}

/**
 * Passagem única: extrai $$...$$, $...$ e `código` ANTES de aplicar regras de Markdown
 * (**negrito**, *itálico*, _itálico_, ~~tachado~~) e tags IDV [r:...], evitando que $x_i * y_j$ dispare itálico.
 */
export function tokenizeMarkdownAndLatexLine(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const regex =
    /(\\\$)|(\$\$([^$]+)\$\$)|(\$(?!\s)([^$\n]*?[^\s\\])\$)|(`([^`\n]+)`)|(\[(r|b|g|y|c|p|w):([^\]]+)\])|(\*\*([^*]+)\*\*)|(~~([^~]+)~~)|(\*([^*]+)\*)|(_([^_]+)_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', text: input.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      tokens.push({ kind: 'text', text: '$' });
    } else if (match[2]) {
      tokens.push({ kind: 'latex_block', text: match[3].trim() });
    } else if (match[4]) {
      tokens.push({ kind: 'latex', text: match[5].trim() });
    } else if (match[6]) {
      tokens.push({ kind: 'code', text: match[7] });
    } else if (match[8]) {
      tokens.push({ kind: 'text', text: match[10], colorCode: match[9], isAccent: true });
    } else if (match[11]) {
      tokens.push({ kind: 'text', text: match[12], bold: true });
    } else if (match[13]) {
      tokens.push({ kind: 'text', text: match[14], strike: true });
    } else if (match[15]) {
      tokens.push({ kind: 'text', text: match[16], italic: true, isAccent: true });
    } else if (match[17]) {
      tokens.push({ kind: 'text', text: match[18], italic: true });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    tokens.push({ kind: 'text', text: input.slice(lastIndex) });
  }

  return tokens;
}
