// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { joinOrganizationByCodeAction } from '@/app/(dashboard)/organizacoes/actions';
import type { Organization } from '@/types/organizations';

interface OrgRestrictedAccessViewProps {
  organization: Organization;
  orgSlug: string;
}

export function OrgRestrictedAccessView({
  organization,
  orgSlug,
}: OrgRestrictedAccessViewProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await joinOrganizationByCodeAction({ codeOrUrl: code.trim() });
      if (res.ok) {
        setSuccessMsg('Acesso autorizado! Carregando painel da equipe...');
        setTimeout(() => {
          router.refresh();
        }, 800);
      } else {
        setErrorMsg(res.error || 'Código inválido ou expirado.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha na verificação do código.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-app font-['Open_Sans'] text-fg">
      <div className="max-w-md w-full bg-surface border border-border-subtle rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center space-y-6">
        {/* Glow decorativo da IDV */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: 'var(--org-primary, #FFCC00)' }}
        />

        {/* Monograma ou Ícone */}
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center border shadow-lg"
          style={{
            borderColor: 'var(--org-primary, #FFCC00)',
            backgroundColor: 'color-mix(in srgb, var(--org-primary, #FFCC00) 15%, transparent)',
          }}
        >
          <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--org-primary, #FFCC00)' }}>
            lock
          </span>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/5 border border-border-subtle text-fg-secondary">
            Acesso Restrito à Equipe
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-fg font-['Bukra'] tracking-tight">
            {organization.name}
          </h2>
          <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
            O painel de gestão de tarefas, metas e reuniões é exclusivo para membros ativos desta organização no HUB LabDiv.
          </p>
        </div>

        {/* Formulário de Código de Convite */}
        <form onSubmit={handleJoin} className="space-y-3 pt-2 border-t border-border-subtle text-left">
          <label className="block text-xs font-bold text-fg-secondary">
            Possui código de convite da organização?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX: LABDIV-2026"
              className="flex-1 bg-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono uppercase tracking-wider text-fg focus:outline-none focus:border-[var(--org-primary,#FFCC00)]"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              style={{
                backgroundColor: 'var(--org-primary, #FFCC00)',
                color: '#121212',
              }}
            >
              {isSubmitting ? (
                <span>Validando...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">key</span>
                  <span>Entrar</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              {errorMsg}
            </p>
          )}

          {successMsg && (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              {successMsg}
            </p>
          )}

          <p className="text-[11px] text-fg-muted pt-1">
            Se você faz parte desta iniciativa, solicite o código ao coordenador ou admin da equipe.
          </p>
        </form>
      </div>
    </div>
  );
}
