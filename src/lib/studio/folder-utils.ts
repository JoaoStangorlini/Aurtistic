// Este programa é um software livre (Licença AGPLv3)
import type { StudioLayer, StudioLayerFolder } from '@/components/organizacoes/studio/types';

export function isLayerEffectivelyVisible(
  layer: StudioLayer,
  folders: StudioLayerFolder[] = []
): boolean {
  if (!layer.visible) return false;
  if (!layer.folderId) return true;
  const folder = folders.find((f) => f.id === layer.folderId);
  return folder ? folder.visible : true;
}

export function isLayerEffectivelyLocked(
  layer: StudioLayer,
  folders: StudioLayerFolder[] = []
): boolean {
  if (layer.locked) return true;
  if (!layer.folderId) return false;
  const folder = folders.find((f) => f.id === layer.folderId);
  return folder ? folder.locked : false;
}

/**
 * Garante que todas as camadas pertencentes a uma mesma pasta/grupo formem um bloco
 * contíguo em `layers[]` (fidelidade 1:1 entre árvore visual e Z-order real).
 */
export function enforceContiguousFolders(
  layers: StudioLayer[],
  folders: StudioLayerFolder[] = []
): StudioLayer[] {
  const validFolderIds = new Set(folders.map((f) => f.id));
  const cleaned = layers.map((l) =>
    l.folderId && !validFolderIds.has(l.folderId) ? { ...l, folderId: null } : l
  );

  // Agrupa membros por pasta mantendo ordem relativa interna
  const folderMembers = new Map<string, StudioLayer[]>();
  const lastIndexByFolder = new Map<string, number>();

  cleaned.forEach((l, idx) => {
    if (l.folderId) {
      const list = folderMembers.get(l.folderId) || [];
      list.push(l);
      folderMembers.set(l.folderId, list);
      lastIndexByFolder.set(l.folderId, idx);
    }
  });

  if (folderMembers.size === 0) return cleaned;

  const emittedFolders = new Set<string>();
  const result: StudioLayer[] = [];

  // Emite cada bloco de pasta na posição do seu membro de maior Z-index (último índice)
  cleaned.forEach((l, idx) => {
    if (!l.folderId) {
      result.push(l);
      return;
    }
    if (!emittedFolders.has(l.folderId) && lastIndexByFolder.get(l.folderId) === idx) {
      emittedFolders.add(l.folderId);
      const members = folderMembers.get(l.folderId) || [];
      result.push(...members);
    }
  });

  return result;
}

/**
 * Move o bloco contíguo inteiro de uma pasta uma posição acima (Z+) ou abaixo (Z-).
 */
export function reorderContiguousFolderBlock(
  layers: StudioLayer[],
  folders: StudioLayerFolder[],
  folderId: string,
  direction: 'up' | 'down'
): StudioLayer[] {
  const normalized = enforceContiguousFolders(layers, folders);
  const firstIdx = normalized.findIndex((l) => l.folderId === folderId);
  if (firstIdx < 0) return normalized;

  let lastIdx = firstIdx;
  while (lastIdx + 1 < normalized.length && normalized[lastIdx + 1].folderId === folderId) {
    lastIdx++;
  }

  const block = normalized.slice(firstIdx, lastIdx + 1);
  const rest = [...normalized.slice(0, firstIdx), ...normalized.slice(lastIdx + 1)];

  if (direction === 'up') {
    if (lastIdx >= normalized.length - 1) return normalized;
    const above = normalized[lastIdx + 1];
    if (!above.folderId) {
      // Insere imediatamente após o item solto acima
      const insertAt = firstIdx + 1;
      return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
    }
    // Pula o bloco inteiro da pasta acima
    let aboveEnd = lastIdx + 1;
    while (aboveEnd + 1 < normalized.length && normalized[aboveEnd + 1].folderId === above.folderId) {
      aboveEnd++;
    }
    const skipCount = aboveEnd - lastIdx;
    const insertAt = firstIdx + skipCount;
    return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  } else {
    if (firstIdx <= 0) return normalized;
    const below = normalized[firstIdx - 1];
    if (!below.folderId) {
      const insertAt = firstIdx - 1;
      return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
    }
    let belowStart = firstIdx - 1;
    while (belowStart - 1 >= 0 && normalized[belowStart - 1].folderId === below.folderId) {
      belowStart--;
    }
    return [...rest.slice(0, belowStart), ...block, ...rest.slice(belowStart)];
  }
}

/**
 * Move uma camada individual 1 passo acima (Z+) ou abaixo (Z-) respeitando blocos de pastas:
 * - Camada dentro de pasta move-se apenas dentro dos limites daquela pasta.
 * - Camada solta pula o bloco contíguo inteiro de uma pasta adjacente.
 */
export function reorderSingleLayerStep(
  layers: StudioLayer[],
  folders: StudioLayerFolder[],
  layerId: string,
  direction: 'up' | 'down'
): StudioLayer[] {
  const normalized = enforceContiguousFolders(layers, folders);
  const idx = normalized.findIndex((l) => l.id === layerId);
  if (idx < 0) return normalized;
  const current = normalized[idx];

  if (current.folderId) {
    const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= normalized.length) return normalized;
    if (normalized[targetIdx].folderId !== current.folderId) return normalized;
    const copy = [...normalized];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    return copy;
  }

  // Camada solta: pula bloco inteiro de pasta se adjacente
  const nextIdx = direction === 'up' ? idx + 1 : idx - 1;
  if (nextIdx < 0 || nextIdx >= normalized.length) return normalized;
  const neighbor = normalized[nextIdx];
  const copy = [...normalized];
  const [moved] = copy.splice(idx, 1);

  if (!neighbor.folderId) {
    copy.splice(nextIdx, 0, moved);
    return copy;
  }

  if (direction === 'up') {
    let blockEnd = nextIdx;
    while (blockEnd + 1 < normalized.length && normalized[blockEnd + 1].folderId === neighbor.folderId) {
      blockEnd++;
    }
    copy.splice(blockEnd, 0, moved);
    return copy;
  } else {
    let blockStart = nextIdx;
    while (blockStart - 1 >= 0 && normalized[blockStart - 1].folderId === neighbor.folderId) {
      blockStart--;
    }
    copy.splice(blockStart, 0, moved);
    return copy;
  }
}
