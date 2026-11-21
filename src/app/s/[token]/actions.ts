// Este programa é um software livre (Licença AGPLv3)
'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyShareOrFolderPin } from '@/lib/pin-scrypt';
import {
  signEdgeTenantTicket,
  attachSignedPublicMediaUrls,
  getEdgeStorageServerUrl,
} from '@/lib/edge-ticket';
import { validateShareToken } from '@/lib/validators';
import { checkPinRateLimit, recordPinFailure, resetPinAttempts } from '@/lib/pin-rate-limit';
import type { UserFileIndexRow } from '@/types';

export interface VerifySharePinResult {
  ok: boolean;
  error?: string;
  ticket?: string;
  serverUrl?: string;
  files?: Array<
    UserFileIndexRow & {
      itemTicket?: string;
      signedThumbUrl?: string;
      signedStreamUrl?: string;
    }
  >;
}

export interface SubmitProofingResult {
  ok: boolean;
  error?: string;
  selectedCount?: number;
  createdTaskId?: string;
}

interface ResolvedShareLinkMeta {
  id: string;
  user_id: string;
  organization_id?: string | null;
  org_slug?: string | null;
  folder_path: string;
  album_title: string;
  mode: string;
  allow_download: boolean;
  expires_at?: string | null;
}

function computeShareTicketTtl(expiresAt?: string | null): number | { error: string } {
  const maxTtlMs = 4 * 60 * 60 * 1000;
  const remainingMs = expiresAt ? new Date(expiresAt).getTime() - Date.now() : maxTtlMs;
  if (remainingMs <= 0) {
    return { error: 'Link de prova expirado.' };
  }
  return Math.min(maxTtlMs, Math.max(60000, remainingMs));
}

function signShareTicketForLink(link: ResolvedShareLinkMeta, ttlMs: number, allowDownload: boolean) {
  const orgScope =
    link.organization_id && link.org_slug
      ? {
          scopeType: 'org' as const,
          organizationId: link.organization_id,
          orgSlug: link.org_slug,
          allowedOrgSlugs: [link.org_slug],
        }
      : {};

  return signEdgeTenantTicket({
    userId: link.user_id,
    ...orgScope,
    purpose: 'share',
    allowedPrefix: link.folder_path,
    allowDownload,
    readOnly: true,
    ttlMs,
  });
}

async function verifyLegacyScryptWithServiceRole(
  cleanToken: string,
  pin: string
): Promise<{ ok: true; adminClient: NonNullable<ReturnType<typeof createAdminClient>> } | { ok: false; error: string }> {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      error: 'Este link legado requer chave administrativa no servidor para validação segura do PIN.',
    };
  }

  const { data: legacyRows, error: legacyErr } = await adminClient.rpc(
    'get_share_link_by_token_internal',
    { p_token: cleanToken }
  );

  if (legacyErr || !legacyRows || legacyRows.length === 0) {
    return { ok: false, error: 'Link de prova inválido ou expirado.' };
  }

  const link = legacyRows[0];
  if (link.pin_hash) {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) {
      return { ok: false, error: 'Digite o PIN de acesso fornecido pelo criador.' };
    }
    if (!verifyShareOrFolderPin(cleanPin, link.pin_hash)) {
      const fail = recordPinFailure(cleanToken);
      if (fail.locked) {
        return {
          ok: false,
          error: '5 tentativas incorretas. Bloqueado temporariamente por 60 segundos.',
        };
      }
      return { ok: false, error: 'PIN incorreto. Verifique os dígitos e tente novamente.' };
    }
    resetPinAttempts(cleanToken);

    // Backfill silencioso para pin_pg_hash após validação legada com service_role
    await adminClient
      .rpc('set_share_link_pin_pg_hash', { p_share_id: link.id, p_pin: cleanPin })
      .then(() => undefined, () => undefined);
  }

  return { ok: true, adminClient };
}

