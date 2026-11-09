// Este programa é um software livre (Licença AGPLv3)
'use server';

import { createClient } from '@/utils/supabase/server';
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

/**
 * Valida o PIN informado pelo cliente (usando Scrypt KDF seguro) com proteção
 * anti-brute-force e devolve os arquivos da pasta e o ticket de compartilhamento (purpose: 'share').
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

    const rateCheck = checkPinRateLimit(cleanToken);
    if (!rateCheck.allowed) {
      return {
        ok: false,
        error: `Muitas tentativas incorretas. Aguarde ${rateCheck.waitSeconds}s antes de tentar novamente.`,
      };
    }

    const supabase = await createClient();
    const { data: linkRows, error: linkErr } = await supabase.rpc(
      'get_share_link_by_token_internal',
      { p_token: cleanToken }
    );

    if (linkErr || !linkRows || linkRows.length === 0) {
      return { ok: false, error: 'Link de prova inválido ou expirado.' };
    }

    const link = linkRows[0];

    // Verifica PIN se o link estiver protegido
    if (link.pin_hash) {
      const cleanPin = String(pin || '').trim();
      if (!cleanPin) {
        return { ok: false, error: 'Digite o PIN de acesso fornecido pelo criador.' };
      }

      const isValid = verifyShareOrFolderPin(cleanPin, link.pin_hash);
      if (!isValid) {
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
    }

    // Calcula TTL seguro limitado à expiração do link
    const maxTtlMs = 4 * 60 * 60 * 1000;
    const remainingMs = link.expires_at ? new Date(link.expires_at).getTime() - Date.now() : maxTtlMs;
    if (remainingMs <= 0) {
      return { ok: false, error: 'Link de prova expirado.' };
    }
    const ttlMs = Math.min(maxTtlMs, Math.max(60000, remainingMs));

    // Busca arquivos da pasta compartilhada
    const { data: filesData, error: filesErr } = await supabase.rpc(
      'get_share_link_files_by_token',
      { p_token: cleanToken }
    );

    if (filesErr) {
      return { ok: false, error: 'Não foi possível carregar os arquivos deste álbum.' };
    }

    // Emite ticket de compartilhamento (escopo restrito à pasta e readOnly)
    const shareTicket = signEdgeTenantTicket({
      userId: link.user_id,
      purpose: 'share',
      allowedPrefix: link.folder_path,
      allowDownload: Boolean(link.allow_download),
      readOnly: true,
      ttlMs,
    });

    const signedFiles = attachSignedPublicMediaUrls(
      (filesData as UserFileIndexRow[]) || [],
      {
        omitFullUrls: true,
        allowDownload: Boolean(link.allow_download),
      }
    );

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
 * Renovação silenciosa da sessão anônima do visitante em /s/[token],
 * validando o token e PIN e respeitando o teto de expires_at.
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
    const cleanToken = tokenRes.data;

    const rateCheck = checkPinRateLimit(cleanToken);
    if (!rateCheck.allowed) {
      return { ok: false, error: `Aguarde ${rateCheck.waitSeconds}s.` };
    }

    const supabase = await createClient();
    const { data: linkRows, error: linkErr } = await supabase.rpc(
      'get_share_link_by_token_internal',
      { p_token: cleanToken }
    );

    if (linkErr || !linkRows || linkRows.length === 0) {
      return { ok: false, error: 'Link inválido ou expirado.' };
    }

    const link = linkRows[0];

    if (link.pin_hash) {
      const cleanPin = String(pin || '').trim();
      const isValid = cleanPin ? verifyShareOrFolderPin(cleanPin, link.pin_hash) : false;
      if (!isValid) {
        recordPinFailure(cleanToken);
        return { ok: false, error: 'PIN incorreto.' };
      }
      resetPinAttempts(cleanToken);
    }

    const maxTtlMs = 4 * 60 * 60 * 1000;
    const remainingMs = link.expires_at ? new Date(link.expires_at).getTime() - Date.now() : maxTtlMs;
    if (remainingMs <= 0) {
      return { ok: false, error: 'Link de prova expirado.' };
    }
    const ttlMs = Math.min(maxTtlMs, Math.max(60000, remainingMs));

    const shareTicket = signEdgeTenantTicket({
      userId: link.user_id,
      purpose: 'share',
      allowedPrefix: link.folder_path,
      allowDownload: Boolean(link.allow_download),
      readOnly: true,
      ttlMs,
    });

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
 * Submete atomicamente as fotos selecionadas pelo cliente via RPC submit_client_proofing_selection.
 * O trigger cria/atualiza a Tarefa em public.tasks e vincula linked_task_ids.
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
    const { data: linkRows, error: linkErr } = await supabase.rpc(
      'get_share_link_by_token_internal',
      { p_token: cleanToken }
    );

    if (linkErr || !linkRows || linkRows.length === 0) {
      return { ok: false, error: 'Link de prova inválido ou expirado.' };
    }

    const link = linkRows[0];

    // Se houver PIN, valida novamente para proteger contra submissões forjadas
    if (link.pin_hash) {
      const cleanPin = String(pin || '').trim();
      const isValid = cleanPin ? verifyShareOrFolderPin(cleanPin, link.pin_hash) : false;
      if (!isValid) {
        recordPinFailure(cleanToken);
        return { ok: false, error: 'PIN inválido ou sessão expirada. Destranque novamente.' };
      }
      resetPinAttempts(cleanToken);
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'submit_client_proofing_selection',
      {
        p_token: cleanToken,
        p_client_name: String(clientName || '').trim() || 'Cliente',
        p_client_feedback: String(clientFeedback || '').trim(),
        p_selected_paths: selectedPaths,
      }
    );

    if (rpcErr) {
      return { ok: false, error: rpcErr.message || 'Falha ao processar seleção no servidor.' };
    }

    const parsed = rpcResult as {
      success?: boolean;
      error?: string;
      selectedCount?: number;
      createdTaskId?: string;
    };

    if (!parsed || parsed.success === false) {
      return { ok: false, error: parsed?.error || 'Não foi possível salvar a seleção.' };
    }

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
    const cleanToken = tokenRes.data;

    const rateCheck = checkPinRateLimit(cleanToken);
    if (!rateCheck.allowed) {
      return { ok: false, error: `Aguarde ${rateCheck.waitSeconds}s.` };
    }

    const supabase = await createClient();
    const { data: linkRows, error: linkErr } = await supabase.rpc(
      'get_share_link_by_token_internal',
      { p_token: cleanToken }
    );

    if (linkErr || !linkRows || linkRows.length === 0) {
      return { ok: false, error: 'Link inválido ou expirado.' };
    }

    const link = linkRows[0];
    if (link.allow_download === false) {
      return { ok: false, error: 'Download desabilitado para este link.' };
    }

    if (link.pin_hash) {
      const cleanPin = String(pin || '').trim();
      const isValid = cleanPin ? verifyShareOrFolderPin(cleanPin, link.pin_hash) : false;
      if (!isValid) {
        recordPinFailure(cleanToken);
        return { ok: false, error: 'PIN inválido.' };
      }
      resetPinAttempts(cleanToken);
    }

    const shareTicket = signEdgeTenantTicket({
      userId: link.user_id,
      purpose: 'share',
      allowedPrefix: link.folder_path,
      allowDownload: true,
      readOnly: true,
      ttlMs: 60 * 60 * 1000,
    });

    const serverUrl = getEdgeStorageServerUrl();
    const filesParam =
      Array.isArray(selectedPaths) && selectedPaths.length > 0
        ? `&files=${encodeURIComponent(JSON.stringify(selectedPaths))}`
        : '';

    const zipUrl = `${serverUrl}/api/tenant/zip?folder=${encodeURIComponent(link.folder_path)}&ticket=${encodeURIComponent(shareTicket.ticket)}${filesParam}`;

    return { ok: true, zipUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar download.';
    return { ok: false, error: msg };
  }
}
