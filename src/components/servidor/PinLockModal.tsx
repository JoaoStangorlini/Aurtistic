// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { resolveClientEdgeServerUrl } from '@/lib/edge-urls';

export interface PinLockModalProps {
  isOpen: boolean;
  mode: 'unlock' | 'set' | 'remove';
  folderPath: string;
  pinHint?: string;
  ticket: string;
  serverUrl?: string;
  onClose: () => void;
  onSuccess: (folderPath: string, mode: 'unlock' | 'set' | 'remove') => void;
}

export function PinLockModal({
  isOpen,
  mode,
  folderPath,
  pinHint,
  ticket,
  serverUrl,
  onClose,
  onSuccess,
}: PinLockModalProps) {
  const [pin, setPin] = useState('');
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const base = resolveClientEdgeServerUrl(serverUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      setError('O PIN deve conter entre 4 e 8 dígitos numéricos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint =
        mode === 'unlock'
          ? `${base}/api/tenant/pin/verify`
          : mode === 'set'
            ? `${base}/api/tenant/pin/set`
            : `${base}/api/tenant/pin`;

      const res = await fetch(endpoint, {
        method: mode === 'remove' ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-ticket': ticket,
        },
        body: JSON.stringify({
          folderPath,
          pin: cleanPin,
          ...(mode === 'set' ? { hint: hint.trim() } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Falha na operação de PIN.');
      }

      setPin('');
      setHint('');
      onSuccess(folderPath, mode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao validar PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#9D4EDD]/15 border border-[#9D4EDD]/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#9D4EDD] text-[22px]">
                {mode === 'unlock' ? 'lock_open' : mode === 'set' ? 'enhanced_encryption' : 'no_encryption'}
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-fg">
                {mode === 'unlock'
                  ? 'Desbloquear Pasta com PIN'
                  : mode === 'set'
                    ? 'Proteger Pasta com PIN'
                    : 'Remover PIN da Pasta'}
              </h3>
              <p className="text-xs text-fg-secondary truncate max-w-[240px]">/{folderPath}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-hover"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {mode === 'unlock' && pinHint && (
          <div className="mb-4 p-3 rounded-lg bg-app border border-border-subtle text-xs text-fg-secondary">
            <span className="font-bold text-[#FFCC00]">Dica do PIN:</span> {pinHint}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#F14343]/10 border border-[#F14343]/40 text-xs text-[#ffb4ab]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-fg-secondary uppercase tracking-wider mb-1.5">
              PIN Numérico (4 a 8 dígitos)
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full bg-app border border-border-subtle focus:border-[#9D4EDD] rounded-lg px-4 py-2.5 text-center text-lg tracking-[0.4em] font-bold text-fg outline-none"
            />
          </div>

          {mode === 'set' && (
            <div>
              <label className="block text-xs font-bold text-fg-secondary uppercase tracking-wider mb-1.5">
                Dica de Lembrete (Opcional)
              </label>
              <input
                type="text"
                maxLength={80}
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Ex: Ano do primeiro ensaio"
                className="w-full bg-app border border-border-subtle focus:border-[#9D4EDD] rounded-lg px-3.5 py-2 text-sm text-fg outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-bold text-fg-secondary hover:text-fg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="px-5 py-2 rounded-lg bg-[#9D4EDD] hover:bg-[#8B38CC] text-fg text-xs font-bold transition-colors disabled:opacity-50"
            >
              {loading
                ? 'Validando...'
                : mode === 'unlock'
                  ? 'Desbloquear'
                  : mode === 'set'
                    ? 'Ativar PIN'
                    : 'Remover PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

