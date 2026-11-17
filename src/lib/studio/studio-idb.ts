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

function sanitizeDraftForStorage(draft: StudioDraft): StudioDraft {
  return {
    ...draft,
    slides: draft.slides.map((s) => ({
      ...s,
      layers: s.layers.map((l) => {
        if (l.type === 'image') {
          const img = l as StudioImageLayer;
          // Se tiver caminho no cofre e src for data:blob, preserva o caminho canônico
          if (img.vaultRelativePath && img.src.startsWith('blob:')) {
            return { ...img, src: img.vaultRelativePath };
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
      req.onsuccess = () => resolve((req.result as StudioDraft) || null);
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
      req.onsuccess = () => resolve(((req.result as StudioDraft[]) || []).sort((a, b) => a.slotIndex - b.slotIndex));
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
