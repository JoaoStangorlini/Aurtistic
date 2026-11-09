// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/file-upload-helpers.ts (Client-Safe)

import { unzip } from 'fflate';

export interface UploadItem {
  file: File;
  relativePath: string; // Ex: "foto.jpg" ou "Ensaios/Noturno/foto1.jpg"
}

interface WebkitFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void;
  createReader?: () => WebkitFileSystemDirectoryReader;
}

interface WebkitFileSystemDirectoryReader {
  readEntries: (
    success: (entries: WebkitFileSystemEntry[]) => void,
    error?: (err: unknown) => void
  ) => void;
}

/**
 * Lê todas as entradas de um leitor de diretório em lotes (o navegador limita cada lote a ~100 itens).
 */
async function readAllDirectoryEntries(
  reader: WebkitFileSystemDirectoryReader
): Promise<WebkitFileSystemEntry[]> {
  const entries: WebkitFileSystemEntry[] = [];
  let readMore = true;

  while (readMore) {
    try {
      const batch = await new Promise<WebkitFileSystemEntry[]>((resolve) => {
        try {
          reader.readEntries(
            (results) => resolve(results || []),
            () => resolve([])
          );
        } catch {
          resolve([]);
        }
      });

      if (batch.length > 0) {
        entries.push(...batch);
      } else {
        readMore = false;
      }
    } catch {
      readMore = false;
    }
  }

  return entries;
}

/**
 * Varre recursivamente uma árvore de diretórios e arquivos usando a HTML5 FileSystem API.
 */
async function traverseEntryRecursive(
  entry: WebkitFileSystemEntry,
  pathPrefix = ''
): Promise<UploadItem[]> {
  if (entry.isFile && typeof entry.file === 'function') {
    return new Promise<UploadItem[]>((resolve) => {
      try {
        entry.file!(
          (f: File) => {
            const rel = pathPrefix ? `${pathPrefix}/${f.name}` : f.name;
            resolve([{ file: f, relativePath: rel }]);
          },
          () => resolve([])
        );
      } catch {
        resolve([]);
      }
    });
  }

  if (entry.isDirectory && typeof entry.createReader === 'function') {
    const currentPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    const reader = entry.createReader();
    const children = await readAllDirectoryEntries(reader);

    const results: UploadItem[] = [];
    for (const child of children) {
      const childItems = await traverseEntryRecursive(child, currentPrefix);
      results.push(...childItems);
    }
    return results;
  }

  return [];
}

/**
 * Extrai arquivos e pastas arrastadas via Drag & Drop, preservando caminhos relativos de subpastas.
 * Compatível com múltiplos arquivos, múltiplas pastas soltas simultaneamente e Chromium/Opera GX.
 */
export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<UploadItem[]> {
  // CRÍTICO (Chromium / Opera GX):
  // O navegador invalida dataTransfer.files e dataTransfer.items assim que o event loop avança
  // para uma microtarefa assíncrona (após qualquer await).
  // Por isso, DEVEMOS capturar dataTransfer.files e inspecionar items SINCRONAMENTE antes de qualquer await!
  const syncFiles = dataTransfer.files ? Array.from(dataTransfer.files) : [];
  const rawItems = dataTransfer.items ? Array.from(dataTransfer.items) : [];

  // Inspeciona se o navegador forneceu entradas de sistema de arquivos (webkitGetAsEntry)
  const entries: WebkitFileSystemEntry[] = [];
  for (const it of rawItems) {
    if (it.kind === 'file' && typeof it.webkitGetAsEntry === 'function') {
      try {
        const ent = it.webkitGetAsEntry() as WebkitFileSystemEntry | null;
        if (ent) entries.push(ent);
      } catch {
        // Ignora erros de sandbox/permissões
      }
    }
  }

  const hasDirectory = entries.some((e) => e.isDirectory);

  // Se houver diretórios (ou misto de pastas e arquivos soltos), varre recursivamente
  if (hasDirectory && entries.length > 0) {
    const collected: UploadItem[] = [];
    for (const ent of entries) {
      try {
        const subItems = await traverseEntryRecursive(ent, '');
        collected.push(...subItems);
      } catch {
        // Continua processando as demais entradas
      }
    }
    if (collected.length > 0) {
      return collected;
    }
  }

  // Se não havia pastas ou a varredura retornou vazia,
  // utiliza os arquivos capturados sincronicamente no instante exato do evento drop
  if (syncFiles.length > 0) {
    return extractFilesFromFileList(syncFiles);
  }

  // Fallback se syncFiles estiver vazio mas existirem entries individuais
  if (entries.length > 0) {
    const collected: UploadItem[] = [];
    for (const ent of entries) {
      try {
        const subItems = await traverseEntryRecursive(ent, '');
        collected.push(...subItems);
      } catch {
        // Ignora falhas pontuais
      }
    }
    return collected;
  }

  return [];
}

