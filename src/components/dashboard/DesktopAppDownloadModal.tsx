// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useState } from 'react';
import {
  detectClientPlatform,
  getLanConfig,
  probeLanServer,
  setLanConfig,
  type DetectedOsPlatform,
} from '@/lib/native-bridge';
import type { DesktopReleasePayload } from '@/app/api/app/desktop-release/route';

export interface DesktopAppDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedPlatform?: DetectedOsPlatform;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DEFAULT_PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.stangorlini.aurtistic';

function formatSizeMb(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  return ` (${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
}

function isIosNonSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|WhatsApp|Line\//i.test(ua);
}

export function DesktopAppDownloadModal({
  isOpen,
  onClose,
  detectedPlatform: propPlatform,
}: DesktopAppDownloadModalProps) {
  const [platform, setPlatform] = useState<DetectedOsPlatform>(propPlatform || 'unknown');
  const [nonSafariIos, setNonSafariIos] = useState(false);
  const [release, setRelease] = useState<DesktopReleasePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedApt, setCopiedApt] = useState(false);
  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);

  const [deferredPwaPrompt, setDeferredPwaPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [pwaNotice, setPwaNotice] = useState<string | null>(null);

  const [lanUrl, setLanUrl] = useState('');
  const [autoDetectLan, setAutoDetectLan] = useState(true);
  const [lanProbeStatus, setLanProbeStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPwaPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const detected = propPlatform && propPlatform !== 'unknown' ? propPlatform : detectClientPlatform();
    setPlatform(detected);
    setNonSafariIos(detected === 'ios' && isIosNonSafariBrowser());
    setShowOtherPlatforms(detected === 'unknown');
    setPwaNotice(null);

    const cfg = getLanConfig();
    setLanUrl(cfg.lanServerUrl);
    setAutoDetectLan(cfg.autoDetectLan);
    setLanProbeStatus('idle');

    let cancelled = false;
    setLoading(true);
    fetch('/api/app/desktop-release')
      .then((r) => r.json())
      .then((data: DesktopReleasePayload) => {
        if (!cancelled) setRelease(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, propPlatform]);

  if (!isOpen) return null;

  const fallbackReleaseUrl =
    release?.releasePageUrl || 'https://github.com/JoaoStangorlini/Aurtistic/releases/latest';
  const aptCmd =
    release?.aptInstallCommand ||
    'curl -fsSL https://joaostangorlini.github.io/Aurtistic/apt/install.sh | sudo bash';

  const handleInstallPwa = async () => {
    if (deferredPwaPrompt) {
      await deferredPwaPrompt.prompt();
      const choice = await deferredPwaPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') {
        setPwaNotice('Instalação do WebApp iniciada!');
      }
      setDeferredPwaPrompt(null);
      return;
    }
    setPwaNotice(
      'Abra o menu do navegador (⋮) e toque em "Instalar aplicativo" ou "Adicionar à tela inicial".'
    );
  };

  const handleSaveLan = async () => {
    const saved = await setLanConfig({ lanServerUrl: lanUrl, autoDetectLan });
    setLanUrl(saved.lanServerUrl);
    if (!saved.lanServerUrl) {
      setLanProbeStatus('idle');
      return;
    }
    setLanProbeStatus('testing');
    const res = await probeLanServer(saved.lanServerUrl, 1500);
    setLanProbeStatus(res.reachable ? 'ok' : 'fail');
  };

  const modalSubtitle =
    platform === 'ios' || platform === 'android'
      ? 'Tenha o Aurtistic na tela inicial com lembretes, transferências grandes e acesso rápido ao Cofre.'
      : 'App completo com alarmes na bandeja, fila bidirecional sem limite de 100 MB e espelhamento de pastas.';

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-surface border border-border-subtle rounded-2xl shadow-2xl p-5 sm:p-6 text-fg">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">
                {platform === 'ios' || platform === 'android' ? 'install_mobile' : 'install_desktop'}
              </span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-fg">
                {platform === 'ios'
                  ? 'Instalar WebApp no iOS / iPadOS'
                  : platform === 'android'
                    ? 'Aurtistic para Android'
                    : `App Aurtistic Desktop ${release?.version ? `(${release.version})` : ''}`}
              </h2>
              <p className="text-xs text-fg-muted">{modalSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover cursor-pointer"
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Destaque adaptativo por plataforma */}
        {platform === 'ios' && (
          <div className="p-4 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 mb-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary)]">
                ios_share
              </span>
              <span className="text-sm font-bold text-fg">Instalar como WebApp (PWA) em 3 passos</span>
            </div>
            <ol className="space-y-2 text-xs text-fg">
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Toque no ícone <strong>Compartilhar</strong> (<span className="font-mono">⎙</span> /{' '}
                  <span className="material-symbols-outlined text-[14px] align-middle">ios_share</span>) na barra do Safari.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Role o menu e toque em <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Toque em <strong>&quot;Adicionar&quot;</strong> no canto superior direito para abrir em tela cheia.
                </span>
              </li>
            </ol>
            {nonSafariIos && (
              <p className="mt-3 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                Você parece estar fora do Safari (ex.: Chrome ou navegador interno de aplicativo). Se a opção não aparecer, toque no menu para <strong>&quot;Abrir no Safari&quot;</strong> primeiro.
              </p>
            )}
          </div>
        )}

        {platform === 'android' && (
          <div className="p-4 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 mb-4 space-y-2.5">
            <a
              href={DEFAULT_PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-sm hover:brightness-110 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">shop</span>
              <span>Baixar na Google Play</span>
            </a>
            <button
              type="button"
              onClick={() => void handleInstallPwa()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-[var(--accent-primary)] text-xs font-semibold text-fg cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">install_mobile</span>
              <span>Instalar como WebApp (PWA) no navegador</span>
            </button>
            {pwaNotice && <p className="text-[11px] text-fg-muted text-center">{pwaNotice}</p>}
          </div>
        )}

        {platform === 'windows' && (
          <div className="mb-4 space-y-2">
            <a
              href={release?.assets.windowsExe?.url || fallbackReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-sm hover:brightness-110 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">desktop_windows</span>
              <span>
                {loading
                  ? 'Buscando versão mais recente...'
                  : `Baixar para Windows (.exe)${formatSizeMb(release?.assets.windowsExe?.sizeBytes)}`}
              </span>
            </a>
            <p className="text-[11px] text-fg-muted px-1">
              Dica (1ª execução): se o Windows SmartScreen exibir aviso por ser um software independente sem certificado pago, clique em <strong>Mais informações</strong> → <strong>Executar assim mesmo</strong>.
            </p>
          </div>
        )}

        {platform === 'linux' && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href={release?.assets.linuxDeb?.url || fallbackReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-sm hover:brightness-110 transition-all shadow-md"
              >
                <span className="material-symbols-outlined text-[20px]">package_2</span>
                <span>
                  {loading
                    ? 'Buscando .deb...'
                    : `Baixar .deb (Ubuntu/Zorin)${formatSizeMb(release?.assets.linuxDeb?.sizeBytes)}`}
                </span>
              </a>
              <a
                href={release?.assets.linuxAppImage?.url || fallbackReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border-subtle bg-app hover:border-[var(--accent-primary)] font-bold text-sm text-fg transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">terminal</span>
                <span>
                  Baixar .AppImage{formatSizeMb(release?.assets.linuxAppImage?.sizeBytes)}
                </span>
              </a>
            </div>
            <p className="text-[11px] text-fg-muted px-1">
              O <strong>.deb</strong> instala com duplo clique ou <code className="font-mono">sudo apt install ./aurtistic_*.deb</code>. O <strong>.AppImage</strong> roda direto sem instalar e possui atualização automática.
            </p>
          </div>
        )}

        {platform === 'macos' && (
          <div className="mb-4 space-y-2">
            <a
              href={release?.assets.macDmg?.url || fallbackReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-sm hover:brightness-110 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">laptop_mac</span>
              <span>
                {loading
                  ? 'Buscando versão mais recente...'
                  : `Baixar para macOS (.dmg Universal)${formatSizeMb(release?.assets.macDmg?.sizeBytes)}`}
              </span>
            </a>
            <p className="text-[11px] text-fg-muted px-1">
              Compatível com Apple Silicon (M1–M4) e Intel. Se o Gatekeeper bloquear na 1ª abertura, clique com o botão direito em <strong>Aurtistic.app</strong> → <strong>Abrir</strong>.
            </p>
          </div>
        )}

        {/* Instalação via APT no Linux (sempre visível para Linux e acessível em Outras Plataformas) */}
        {(platform === 'linux' || showOtherPlatforms) && (
          <div className="p-3 rounded-xl border border-border-subtle bg-app mb-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-fg">Instalar / atualizar via terminal Linux (APT)</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(aptCmd);
                  setCopiedApt(true);
                  setTimeout(() => setCopiedApt(false), 2000);
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-border-subtle bg-surface hover:border-[var(--accent-primary)] cursor-pointer"
              >
                {copiedApt ? 'Copiado!' : 'Copiar comando'}
              </button>
            </div>
            <code className="block text-[11px] font-mono text-fg-muted break-all select-all">
              {aptCmd}
            </code>
          </div>
        )}

        {/* Bloco secundário colapsável: Outras plataformas */}
        <div className="mb-4">
          {platform !== 'unknown' && (
            <button
              type="button"
              onClick={() => setShowOtherPlatforms((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg cursor-pointer mb-2"
            >
              <span className="material-symbols-outlined text-[16px]">
                {showOtherPlatforms ? 'expand_less' : 'expand_more'}
              </span>
              <span>Outras plataformas (Android, iOS, Windows, Linux e macOS)</span>
            </button>
          )}

          {showOtherPlatforms && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <a
                href={DEFAULT_PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-border-subtle bg-app hover:border-[var(--accent-primary)] transition-colors flex flex-col gap-1"
              >
                <span className="text-xs font-bold text-fg">Android (Mobile)</span>
                <span className="text-[11px] text-fg-muted">Google Play Store</span>
              </a>

              <div className="p-3 rounded-xl border border-border-subtle bg-app flex flex-col gap-1">
                <span className="text-xs font-bold text-fg">iOS / iPadOS</span>
                <span className="text-[11px] text-fg-muted">Safari → Compartilhar → Tela de Início</span>
              </div>

              <a
                href={release?.assets.windowsExe?.url || fallbackReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-border-subtle bg-app hover:border-[var(--accent-primary)] transition-colors flex flex-col gap-1"
              >
                <span className="text-xs font-bold text-fg">Windows 10/11</span>
                <span className="text-[11px] text-fg-muted">Instalador (.exe)</span>
              </a>

              <div className="p-3 rounded-xl border border-border-subtle bg-app flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-bold text-fg">Linux (Zorin OS / Ubuntu)</span>
                <div className="flex flex-wrap gap-1.5">
                  <a
                    href={release?.assets.linuxDeb?.url || fallbackReleaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] hover:underline"
                  >
                    .deb
                  </a>
                  <a
                    href={release?.assets.linuxAppImage?.url || fallbackReleaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-hover text-fg hover:underline"
                  >
                    .AppImage
                  </a>
                </div>
              </div>

              <a
                href={release?.assets.macDmg?.url || fallbackReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-border-subtle bg-app hover:border-[var(--accent-primary)] transition-colors flex flex-col gap-1"
              >
                <span className="text-xs font-bold text-fg">macOS</span>
                <span className="text-[11px] text-fg-muted">Imagem Universal (.dmg)</span>
              </a>
            </div>
          )}
        </div>

        {/* Configuração opcional de rede local (LAN) sem IP fixo */}
        <div className="p-3 rounded-xl border border-border-subtle bg-app">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <span className="text-xs font-bold text-fg block">Endereço da Rede Local de Casa (Opcional)</span>
              <span className="text-[11px] text-fg-muted">
                Usado automaticamente no App Desktop e no Celular quando estiver em casa. Fora de casa, usa HTTPS automaticamente.
              </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={lanUrl}
              onChange={(e) => setLanUrl(e.target.value)}
              placeholder="Ex.: http://192.168.0.100:8080"
              className="flex-1 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs text-fg"
            />
            <button
              type="button"
              onClick={() => void handleSaveLan()}
              className="px-3 py-1.5 rounded-lg bg-surface border border-border-subtle hover:border-[var(--accent-primary)] text-xs font-bold cursor-pointer shrink-0"
            >
              {lanProbeStatus === 'testing' ? 'Testando...' : 'Salvar e Testar'}
            </button>
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoDetectLan}
              onChange={(e) => setAutoDetectLan(e.target.checked)}
            />
            Detectar rede local automaticamente antes de enviar arquivos grandes
          </label>
          {lanProbeStatus === 'ok' && (
            <p className="text-[11px] text-emerald-500 mt-1 font-semibold">
              Servidor local acessível nesta rede!
            </p>
          )}
          {lanProbeStatus === 'fail' && (
            <p className="text-[11px] text-amber-400 mt-1">
              Endereço LAN inacessível no momento (ou bloqueado por HTTPS do navegador). O acesso remoto HTTPS continua funcionando normalmente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
