// Este programa é um software livre (Licença AGPLv3)
// Motor Instantâneo 2D de Remoção de Fundo Sólido e Extração de Lousa/Caderno (< 50 ms)

const MAX_PROCESS_DIM = 1440;

function loadImageToBoundedCanvas(img: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
} {
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, MAX_PROCESS_DIM / Math.max(nw, nh));
  const width = Math.max(1, Math.round(nw * scale));
  const height = Math.max(1, Math.round(nh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem para processamento.'));
    img.src = src;
  });
}

/**
 * Remove fundo sólido via BFS iterativo com Int32Array a partir das bordas.
 */
export function removeSolidBackground2D(
  img: HTMLImageElement,
  options: { tolerance?: number; feather?: number; sampleMode?: 'edges' | 'corners' } = {}
): { ok: true; maskDataUrl: string } | { ok: false; error: string } {
  const tolerance = options.tolerance ?? 38;
  const feather = options.feather ?? 14;
  const sampleMode = options.sampleMode ?? 'edges';

  const { canvas, ctx, width, height } = loadImageToBoundedCanvas(img);

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, width, height);
  } catch {
    return {
      ok: false,
      error: 'Esta imagem externa bloqueou a leitura de pixels (CORS). Use uma foto do Cofre ou faça upload local.',
    };
  }

  const data = imgData.data;
  const total = width * height;

  // Amostra cor de referência das bordas ou 4 cantos
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sampleCount = 0;

  const samplePixel = (x: number, y: number) => {
    const off = (y * width + x) * 4;
    sumR += data[off];
    sumG += data[off + 1];
    sumB += data[off + 2];
    sampleCount++;
  };

  if (sampleMode === 'corners') {
    const pts = [
      [2, 2],
      [Math.max(0, width - 3), 2],
      [2, Math.max(0, height - 3)],
      [Math.max(0, width - 3), Math.max(0, height - 3)],
    ];
    for (const [x, y] of pts) samplePixel(x, y);
  } else {
    const stepX = Math.max(1, Math.floor(width / 24));
    const stepY = Math.max(1, Math.floor(height / 24));
    for (let x = 0; x < width; x += stepX) {
      samplePixel(x, 0);
      samplePixel(x, height - 1);
    }
    for (let y = 0; y < height; y += stepY) {
      samplePixel(0, y);
      samplePixel(width - 1, y);
    }
  }

  const bgR = sumR / Math.max(1, sampleCount);
  const bgG = sumG / Math.max(1, sampleCount);
  const bgB = sumB / Math.max(1, sampleCount);

  const visited = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const maxDist = tolerance + feather;

  const colorDist = (idx: number) => {
    const off = idx * 4;
    const dr = data[off] - bgR;
    const dg = data[off + 1] - bgG;
    const db = data[off + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const enqueueSeed = (x: number, y: number) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    if (colorDist(idx) <= maxDist) {
      isBg[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueueSeed(x, 0);
    enqueueSeed(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueSeed(0, y);
    enqueueSeed(width - 1, y);
  }

  // BFS iterativo 4-vizinhos (zero recursão)
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx / width) | 0;

    if (x > 0) {
      const n = idx - 1;
      if (!visited[n]) {
        visited[n] = 1;
        if (colorDist(n) <= maxDist) {
          isBg[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (x + 1 < width) {
      const n = idx + 1;
      if (!visited[n]) {
        visited[n] = 1;
        if (colorDist(n) <= maxDist) {
          isBg[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (y > 0) {
      const n = idx - width;
      if (!visited[n]) {
        visited[n] = 1;
        if (colorDist(n) <= maxDist) {
          isBg[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (y + 1 < height) {
      const n = idx + width;
      if (!visited[n]) {
        visited[n] = 1;
        if (colorDist(n) <= maxDist) {
          isBg[n] = 1;
          queue[tail++] = n;
        }
      }
    }
  }

  // Gera máscara PNG (branco opaco = sujeito, transparente = fundo)
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    let alpha = 255;
    if (isBg[i]) {
      const d = colorDist(i);
      if (d <= tolerance || feather <= 0) {
        alpha = 0;
      } else {
        const t = Math.min(1, Math.max(0, (d - tolerance) / feather));
        alpha = Math.round(t * 255);
      }
    }
    data[off] = 255;
    data[off + 1] = 255;
    data[off + 2] = 255;
    data[off + 3] = alpha;
  }

  ctx.putImageData(imgData, 0, 0);
  return { ok: true, maskDataUrl: canvas.toDataURL('image/png') };
}

/**
 * Extrai escrita de Lousa (giz claro em fundo escuro) ou Caderno (tinta escura em papel claro).
 */
export function extractBoardOrNotebookWriting2D(
  img: HTMLImageElement,
  options: { mode?: 'dark-board' | 'light-paper'; threshold?: number; contrast?: number } = {}
): { ok: true; maskDataUrl: string } | { ok: false; error: string } {
  const mode = options.mode ?? 'dark-board';
  const threshold = options.threshold ?? (mode === 'dark-board' ? 128 : 155);
  const contrast = options.contrast ?? 1.8;

  const { canvas, ctx, width, height } = loadImageToBoundedCanvas(img);

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, width, height);
  } catch {
    return {
      ok: false,
      error: 'Esta imagem externa bloqueou a leitura de pixels (CORS). Use uma foto do Cofre ou faça upload local.',
    };
  }

  const data = imgData.data;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const lum = 0.2126 * data[off] + 0.7152 * data[off + 1] + 0.0722 * data[off + 2];
    const diff = mode === 'dark-board' ? lum - threshold : threshold - lum;
    const normalized = Math.max(0, Math.min(1, 0.5 + (diff / 90) * contrast));
    const alpha = Math.round((normalized < 0.12 ? 0 : normalized) * 255);

    data[off] = 255;
    data[off + 1] = 255;
    data[off + 2] = 255;
    data[off + 3] = alpha;
  }

  ctx.putImageData(imgData, 0, 0);
  return { ok: true, maskDataUrl: canvas.toDataURL('image/png') };
}
