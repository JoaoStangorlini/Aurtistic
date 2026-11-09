// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/auth/HubLinkCard.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { unlinkHubAccountAction } from '@/app/auth/actions';
import type { HubConnectionData } from '@/lib/hub-sso';

export interface HubLinkCardProps {
  hubConnection?: HubConnectionData | null;
  userEmail?: string;
}

export function HubLinkCard({ hubConnection, userEmail }: HubLinkCardProps) {
  const router = useRouter();
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isLinked = Boolean(hubConnection?.hub_user_id);

  const handleConnectHub = () => {
    try {
      setIsRedirecting(true);
      setErrorMsg(null);
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const hubBaseUrl = process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:3001';
      const redirectUri = `${origin}/auth/hub-callback`;
      const next = '/configuracoes-avancadas';

      const ssoUrl = `${hubBaseUrl}/auth/sso/authorize?redirect_uri=${encodeURIComponent(
        redirectUri
      )}&next=${encodeURIComponent(next)}&action=link`;

      window.location.href = ssoUrl;
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao redirecionar para o HUB.');
      setIsRedirecting(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Deseja realmente desvincular o perfil do HUB LabDiv desta conta Aurtistic?')) {
      return;
    }

    try {
      setIsUnlinking(true);
      setErrorMsg(null);
      const res = await unlinkHubAccountAction();
      if (!res.success) {
        throw new Error(res.error || 'Falha ao desvincular.');
      }
      setSuccessMsg('Perfil do HUB desvinculado com sucesso.');
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao desvincular conta.');
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl p-6 shadow-xl space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-black/40 border border-white/10 shrink-0">
            <img src="/icone-HUBLabDiv.svg" alt="HUB LabDiv" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Vínculo com HUB LabDiv</span>
              {isLinked ? (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Vinculado
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">
                  Não Vinculado
                </span>
              )}
            </h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Integração cross-app de identidade institucional, permissões de pesquisa e login seguro por SSO.
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-red-400">error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Conteúdo: Conectado vs Desconectado */}
      {isLinked && hubConnection ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-black/60 border border-[#FFCC00]/40 shrink-0 flex items-center justify-center">
                {hubConnection.hub_avatar_url ? (
                  <img
                    src={hubConnection.hub_avatar_url}
                    alt={hubConnection.hub_full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-bold text-white">
                    {(hubConnection.hub_full_name || hubConnection.hub_username || 'P').charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">{hubConnection.hub_full_name || hubConnection.hub_username}</p>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#0F4780]/80 text-blue-200 border border-blue-400/30">
                    {hubConnection.is_labdiv ? 'LabDiv' : 'HUB'}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-0.5">{hubConnection.hub_email}</p>
                {hubConnection.linked_at && (
                  <p className="text-[10px] text-white/40 mt-1">
                    Vinculado em: {new Date(hubConnection.linked_at).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(hubConnection.linked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleConnectHub}
                disabled={isRedirecting || isUnlinking}
                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/80 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">sync</span>
                <span>{isRedirecting ? 'Sincronizando...' : 'Re-sincronizar'}</span>
              </button>

              <button
                type="button"
                onClick={handleUnlink}
                disabled={isUnlinking || isRedirecting}
                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-bold text-red-400 hover:text-red-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">link_off</span>
                <span>{isUnlinking ? 'Desvinculando...' : 'Desvincular'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-white/70 leading-relaxed">
            Esta conta Aurtistic ainda não está associada a nenhuma identidade institucional do HUB LabDiv. Vincule para habilitar acesso com 1 clique pelo portal do HUB, unificar tarefas do laboratório e sincronizar seu avatar e e-mail @usp.br.
          </p>

          <button
            type="button"
            onClick={handleConnectHub}
            disabled={isRedirecting}
            className="group relative overflow-hidden rounded-xl p-[2px] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-lg hover:shadow-[0_8px_25px_rgba(15,71,128,0.35)]"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-[#0F4780] via-[#F14343] to-[#FFCC00] opacity-95 group-hover:opacity-100" />
            <div className="relative flex items-center gap-3 rounded-[10px] bg-[#0E1522] px-4 py-2.5 backdrop-blur-md transition-all group-hover:bg-[#0E1522]/90">
              {isRedirecting ? (
                <div className="w-5 h-5 border-2 border-[#FFCC00] border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[20px] text-[#FFCC00]">link</span>
              )}
              <span className="text-xs font-black text-white uppercase tracking-wider">
                {isRedirecting ? 'Conectando ao HUB...' : 'Vincular ao meu Perfil do HUB LabDiv'}
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

