'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAdvancedConfig } from '@/app/(dashboard)/actions';

interface AdvancedConfig {
  enable_subtasks: boolean;
  enable_workspaces: boolean;
  enable_admin_filters: boolean;
  sync_curriculum_photo: boolean;
  completion_statuses: string[];
}

export default function AdvancedConfigClient({ 
  initialConfig, 
  availableStatuses,
  userEmail
}: { 
  initialConfig: AdvancedConfig, 
  availableStatuses: string[],
  userEmail: string
}) {
  const router = useRouter();
  const [config, setConfig] = useState<AdvancedConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);



  const handleToggle = (field: keyof AdvancedConfig) => {
    setConfig(prev => ({
      ...prev,
      [field]: !prev[field]
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
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };



  return (
    <div className="max-w-4xl mx-auto space-y-8">
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

      <div className="max-w-2xl mx-auto">
        
        {/* Lado Esquerdo: Módulos */}
        <div className="space-y-6">
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-[#2D2D2D] pb-2">
              Módulos e Visualização
            </h2>
            
            <div className="space-y-6">
              {/* Toggle Subtarefas */}
              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Subtarefas (Hierarquia e Setas)</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ativa a visualização em árvore com suporte a tarefas pai/filha. Desligar isso mostrará todas as tarefas como uma lista plana.
                  </p>
                </div>
                <button onClick={() => handleToggle('enable_subtasks')} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${config.enable_subtasks ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enable_subtasks ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Toggle Espaços */}
              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Espaços de Trabalho</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Ativa o painel de Espaços (Workspaces). Se desativado, o Aurtistic será focado em uma única visão central.
                  </p>
                </div>
                <button onClick={() => handleToggle('enable_workspaces')} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${config.enable_workspaces ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enable_workspaces ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Toggle Filtros LabDiv */}
              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Filtros Corporativos (LabDiv)</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Habilita filtros automáticos caso você faça parte da equipe HUB/LabDiv.
                  </p>
                </div>
                <button onClick={() => handleToggle('enable_admin_filters')} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${config.enable_admin_filters ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enable_admin_filters ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Toggle Foto de Perfil */}
              <div className="flex justify-between items-start">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-[#E0E0E0]">Sincronizar Foto do Currículo</h3>
                  <p className="text-xs text-[#8E8E8E] mt-1">
                    Substitui o ícone padrão de usuário pela foto principal cadastrada no seu currículo.
                  </p>
                </div>
                <button onClick={() => handleToggle('sync_curriculum_photo')} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${config.sync_curriculum_photo !== false ? 'bg-[#9D4EDD]' : 'bg-[#2D2D2D]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.sync_curriculum_photo !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-2">
              Status de Conclusão (Gatilhos)
            </h2>
            <p className="text-xs text-[#8E8E8E] mb-4">
              Selecione quais *Status* devem agir como finalizadores de tarefas. Ao selecionar um desses status, a tarefa sumirá do painel padrão e avançará o prazo (se for recorrente).
            </p>
            <div className="flex flex-wrap gap-2">
              {availableStatuses.map(status => {
                const isActive = (config.completion_statuses || []).includes(status.toLowerCase());
                return (
                  <button
                    key={status}
                    onClick={() => toggleCompletionStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                      isActive 
                        ? 'bg-[#0f9d58]/20 border-[#0f9d58] text-[#69f0ae]' 
                        : 'bg-[#252525] border-[#333333] text-[#8E8E8E] hover:text-[#E0E0E0]'
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#9D4EDD] hover:bg-[#8534C1] text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? <span className="material-symbols-outlined animate-spin text-[20px]">sync</span> : <span className="material-symbols-outlined text-[20px]">save</span>}
            {isSaving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
          
          {savedSuccess && (
            <div className="p-3 bg-[#0f9d58]/20 text-[#69f0ae] rounded-lg text-sm text-center font-bold">
              Configurações salvas com sucesso!
            </div>
          )}
        </div>

              </div>
    </div>
  );
}
