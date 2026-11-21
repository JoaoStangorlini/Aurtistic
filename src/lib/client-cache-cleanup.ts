// Este programa é um software livre (Licença AGPLv3)
'use client';

/**
 * Limpeza centralizada de todos os caches do cliente no logout:
 * - Bancos IndexedDB (AurtisticOfflineDB, aurtistic_studio_v4, etc.)
 * - localStorage (tokens, temas escopados, sessões, exceto acessibilidade global)
 * - sessionStorage
 */
export async function clearAllUserClientCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Limpa IndexedDB
  const knownDbs = [
    'AurtisticOfflineDB',
    'aurtistic_studio_v4',
    'aurtistic_offline_store',
    'aurtistic-audio-cache',
    'aurtistic_studio_cache',
  ];

  for (const dbName of knownDbs) {
    try {
      window.indexedDB.deleteDatabase(dbName);
    } catch (e) {
      console.warn(`[CacheCleanup] Falha ao excluir banco IndexedDB ${dbName}:`, e);
    }
  }

  // 2. Limpa chaves de usuário do localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && !key.startsWith('global_acc_')) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('[CacheCleanup] Falha ao limpar localStorage:', e);
  }

  // 3. Limpa sessionStorage
  try {
    window.sessionStorage.clear();
  } catch {}

  // 4. Limpa Service Worker Cache Storage (Cache API)
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheKeys = await window.caches.keys();
      for (const k of cacheKeys) {
        await window.caches.delete(k);
      }
    }
  } catch (e) {
    console.warn('[CacheCleanup] Falha ao limpar Cache Storage:', e);
  }
}
