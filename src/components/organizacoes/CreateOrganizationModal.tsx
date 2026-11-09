// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/CreateOrganizationModal.tsx
'use client';

import React, { useState } from 'react';
import { createOrganizationAction } from '@/app/(dashboard)/organizacoes/actions';

export interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatedSuccess: (orgId: string, orgName: string) => void;
}

export function CreateOrganizationModal({
  isOpen,
  onClose,
  onCreatedSuccess,
}: CreateOrganizationModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!slug || slug === val.slice(0, -1).toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_-]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 30)
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await createOrganizationAction({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
      });

      if (!res.ok || !res.organization) {
        setErrorMsg(res.error || 'Falha ao criar organização.');
      } else {
        onCreatedSuccess(res.organization.id, res.organization.name);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao criar organização.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-teal-400">add_business</span>
            <div>
              <h2 className="text-base font-bold text-fg">Criar Nova Organização</h2>
              <p className="text-xs text-fg-muted">Workspace colaborativo para sua equipe, laboratório ou ateliê.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nome da Organização *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Laboratório de Divulgação Científica"
              value={name}
              onChange={handleNameChange}
              className="w-full rounded-lg border border-border-subtle bg-app px-3 py-2 text-xs text-fg placeholder-slate-600 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Identificador / Slug Único *
            </label>
            <div className="flex items-center rounded-lg border border-border-subtle bg-app px-3 py-1.5 focus-within:border-teal-500">
              <span className="text-xs text-slate-500 font-mono">/org/</span>
              <input
                type="text"
                required
                placeholder="labdiv"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                className="w-full bg-transparent px-1 py-0.5 text-xs text-fg placeholder-slate-600 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Descrição do Propósito
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Pesquisa, desenvolvimento de projetos e extensão comunitária."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-app px-3 py-2 text-xs text-fg placeholder-slate-600 focus:border-teal-500 focus:outline-none resize-none"
            />
          </div>

          <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[11px] leading-relaxed">
            💡 Como criador, você será automaticamente o <strong>Administrador</strong> desta organização com permissão de escrita no <strong>Org Vault de 25 GB</strong> no servidor.
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-rose-400">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-fg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-md"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">check</span>
              )}
              Criar Organização
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

