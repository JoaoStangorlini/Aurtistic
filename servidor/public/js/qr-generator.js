// Este programa é um software livre (Licença AGPLv3)
/**
 * public/js/qr-generator.js
 * Gerador de QR Code vetorial em SVG puro (Sprint 3 / V11.0).
 * 100% standalone, zero dependências externas ou módulos pesados.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRCodeSVG = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Implementação minimalista de codificação QR Code (Modo Byte, Versão Dinâmica 1-10, Nível L/M)
  // Baseada nos padrões ISO/IEC 18004 para geração de matriz direta

  const PAD0 = 0xec;
  const PAD1 = 0x11;

  // Polinômios de erro Reed-Solomon e tabelas de capacidades
  const RS_POLY = [
    [], [], [], [], [], [], [],
    [1, 127, 122, 154, 164, 11, 68, 117], // 7
    [], [],
    [1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193], // 10
    [], [], [],
    [1, 228, 25, 196, 130, 211, 215, 100, 180, 230, 197, 101, 126, 153, 157], // 14
    [],
    [1, 59, 13, 251, 250, 109, 179, 14, 172, 72, 128, 34, 210, 199, 182, 42, 107], // 16
    [],
    [1, 215, 234, 158, 94, 184, 97, 118, 170, 79, 187, 152, 148, 252, 179, 5, 98, 96, 153] // 18
  ];

  const EXP_TABLE = new Uint8Array(256);
  const LOG_TABLE = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  EXP_TABLE[255] = EXP_TABLE[0];

  function gmult(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
  }

  // Tabela de capacidade Byte (Versão 1 a 6, Nível L e M)
  const CAPACITIES = [
    { version: 1, totalBytes: 26, dataBytes: 19, ecBytes: 7, size: 21 },
    { version: 2, totalBytes: 44, dataBytes: 34, ecBytes: 10, size: 25 },
    { version: 3, totalBytes: 70, dataBytes: 55, ecBytes: 15, size: 29 },
    { version: 4, totalBytes: 100, dataBytes: 80, ecBytes: 20, size: 33 },
    { version: 5, totalBytes: 134, dataBytes: 108, ecBytes: 26, size: 37 },
    { version: 6, totalBytes: 172, dataBytes: 136, ecBytes: 36, size: 41 },
  ];

  function getBestCapacity(dataLength) {
    for (const cap of CAPACITIES) {
      // 4 bits de modo (0100) + 8 bits de contagem de caractere = 12 bits = 1.5 byte de overhead
      if (cap.dataBytes >= dataLength + 2) {
        return cap;
      }
    }
    return CAPACITIES[CAPACITIES.length - 1];
  }

  function encodeData(text, capacity) {
    const bytes = [];
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(text);

    // Bit buffer
    let bitBuffer = 0;
    let bitLength = 0;

    function putBits(num, length) {
      for (let i = length - 1; i >= 0; i--) {
        const bit = (num >>> i) & 1;
        bitBuffer = (bitBuffer << 1) | bit;
        bitLength++;
        if (bitLength === 8) {
          bytes.push(bitBuffer);
          bitBuffer = 0;
          bitLength = 0;
        }
      }
    }

    // Modo Byte: 0100 (4 bits)
    putBits(0b0100, 4);
    // Comprimento (8 bits para versões 1-9)
    putBits(utf8Bytes.length, 8);

    // Dados UTF-8
    for (const b of utf8Bytes) {
      putBits(b, 8);
    }

    // Terminador (até 4 bits 0)
    const termBits = Math.min(4, (capacity.dataBytes * 8) - (bytes.length * 8 + bitLength));
    putBits(0, termBits);

    // Alinhamento para byte
    if (bitLength > 0) {
      putBits(0, 8 - bitLength);
    }

    // Preenchimento com PAD0 e PAD1
    let pad = false;
    while (bytes.length < capacity.dataBytes) {
      bytes.push(pad ? PAD1 : PAD0);
      pad = !pad;
    }

    return bytes;
  }

  function calculateErrorCorrection(data, totalBytes, ecCount) {
    const poly = [];
    poly[0] = 1;
    for (let i = 0; i < ecCount; i++) {
      poly[i + 1] = 1;
      for (let j = i; j > 0; j--) {
        poly[j] = poly[j] ? poly[j - 1] ^ gmult(poly[j], EXP_TABLE[i]) : poly[j - 1];
      }
      poly[0] = gmult(poly[0], EXP_TABLE[i]);
    }

    const res = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < ecCount - 1; j++) {
        res[j] = res[j + 1] ^ gmult(poly[poly.length - 2 - j], factor);
      }
      res[ecCount - 1] = gmult(poly[0], factor);
    }
    return Array.from(res);
  }

  function createMatrix(size) {
    const matrix = [];
    for (let r = 0; r < size; r++) {
      matrix.push(new Array(size).fill(null));
    }
    return matrix;
  }

  function applyFinderPattern(matrix, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= matrix.length || nc < 0 || nc >= matrix.length) continue;
        if (
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  }

  function applyTimingPatterns(matrix) {
    const size = matrix.length;
    for (let i = 8; i < size - 8; i++) {
      const val = i % 2 === 0;
      if (matrix[6][i] === null) matrix[6][i] = val;
      if (matrix[i][6] === null) matrix[i][6] = val;
    }
  }

  function applyAlignmentPattern(matrix, row, col) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const nr = row + r;
        const nc = col + c;
        if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  }

  function generateMatrix(text) {
    const capacity = getBestCapacity(text.length);
    const dataBytes = encodeData(text, capacity);
    const ecBytes = calculateErrorCorrection(dataBytes, capacity.totalBytes, capacity.ecBytes);
    const allBytes = dataBytes.concat(ecBytes);

    const size = capacity.size;
    const matrix = createMatrix(size);

    // 1. Finder Patterns
    applyFinderPattern(matrix, 0, 0);
    applyFinderPattern(matrix, 0, size - 7);
    applyFinderPattern(matrix, size - 7, 0);

    // 2. Alignment pattern para versão 2 ou maior
    if (capacity.version >= 2) {
      applyAlignmentPattern(matrix, size - 7, size - 7);
    }

    // 3. Timing patterns
    applyTimingPatterns(matrix);

    // 4. Dark module
    matrix[4 * capacity.version + 9][8] = true;

    // 5. Preencher dados
    let byteIdx = 0;
    let bitIdx = 7;
    let up = true;

    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // Pula timing vertical

      const rowStart = up ? size - 1 : 0;
      const rowEnd = up ? -1 : size;
      const step = up ? -1 : 1;

      for (let row = rowStart; row !== rowEnd; row += step) {
        for (let c = 0; c < 2; c++) {
          const cCol = col - c;
          if (matrix[row][cCol] === null) {
            let bit = false;
            if (byteIdx < allBytes.length) {
              bit = ((allBytes[byteIdx] >>> bitIdx) & 1) === 1;
              bitIdx--;
              if (bitIdx < 0) {
                bitIdx = 7;
                byteIdx++;
              }
            }
            // Máscara 0: (row + col) % 2 === 0
            const mask = (row + cCol) % 2 === 0;
            matrix[row][cCol] = mask ? !bit : bit;
          }
        }
      }
      up = !up;
    }

    return matrix;
  }

  /**
   * Gera um SVG vetorial de QR Code como string.
   * @param {string} text - Texto ou URL
   * @param {Object} [options]
   * @param {number} [options.size] - Tamanho em px (padrão 240)
   * @param {string} [options.fgColor] - Cor dos módulos (padrão #FFB703)
   * @param {string} [options.bgColor] - Cor de fundo (padrão #0B1320)
   * @param {number} [options.margin] - Margem externa em módulos (padrão 2)
   * @returns {string} SVG String
   */
  function generateSVG(text, options = {}) {
    const sizePx = options.size || 240;
    const fg = options.fgColor || '#FFB703';
    const bg = options.bgColor || '#0B1320';
    const margin = options.margin !== undefined ? options.margin : 2;

    const matrix = generateMatrix(String(text || ''));
    const moduleCount = matrix.length;
    const totalModules = moduleCount + margin * 2;
    const moduleSize = sizePx / totalModules;

    let paths = '';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r][c]) {
          const x = (c + margin) * moduleSize;
          const y = (r + margin) * moduleSize;
          paths += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(moduleSize + 0.3).toFixed(2)}" height="${(moduleSize + 0.3).toFixed(2)}" fill="${fg}" />`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" class="qr-code-svg rounded-xl">
      <rect width="100%" height="100%" fill="${bg}" rx="12" />
      ${paths}
    </svg>`;
  }

  return {
    generateSVG,
    generateMatrix,
  };
});

