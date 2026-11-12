// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationRequestsPanel.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Organization, OrganizationSubteam } from '@/types/organizations';

export type RequestItemType = 'pedido' | 'sugestao';
export type RequestPriority = 'Baixa' | 'Média' | 'Alta' | 'Urgente';
export type RequestStatus = 'Pendente' | 'Em Análise' | 'Aprovado / Atendido' | 'Arquivado';

export interface OrgDemandItem {
  id: string;
  type: RequestItemType;
  title: string;
  description: string;
  subteam_id?: string | null;
  priority: RequestPriority;
  status: RequestStatus;
  created_by_name: string;
  created_at: string;
  admin_response?: string | null;
  resolved_at?: string | null;
}

export interface OrganizationRequestsPanelProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  currentUserId?: string;
  currentUserName?: string;
  isAdmin?: boolean;
}

const STORAGE_KEY_PREFIX = 'aurtistic_org_demands_';

export function OrganizationRequestsPanel({
  organization,
  subteams,
  currentUserId,
  currentUserName = 'Membro da Equipe',
  isAdmin = false,
}: OrganizationRequestsPanelProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${organization.id}`;
  const [items, setItems] = useState<OrgDemandItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Filtros
  const [typeFilter, setTypeFilter] = useState<'all' | RequestItemType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');

  // Formulário de Criação
  const [demandType, setDemandType] = useState<RequestItemType>('pedido');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subteamId, setSubteamId] = useState<string>('');
  const [priority, setPriority] = useState<RequestPriority>('Média');

  // Resposta administrativa
  const [respondingItemId, setRespondingItemId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responseStatus, setResponseStatus] = useState<RequestStatus>('Aprovado / Atendido');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      } else {
        // Demandas semente para demonstração e clareza
        const seed: OrgDemandItem[] = [
          {
            id: 'demand-seed-1',
            type: 'pedido',
            title: 'Leitor de cartão SD USB para fotos de campo',
            description: 'Necessário para descarregar fotos da Canon no cofre durante eventos externos.',
            subteam_id: subteams.find((s) => s.name.toLowerCase().includes('comunic'))?.id || null,
            priority: 'Alta',
            status: 'Pendente',
            created_by_name: 'Equipe de Mídia',
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
          {
            id: 'demand-seed-2',
            type: 'sugestao',
            title: 'Pausa de 5 minutos antes do início de reuniões presenciais',
            description: 'Reduz sobrecarga sensorial para membros neurodivergentes antes da pauta principal.',
            subteam_id: null,
            priority: 'Média',
            status: 'Em Análise',
            created_by_name: 'Membro do Laboratório',
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
          },
        ];
        setItems(seed);
        localStorage.setItem(storageKey, JSON.stringify(seed));
      }
    } catch {}
    setIsLoaded(true);
  }, [storageKey, subteams]);

  const saveItems = useCallback(
    (newItems: OrgDemandItem[]) => {
      setItems(newItems);
      try {
        localStorage.setItem(storageKey, JSON.stringify(newItems));
      } catch {}
    },
    [storageKey]
  );

  const handleCreateDemand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const newItem: OrgDemandItem = {
      id: `demand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: demandType,
      title: title.trim(),
      description: description.trim(),
      subteam_id: subteamId || null,
      priority,
      status: 'Pendente',
      created_by_name: currentUserName,
      created_at: new Date().toISOString(),
    };

    saveItems([newItem, ...items]);
    setTitle('');
    setDescription('');
    setSubteamId('');
    setPriority('Média');
    setIsFormOpen(false);
  };

  const handleSaveAdminResponse = (itemId: string) => {
    const updated = items.map((it) => {
      if (it.id === itemId) {
        return {
          ...it,
          status: responseStatus,
          admin_response: responseText.trim() || it.admin_response,
          resolved_at: responseStatus === 'Aprovado / Atendido' ? new Date().toISOString() : it.resolved_at,
        };
      }
      return it;
    });
    saveItems(updated);
    setRespondingItemId(null);
    setResponseText('');
  };

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      return true;
    });
  }, [items, typeFilter, statusFilter]);

  if (!isLoaded) return null;

  return (
    <div className="p-4 md:p-5 bg-surface border border-border-subtle rounded-2xl shadow-lg space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[22px] text-amber-400">
            forward_to_inbox
          </span>
          <div>
            <h3 className="text-sm font-bold text-fg uppercase tracking-wider font-['Bukra']">
              Canal de Pedidos & Sugestões da Organização
            </h3>
            <p className="text-xs text-fg-secondary">
              Espaço transparente para solicitar materiais, insumos, acessos e propor melhorias de processo.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isFormOpen ? 'expand_less' : 'add'}
          </span>
          <span>{isFormOpen ? 'Fechar Formulário' : 'Novo Pedido ou Sugestão'}</span>
        </button>
      </div>

      {/* Formulário de Envio */}
      {isFormOpen && (
        <form
          onSubmit={handleCreateDemand}
          className="p-4 rounded-xl bg-app border border-border-subtle space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDemandType('pedido')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                demandType === 'pedido'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-surface border-border-subtle text-fg-muted'
              }`}
            >
              📦 Pedido (Materiais, Acessos, Logística)
            </button>
            <button
              type="button"
              onClick={() => setDemandType('sugestao')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                demandType === 'sugestao'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                  : 'bg-surface border-border-subtle text-fg-muted'
              }`}
            >
              💡 Sugestão (Melhoria de Processo, Ideias)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                Título da Demanda *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Aquisição de cabo HDMI longo, Nova dinâmica de intervalo..."
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                Categoria Relacionada
              </label>
              <select
                value={subteamId}
                onChange={(e) => setSubteamId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:border-amber-500 focus:outline-none"
              >
                <option value="">Geral / Toda a Organização</option>
                {subteams.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
              Descrição e Justificativa *
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique o que é necessário, por que faz diferença para o trabalho da equipe e para quando seria ideal..."
              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-fg-muted uppercase">Urgência:</span>
              {(['Baixa', 'Média', 'Alta', 'Urgente'] as RequestPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                    priority === p
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-surface text-fg-muted hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shadow-sm"
              >
                Enviar Demanda
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filtros da Listagem */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-fg-muted uppercase">Tipo:</span>
          {(['all', 'pedido', 'sugestao'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                typeFilter === t
                  ? 'bg-surface text-white border border-border-subtle shadow-sm'
                  : 'text-fg-muted hover:text-white'
              }`}
            >
              {t === 'all' ? 'Todos' : t === 'pedido' ? '📦 Pedidos' : '💡 Sugestões'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-fg-muted uppercase">Status:</span>
          {(['all', 'Pendente', 'Em Análise', 'Aprovado / Atendido', 'Arquivado'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === st
                  ? 'bg-surface text-white border border-border-subtle shadow-sm'
                  : 'text-fg-muted hover:text-white'
              }`}
            >
              {st === 'all' ? 'Todos os Status' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Demandas */}
      <div className="space-y-2.5">
        {filteredItems.length === 0 ? (
          <div className="p-4 rounded-xl bg-app border border-border-subtle text-xs text-fg-muted text-center italic">
            Nenhuma demanda encontrada com os filtros selecionados.
          </div>
        ) : (
          filteredItems.map((it) => {
            const sub = subteams.find((s) => s.id === it.subteam_id);
            const isResponding = respondingItemId === it.id;

            return (
              <div
                key={it.id}
                className="p-3.5 rounded-xl bg-app border border-border-subtle space-y-2.5 hover:border-amber-500/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          it.type === 'pedido'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        }`}
                      >
                        {it.type === 'pedido' ? 'Pedido' : 'Sugestão'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg-secondary">
                        {sub?.name || 'Geral'}
                      </span>
                      <span className="text-[10px] font-mono text-fg-muted">
                        Prioridade: {it.priority}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-fg">{it.title}</h4>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                      it.status === 'Aprovado / Atendido'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : it.status === 'Em Análise'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : it.status === 'Arquivado'
                        ? 'bg-white/5 text-white/40 border border-white/10'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {it.status}
                  </span>
                </div>

                <p className="text-xs text-fg-secondary leading-relaxed">{it.description}</p>

                <div className="flex items-center justify-between text-[10px] text-fg-muted border-t border-border-subtle pt-2">
                  <span>Enviado por: {it.created_by_name}</span>
                  <span>{new Date(it.created_at).toLocaleDateString('pt-BR')}</span>
                </div>

                {/* Resposta do Administrador */}
                {it.admin_response && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 space-y-1">
                    <span className="font-bold block text-emerald-300">Resposta da Coordenação:</span>
                    <p className="text-[11px] text-emerald-200/90">{it.admin_response}</p>
                  </div>
                )}

                {/* Ações de Gestão (Admin) */}
                {isAdmin && (
                  <div className="pt-1">
                    {isResponding ? (
                      <div className="p-3 rounded-lg bg-surface border border-border-subtle space-y-2">
                        <label className="text-[10px] font-bold text-fg-muted uppercase block">
                          Responder Demanda & Atualizar Andamento
                        </label>
                        <textarea
                          rows={2}
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Digite o retorno oficial para o membro..."
                          className="w-full px-2.5 py-1.5 rounded-lg bg-app border border-border-subtle text-xs text-fg focus:outline-none"
                        />
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <select
                            value={responseStatus}
                            onChange={(e) => setResponseStatus(e.target.value as RequestStatus)}
                            className="px-2 py-1 rounded bg-app border border-border-subtle text-xs text-fg focus:outline-none"
                          >
                            <option value="Em Análise">Em Análise</option>
                            <option value="Aprovado / Atendido">Aprovado / Atendido</option>
                            <option value="Arquivado">Arquivado</option>
                          </select>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setRespondingItemId(null)}
                              className="px-2.5 py-1 rounded text-xs text-fg-muted hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveAdminResponse(it.id)}
                              className="px-3 py-1 rounded text-xs font-bold bg-teal-500 text-slate-950 hover:bg-teal-400"
                            >
                              Salvar Resposta
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRespondingItemId(it.id);
                          setResponseText(it.admin_response || '');
                          setResponseStatus(it.status);
                        }}
                        className="text-[11px] font-bold text-teal-300 hover:text-teal-200 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">reply</span>
                        <span>{it.admin_response ? 'Editar Resposta Oficial' : 'Responder Demanda'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

