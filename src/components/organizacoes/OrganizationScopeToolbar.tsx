// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationScopeToolbar.tsx
'use client';

import React, { useState } from 'react';
import type { Organization } from '@/types/organizations';
import { JoinOrganizationModal } from './JoinOrganizationModal';
import { CreateOrganizationModal } from './CreateOrganizationModal';

export interface OrganizationScopeToolbarProps {
  currentScope: 'all' | 'individual' | 'organization';
  onScopeChange: (scope: 'all' | 'individual' | 'organization') => void;
  organizations: Organization[];
  activeOrgId: string | null;
  onSelectOrg: (orgId: string) => void;
  onJoinedOrg: (orgId: string, orgName: string) => void;
  onCreatedOrg: (orgId: string, orgName: string) => void;
  onToggleManageOrg?: () => void;
  isManagingOrg?: boolean;
}

export function OrganizationScopeToolbar({
  currentScope,
  onScopeChange,
  organizations,
  activeOrgId,
  onSelectOrg,
  onJoinedOrg,
  onCreatedOrg,
  onToggleManageOrg,
  isManagingOrg = false,
}: OrganizationScopeToolbarProps) {
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0] || null;

  // Quando o usuário não possui nenhuma organização cadastrada
  if (!organizations || organizations.length === 0) {
    return (
      <div data-tour="org-scope-toolbar" className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface border border-border-subtle rounded-2xl p-2.5 shadow-md mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider px-2">
            Escopo:
          </span>
          <span className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-[var(--accent-secondary)] text-[var(--on-accent-secondary)] shadow-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">person</span>
            Individual
          </span>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setIsJoinModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3.5 py-1.5 text-xs font-bold text-teal-600 dark:text-teal-300 hover:bg-teal-500/20 transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">domain_add</span>
            🏛️ + Entrar com Código ou Criar Organização
          </button>
        </div>

        <JoinOrganizationModal
          isOpen={isJoinModalOpen}
          onClose={() => setIsJoinModalOpen(false)}
          onJoinedSuccess={(orgId, orgName) => {
            onJoinedOrg(orgId, orgName);
            onScopeChange('organization');
          }}
        />

        <CreateOrganizationModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreatedSuccess={(orgId, orgName) => {
            onCreatedOrg(orgId, orgName);
            onScopeChange('organization');
          }}
        />
      </div>
    );
  }

  return (
    <div data-tour="org-scope-toolbar" className="w-full flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface border border-border-subtle rounded-2xl p-2.5 shadow-md mb-3">
      {/* Lado Esquerdo: Alternância de Escopo ([Tudo] vs [Individual] vs [Organização]) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider px-2">
          Escopo:
        </span>

        {/* Botão Tudo (Pessoal + Organizações unificados) */}
        <button
          type="button"
          onClick={() => onScopeChange('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            currentScope === 'all'
              ? 'bg-[var(--accent-primary)] text-[var(--on-accent-primary)] shadow-sm font-black'
              : 'bg-app text-fg-secondary hover:text-fg border border-border-subtle hover:bg-surface-hover'
          }`}
          title="Ver tarefas e eventos individuais e de todas as organizações"
        >
          <span className="material-symbols-outlined text-[16px]">public</span>
          Tudo
        </button>

        {/* Botão Individual */}
        <button
          type="button"
          onClick={() => onScopeChange('individual')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            currentScope === 'individual'
              ? 'bg-[var(--accent-secondary)] text-[var(--on-accent-secondary)] shadow-sm font-black'
              : 'bg-app text-fg-secondary hover:text-fg border border-border-subtle hover:bg-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">person</span>
          Individual
        </button>

        {/* Botão Organização */}
        <button
          type="button"
          onClick={() => {
            onScopeChange('organization');
            const targetOrgId = activeOrgId || (organizations.length > 0 ? organizations[0].id : null);
            if (targetOrgId) {
              onSelectOrg(targetOrgId);
            }
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            currentScope === 'organization'
              ? 'bg-teal-500 text-slate-950 shadow-sm font-black'
              : 'bg-app text-fg-secondary hover:text-fg border border-border-subtle hover:bg-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">domain</span>
          Organização
          {organizations.length > 0 && (
            <span className="rounded-full bg-slate-900/60 px-1.5 py-0.2 text-[10px] text-teal-300 font-mono">
              {organizations.length}
            </span>
          )}
        </button>

        {/* Dropdown / Seletor de Organizações (Quando Modo Organização está Ativo) */}
        {currentScope === 'organization' && organizations.length > 0 && (
          <div className="flex items-center gap-1.5 pl-1 animate-in fade-in duration-200">
            {organizations.length === 1 ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-200 shadow-inner">
                <span className="text-[14px]">🏛️</span>
                <span>{organizations[0].name}</span>
              </div>
            ) : (
              <select
                value={activeOrgId || activeOrg?.id || ''}
                onChange={(e) => onSelectOrg(e.target.value)}
                className="rounded-xl border border-teal-500/40 bg-surface px-3 py-1.5 text-xs font-bold text-fg focus:border-teal-500 focus:outline-none cursor-pointer"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    🏛️ {org.name}
                  </option>
                ))}
              </select>
            )}

            {/* Botão de Atalho para o Módulo de Gestão da Organização */}
            {onToggleManageOrg && (
              <button
                type="button"
                onClick={onToggleManageOrg}
                title="Abrir módulo de gestão, membros e convites desta organização"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  isManagingOrg
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-app text-teal-600 dark:text-teal-400 border border-teal-500/30 hover:bg-teal-500/20'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">settings</span>
                {isManagingOrg ? 'Ver Tarefas' : 'Gerenciar'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lado Direito: Ações Imediatas (Entrar com Código / Criar Organização) */}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => setIsJoinModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-teal-600 dark:text-teal-300 hover:bg-teal-500/20 transition-colors shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">vpn_key</span>
          Entrar com Código
        </button>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          Criar Organização
        </button>
      </div>

      {/* Modais Integrados */}
      <JoinOrganizationModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onJoinedSuccess={(orgId, orgName) => {
          onJoinedOrg(orgId, orgName);
          onScopeChange('organization');
        }}
      />

      <CreateOrganizationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreatedSuccess={(orgId, orgName) => {
          onCreatedOrg(orgId, orgName);
          onScopeChange('organization');
        }}
      />
    </div>
  );
}

