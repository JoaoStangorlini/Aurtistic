// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useState } from 'react';
import type { PostBackupStoragePolicy, SmartBackupPreferences } from '@/types/storage';

export const DEFAULT_SMART_BACKUP_PREFS: SmartBackupPreferences = {
  wifiOnly: true,
  backgroundSyncEnabled: false,
  postBackupPolicy: 'keep_original',
  compressedMaxEdgePx: 1600,
  compressedQuality: 0.78,
};

const STORAGE_KEY = 'aurtistic_smart_backup_prefs_v1';

export function loadSmartBackupPreferences(): SmartBackupPreferences {
  if (typeof window === 'undefined') return DEFAULT_SMART_BACKUP_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SMART_BACKUP_PREFS;
    return { ...DEFAULT_SMART_BACKUP_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SMART_BACKUP_PREFS;
  }
}

export function saveSmartBackupPreferences(prefs: SmartBackupPreferences) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { }
}

interface SmartBackupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (prefs: SmartBackupPreferences) => void;
}

export function SmartBackupSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: SmartBackupSettingsModalProps) {
  const [prefs, setPrefs] = useState<SmartBackupPreferences>(DEFAULT_SMART_BACKUP_PREFS);

  useEffect(() => {
    if (isOpen) {
      setPrefs(loadSmartBackupPreferences());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    saveSmartBackupPreferences(prefs);

    // Se rodar no Capacitor Android, agenda ou cancela o WorkManager Unmetered
    try {
      const cap = (window as any).Capacitor;
      const plugin = cap?.Plugins?.SmartBackup;
      if (plugin?.configureBackgroundSync) {
        await plugin.configureBackgroundSync({
          enabled: prefs.backgroundSyncEnabled,
          wifiOnly: prefs.wifiOnly,
        });
      }
    } catch { }

    onSaved?.(prefs);
    onClose();
  };

  const policies: { id: PostBackupStoragePolicy; title: string; desc: string; nativeOnly?: boolean }[] = [
    {
      id: 'keep_original',
      title: 'A) Manter foto original no aparelho',
      desc: 'Faz backup completo para o servidor Edge sem alterar nem remover os arquivos locais.',
    },
    {
      id: 'delete_local',
      title: 'B) Apagar do aparelho após backup verificado',
      desc: 'Disponível no app Android nativo: remove o arquivo local somente após validação SHA-256 no servidor.',
      nativeOnly: true,
    },
    {
      id: 'replace_compressed',
      title: 'C) Substituir local por versão comprimida leve (Anti-Loop)',
      desc: 'Disponível no app Android nativo: mantém original no Edge e cria proxy assinado no aparelho.',
      nativeOnly: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border-subtle bg-surface p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div>
            <h3 className="text-lg font-black text-white">Backup Inteligente &amp; Gestão de Espaço</h3>
            <p className="text-xs text-fg-muted">Controle de rede Wi-Fi, execução em 2º plano e política pós-envio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-white text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-xl border border-border-subtle bg-app cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.wifiOnly}
              onChange={(e) => setPrefs((p) => ({ ...p, wifiOnly: e.target.checked }))}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-bold text-white">Sincronizar Somente via Wi-Fi (Unmetered)</div>
              <div className="text-xs text-fg-muted">
                Bloqueia uploads automáticos e Sync do Portfólio em redes móveis (4G/5G) ou roteadores medidos.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-border-subtle bg-app cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.backgroundSyncEnabled}
              onChange={(e) => setPrefs((p) => ({ ...p, backgroundSyncEnabled: e.target.checked }))}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-bold text-white">Executar Backup em Segundo Plano</div>
              <div className="text-xs text-fg-muted">
                No Android, agenda WorkManager com restrição de Wi-Fi Unmetered mesmo com o app fechado.
              </div>
            </div>
          </label>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-fg-muted">
            Política Pós-Backup Verificado (SHA-256)
          </div>
          {policies.map((pol) => {
            const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
            const isDisabled = Boolean(pol.nativeOnly && !isNative);

            return (
              <label
                key={pol.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed border-border-subtle bg-app'
                    : prefs.postBackupPolicy === pol.id
                    ? 'border-teal-500 bg-teal-500/10 cursor-pointer'
                    : 'border-border-subtle bg-app hover:border-border-strong cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="postBackupPolicy"
                  disabled={isDisabled}
                  checked={prefs.postBackupPolicy === pol.id}
                  onChange={() => !isDisabled && setPrefs((p) => ({ ...p, postBackupPolicy: pol.id }))}
                  className="mt-1"
                />
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>{pol.title}</span>
                    {isDisabled && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        App Android Nativo
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-fg-muted mt-0.5">{pol.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-bold text-fg-secondary hover:text-white cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-[#FFCC00] text-black text-xs font-black hover:bg-[#e6b800] cursor-pointer"
          >
            Salvar Preferências
          </button>
        </div>
      </div>
    </div>
  );
}

