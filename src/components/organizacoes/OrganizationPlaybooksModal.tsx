// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationPlaybooksModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import type {
  OrganizationSubteam,
  OrganizationTaskTemplate,
} from '@/types/organizations';
import {
  getOrganizationTaskTemplatesAction,
  createOrganizationTaskTemplateAction,
  applyPlaybookToTasksAction,
} from '@/app/(dashboard)/organizacoes/actions';

export interface OrganizationPlaybooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  subteams: OrganizationSubteam[];
  onPlaybookApplied?: () => void;
}

export function OrganizationPlaybooksModal({
  isOpen,
  onClose,
  organizationId,
  subteams,
  onPlaybookApplied,
}: OrganizationPlaybooksModalProps) {
  const [templates, setTemplates] = useState<OrganizationTaskTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSubteamId, setNewSubteamId] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !organizationId) return;
    setLoading(true);
    getOrganizationTaskTemplatesAction(organizationId)
      .then((res) => {
        if (res.ok && res.templates) setTemplates(res.templates);
      })
      .finally(() => setLoading(false));
  }, [isOpen, organizationId]);

  if (!isOpen) return null;

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const checklistItems = newChecklistText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text, done: false }));

    const res = await createOrganizationTaskTemplateAction({
      organizationId,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      subteamId: newSubteamId || undefined,
      checklistItems,
    });

    if (res.ok && res.template) {
      setTemplates((prev) => [res.template, ...prev]);
      setIsCreating(false);
      setNewTitle('');
      setNewDesc('');
      setNewChecklistText('');
    }
  };

  const handleApply = async (templateId: string) => {
    setApplyingId(templateId);
    setStatusMsg(null);
    try {
      const res = await applyPlaybookToTasksAction({
        organizationId,
        templateId,
      });
      if (res.ok) {
        setStatusMsg('Playbook instanciado com sucesso em suas tarefas!');
        onPlaybookApplied?.();
        setTimeout(() => setStatusMsg(null), 3500);
      }
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[24px] text-[var(--accent-secondary)]">
              play_shapes
            </span>
            <div>
              <h2 className="text-base font-bold text-fg font-['Bukra']">
                Playbooks & Templates de Equipe
              </h2>
              <p className="text-xs text-fg-secondary">
                Rotinas operacionais padronizadas que geram tarefas e subtarefas em 1 clique.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-secondary hover:text-fg hover:bg-app transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {statusMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Corpo com Lista ou Criação */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-4 flex-1">
          {isCreating ? (
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                Novo Playbook
              </h3>
              <div>
                <label className="block text-[11px] font-bold text-fg-secondary mb-1">
                  Título do Playbook
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Onboarding de Novo Pesquisador"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-fg outline-none focus:border-[var(--accent-secondary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-fg-secondary mb-1">
                  Subequipe Relacionada (opcional)
                </label>
                <select
                  value={newSubteamId}
                  onChange={(e) => setNewSubteamId(e.target.value)}
                  className="w-full bg-app border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-fg outline-none focus:border-[var(--accent-secondary)]"
                >
                  <option value="">Geral / Todas</option>
                  {subteams.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-fg-secondary mb-1">
                  Passos / Checklist (um por linha)
                </label>
                <textarea
                  rows={4}
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  placeholder="Cadastrar no canal do LabDiv&#10;Apresentar repositório e cofre&#10;Configurar conta e e-mail USP"
                  className="w-full bg-app border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-fg outline-none focus:border-[var(--accent-secondary)]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-fg-secondary hover:text-fg hover:bg-app"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--accent-secondary)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider shadow-sm"
                >
                  Salvar Playbook
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                  {templates.length} Playbooks Disponíveis
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="px-3 py-1.5 rounded-xl bg-app border border-border-subtle hover:border-[var(--accent-secondary)] text-fg text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Criar Playbook</span>
                </button>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-fg-muted">
                  Carregando playbooks...
                </div>
              ) : templates.length === 0 ? (
                <div className="py-12 text-center text-xs text-fg-muted border border-dashed border-border-subtle rounded-2xl">
                  Nenhum playbook cadastrado ainda. Crie o primeiro acima!
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="p-4 rounded-xl bg-app border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[var(--accent-primary)]/40 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <h4 className="text-xs font-bold text-fg truncate">
                          {tmpl.title}
                        </h4>
                        {tmpl.description && (
                          <p className="text-[11px] text-fg-muted line-clamp-1">
                            {tmpl.description}
                          </p>
                        )}
                        <span className="text-[10px] text-[var(--accent-secondary)] block">
                          {tmpl.checklist_items.length} passos no checklist
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={applyingId === tmpl.id}
                        onClick={() => handleApply(tmpl.id)}
                        className="py-2 px-4 rounded-xl bg-[var(--accent-secondary)] text-[#121212] font-black text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        {applyingId === tmpl.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-transparent border-t-[#121212] rounded-full animate-spin"></span>
                        ) : (
                          <span className="material-symbols-outlined text-[16px]">
                            auto_awesome
                          </span>
                        )}
                        <span>Instanciar Tarefas</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
