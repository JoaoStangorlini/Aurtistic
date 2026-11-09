// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/auth/UnifiedAuthCard.tsx
'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';
import { login, signup } from '@/app/login/actions';

export interface UnifiedAuthCardProps {
  next?: string;
  defaultMode?: 'login' | 'register';
  title?: string;
  subtitle?: string;
}

export function UnifiedAuthCard({
  next = '/labdiv',
  defaultMode = 'login',
  title = 'Bem-vindo ao Aurtistic',
  subtitle = 'Gerenciador criativo, autônomo e de alta densidade cognitiva.',
}: UnifiedAuthCardProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>(defaultMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRedirectingToHub, setIsRedirectingToHub] = useState(false);

  const searchParams = useSearchParams();
  const urlError = searchParams?.get('error');
  const activeError = errorMsg || urlError;

  // Redireciona diretamente para o HUB para login e tela de autorização/consentimento
  const handleConnectViaHub = () => {
    try {
      setIsRedirectingToHub(true);
      setErrorMsg(null);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const hubBaseUrl =
        process.env.NEXT_PUBLIC_HUB_LABDIV_URL ||
        process.env.NEXT_PUBLIC_HUB_URL ||
        'http://localhost:3001';
      const redirectUri = `${origin}/auth/hub-callback`;
      const sanitizedNext = next.startsWith('/') && !next.startsWith('//') ? next : '/labdiv';

      const state =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2);

      // Armazena cookie lax para verificação CSRF segura
      document.cookie = `aurtistic_sso_state=${state}; Path=/; SameSite=Lax; Max-Age=600`;

      const ssoAuthorizeUrl = `${hubBaseUrl}/auth/sso/authorize?redirect_uri=${encodeURIComponent(
        redirectUri
      )}&next=${encodeURIComponent(sanitizedNext)}&state=${encodeURIComponent(state)}`;

      window.location.href = ssoAuthorizeUrl;
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao redirecionar para o HUB.');
      setIsRedirectingToHub(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 md:p-8 bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl transition-colors duration-200">
      {/* Cabeçalho */}
      <div className="flex flex-col items-center text-center mb-6">
        <ThemedAurtisticLogo size="lg" showTagline={true} />
        <h1 className="text-xl md:text-2xl font-black text-fg mt-4 font-['Bukra'] tracking-tight">
          {title}
        </h1>
        <p className="text-xs text-fg-secondary mt-1 max-w-xs">{subtitle}</p>
      </div>

      {activeError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span>{activeError === 'access_denied' ? 'A autorização no HUB foi cancelada.' : activeError}</span>
        </div>
      )}

      {/* Botão de Acesso HUB LabDiv (IDV LabDiv Oficial: Azul #0F4780, Vermelho #F14343 e Amarelo #FFCC00) */}
      <div className="flex flex-col gap-2.5 mb-6">
        <button
          type="button"
          disabled={isSubmitting || isRedirectingToHub}
          onClick={handleConnectViaHub}
          className="group relative w-full overflow-hidden rounded-2xl p-[2px] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none shadow-xl hover:shadow-[0_8px_30px_rgba(241,67,67,0.35)] cursor-pointer"
        >
          {/* Borda Dinâmica com Gradiente Oficial LabDiv */}
          <span className="absolute inset-0 bg-gradient-to-r from-[#0F4780] via-[#F14343] to-[#FFCC00] opacity-95 transition-opacity group-hover:opacity-100" />

          {/* Superfície do Botão em Dark Navy com Efeito de Vidro */}
          <div className="relative flex items-center justify-between gap-3.5 rounded-[14px] bg-[#0E1522]/90 px-4 py-3 backdrop-blur-md transition-all group-hover:bg-[#0E1522]/80">
            <div className="flex items-center gap-3.5">
              {isRedirectingToHub ? (
                <div className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center">
                  <span className="w-6 h-6 border-2 border-[#FFCC00] border-t-transparent rounded-full animate-spin"></span>
                </div>
              ) : (
                <div className="p-1 rounded-xl bg-black/40 border border-white/10 shrink-0 flex items-center justify-center shadow-inner">
                  <img
                    src="/icone-HUBLabDiv.svg"
                    alt="HUB LabDiv"
                    className="w-10 h-10 md:w-11 md:h-11 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#60A5FA] via-[#F87171] to-[#FFCC00]">
                  Workspace Institucional
                </span>
                <span className="text-sm md:text-base font-black text-white tracking-wide drop-shadow-sm">
                  {isRedirectingToHub ? 'Conectando ao HUB...' : 'Entrar via HUB LabDiv'}
                </span>
              </div>
            </div>

            <span className="material-symbols-outlined text-[24px] text-[#FFCC00] pr-1 transition-transform duration-300 group-hover:translate-x-1 shrink-0">
              arrow_forward
            </span>
          </div>
        </button>
      </div>

      {/* Divisor */}
      <div className="relative flex items-center justify-center mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle"></div>
        </div>
        <span className="relative px-3 bg-surface text-[10px] font-bold text-fg-muted uppercase tracking-widest">
          ou credencial local
        </span>
      </div>

      {/* Seletor de Modo: Entrar / Criar Conta */}
      <div className="flex rounded-xl bg-app p-1 mb-4 border border-border-subtle">
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            authMode === 'login'
              ? 'bg-surface text-fg shadow-sm border border-border-subtle'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('register')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            authMode === 'register'
              ? 'bg-surface text-fg shadow-sm border border-border-subtle'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          Criar Conta
        </button>
      </div>

      {/* Formulário de Usuário e Senha */}
      <form
        action={authMode === 'register' ? signup : login}
        onSubmit={() => setIsSubmitting(true)}
        className="flex flex-col gap-3.5"
      >
        <input type="hidden" name="next" value={next} />

        {authMode === 'register' && (
          <div>
            <label
              className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1"
              htmlFor="fullName"
            >
              Nome Completo (Opcional)
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
              placeholder="Seu nome"
            />
          </div>
        )}

        <div>
          <label
            className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1"
            htmlFor="username"
          >
            {authMode === 'register' ? 'Nome de Usuário ou E-mail' : 'Usuário ou E-mail'}
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
            placeholder="Seu usuário, @username ou e-mail"
          />
        </div>

        <div>
          <label
            className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1"
            htmlFor="password"
          >
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
            required
            className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isRedirectingToHub}
          className="w-full mt-2 py-3 bg-[var(--accent-secondary,#FFCC00)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 active:scale-[0.99] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-transparent border-t-[#121212] rounded-full animate-spin"></span>
              <span>{authMode === 'register' ? 'Criando conta...' : 'Autenticando...'}</span>
            </>
          ) : (
            <span>{authMode === 'register' ? 'Criar Conta e Entrar' : 'Entrar no Espaço'}</span>
          )}
        </button>
      </form>
    </div>
  );
}
