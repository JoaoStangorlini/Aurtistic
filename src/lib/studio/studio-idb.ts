// Este programa é um software livre (Licença AGPLv3)
import type { StudioDraft, StudioImageLayer } from '@/components/organizacoes/studio/types';

const DB_NAME = 'aurtistic_studio_v4';
const DB_VERSION = 1;
const STORE_NAME = 'draft_slots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slotIndex' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function rehydrateDraft(draft: StudioDraft): StudioDraft {
  return {
    ...draft,
    slides: draft.slides.map((s) => ({
      ...s,
      layers: s.layers.map((l) => {
        if (l.type === 'image') {
          const img = l as StudioImageLayer;
          const rel = img.vaultRef?.relativePath || img.vaultRelativePath;
          if (rel) {
            const isPublicAsset =
              rel.startsWith('http') ||
              rel.startsWith('/galeria') ||
              rel.startsWith('/show') ||
              rel.startsWith('/Logo');
            const resolved = img.resolvedUrl || (isPublicAsset ? rel : img.src);
            return { ...img, vaultRelativePath: img.vaultRelativePath || rel, resolvedUrl: resolved, src: resolved };
          }
        }
        return l;
      }),
    })),
  };
}

export function sanitizeDraftForStorage(draft: StudioDraft): StudioDraft {
  return {
    ...draft,
    slides: draft.slides.map((s) => ({
      ...s,
      layers: s.layers.map((l) => {
        if (l.type === 'image') {
          const img = l as StudioImageLayer;
          const rel = img.vaultRef?.relativePath || img.vaultRelativePath;
          // Apenas camadas com referência do cofre têm URLs temporárias (?ticket=/blob:) limpas;
          // uploads locais (sem vaultRef/vaultRelativePath) são preservados intactos.
          if (rel && (img.src.startsWith('blob:') || img.src.includes('ticket='))) {
            return { ...img, vaultRelativePath: rel, src: rel, resolvedUrl: undefined };
          }
        }
        return l;
      }),
    })),
  };
}

export async function saveDraftToIdb(draft: StudioDraft): Promise<void> {
  try {
    const db = await openDb();
    const sanitized = sanitizeDraftForStorage(draft);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(sanitized);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[StudioIDB] Falha ao salvar no IndexedDB:', err);
  }
}

export async function getDraftFromIdb(slotIndex: 1 | 2 | 3): Promise<StudioDraft | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(slotIndex);
      req.onsuccess = () => {
        const d = req.result as StudioDraft | undefined;
        resolve(d ? rehydrateDraft(d) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function getAllDraftsFromIdb(): Promise<StudioDraft[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const arr = (req.result as StudioDraft[]) || [];
        resolve(arr.map(rehydrateDraft).sort((a, b) => a.slotIndex - b.slotIndex));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteDraftFromIdb(slotIndex: 1 | 2 | 3): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(slotIndex);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

