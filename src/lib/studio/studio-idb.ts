// Este programa é um software livre (Licença AGPLv3)
import type { StudioDraft, StudioImageLayer } from '@/components/organizacoes/studio/types';

const DB_NAME = 'aurtistic_studio_v4';
const DB_VERSION = 2;
const STORE_NAME = 'draft_slots';

export function buildStorageKey(scopeKey: string | undefined, slotIndex: number): string {
  const cleanScope = (scopeKey || 'personal').trim();
  return `${cleanScope}:${slotIndex}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 2) {
        if (db.objectStoreNames.contains(STORE_NAME)) {
          // Migração v1 -> v2: chave composta storageKey `${scopeKey}:${slotIndex}`
          db.deleteObjectStore(STORE_NAME);
        }
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'storageKey' });
        store.createIndex('by_scope', 'scopeKey', { unique: false });
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

export async function saveDraftToIdb(draft: StudioDraft, scopeKey?: string): Promise<void> {
  try {
    const db = await openDb();
    const effectiveScope = (scopeKey || draft.scopeKey || 'personal').trim();
    const storageKey = draft.storageKey || buildStorageKey(effectiveScope, draft.slotIndex);
    const sanitized = {
      ...sanitizeDraftForStorage(draft),
      storageKey,
      scopeKey: effectiveScope,
    };
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

export async function getDraftFromIdb(slotIndex: 1 | 2 | 3, scopeKey?: string): Promise<StudioDraft | null> {
  try {
    const db = await openDb();
    const key = buildStorageKey(scopeKey, slotIndex);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
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

export async function getAllDraftsFromIdb(scopeKey?: string): Promise<StudioDraft[]> {
  try {
    const db = await openDb();
    const cleanScope = scopeKey?.trim();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      if (cleanScope && store.indexNames.contains('by_scope')) {
        const idx = store.index('by_scope');
        const req = idx.getAll(cleanScope);
        req.onsuccess = () => {
          const arr = (req.result as StudioDraft[]) || [];
          resolve(arr.map(rehydrateDraft).sort((a, b) => a.slotIndex - b.slotIndex));
        };
        req.onerror = () => reject(req.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          let arr = (req.result as StudioDraft[]) || [];
          if (cleanScope) {
            arr = arr.filter((d) => (d.scopeKey || 'personal') === cleanScope);
          }
          resolve(arr.map(rehydrateDraft).sort((a, b) => a.slotIndex - b.slotIndex));
        };
        req.onerror = () => reject(req.error);
      }
    });
  } catch {
    return [];
  }
}

export async function deleteDraftFromIdb(slotIndex: 1 | 2 | 3, scopeKey?: string): Promise<void> {
  try {
    const db = await openDb();
    const key = buildStorageKey(scopeKey, slotIndex);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

