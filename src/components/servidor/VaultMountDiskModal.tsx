// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  createWebdavTokenDirect,
  listWebdavTokensDirect,
  revokeWebdavTokenDirect,
  type WebdavTokenSummary,
} from '@/lib/edge-client';
import { resolveClientEdgeServerUrl } from '@/lib/edge-urls';
import {
  isAndroidNative,
  isDesktopApp,
  saveAndroidDeviceCredential,
  saveDesktopCredential,
} from '@/lib/native-bridge';
import { DesktopAppDownloadModal } from '@/components/dashboard/DesktopAppDownloadModal';

export interface VaultMountDiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: string;
  ensureFreshTicket: () => Promise<string>;
  serverUrl?: string;
  scopeType: 'user' | 'org';
  scopeSlug: string;
  scopeLabel: string;
  canWrite: boolean;
}

export function VaultMountDiskModal({
  isOpen,
  onClose,
  ticket,
  ensureFreshTicket,
  serverUrl,
  scopeType,
  scopeSlug,
  scopeLabel,
  canWrite,
}: VaultMountDiskModalProps) {
  const [label, setLabel] = useState('Meu Computador');
  const [readOnly, setReadOnly] = useState(!canWrite);
  const [ttlDays, setTtlDays] = useState<30 | 90 | null>(90);

  const [tokens, setTokens] = useState<WebdavTokenSummary[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newCredential, setNewCredential] = useState<{ tokenId: string; secret: string } | null>(null);
  const [secretConfirmed, setSecretConfirmed] = useState(false);
  const [savedToAndroidKeystore, setSavedToAndroidKeystore] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const httpsBaseUrl = resolveClientEdgeServerUrl(serverUrl);
  const webdavHttpUrl = `${httpsBaseUrl}/webdav/cofre`;
  const davsHost = (() => {
    try {
      return new URL(webdavHttpUrl).host;
    } catch {
      return 'storage.hublabdiv.com.br';
    }
  })();

  const loadTokens = useCallback(async () => {
    if (!isOpen) return;
    setLoadingTokens(true);
    setErrorMsg(null);
    try {
      const fresh = await ensureFreshTicket().catch(() => ticket);
      if (!fresh) return;
      const list = await listWebdavTokensDirect({ ticket: fresh, serverUrl });
      setTokens(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao listar credenciais.');
    } finally {
      setLoadingTokens(false);
    }
  }, [isOpen, ensureFreshTicket, ticket, serverUrl]);

  useEffect(() => {
    if (isOpen) {
      setReadOnly(!canWrite);
      if (scopeType === 'org' && ttlDays === null) {
        setTtlDays(90);
      }
      void loadTokens();
    } else {
      setNewCredential(null);
      setSecretConfirmed(false);
      setSavedToAndroidKeystore(false);
      setErrorMsg(null);
    }
  }, [isOpen, canWrite, scopeType, ttlDays, loadTokens]);

  if (!isOpen) return null;

  const copyText = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleCreateToken = async () => {
    setCreating(true);
    setErrorMsg(null);
    setSavedToAndroidKeystore(false);
    try {
      const fresh = await ensureFreshTicket().catch(() => ticket);
      const created = await createWebdavTokenDirect({
        ticket: fresh,
        serverUrl,
        label: label.trim() || 'Dispositivo Aurtistic',
        readOnly: !canWrite || readOnly,
        ttlDays: scopeType === 'org' ? (ttlDays || 90) : ttlDays,
      });
      setNewCredential({ tokenId: created.tokenId, secret: created.secret });
      setSecretConfirmed(false);

      // No App Desktop Electron, grava a credencial direto no safeStorage (Keyring/DPAPI)
      if (isDesktopApp()) {
        const scopeKey = scopeType === 'org' ? `org:${scopeSlug}` : 'personal';
        const deskRes = await saveDesktopCredential({
          scopeKey,
          tokenId: created.tokenId,
          secret: created.secret,
        });
        if (!deskRes.ok && deskRes.error) {
          setErrorMsg(deskRes.error);
        } else if (deskRes.ok) {
          setSavedToAndroidKeystore(true);
        }
      }

      // No Android nativo, grava a credencial direto no Keystore / EncryptedSharedPreferences
      if (isAndroidNative()) {
        const scopeKey = `${scopeType}:${scopeSlug || 'personal'}`;
        const ok = await saveAndroidDeviceCredential({
          credentialScopeKey: scopeKey,
          tokenId: created.tokenId,
          secret: created.secret,
          remoteServerUrl: httpsBaseUrl,
        });
        setSavedToAndroidKeystore(ok);
      }

      await loadTokens();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao criar credencial.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    setErrorMsg(null);
    try {
      const fresh = await ensureFreshTicket().catch(() => ticket);
      await revokeWebdavTokenDirect({ ticket: fresh, serverUrl, tokenId });
      if (newCredential?.tokenId === tokenId) {
        setNewCredential(null);
      }
      await loadTokens();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao revogar credencial.');
    }
  };

  const activeUser = newCredential?.tokenId || '<seu-usuario-token>';
  const davsUrl = `davs://${activeUser}@${davsHost}/webdav/cofre`;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-surface border border-border-subtle rounded-2xl shadow-2xl p-5 sm:p-6 text-fg">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-fg flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent-primary)]">hard_drive</span>
                <span>Acesso Desktop & Disco Remoto — {scopeLabel}</span>
              </h2>
              <p className="text-xs text-fg-muted mt-0.5">
                Escolha o aplicativo completo para sincronização de pastas grandes ou conecte via WebDAV HTTPS.
              </p>
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

          {/* OPÇÃO 1: App Aurtistic Desktop (Recomendado) */}
          <div className="p-4 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/5 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--accent-primary)] text-white">
                    Recomendado
                  </span>
                  <h3 className="text-sm font-bold text-fg">App Aurtistic Desktop (Windows, Linux e macOS)</h3>
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  Substitui montagens manuais: fila persistente sem limite de 100 MB (uploads e downloads resumíveis),
                  espelhamento seletivo de pastas e alarmes na bandeja do sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold hover:brightness-110 transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>Baixar App</span>
              </button>
            </div>
          </div>

          {/* OPÇÃO 2: WebDAV — Internet (HTTPS) */}
          <div className="p-4 rounded-xl border border-border-subtle bg-app mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-emerald-500">public</span>
                <span>WebDAV — Internet (HTTPS)</span>
              </h3>
              <span className="text-[11px] font-mono text-fg-muted">TLS / Cloudflare</span>
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-border-subtle">
                <code className="text-[11px] font-mono text-fg truncate">{webdavHttpUrl}</code>
                <button
                  type="button"
                  onClick={() => void copyText('https', webdavHttpUrl)}
                  className="text-[11px] font-semibold px-2 py-1 rounded border border-border-subtle hover:border-[var(--accent-primary)] cursor-pointer shrink-0"
                >
                  {copiedId === 'https' ? 'Copiado!' : 'Copiar HTTPS'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-border-subtle">
                <code className="text-[11px] font-mono text-fg-muted truncate">{davsUrl}</code>
                <button
                  type="button"
                  onClick={() => void copyText('davs', davsUrl)}
                  className="text-[11px] font-semibold px-2 py-1 rounded border border-border-subtle hover:border-[var(--accent-primary)] cursor-pointer shrink-0"
                >
                  {copiedId === 'davs' ? 'Copiado!' : 'Copiar davs://'}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-amber-400/90 mb-3">
              Nota: via WebDAV pelo túnel Cloudflare, arquivos individuais acima de 100 MB exigem o App Desktop ou o gerenciador de envios em partes do site.
            </p>

            {/* Gerar Credencial Revogável */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Nome do dispositivo"
                className="sm:col-span-2 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs text-fg"
              />
              <select
                value={readOnly ? 'ro' : 'rw'}
                disabled={!canWrite}
                onChange={(e) => setReadOnly(e.target.value === 'ro')}
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs text-fg"
              >
                {canWrite && <option value="rw">Leitura e Escrita</option>}
                <option value="ro">Somente Leitura</option>
              </select>
              <select
                value={ttlDays === null ? 'never' : String(ttlDays)}
                onChange={(e) => {
                  const v = e.target.value;
                  setTtlDays(v === 'never' ? null : (Number(v) as 30 | 90));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs text-fg"
              >
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
                {scopeType === 'user' && <option value="never">Sem expiração</option>}
              </select>
            </div>

            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={() => void handleCreateToken()}
                disabled={creating}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-secondary,#FFCC00)] text-black text-xs font-bold hover:brightness-105 cursor-pointer disabled:opacity-50"
              >
                {creating ? 'Gerando...' : 'Gerar credencial de dispositivo'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
              {errorMsg}
            </div>
          )}

          {newCredential && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
              <p className="font-bold text-emerald-400 mb-2">
                Credencial gerada (copie o segredo agora — não será exibido novamente)
              </p>
              {savedToAndroidKeystore && (
                <p className="text-[11px] text-emerald-300 mb-2">
                  Credencial salva com segurança no Android Keystore deste aparelho para envios e downloads com a tela bloqueada.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-border-subtle">
                  <span className="font-mono truncate">Usuário: {newCredential.tokenId}</span>
                  <button
                    type="button"
                    onClick={() => void copyText('u', newCredential.tokenId)}
                    className="px-2 py-0.5 rounded border border-border-subtle text-[11px] cursor-pointer"
                  >
                    {copiedId === 'u' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-border-subtle">
                  <span className="font-mono truncate">Segredo: {newCredential.secret}</span>
                  <button
                    type="button"
                    onClick={() => void copyText('s', newCredential.secret)}
                    className="px-2 py-0.5 rounded border border-border-subtle text-[11px] cursor-pointer"
                  >
                    {copiedId === 's' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] text-fg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={secretConfirmed}
                  onChange={(e) => setSecretConfirmed(e.target.checked)}
                />
                Já copiei/salvei o segredo deste dispositivo
              </label>
            </div>
          )}

          {/* Lista estável de dispositivos conectados */}
          <div className="min-h-[72px]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-fg-muted mb-2">
              Dispositivos Conectados ({tokens.length})
            </h4>
            {loadingTokens && tokens.length === 0 ? (
              <p className="text-xs text-fg-muted">Carregando credenciais...</p>
            ) : tokens.length === 0 ? (
              <p className="text-xs text-fg-muted">Nenhuma credencial ativa para este cofre.</p>
            ) : (
              <div className="space-y-1.5">
                {tokens.map((tok) => (
                  <div
                    key={tok.tokenId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border-subtle bg-app text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-fg truncate">
                        {tok.label} <span className="font-mono font-normal text-fg-muted">({tok.tokenId})</span>
                      </p>
                      <p className="text-[11px] text-fg-muted">
                        {tok.readOnly ? 'Somente Leitura' : 'Leitura e Escrita'} •{' '}
                        {tok.expiresAt
                          ? `Expira em ${new Date(tok.expiresAt).toLocaleDateString('pt-BR')}`
                          : 'Sem expiração'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevokeToken(tok.tokenId)}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 font-bold cursor-pointer shrink-0"
                    >
                      Revogar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DesktopAppDownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
      />
    </>
  );
}