async function resolveUnlockedShareLink(
  cleanToken: string,
  pin?: string
): Promise<
  | { ok: true; link: ResolvedShareLinkMeta; files: UserFileIndexRow[] }
  | { ok: false; error: string }
> {
  const rateCheck = checkPinRateLimit(cleanToken);
  if (!rateCheck.allowed) {
    return {
      ok: false,
      error: `Muitas tentativas incorretas. Aguarde ${rateCheck.waitSeconds}s antes de tentar novamente.`,
    };
  }

  const supabase = await createClient();
  const cleanPin = String(pin || '').trim();

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('unlock_and_list_share_link', {
    p_token: cleanToken,
    p_pin: cleanPin || null,
  });

  if (!rpcErr && rpcRes) {
    if (rpcRes.ok) {
      resetPinAttempts(cleanToken);
      return {
        ok: true,
        link: rpcRes.link as ResolvedShareLinkMeta,
        files: (Array.isArray(rpcRes.files) ? rpcRes.files : []) as UserFileIndexRow[],
      };
    }

    if (rpcRes.code === 'PIN_LEGACY_SERVICE_REQUIRED') {
      const legacyCheck = await verifyLegacyScryptWithServiceRole(cleanToken, cleanPin);
      if (!legacyCheck.ok) {
        return { ok: false, error: legacyCheck.error };
      }

      const { data: svcRes, error: svcErr } = await legacyCheck.adminClient.rpc(
        'unlock_and_list_share_link',
        { p_token: cleanToken, p_pin: cleanPin || null }
      );
      if (!svcErr && svcRes?.ok) {
        return {
          ok: true,
          link: svcRes.link as ResolvedShareLinkMeta,
          files: (Array.isArray(svcRes.files) ? svcRes.files : []) as UserFileIndexRow[],
        };
      }
      return { ok: false, error: svcRes?.error || 'Falha ao desbloquear link legado.' };
    }

    if (rpcRes.code === 'INVALID_PIN') {
      recordPinFailure(cleanToken);
    }
    return { ok: false, error: rpcRes.error || 'PIN incorreto ou link indisponível.' };
  }

  // Fallback controlado caso Migration 14 ainda não tenha sido aplicada no banco
  if (rpcErr?.code === '42883' || rpcErr?.message?.includes('unlock_and_list_share_link')) {
    const { data: linkRows, error: linkErr } = await supabase.rpc(
      'get_share_link_by_token_internal',
      { p_token: cleanToken }
    );
    if (linkErr || !linkRows || linkRows.length === 0) {
      return { ok: false, error: 'Link de prova inválido ou expirado.' };
    }
    const link = linkRows[0];
    if (link.pin_hash) {
      if (!cleanPin) {
        return { ok: false, error: 'Digite o PIN de acesso fornecido pelo criador.' };
      }
      if (!verifyShareOrFolderPin(cleanPin, link.pin_hash)) {
        const fail = recordPinFailure(cleanToken);
        return {
          ok: false,
          error: fail.locked
            ? '5 tentativas incorretas. Bloqueado temporariamente por 60 segundos.'
            : 'PIN incorreto. Verifique os dígitos e tente novamente.',
        };
      }
      resetPinAttempts(cleanToken);
    }
    let orgSlug: string | null = null;
    if (link.organization_id) {
      const reader = createAdminClient() || supabase;
      const { data: org } = await reader
        .from('organizations')
        .select('slug')
        .eq('id', link.organization_id)
        .maybeSingle();
      orgSlug = org?.slug || null;
    }
    const { data: filesData, error: filesErr } = await supabase.rpc(
      'get_share_link_files_by_token',
      { p_token: cleanToken }
    );
    if (filesErr) {
      return { ok: false, error: 'Não foi possível carregar os arquivos deste álbum.' };
    }
    return {
      ok: true,
      link: { ...link, org_slug: orgSlug },
      files: (Array.isArray(filesData) ? filesData : []) as UserFileIndexRow[],
    };
  }

  return { ok: false, error: rpcErr?.message || 'Erro ao validar link de compartilhamento.' };
}

