// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { login, requestPasswordReset, signup } from '@/app/login/actions';
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';
import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-identifier';

export interface UnifiedAuthCardProps {
  next?: string;
  title?: string;
  subtitle?: string;
}

type AuthStep = 'identify' | 'login' | 'register';

export function UnifiedAuthCard({
  next = '/labdiv',
  title = 'Bem-vindo ao Aurtistic',
  subtitle = 'Gerenciador criativo, autônomo e de alta densidade cognitiva.',
}: UnifiedAuthCardProps) {
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');

  const [step, setStep] = useState<AuthStep>('identify');
  const [identifier, setIdentifier] = useState('');
  const [resolvedLabel, setResolvedLabel] = useState('');
  const [identifierKind, setIdentifierKind] = useState<'email' | 'username'>('username');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [legalModalDoc, setLegalModalDoc] = useState<'terms' | 'privacy' | null>(null);

  const [isCheckingId, setIsCheckingId] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirectingToHub, setIsRedirectingToHub] = useState(false);
  const [isResettingPwd, setIsResettingPwd] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const activeError = errorMsg || (step === 'identify' ? urlError : null) || (!errorMsg ? urlError : null);

  const handleConnectViaHub = () => {
    try {
      setIsRedirectingToHub(true);
      setErrorMsg(null);
      setInfoMsg(null);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const hubBaseUrl = (
        process.env.NEXT_PUBLIC_HUB_LABDIV_URL ||
        process.env.NEXT_PUBLIC_HUB_URL ||
        'https://hub-lab-div.vercel.app'
      ).replace(/\/+$/, '');
      const redirectUri = `${origin}/auth/hub-callback`;
      const sanitizedNext = next.startsWith('/') && !next.startsWith('//') ? next : '/labdiv';

      const state =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2);

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

  const handleCheckIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) {
      setErrorMsg('Informe seu usuário ou e-mail para continuar.');
      return;
    }

    setIsCheckingId(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const resp = await fetch('/api/auth/check-identifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmed }),
      });

      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        exists?: boolean;
        kind?: 'email' | 'username';
        displayLabel?: string;
        isValidForSignup?: boolean;
        signupValidationError?: string | null;
        error?: string;
      } | null;

      if (!resp.ok || !data?.ok) {
        setErrorMsg(data?.error || 'Não foi possível verificar o usuário agora. Tente novamente.');
        return;
      }

      setIdentifier(data.displayLabel || trimmed);
      setResolvedLabel(data.displayLabel || trimmed);
      setIdentifierKind(data.kind === 'email' ? 'email' : 'username');
      setPassword('');
      setConfirmPassword('');
      setAcceptTerms(false);

      if (data.exists) {
        setStep('login');
      } else {
        if (!data.isValidForSignup && data.signupValidationError) {
          setErrorMsg(data.signupValidationError);
          return;
        }
        setStep('register');
      }
    } catch {
      setErrorMsg('Falha de conexão ao verificar usuário. Verifique sua internet.');
    } finally {
      setIsCheckingId(false);
    }
  };

  const handleSwitchIdentifier = () => {
    setStep('identify');
    setPassword('');
    setConfirmPassword('');
    setAcceptTerms(false);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleForgotPassword = async () => {
    setIsResettingPwd(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await requestPasswordReset(resolvedLabel || identifier);
      if (res.ok) {
        setInfoMsg(res.message);
      } else {
        setErrorMsg(res.message);
      }
    } catch {
      setErrorMsg('Não foi possível enviar o link de recuperação agora.');
    } finally {
      setIsResettingPwd(false);
    }
  };

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmitRegister =
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword === password &&
    acceptTerms &&
    !isSubmitting &&
    !isRedirectingToHub;

  return (
    <>
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
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
            <span>
              {activeError === 'access_denied' ? 'A autorização no HUB foi cancelada.' : activeError}
            </span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
              check_circle
            </span>
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Botão de Acesso HUB LabDiv */}
        <div className="flex flex-col gap-2.5 mb-6">
          <button
            type="button"
            disabled={isSubmitting || isCheckingId || isRedirectingToHub}
            onClick={handleConnectViaHub}
            className="group relative w-full overflow-hidden rounded-2xl p-[2px] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none shadow-xl hover:shadow-[0_8px_30px_rgba(241,67,67,0.35)] cursor-pointer"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-[#0F4780] via-[#F14343] to-[#FFCC00] opacity-95 transition-opacity group-hover:opacity-100" />
            <div className="relative flex items-center justify-between gap-3.5 rounded-[14px] bg-[#0E1522]/90 px-4 py-3 backdrop-blur-md transition-all group-hover:bg-[#0E1522]/80">
              <div className="flex items-center gap-3.5">
                {isRedirectingToHub ? (
                  <div className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center">
                    <span className="w-6 h-6 border-2 border-[#FFCC00] border-t-transparent rounded-full animate-spin" />
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
            <div className="w-full border-t border-border-subtle" />
          </div>
          <span className="relative px-3 bg-surface text-[10px] font-bold text-fg-muted uppercase tracking-widest">
            ou credencial local
          </span>
        </div>

        {/* Etapa 1: Identificação única */}
        {step === 'identify' && (
          <form onSubmit={handleCheckIdentifier} className="flex flex-col gap-3.5">
            <div>
              <label
                className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1"
                htmlFor="auth-identifier"
              >
                Usuário ou E-mail
              </label>
              <input
                id="auth-identifier"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
                placeholder="Ex.: stangorlini ou voce@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={isCheckingId || isRedirectingToHub}
              className="w-full mt-1 py-3 bg-[var(--accent-secondary,#FFCC00)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 active:scale-[0.99] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isCheckingId ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-transparent border-t-[#121212] rounded-full animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <span>Continuar</span>
              )}
            </button>
          </form>
        )}

        {/* Etapa 2A: Conta existente */}
        {step === 'login' && (
          <form
            action={login}
            onSubmit={() => {
              setErrorMsg(null);
              setIsSubmitting(true);
            }}
            className="flex flex-col gap-3.5"
          >
            <input type="hidden" name="next" value={next} />
            <input
              type="text"
              name="username"
              value={resolvedLabel || identifier}
              readOnly
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />

            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-app border border-border-subtle">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[16px] text-fg-muted shrink-0">
                  person
                </span>
                <span className="text-xs font-bold text-fg truncate">
                  {resolvedLabel || identifier}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSwitchIdentifier}
                className="text-[11px] font-bold text-[var(--accent-primary)] hover:underline shrink-0 cursor-pointer"
              >
                Trocar
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider"
                  htmlFor="login-password"
                >
                  Senha
                </label>
                {identifierKind === 'email' && (
                  <button
                    type="button"
                    disabled={isResettingPwd}
                    onClick={() => void handleForgotPassword()}
                    className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {isResettingPwd ? 'Enviando...' : 'Esqueci minha senha'}
                  </button>
                )}
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
                placeholder="Digite sua senha"
              />
            </div>

            <p className="text-[11px] text-fg-muted leading-snug">
              Se você criou sua conta diretamente pelo <strong>HUB LabDiv</strong>, clique em{' '}
              <em>&quot;Entrar via HUB LabDiv&quot;</em> acima.
            </p>

            <button
              type="submit"
              disabled={isSubmitting || isRedirectingToHub || !password}
              className="w-full mt-1 py-3 bg-[var(--accent-secondary,#FFCC00)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 active:scale-[0.99] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-transparent border-t-[#121212] rounded-full animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <span>Entrar no Espaço</span>
              )}
            </button>
          </form>
        )}

        {/* Etapa 2B: Nova conta */}
        {step === 'register' && (
          <form
            action={signup}
            onSubmit={(e) => {
              if (!canSubmitRegister) {
                e.preventDefault();
                return;
              }
              setErrorMsg(null);
              setIsSubmitting(true);
            }}
            className="flex flex-col gap-3.5"
          >
            <input type="hidden" name="next" value={next} />
            <input
              type="text"
              name="username"
              value={resolvedLabel || identifier}
              readOnly
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />

            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-app border border-border-subtle">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] shrink-0">
                  Nova conta
                </span>
                <span className="text-xs font-bold text-fg truncate">
                  {resolvedLabel || identifier}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSwitchIdentifier}
                className="text-[11px] font-bold text-[var(--accent-primary)] hover:underline shrink-0 cursor-pointer"
              >
                Trocar
              </button>
            </div>

            <p className="text-[11px] text-fg-muted leading-snug">
              Não encontramos este usuário. Confira se digitou corretamente antes de criar sua nova conta.
            </p>

            <div>
              <label
                className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1"
                htmlFor="register-password"
              >
                Criar Senha (mín. {MIN_PASSWORD_LENGTH} caracteres)
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
                placeholder={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`}
              />
              {passwordTooShort && (
                <p className="text-[11px] text-amber-400 mt-1">
                  Use no mínimo {MIN_PASSWORD_LENGTH} caracteres.
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wider mb-1"
                htmlFor="register-confirm-password"
              >
                Confirmar Senha
              </label>
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-app border border-border-subtle focus:border-[var(--accent-secondary)] text-fg px-3.5 py-2.5 rounded-xl text-xs outline-none transition-colors"
                placeholder="Repita a senha"
              />
              {passwordsMismatch && (
                <p className="text-[11px] text-red-400 mt-1">As senhas não coincidem.</p>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-[11px] text-fg-secondary leading-relaxed cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                name="acceptTerms"
                required
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 rounded border-border-subtle accent-[var(--accent-primary)] shrink-0 cursor-pointer"
              />
              <span>
                Li e aceito os{' '}
                <button
                  type="button"
                  onClick={() => setLegalModalDoc('terms')}
                  className="font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Termos de Uso
                </button>{' '}
                e a{' '}
                <button
                  type="button"
                  onClick={() => setLegalModalDoc('privacy')}
                  className="font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Política de Privacidade
                </button>{' '}
                do Aurtistic.
              </span>
            </label>

            <button
              type="submit"
              disabled={!canSubmitRegister}
              className="w-full mt-1 py-3 bg-[var(--accent-secondary,#FFCC00)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 active:scale-[0.99] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-transparent border-t-[#121212] rounded-full animate-spin" />
                  <span>Criando conta...</span>
                </>
              ) : (
                <span>Criar Conta e Entrar</span>
              )}
            </button>
          </form>
        )}

        {/* Rodapé legal */}
        <p className="mt-5 pt-4 border-t border-border-subtle text-center text-[11px] text-fg-muted">
          <Link href="/terms" className="hover:text-fg underline">
            Termos de Uso
          </Link>
          {' • '}
          <Link href="/privacy-policy" className="hover:text-fg underline">
            Política de Privacidade
          </Link>
        </p>
      </div>

      {/* Modal de leitura rápida de Termos / Privacidade (sem sair do cadastro) */}
      {legalModalDoc && (
        <div
          className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLegalModalDoc(null);
          }}
        >
          <div className="w-full max-w-2xl max-h-[85dvh] flex flex-col bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLegalModalDoc('terms')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    legalModalDoc === 'terms'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'text-fg-muted hover:text-fg bg-app'
                  }`}
                >
                  Termos de Uso
                </button>
                <button
                  type="button"
                  onClick={() => setLegalModalDoc('privacy')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    legalModalDoc === 'privacy'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'text-fg-muted hover:text-fg bg-app'
                  }`}
                >
                  Política de Privacidade
                </button>
              </div>
              <button
                type="button"
                onClick={() => setLegalModalDoc(null)}
                className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover cursor-pointer"
                aria-label="Fechar leitura"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <LegalDocumentView doc={legalModalDoc} mode="compact" />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border-subtle bg-app">
              <button
                type="button"
                onClick={() => setLegalModalDoc(null)}
                className="px-4 py-2 rounded-xl border border-border-subtle bg-surface text-xs font-semibold text-fg hover:bg-surface-hover cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAcceptTerms(true);
                  setLegalModalDoc(null);
                }}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold hover:brightness-110 cursor-pointer"
              >
                Li e concordar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
