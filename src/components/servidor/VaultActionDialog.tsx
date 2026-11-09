// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface VaultActionDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  mode?: 'confirm' | 'prompt' | 'danger' | 'alert';
  icon?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (val?: string) => void;
  onCancel: () => void;
}

function VaultActionDialogContent({
  title,
  description,
  mode = 'confirm',
  icon,
  confirmLabel,
  cancelLabel = 'Cancelar',
  defaultValue = '',
  placeholder = '',
  onConfirm,
  onCancel,
}: Omit<VaultActionDialogProps, 'isOpen'>) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'prompt') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const defaultIcon =
    icon ||
    (mode === 'danger'
      ? 'delete'
      : mode === 'alert'
        ? 'info'
        : mode === 'prompt'
          ? 'edit'
          : 'help_outline');

  const defaultConfirmLabel =
    confirmLabel ||
    (mode === 'danger'
      ? 'Excluir'
      : mode === 'alert'
        ? 'Entendido'
        : mode === 'prompt'
          ? 'Salvar'
          : 'Confirmar');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'prompt') {
      if (inputValue.trim()) {
        onConfirm(inputValue.trim());
      }
    } else {
      onConfirm();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vault-dialog-title"
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-surface border border-border-subtle rounded-2xl shadow-2xl max-w-md w-full p-6 text-fg relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                mode === 'danger'
                  ? 'bg-[#F14343]/10 border-[#F14343]/30 text-[#F14343]'
                  : 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">
                {defaultIcon}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h3
                id="vault-dialog-title"
                className="text-base font-bold text-fg leading-snug"
              >
                {title}
              </h3>
              {description && (
                <p className="text-xs text-fg-secondary mt-1 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {mode === 'prompt' && (
            <div className="pt-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                required
                className="w-full rounded-xl border border-border-subtle bg-app p-2.5 text-xs text-fg placeholder:text-fg-muted focus:border-[var(--accent-primary)] focus:outline-none transition-colors"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-subtle">
            {mode !== 'alert' && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl bg-app hover:bg-surface-hover text-fg text-xs font-semibold border border-border-subtle transition-colors"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="submit"
              disabled={mode === 'prompt' && !inputValue.trim()}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
                mode === 'danger'
                  ? 'bg-[#F14343] hover:bg-[#D63030] text-white'
                  : 'bg-[var(--accent-primary)] hover:opacity-90 text-white dark:text-[#121212]'
              }`}
            >
              {defaultConfirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function VaultActionDialog(props: VaultActionDialogProps) {
  if (!props.isOpen) return null;
  return (
    <VaultActionDialogContent
      key={`${props.isOpen}-${props.defaultValue || ''}-${props.title}`}
      {...props}
    />
  );
}
