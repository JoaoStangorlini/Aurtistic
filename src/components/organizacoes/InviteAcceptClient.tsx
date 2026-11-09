// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/InviteAcceptClient.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';
import Link from 'next/link';

export interface InviteAcceptClientProps {
  token: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previewData: any;
  isAuthenticated: boolean;
}

export function InviteAcceptClient({
  token,
  previewData,
  isAuthenticated,
}: InviteAcceptClientProps) {
  const router = useRouter();
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<string>(
    previewData?.placeholder_member_id || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!previewData || !previewData.valid) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-surface/90 border border-border-subtle rounded-2xl text-center shadow-xl">
        <span className="material-symbols-outlined text-[48px] text-rose-500 mb-3">
          link_off
        </span>
        <h2 className="text-xl font-bold text-fg mb-2">Convite Inválido ou Expirado</h2>
        <p className="text-xs text-fg-secondary mb-6 leading-relaxed">
          {previewData?.error || 'Este link de convite não existe mais ou já foi aceito.'}
        </p>
        <Link
          href="/"
          className="inline-flex py-2.5 px-6 rounded-xl bg-app border border-border-subtle text-fg text-xs font-bold hover:border-[var(--accent-secondary)] transition-colors"
        >
          Voltar ao Início
        </Link>
      </div>
    );
  }

  const org = previewData.organization;
  const placeholders: Array<{ id: string; full_name: string }> =
    previewData.available_placeholders || [];

  const handleAccept = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('accept_organization_invite', {
        p_token: token,
        p_claim_placeholder_id: selectedPlaceholder || null,
      });

      if (error) {
        setErrorMsg(error.message);
        setIsSubmitting(false);
        return;
      }

      if (data?.success) {
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao aceitar convite.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 md:p-8 bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl">
      <div className="flex flex-col items-center text-center mb-6">
        <ThemedAurtisticLogo size="md" />
        <div className="mt-4 w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#9D4EDD]/20 to-[#FFCC00]/20 border border-border-subtle flex items-center justify-center text-2xl font-bold text-[var(--accent-secondary)] shadow-sm">
          {org.name.slice(0, 2).toUpperCase()}
        </div>
        <h1 className="text-xl md:text-2xl font-black text-fg mt-3 font-['Bukra']">
          {org.name}
        </h1>
        <p className="text-xs text-fg-secondary mt-1">
          {org.description || 'Você foi convidado para colaborar nesta organização.'}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="p-4 rounded-xl bg-app border border-border-subtle mb-6 space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-fg-secondary">Cargo Atribuído:</span>
          <span className="font-bold text-[var(--accent-secondary)] uppercase">
            {previewData.assigned_role === 'admin' ? 'Administrador' : 'Membro'}
          </span>
        </div>
        {previewData.target_email && (
          <div className="flex justify-between items-center">
            <span className="text-fg-secondary">Destinatário:</span>
            <span className="font-medium text-fg">{previewData.target_email}</span>
          </div>
        )}
      </div>

      {placeholders.length > 0 && (
        <div className="mb-6">
          <label className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1.5">
            Vincular ao seu nome existente na equipe (opcional):
          </label>
          <select
            value={selectedPlaceholder}
            onChange={(e) => setSelectedPlaceholder(e.target.value)}
            className="w-full bg-app border border-border-subtle text-fg text-xs rounded-xl px-3 py-2.5 outline-none focus:border-[var(--accent-secondary)] transition-colors"
          >
            <option value="">Entrar como novo perfil de membro</option>
            {placeholders.map((p) => (
              <option key={p.id} value={p.id}>
                Sou eu: {p.full_name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-fg-muted mt-1">
            Se seu nome já aparecia nas tarefas do LabDiv, selecione-o acima para herdar todo o histórico.
          </p>
        </div>
      )}

      {!isAuthenticated ? (
        <div className="space-y-3">
          <p className="text-xs text-center text-fg-secondary">
            Faça login ou crie sua conta para aceitar este convite.
          </p>
          <Link
            href={`/login?next=/convite/${token}`}
            className="w-full py-3 bg-[var(--accent-secondary,#FFCC00)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-md"
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            <span>Entrar para Aceitar Convite</span>
          </Link>
        </div>
      ) : (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleAccept}
          className="w-full py-3 bg-[var(--accent-secondary,#FFCC00)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-transparent border-t-[#121212] rounded-full animate-spin"></span>
              <span>Associando Membro...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">group_add</span>
              <span>Aceitar Convite & Entrar</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