/**
 * Valida o PIN informado pelo cliente e devolve arquivos e ticket de compartilhamento (purpose: 'share').
 */
export async function verifySharePinAction(
  token: string,
  pin: string
): Promise<VerifySharePinResult> {
  try {
    const tokenRes = validateShareToken(token);
    if (!tokenRes.ok) {
      return { ok: false, error: 'Token de compartilhamento inválido.' };
    }
    const cleanToken = tokenRes.data;

    const resolved = await resolveUnlockedShareLink(cleanToken, pin);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    const ttlOrErr = computeShareTicketTtl(resolved.link.expires_at);
    if (typeof ttlOrErr !== 'number') {
      return { ok: false, error: ttlOrErr.error };
    }

    const allowDownload = Boolean(resolved.link.allow_download);
    const shareTicket = signShareTicketForLink(resolved.link, ttlOrErr, allowDownload);
    const orgContext =
      resolved.link.organization_id && resolved.link.org_slug
        ? { organizationId: resolved.link.organization_id, orgSlug: resolved.link.org_slug }
        : null;

    const signedFiles = attachSignedPublicMediaUrls(resolved.files, {
      omitFullUrls: true,
      allowDownload,
      ttlMs: ttlOrErr,
      orgContext,
    });

    return {
      ok: true,
      ticket: shareTicket.ticket,
      serverUrl: getEdgeStorageServerUrl(),
      files: signedFiles,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno ao validar PIN.';
    return { ok: false, error: msg };
  }
}

/**
 * Renovação silenciosa da sessão anônima do visitante em /s/[token].
 */
export async function refreshShareTicketAction(
  token: string,
  pin?: string
): Promise<{ ok: boolean; ticket?: string; serverUrl?: string; error?: string }> {
  try {
    const tokenRes = validateShareToken(token);
    if (!tokenRes.ok) {
      return { ok: false, error: 'Token inválido.' };
    }

    const resolved = await resolveUnlockedShareLink(tokenRes.data, pin);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    const ttlOrErr = computeShareTicketTtl(resolved.link.expires_at);
    if (typeof ttlOrErr !== 'number') {
      return { ok: false, error: ttlOrErr.error };
    }

    const shareTicket = signShareTicketForLink(
      resolved.link,
      ttlOrErr,
      Boolean(resolved.link.allow_download)
    );

    return {
      ok: true,
      ticket: shareTicket.ticket,
      serverUrl: getEdgeStorageServerUrl(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao renovar ticket.';
    return { ok: false, error: msg };
  }
}

/**
 * Submete atomicamente as fotos selecionadas pelo cliente validando PIN no Postgres.
 */
export async function submitClientProofingAction(
  token: string,
  clientName: string,
  clientFeedback: string,
  selectedPaths: string[],
  pin?: string
): Promise<SubmitProofingResult> {
  try {
    const tokenRes = validateShareToken(token);
    if (!tokenRes.ok) {
      return { ok: false, error: 'Token de compartilhamento inválido.' };
    }
    const cleanToken = tokenRes.data;

    const rateCheck = checkPinRateLimit(cleanToken);
    if (!rateCheck.allowed) {
      return {
        ok: false,
        error: `Muitas tentativas incorretas. Aguarde ${rateCheck.waitSeconds}s antes de enviar.`,
      };
    }

    if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) {
      return { ok: false, error: 'Selecione pelo menos uma foto para aprovar.' };
    }

    const supabase = await createClient();
    const cleanPin = String(pin || '').trim();
    const cleanClientName = String(clientName || '').trim() || 'Cliente';
    const cleanFeedback = String(clientFeedback || '').trim();

    let { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'submit_client_proofing_selection_v2',
      {
        p_token: cleanToken,
        p_pin: cleanPin || null,
        p_client_name: cleanClientName,
        p_client_feedback: cleanFeedback,
        p_selected_paths: selectedPaths,
      }
    );

    if (!rpcErr && rpcResult?.code === 'PIN_LEGACY_SERVICE_REQUIRED') {
      const legacyCheck = await verifyLegacyScryptWithServiceRole(cleanToken, cleanPin);
      if (!legacyCheck.ok) {
        return { ok: false, error: legacyCheck.error };
      }
      const svc = await legacyCheck.adminClient.rpc('submit_client_proofing_selection_v2', {
        p_token: cleanToken,
        p_pin: cleanPin || null,
        p_client_name: cleanClientName,
        p_client_feedback: cleanFeedback,
        p_selected_paths: selectedPaths,
      });
      rpcResult = svc.data;
      rpcErr = svc.error;
    }

    // Fallback controlado caso Migration 14 ainda não tenha sido aplicada
    if (
      rpcErr?.code === '42883' ||
      rpcErr?.message?.includes('submit_client_proofing_selection_v2')
    ) {
      const { data: linkRows, error: linkErr } = await supabase.rpc(
        'get_share_link_by_token_internal',
        { p_token: cleanToken }
      );
      if (linkErr || !linkRows || linkRows.length === 0) {
        return { ok: false, error: 'Link de prova inválido ou expirado.' };
      }
      const link = linkRows[0];
      if (link.pin_hash) {
        const isValid = cleanPin ? verifyShareOrFolderPin(cleanPin, link.pin_hash) : false;
        if (!isValid) {
          recordPinFailure(cleanToken);
          return { ok: false, error: 'PIN inválido ou sessão expirada. Destranque novamente.' };
        }
        resetPinAttempts(cleanToken);
      }
      const legacySubmit = await supabase.rpc('submit_client_proofing_selection', {
        p_token: cleanToken,
        p_client_name: cleanClientName,
        p_client_feedback: cleanFeedback,
        p_selected_paths: selectedPaths,
      });
      rpcResult = legacySubmit.data;
      rpcErr = legacySubmit.error;
    }

    if (rpcErr) {
      return { ok: false, error: rpcErr.message || 'Falha ao processar seleção no servidor.' };
    }

    const parsed = rpcResult as {
      success?: boolean;
      code?: string;
      error?: string;
      selectedCount?: number;
      createdTaskId?: string;
    };

    if (!parsed || parsed.success === false) {
      if (parsed?.code === 'INVALID_PIN') recordPinFailure(cleanToken);
      return { ok: false, error: parsed?.error || 'Não foi possível salvar a seleção.' };
    }

    resetPinAttempts(cleanToken);
    return {
      ok: true,
      selectedCount: parsed.selectedCount || selectedPaths.length,
      createdTaskId: parsed.createdTaskId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno ao submeter seleção.';
    return { ok: false, error: msg };
  }
}

/**
 * Gera URL de download do pacote ZIP (todas as fotos ou seletivo apenas das aprovadas).
 */
export async function getShareLinkZipUrlAction(
  token: string,
  pin?: string,
  selectedPaths?: string[]
): Promise<{ ok: boolean; zipUrl?: string; error?: string }> {
  try {
    const tokenRes = validateShareToken(token);
    if (!tokenRes.ok) {
      return { ok: false, error: 'Token inválido.' };
    }

    const resolved = await resolveUnlockedShareLink(tokenRes.data, pin);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    if (resolved.link.allow_download === false) {
      return { ok: false, error: 'Download desabilitado para este link.' };
    }

    const shareTicket = signShareTicketForLink(resolved.link, 60 * 60 * 1000, true);
    const serverUrl = getEdgeStorageServerUrl();
    const filesParam =
      Array.isArray(selectedPaths) && selectedPaths.length > 0
        ? `&files=${encodeURIComponent(JSON.stringify(selectedPaths))}`
        : '';

    const zipUrl = `${serverUrl}/api/tenant/zip?folder=${encodeURIComponent(resolved.link.folder_path)}&ticket=${encodeURIComponent(shareTicket.ticket)}${filesParam}`;

    return { ok: true, zipUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar download.';
    return { ok: false, error: msg };
  }
}
