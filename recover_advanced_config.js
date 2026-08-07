const fs = require('fs');

const content = `'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAdvancedConfig } from '@/app/(dashboard)/actions';

interface AdvancedConfig {
  enable_subtasks?: boolean;
  enable_workspaces?: boolean;
  sync_curriculum_photo?: boolean;
  completion_statuses?: string[];
  
  auto_fill_dimension?: boolean;
  pre_fill_defaults?: boolean;
  default_task_values?: { status?: string, prioridade?: string, categoria?: string, prazo?: string };
  default_display_mode?: 'tarefas' | 'eventos' | 'ambos';
  default_view_mode?: 'list' | 'weekly' | 'monthly';
  start_in_daily_followup?: boolean;
  show_quick_links?: boolean;
  show_quick_filters?: boolean;

  auto_complete_parent?: boolean;
  auto_complete_subtasks?: boolean;
  inherit_parent_attributes?: boolean;
  prevent_parent_completion_if_subtasks_pending?: boolean;

  auto_expand_descriptions?: boolean;
  pin_favorites_to_top?: boolean;
  enable_badge_quick_edit?: boolean;
  show_export_buttons?: boolean;
  confirm_on_delete?: boolean;
  soft_delete_to_discarded?: boolean;
}

export default function AdvancedConfigClient({ 
  initialConfig, 
  availableStatuses,
  availablePriorities,
  availableCategories,
  userEmail
}: { 
  initialConfig: AdvancedConfig, 
  availableStatuses: string[],
  availablePriorities: string[],
  availableCategories: string[],
  userEmail: string
}) {
  const router = useRouter();
  const safeInitialConfig = {
    ...initialConfig,
    default_task_values: initialConfig.default_task_values || {}
  };
  const [config, setConfig] = useState<AdvancedConfig>(safeInitialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(safeInitialConfig);

  const handleToggle = (field: keyof AdvancedConfig) => {
    setConfig(prev => ({
      ...prev,
      [field]: prev[field] === undefined ? true : !prev[field]
    }));
  };

  const handleDefaultValueChange = (field: 'status' | 'prioridade' | 'categoria' | 'prazo', value: string) => {
    setConfig(prev => ({
      ...prev,
      default_task_values: {
        ...(prev.default_task_values || {}),
        [field]: value
      }
    }));
  };

  const toggleCompletionStatus = (status: string) => {
    setConfig(prev => {
      const lower = status.toLowerCase();
      const current = prev.completion_statuses || [];
      const exists = current.includes(lower);
      
      return {
        ...prev,
        completion_statuses: exists 
          ? current.filter(s => s !== lower)
          : [...current, lower]
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateAdvancedConfig(config);
      setSavedSuccess(true);
      router.refresh();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(\`Erro ao salvar: \${err.message}\`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {hasChanges && !savedSuccess && (
        <div className="fixed top-24 right-4 md:right-8 z-50 bg-[#9D4EDD] text-white px-4 py-3 rounded shadow-2xl flex items-center gap-3 border border-[#9D4EDD]/50 animate-pulse">
          <span className="material-symbols-outlined">save</span>
          <div className="flex flex-col">
            <span className="font-bold text-sm">Alterações não salvas</span>
            <span className="text-xs font-medium">Lembre-se de salvar!</span>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="ml-2 bg-[#121212] text-[#9D4EDD] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#2D2D2D] transition-colors disabled:opacity-50">
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      )}
      <div className="max-w-4xl mx-auto space-y-8 pb-32">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-black text-white font-['Bukra'] tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-[32px] text-[#9D4EDD]">tune</span>
            Configurações Avançadas
          </h1>
          <p className="text-[#A0A0A0] mt-2">
            Personalize módulos, desligue funcionalidades que não usa e defina regras customizadas de comportamento.
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          {/* Lado Esquerdo: Módulos */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-[#2D2D2D] pb-2">
              Módulos e Visualização
            </h2>
            
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Espaços de Trabalho</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ativa o painel de Espaços (Workspaces). Se desativado, o Aurtistic será focado em uma única visão central.
                  </p>
                </div>
                <button onClick={() => handleToggle('enable_workspaces')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.enable_workspaces ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.enable_workspaces ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Preenchimento Automático da Dimensão</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Preenche automaticamente a dimensão ao criar uma nova tarefa com base na dimensão que você está filtrando.
                  </p>
                </div>
                <button onClick={() => handleToggle('auto_fill_dimension')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.auto_fill_dimension !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.auto_fill_dimension !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Sincronizar Foto do Currículo</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Substitui o ícone padrão de usuário pela foto principal cadastrada no seu currículo.
                  </p>
                </div>
                <button onClick={() => handleToggle('sync_curriculum_photo')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.sync_curriculum_photo !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.sync_curriculum_photo !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Iniciar no modo Foco Diário</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    O sistema sempre abrirá com as tarefas futuras ocultadas e o botão Foco Diário ativado.
                  </p>
                </div>
                <button onClick={() => handleToggle('start_in_daily_followup')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.start_in_daily_followup ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.start_in_daily_followup ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Exibir Atalhos Rápidos</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Desligue para ocultar o painel superior de botões de atalho.
                  </p>
                </div>
                <button onClick={() => handleToggle('show_quick_links')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.show_quick_links !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.show_quick_links !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Exibir Barra de Filtros Rápidos</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Desligue para ocultar completamente a barra superior de filtros de Status, Responsável, etc.
                  </p>
                </div>
                <button onClick={() => handleToggle('show_quick_filters')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.show_quick_filters !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.show_quick_filters !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Expandir Descrições por Padrão</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Exibe o texto completo de descrições longas sem precisar clicar em "Ver mais".
                  </p>
                </div>
                <button onClick={() => handleToggle('auto_expand_descriptions')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.auto_expand_descriptions ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.auto_expand_descriptions ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Fixar Tarefas Favoritas no Topo</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Mantém tarefas com estrela sempre posicionadas no topo da lista independente da ordenação.
                  </p>
                </div>
                <button onClick={() => handleToggle('pin_favorites_to_top')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.pin_favorites_to_top ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.pin_favorites_to_top ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Edição Rápida por Clique nos Badges</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Permite alterar Status, Prioridade, Categoria ou Responsável clicando diretamente nas etiquetas coloridas.
                  </p>
                </div>
                <button onClick={() => handleToggle('enable_badge_quick_edit')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.enable_badge_quick_edit !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.enable_badge_quick_edit !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Exibir Opções de Exportação (CSV e Agenda)</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Exibe botões de download CSV e exportação para o Google Agenda dentro do menu de filtros.
                  </p>
                </div>
                <button onClick={() => handleToggle('show_export_buttons')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.show_export_buttons !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.show_export_buttons !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Pedir Confirmação ao Excluir Tarefas</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Exibe um popup de confirmação antes de apagar qualquer tarefa permanentemente.
                  </p>
                </div>
                <button onClick={() => handleToggle('confirm_on_delete')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.confirm_on_delete !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.confirm_on_delete !== false ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded border border-[#2D2D2D] hover:border-[#9D4EDD]/50 transition-colors">
                <div className="pr-4">
                  <h4 className="text-white text-sm font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#9D4EDD] text-[18px]">recycling</span>
                    Mover para Descartadas ao Excluir (Soft Delete)
                  </h4>
                  <p className="text-[#A0A0A0] text-xs mt-1 leading-relaxed">
                    Ao pressionar Delete, a tarefa será movida para o status &quot;Descartada&quot;. Pressionar Delete em tarefas já descartadas as excluirá permanentemente.
                  </p>
                </div>
                <button onClick={() => handleToggle('soft_delete_to_discarded')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.soft_delete_to_discarded ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.soft_delete_to_discarded ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>
            </div>
          </div>

          {/* Comportamento Inicial e Limpeza de UI */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-[#2D2D2D] pb-2">
              Comportamento Inicial e Limpeza de UI
            </h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#E0E0E0] mb-2">Modo de Exibição Inicial</label>
                  <select 
                    value={config.default_display_mode || 'tarefas'} 
                    onChange={(e) => setConfig(p => ({ ...p, default_display_mode: e.target.value as any }))}
                    className="w-full bg-[#121212] border border-[#2D2D2D] text-white px-3 py-2 rounded focus:border-[#9D4EDD] focus:outline-none"
                  >
                    <option value="tarefas">Tarefas</option>
                    <option value="eventos">Eventos</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#E0E0E0] mb-2">Modo de Visão Inicial</label>
                  <select 
                    value={config.default_view_mode || 'list'} 
                    onChange={(e) => setConfig(p => ({ ...p, default_view_mode: e.target.value as any }))}
                    className="w-full bg-[#121212] border border-[#2D2D2D] text-white px-3 py-2 rounded focus:border-[#9D4EDD] focus:outline-none"
                  >
                    <option value="list">Lista</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Preenchimento Padrão (Valores Iniciais)</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Habilita o uso de valores padrão ao criar novas tarefas. Defina-os abaixo.
                  </p>
                </div>
                <button onClick={() => handleToggle('pre_fill_defaults')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.pre_fill_defaults ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.pre_fill_defaults ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              {config.pre_fill_defaults && (
                <div className="bg-[#121212] p-4 rounded-lg border border-[#2D2D2D] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in duration-200">
                  <div>
                    <label className="block text-xs font-bold text-[#8E8E8E] uppercase mb-1">Status Padrão</label>
                    <select 
                      value={config.default_task_values?.status || ''} 
                      onChange={(e) => handleDefaultValueChange('status', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm focus:border-[#9D4EDD] focus:outline-none"
                    >
                      <option value="">Nenhum</option>
                      {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8E8E8E] uppercase mb-1">Prioridade Padrão</label>
                    <select 
                      value={config.default_task_values?.prioridade || ''} 
                      onChange={(e) => handleDefaultValueChange('prioridade', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm focus:border-[#9D4EDD] focus:outline-none"
                    >
                      <option value="">Nenhuma</option>
                      {availablePriorities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8E8E8E] uppercase mb-1">Categoria Padrão</label>
                    <select 
                      value={config.default_task_values?.categoria || ''} 
                      onChange={(e) => handleDefaultValueChange('categoria', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm focus:border-[#9D4EDD] focus:outline-none"
                    >
                      <option value="">Nenhuma</option>
                      {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8E8E8E] uppercase mb-1">Prazo Padrão</label>
                    <select 
                      value={config.default_task_values?.prazo || ''} 
                      onChange={(e) => handleDefaultValueChange('prazo', e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm focus:border-[#9D4EDD] focus:outline-none"
                    >
                      <option value="">Nenhum (Em branco)</option>
                      <option value="amanha">Amanhã</option>
                      <option value="proxima_semana">Próxima Semana</option>
                      <option value="proximo_mes">Próximo Mês</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Regras de Tarefas Mãe e Filhas */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-[#2D2D2D] pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#9D4EDD]">account_tree</span>
              Regras de Tarefas Mãe e Filhas (Hierarquia)
            </h2>
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Subtarefas (Hierarquia e Setas)</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ativa a visualização em árvore com suporte a tarefas mãe/filha. Desligar isso mostrará todas as tarefas como uma lista plana.
                  </p>
                </div>
                <button onClick={() => handleToggle('enable_subtasks')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.enable_subtasks ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.enable_subtasks ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Concluir Tarefa Mãe Automaticamente</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ao concluir todas as subtarefas filhas, a tarefa mãe será concluída automaticamente.
                  </p>
                </div>
                <button onClick={() => handleToggle('auto_complete_parent')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.auto_complete_parent ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.auto_complete_parent ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Concluir Subtarefas ao Concluir a Mãe</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ao marcar a tarefa mãe como concluída, todas as suas subtarefas filhas serão concluídas.
                  </p>
                </div>
                <button onClick={() => handleToggle('auto_complete_subtasks')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.auto_complete_subtasks ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.auto_complete_subtasks ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Subtarefas Herdam Atributos da Mãe</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ao criar uma subtarefa, ela já virá preenchida com a mesma categoria, dimensão e prazo da tarefa mãe.
                  </p>
                </div>
                <button onClick={() => handleToggle('inherit_parent_attributes')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.inherit_parent_attributes ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.inherit_parent_attributes ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>

              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Alertar ao Concluir Mãe com Subtarefas Pendentes</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Exibe um aviso se você tentar concluir uma tarefa mãe que ainda possui subtarefas não concluídas.
                  </p>
                </div>
                <button onClick={() => handleToggle('prevent_parent_completion_if_subtasks_pending')} className={\`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors \${config.prevent_parent_completion_if_subtasks_pending ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}\`}>
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${config.prevent_parent_completion_if_subtasks_pending ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-[#2D2D2D] pb-2">
              Status Considerados "Concluídos"
            </h2>
            <p className="text-sm text-[#A0A0A0] mb-4">
              Selecione quais status devem ser tratados pelo sistema como concluídos. (Afeta filtros, modo Foco Diário e auto-conclusão).
            </p>
            <div className="flex flex-wrap gap-2">
              {availableStatuses.map(status => {
                const isActive = config.completion_statuses?.includes(status.toLowerCase());
                return (
                  <button
                    key={status}
                    onClick={() => toggleCompletionStatus(status)}
                    className={\`px-4 py-2 rounded-full text-sm font-medium transition-all
                      \${isActive 
                        ? 'bg-[#9D4EDD] text-white shadow-lg shadow-[#9D4EDD]/20 border border-[#9D4EDD]' 
                        : 'bg-[#121212] text-[#8E8E8E] border border-[#2D2D2D] hover:border-[#9D4EDD]/50 hover:text-white'
                      }\`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-6 border-t border-[#2D2D2D] flex justify-end">
            <button 
              onClick={handleSave} 
              disabled={isSaving || !hasChanges}
              className={\`px-8 py-3 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-xl \${
                savedSuccess 
                  ? 'bg-green-500 text-white shadow-green-500/20' 
                  : isSaving || !hasChanges
                    ? 'bg-[#2D2D2D] text-[#8E8E8E] cursor-not-allowed'
                    : 'bg-[#FFCC00] text-[#121212] hover:bg-white shadow-[#FFCC00]/20'
              }\`}
            >
              {isSaving ? (
                <>Salvando...</>
              ) : savedSuccess ? (
                <><span className="material-symbols-outlined text-[20px]">check_circle</span> Salvo com sucesso!</>
              ) : (
                <><span className="material-symbols-outlined text-[20px]">save</span> Salvar Configurações</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
`;

fs.writeFileSync('src/app/configuracoes-avancadas/AdvancedConfigClient.tsx', content);
console.log('AdvancedConfigClient.tsx recuperado com sucesso!');
