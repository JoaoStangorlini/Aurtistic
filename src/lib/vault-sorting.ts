// Este programa é um software livre (Licença AGPLv3)

export type VaultSortField = 'name' | 'type' | 'date' | 'size';
export type VaultSortDirection = 'asc' | 'desc';

export interface VaultSortPreference {
  field: VaultSortField;
  direction: VaultSortDirection;
}

export const DEFAULT_VAULT_SORT: VaultSortPreference = {
  field: 'name',
  direction: 'asc',
};

const STORAGE_KEY = 'aurtistic_vault_sort_pref';

export function loadVaultSortPreference(): VaultSortPreference {
  if (typeof window === 'undefined') return DEFAULT_VAULT_SORT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<VaultSortPreference>;
    const validFields: VaultSortField[] = ['name', 'type', 'date', 'size'];
    const field = validFields.includes(parsed.field as VaultSortField)
      ? (parsed.field as VaultSortField)
      : 'name';
    const direction: VaultSortDirection = parsed.direction === 'desc' ? 'desc' : 'asc';
    return { field, direction };
  } catch {
    return DEFAULT_VAULT_SORT;
  }
}

export function saveVaultSortPreference(pref: VaultSortPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {}
}

const naturalCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export function compareNaturalNames(a: string, b: string): number {
  return naturalCollator.compare(a || '', b || '');
}

const RAW_EXTS = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'heic']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']);
const NOTE_EXTS = new Set(['md', 'txt']);

export function getFileTypeGroupRank(name: string, kind?: string, mimeType?: string): [number, string] {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (RAW_EXTS.has(ext)) return [1, ext];
  if (IMAGE_EXTS.has(ext) || kind === 'image' || mimeType?.startsWith('image/')) return [0, ext];
  if (VIDEO_EXTS.has(ext) || kind === 'video' || mimeType?.startsWith('video/')) return [2, ext];
  if (NOTE_EXTS.has(ext) || kind === 'note') return [4, ext];
  return [3, ext || kind || ''];
}

export function parseSortableDateMs(raw?: string | null): number {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Normaliza datas EXIF "YYYY:MM:DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
  const exifNormalized = s.replace(/^(\d{4}):(\d{2}):(\d{2})(?:\s+|T)?(.*)$/, '$1-$2-$3T$4').replace(/T$/, '');
  const ms = new Date(exifNormalized).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function sortVaultFolders<T extends { name: string; modifiedAt?: string | null; updatedAt?: string | null }>(
  folders: T[],
  pref: VaultSortPreference
): T[] {
  const factor = pref.direction === 'desc' ? -1 : 1;
  return [...folders].sort((a, b) => {
    if (pref.field === 'date') {
      const ta = parseSortableDateMs(a.modifiedAt || a.updatedAt);
      const tb = parseSortableDateMs(b.modifiedAt || b.updatedAt);
      if (ta !== tb) return (ta - tb) * factor;
    }
    // Para 'name', 'type' e 'size', ordena pastas por ordem alfabética natural
    return compareNaturalNames(a.name, b.name) * factor;
  });
}

export interface SortableVaultFile {
  name: string;
  kind?: string;
  mimeType?: string;
  sizeBytes?: number;
  size_bytes?: number;
  modifiedAt?: string | null;
  capturedAt?: string | null;
  captured_at?: string | null;
  exifDate?: string | null;
}

export function sortVaultFiles<T extends SortableVaultFile>(
  files: T[],
  pref: VaultSortPreference
): T[] {
  const factor = pref.direction === 'desc' ? -1 : 1;
  return [...files].sort((a, b) => {
    if (pref.field === 'type') {
      const [ra, extA] = getFileTypeGroupRank(a.name, a.kind, a.mimeType);
      const [rb, extB] = getFileTypeGroupRank(b.name, b.kind, b.mimeType);
      if (ra !== rb) return (ra - rb) * factor;
      const extCmp = compareNaturalNames(extA, extB);
      if (extCmp !== 0) return extCmp * factor;
      return compareNaturalNames(a.name, b.name) * factor;
    }
    if (pref.field === 'date') {
      const ta = parseSortableDateMs(a.exifDate || a.capturedAt || a.captured_at || a.modifiedAt);
      const tb = parseSortableDateMs(b.exifDate || b.capturedAt || b.captured_at || b.modifiedAt);
      if (ta !== tb) return (ta - tb) * factor;
      return compareNaturalNames(a.name, b.name);
    }
    if (pref.field === 'size') {
      const sa = Number(a.sizeBytes ?? a.size_bytes ?? 0);
      const sb = Number(b.sizeBytes ?? b.size_bytes ?? 0);
      if (sa !== sb) return (sa - sb) * factor;
      return compareNaturalNames(a.name, b.name);
    }
    return compareNaturalNames(a.name, b.name) * factor;
  });
}
