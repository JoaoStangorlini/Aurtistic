// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/auth/vincular-conta/page.tsx
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyHubSsoTicket } from '@/lib/hub-sso';
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';
import { linkExistingAccountAction, createAccountFromHubAction } from '@/app/auth/actions';

export const dynamic = 'force-dynamic';

export default async function VincularContaPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const ticket = typeof searchParams?.ticket === 'string' ? searchParams.ticket : '';
  const rawNext = typeof searchParams?.next === 'string' ? searchParams.next : '/labdiv';
  const urlError = typeof searchParams?.error === 'string' ? searchParams.error : '';

  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/labdiv';

  if (!ticket) {
    redirect('/login?error=' + encodeURIComponent('Ticket SSO ausente. Inicie pelo login.'));
  }

  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
  if (!secret) {
    redirect('/login?error=' + encodeURIComponent('Segredo SSO não configurado no servidor.'));
  }

  const verification = verifyHubSsoTicket(ticket, secret);
  if (!verification.valid || !verification.payload) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 bg-surface border border-red-500/30 rounded-2xl text-center space-y-4 shadow-2xl">
          <span className="material-symbols-outlined text-4xl text-red-400">error</span>
          <h1 className="text-lg font-bold text-fg">Autorização Expirada ou Inválida</h1>
          <p className="text-xs text-fg/70">
            {verification.error || 'O ticket de acesso expirou. Por favor, tente entrar novamente via HUB.'}
          </p>
          <Link
            href="/login"
            className="inline-block mt-2 px-5 py-2.5 bg-[#FFCC00] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90"
          >
            Voltar ao Login
          </Link>
        </div>
      </div>
    );
  }

  const payload = verification.payload;
  const displayName = payload.fullName || payload.username || 'Pesquisador';
  const isLabdivMember = Boolean(payload.isLabdiv);

  return (
    <div className="min-h-screen bg-[#0C0F17] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Luzes de Fundo com IDV LabDiv & Aurtistic */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#0F4780]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#9D4EDD]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg bg-[#141824]/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Barra Superior Gradiente Oficial Roxo -> Azul Metálico -> Dourado */}
        <div className="h-2 w-full bg-gradient-to-r from-[#8E24AA] via-[#1E3D9E] to-[#C7940E]" />

        <div className="p-6 md:p-8 space-y-6">
          {/* Cabeçalho de Conexão */}
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-3.5 mb-3">
              <div className="p-2.5 rounded-2xl bg-black/50 border border-white/10 shadow-lg">
                <img src="/icone-HUBLabDiv.svg" alt="HUB LabDiv" className="w-9 h-9 object-contain" />
              </div>
              <span className="material-symbols-outlined text-fg/40 text-lg">link</span>
              <ThemedAurtisticLogo size="sm" iconOnly={true} />
            </div>

            <span className="text-[10px] font-black uppercase tracking-widest text-[#FFCC00] bg-[#FFCC00]/10 px-2.5 py-0.5 rounded-full border border-[#FFCC00]/20">
              Vincular Contas
            </span>
            <h1 className="text-xl md:text-2xl font-black text-fg mt-2 tracking-tight">
              Identidade HUB Conectada
            </h1>
            <p className="text-xs text-fg/70 max-w-sm mt-1">
              Escolha como deseja conectar sua identidade do HUB ao ecossistema Aurtistic.
            </p>
          </div>

          {urlError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-red-400">error</span>
              <span>{urlError}</span>
            </div>
          )}

          {/* Card do Usuário Autenticado no HUB */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-black/60 border border-[#FFCC00]/40 shrink-0 flex items-center justify-center">
              {payload.avatarUrl ? (
                <img src={payload.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-fg">{displayName.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-fg truncate">{displayName}</p>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#0F4780]/80 text-blue-200 border border-blue-400/30">
                  {isLabdivMember ? 'LabDiv' : 'HUB'}
                </span>
              </div>
              <p className="text-xs text-fg/60 truncate mt-0.5">{payload.email}</p>
            </div>
          </div>

          {/* OPÇÃO 1: Vincular a Conta Existente */}
          <div className="p-5 rounded-2xl bg-black/30 border border-[#9D4EDD]/30 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#9D4EDD]">person_add</span>
              <h2 className="text-sm font-bold text-fg">Vincular a uma conta existente do Aurtistic</h2>
            </div>
            <p className="text-[11px] text-fg/60 leading-relaxed">
              Se você já utiliza o Aurtistic, informe suas credenciais abaixo. Sua conta será vinculada ao HUB para permitir login futuro com 1 toque via SSO institucional sem perder suas tarefas, currículo ou arquivos.
            </p>

            <form action={linkExistingAccountAction} className="space-y-3">
              <input type="hidden" name="ticket" value={ticket} />
              <input type="hidden" name="next" value={safeNext} />

              <div>
                <label className="block text-[10px] font-bold text-fg/70 uppercase tracking-wider mb-1" htmlFor="username">
                  Usuário ou E-mail Aurtistic
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  placeholder="Ex: stangorlini ou seu@email.com"
                  className="w-full bg-[#0E1522] border border-white/10 focus:border-[#9D4EDD] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-fg/70 uppercase tracking-wider mb-1" htmlFor="password">
                  Sua Senha do Aurtistic
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#0E1522] border border-white/10 focus:border-[#9D4EDD] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-[#8E24AA] via-[#1E3D9E] to-[#C7940E] text-fg font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-95 active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">link</span>
                <span>Confirmar e Vincular Contas</span>
              </button>
            </form>
          </div>

          {/* DIVISOR */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <span className="relative px-3 bg-[#141824] text-[10px] font-bold text-fg/40 uppercase tracking-widest">
              ou
            </span>
          </div>

          {/* OPÇÃO 2: Criar Nova Conta a Partir do HUB */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3 text-center">
            <h3 className="text-xs font-bold text-fg">Novo por aqui?</h3>
            <p className="text-[11px] text-fg/50 leading-relaxed max-w-sm mx-auto">
              Se você não possui uma conta anterior no Aurtistic, crie um novo perfil autônomo com sua identidade institucional do HUB.
            </p>

            <form action={createAccountFromHubAction}>
              <input type="hidden" name="ticket" value={ticket} />
              <input type="hidden" name="next" value={safeNext} />

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-fg/80 hover:text-fg font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Criar Nova Conta no Aurtistic
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

