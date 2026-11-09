// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/JoinOrganizationModal.tsx
'use client';

import React, { useState } from 'react';
import {
  getOrganizationInvitePreviewAction,
  joinOrganizationByCodeAction,
} from '@/app/(dashboard)/organizacoes/actions';

export interface JoinOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinedSuccess: (orgId: string, orgName: string) => void;
}

export function JoinOrganizationModal({
  isOpen,
  onClose,
  onJoinedSuccess,
}: JoinOrganizationModalProps) {
  const [codeOrUrl, setCodeOrUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [preview, setPreview] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedPlaceholderId, setSelectedPlaceholderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanInput = codeOrUrl.trim();
    if (!cleanInput) return;
    const cleanToken = cleanInput.includes('/') ? cleanInput : cleanInput.toUpperCase();

    setIsValidating(true);
    setErrorMsg(null);
    setPreview(null);
    setSelectedPlaceholderId(null);

    try {
      const res = await getOrganizationInvitePreviewAction(cleanToken);
      if (!res.ok || !res.preview) {
        setErrorMsg(res.error || 'Código ou link de convite inválido ou expirado.');
      } else {
        setPreview(res.preview);
        if (res.preview.placeholder_member_id) {
          setSelectedPlaceholderId(res.preview.placeholder_member_id);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha na validação do convite.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmJoin = async () => {
    setIsJoining(true);
    setErrorMsg(null);

    const cleanInput = codeOrUrl.trim();
    const cleanToken = cleanInput.includes('/') ? cleanInput : cleanInput.toUpperCase();

    try {
      const res = await joinOrganizationByCodeAction({
        codeOrUrl: cleanToken,
        claimPlaceholderId: selectedPlaceholderId || undefined,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao entrar na organização.');
      } else {
        setSuccessMsg('🎉 Você entrou na organização com sucesso!');
        setTimeout(() => {
          onJoinedSuccess(
            preview?.organization?.id || res.result?.organization_id,
            preview?.organization?.name || 'Organização'
          );
          onClose();
        }, 1500);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao processar convite.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-border-subtle bg-surface p-6 shadow-2xl text-slate-100">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-teal-400">vpn_key</span>
            <div>
              <h2 className="text-base font-bold text-fg">Entrar em uma Organização</h2>
              <p className="text-xs text-fg-muted">Cole o código de 8 dígitos ou o link de convite recebido.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Formulário de Input */}
        <form onSubmit={handleValidate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Código ou Link de Convite
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Ex: labdiv2026 ou https://.../convite/xyz"
                value={codeOrUrl}
                onChange={(e) => {
                  setCodeOrUrl(e.target.value);
                  setPreview(null);
                  setErrorMsg(null);
                }}
                className="flex-1 rounded-lg border border-border-subtle bg-app px-3 py-2 text-xs text-fg placeholder-slate-600 focus:border-teal-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isValidating || !codeOrUrl.trim()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-fg hover:bg-teal-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isValidating ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">search</span>
                )}
                Verificar
              </button>
            </div>
          </div>
        </form>

        {/* Mensagem de Erro */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0 text-rose-400">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Mensagem de Sucesso */}
        {successMsg && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0 text-emerald-400">check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Preview do Convite Encontrado */}
        {preview && (
          <div className="mt-4 p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 font-bold text-xl border border-teal-500/30">
                🏛️
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-fg">{preview.organization?.name}</h3>
                <p className="text-xs text-slate-400">
                  {preview.organization?.description || 'Workspace Oficial Colaborativo'}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Função: {preview.assigned_role === 'admin' ? 'Coordenador/Admin' : 'Membro'}
                  </span>
                </div>
              </div>
            </div>

            {/* Reivindicação de Placeholder de Membro Histórico */}
            {Array.isArray(preview.available_placeholders) && preview.available_placeholders.length > 0 && (
              <div className="pt-2 border-t border-border-subtle">
                <span className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Você já participava desta equipe antes? Selecione seu nome para herdar suas tarefas anteriores:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedPlaceholderId(null)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      selectedPlaceholderId === null
                        ? 'bg-teal-500 text-slate-950 font-bold border-teal-400'
                        : 'bg-app text-slate-400 border-border-subtle hover:text-fg'
                    }`}
                  >
                    👤 Entrar como Novo Membro
                  </button>

                  {preview.available_placeholders.map((p: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlaceholderId(p.id)}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors flex items-center gap-1 ${
                        selectedPlaceholderId === p.id
                          ? 'bg-indigo-600 text-fg font-bold border-indigo-400'
                          : 'bg-app text-slate-300 border-border-subtle hover:text-fg'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">badge</span>
                      Sou {p.full_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Botão de Confirmação */}
            <div className="pt-3 flex justify-end gap-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-fg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmJoin}
                disabled={isJoining}
                className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-md"
              >
                {isJoining ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                )}
                Confirmar Entrada
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