/**
 * Mapeia uma lista de arquivos de um <input type="file"> tradicional ou <input webkitdirectory>.
 */
export function extractFilesFromFileList(
  files: FileList | File[] | ArrayLike<File>
): UploadItem[] {
  const list = Array.from(files);
  return list.map((f) => {
    // webkitRelativePath é preenchido pelo navegador quando selecionado via webkitdirectory
    const cleanRel = (f.webkitRelativePath || f.name)
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    return {
      file: f,
      relativePath: cleanRel,
    };
  });
}

/**
 * Resolve a pasta de destino final e o nome do arquivo para gravação no servidor.
 * Exemplo:
 * - baseTargetFolder = "Portfolio", relativePath = "Ensaios/Praia/foto1.jpg"
 *   -> targetFolder: "Portfolio/Ensaios/Praia", filename: "foto1.jpg"
 */
export function resolveItemTargetFolder(
  baseTargetFolder: string,
  relativePath: string
): { targetFolder: string; filename: string } {
  const cleanBase = (baseTargetFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const cleanRel = (relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  const parts = cleanRel.split('/');
  const filename = parts.pop() || 'arquivo';
  const subPath = parts.join('/');

  let targetFolder = cleanBase;
  if (subPath) {
    targetFolder = cleanBase ? `${cleanBase}/${subPath}` : subPath;
  }

  return { targetFolder, filename };
}

/**
 * Mapeia extensão de arquivo para MIME type comum.
 */
function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'pdf':
      return 'application/pdf';
    case 'md':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'csv':
      return 'text/csv';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Descompacta um arquivo .zip localmente no navegador (client-side) usando fflate,
 * preservando a hierarquia de pastas e subpastas e ignorando metadados de OS (__MACOSX, .DS_Store, Thumbs.db).
 */
export async function extractFilesFromZip(zipFile: File): Promise<UploadItem[]> {
  const arrayBuffer = await zipFile.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  return new Promise<UploadItem[]>((resolve, reject) => {
    unzip(uint8Array, (err, unzipped) => {
      if (err) {
        return reject(new Error(`Falha ao descompactar arquivo .zip: ${err.message}`));
      }

      const items: UploadItem[] = [];

      for (const [rawPath, data] of Object.entries(unzipped)) {
        const cleanPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
        // Pula diretórios explícitos (terminados em /) ou arquivos vazios de 0 bytes que representam pastas
        if (cleanPath.endsWith('/') || data.length === 0) continue;

        // Ignora arquivos de metadados de sistema operacional
        if (
          cleanPath.includes('__MACOSX/') ||
          cleanPath.endsWith('.DS_Store') ||
          cleanPath.endsWith('Thumbs.db') ||
          cleanPath.endsWith('desktop.ini')
        ) {
          continue;
        }

        const filename = cleanPath.split('/').pop() || 'arquivo';
        const mimeType = getMimeTypeFromFilename(filename);
        const file = new File([data], filename, { type: mimeType });

        items.push({
          file,
          relativePath: cleanPath,
        });
      }

      resolve(items);
    });
  });
}


