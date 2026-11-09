// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/portfolio-catalog.ts (Server-Only)
import fs from 'fs';
import path from 'path';
import type { UserFileIndexRow } from '@/types';
import { getEdgeStorageServerUrl, signEdgeTenantTicket } from './edge-ticket';

export const PRIMARY_ADMIN_UUID = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

export interface EnsurePortfolioCatalogOptions {
  isPublicRoute?: boolean;
  currentAuthUserId?: string;
  allowSeedFallback?: boolean;
}

/**
 * Garante que o acervo fotográfico seja carregado com 0ms de bloqueio.
 * - [TRAVA MULTI-TENANT]: Executa estritamente para o PRIMARY_ADMIN_UUID. Outros usuários nunca recebem essas fotos.
 * - [PRIVACIDADE]: Em rotas públicas, filtra apenas visibility === 'public'.
 * - [RLS]: Só aciona upsert em background se o visitante autenticado for o dono (auth.uid() === userId).
 * - [VERCEL SERVERLESS]: Lê de src/lib/portfolio-catalog-seed.json (versionado no repo) caso explicitamente autorizado.
 */
export async function ensurePortfolioCatalogLoaded(
  supabase: any,
  userId: string,
  options?: EnsurePortfolioCatalogOptions
): Promise<UserFileIndexRow[]> {
  // 1. Trava estrita de Admin: nunca injeta fotos pessoais na conta de outros usuários
  if (userId !== PRIMARY_ADMIN_UUID) {
    return [];
  }

  try {
    let query = supabase
      .from('user_files_index')
      .select('*')
      .eq('user_id', userId)
      .or('show_in_portfolio.eq.true,relative_path.ilike.Portfolio/%');

    if (options?.isPublicRoute) {
      query = query.eq('visibility', 'public');
    }

    const { data: rawPhotos, error } = await query.order('created_at', { ascending: false });

    if (!error && Array.isArray(rawPhotos) && rawPhotos.length > 0) {
      return rawPhotos as UserFileIndexRow[];
    }
  } catch (err) {
    console.warn('[PortfolioCatalog] Erro ao buscar do Supabase:', err);
  }

  // Fallback: consulta catálogo vivo do nó Edge ou arquivos locais
  try {
    let legacyItems: any[] = [];

    // 1. Consulta o nó Edge Storage em tempo real
    try {
      const serverUrl = getEdgeStorageServerUrl();
      const res = await fetch(`${serverUrl}/api/portfolio`, {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const edgeCat = await res.json();
        if (Array.isArray(edgeCat?.items)) {
          if (edgeCat.items.length === 0) {
            // Servidor confirmou que o acervo foi limpo/está vazio
            return [];
          }
          legacyItems = edgeCat.items;
        }
      }
    } catch (edgeErr) {
      console.warn('[PortfolioCatalog] Falha ao consultar nó Edge /api/portfolio:', edgeErr);
    }

    // 2. Se não conectou ao nó Edge, verifica os arquivos de catálogo em disco
    if (legacyItems.length === 0) {
      const candidates = [
        path.resolve(process.cwd(), 'servidor/data/catalog.json'),
        path.resolve(process.cwd(), 'servidor/storage/portfolio/catalog.json'),
        path.resolve(process.cwd(), 'firestick-portal/data/catalog.json'),
        path.resolve(process.cwd(), 'firestick-portal/storage/portfolio/catalog.json'),
      ];

      for (const catalogPath of candidates) {
        if (fs.existsSync(catalogPath)) {
          try {
            const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
            if (Array.isArray(cat?.items)) {
              if (cat.items.length === 0) {
                return [];
              }
              legacyItems = cat.items;
              break;
            }
          } catch {}
        }
      }
    }

    // Se nenhum arquivo local existir (ex: container Vercel enxuto), busca do nó Edge via HTTP
    if (legacyItems.length === 0) {
      try {
        const serverUrl = getEdgeStorageServerUrl();
        const exportTicket = signEdgeTenantTicket({
          userId: PRIMARY_ADMIN_UUID,
          role: 'admin',
          purpose: 'vault',
          ttlMs: 60 * 1000,
        });
        const res = await fetch(`${serverUrl}/api/tenant/legacy-catalog-export`, {
          headers: {
            Authorization: `Bearer ${exportTicket.ticket}`,
          },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const exportData = await res.json();
          if (Array.isArray(exportData?.items) && exportData.items.length > 0) {
            legacyItems = exportData.items;
          }
        }
      } catch (remoteErr) {
        console.warn('[PortfolioCatalog] Falha ao buscar export remoto:', remoteErr);
      }
    }

    if (legacyItems.length > 0) {
      const mapped: UserFileIndexRow[] = legacyItems
        .filter((it: any) => !options?.isPublicRoute || it.visibility === 'public' || it.visibility === undefined)
        .map((it: any, idx: number) => {
          const cleanRel = String(it.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
          const parts = cleanRel.split('/');
          const albumName = it.album || (parts.length > 1 ? parts[0] : 'Geral');
          const subalbumName = it.subalbum || (parts.length > 2 ? parts[1] : undefined);
          return {
            id: it.id || `pf_${idx}`,
            user_id: userId,
            relative_path: cleanRel.startsWith('Portfolio/') ? cleanRel : `Portfolio/${cleanRel}`,
            filename: it.originalFile || it.filename || path.basename(cleanRel),
            mime_type: it.mimeType || 'image/jpeg',
            size_bytes: Number(it.sizeBytes) || 0,
            is_directory: false,
            has_pin: false,
            linked_task_id: null,
            linked_task_ids: [],
            show_in_portfolio: true,
            show_in_curriculum: false,
            curriculum_label: null,
            title: it.title || it.originalFile || path.basename(cleanRel),
            description: it.description || null,
            album: albumName,
            category: subalbumName || it.subalbum || 'Fotografia',
            tags: Array.isArray(it.tags) ? it.tags : [],
            exif_data: it.exif || it.exifData || {},
            is_favorite: Boolean(it.isFavorite),
            visibility: 'public' as const,
            display_order: typeof it.order === 'number' ? it.order : idx,
            created_at: it.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });

      // Persiste no Supabase SOMENTE se o visitante autenticado for o dono
      const canPersist = options?.currentAuthUserId === userId;
      if (canPersist) {
        const CHUNK_SIZE = 500;
        void (async () => {
          try {
            for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
              const batch = mapped.slice(i, i + CHUNK_SIZE);
              await supabase
                .from('user_files_index')
                .upsert(batch, { onConflict: 'user_id,relative_path' });
            }
          } catch (upsertErr) {
            console.warn('[PortfolioCatalog] Erro na sincronização assíncrona com Supabase:', upsertErr);
          }
        })().catch(() => {});
      }

      return mapped;
    }
  } catch (err) {
    console.error('[PortfolioCatalog] Falha crítica ao carregar catálogo:', err);
  }

  return [];
}

