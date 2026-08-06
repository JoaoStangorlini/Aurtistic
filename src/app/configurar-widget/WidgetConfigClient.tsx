// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

interface WidgetConfigClientProps {
  userId: string;
  tasks: any[];
}

export default function WidgetConfigClient({ userId, tasks }: WidgetConfigClientProps) {
  const router = useRouter();
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>(['completa', 'descartada', 'concluída']);
  const [sortOrder, setSortOrder] = useState<string>('recentes');
  const [selectedDimension, setSelectedDimension] = useState('Todas');
  const [hiddenTaskIds, setHiddenTaskIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Extrair dimensões únicas existentes
  const dimensions = Array.from(new Set(tasks.map(t => t.dimensao).filter(Boolean)));
  // Extrair status únicos existentes (com fallback)
  const uniqueStatuses = Array.from(new Set(tasks.map(t => t.status || 'não iniciada').filter(Boolean)));

  useEffect(() => {
    // Carregar preferências salvas no Capacitor Preferences
    const loadPrefs = async () => {
      try {
        const { value: hiddenStats } = await Preferences.get({ key: 'widget_hidden_statuses' });
        if (hiddenStats) {
          setHiddenStatuses(JSON.parse(hiddenStats));
        }

        const { value: orderVal } = await Preferences.get({ key: 'widget_sort_order' });
        if (orderVal) {
          setSortOrder(orderVal);
        }

        const { value: dimVal } = await Preferences.get({ key: 'widget_filter_dimension' });
        if (dimVal) {
          setSelectedDimension(dimVal);
        }

        const { value: hiddenVal } = await Preferences.get({ key: 'widget_hidden_task_ids' });
        if (hiddenVal) {
          setHiddenTaskIds(JSON.parse(hiddenVal));
        }
      } catch (err) {
        console.error('Erro ao carregar preferências do widget', err);
      }
    };
    loadPrefs();
  }, []);

  const toggleTaskVisibility = (taskId: string) => {
    setHiddenTaskIds(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleStatusVisibility = (status: string) => {
    setHiddenStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Preferences.set({ key: 'widget_hidden_statuses', value: JSON.stringify(hiddenStatuses) });
      await Preferences.set({ key: 'widget_sort_order', value: sortOrder });
      await Preferences.set({ key: 'widget_filter_dimension', value: selectedDimension });
      await Preferences.set({ key: 'widget_hidden_task_ids', value: JSON.stringify(hiddenTaskIds) });

      // Atualizar lista filtrada do Widget imediatamente no storage
      let filteredTasks = tasks;
      
      // 1. Ocultar status desativados
      filteredTasks = filteredTasks.filter(t => !hiddenStatuses.includes(t.status || 'não iniciada'));

      // 2. Ocultar IDs desativados manualmente
      filteredTasks = filteredTasks.filter(t => !hiddenTaskIds.includes(t.id));

      // 3. Filtrar por dimensão se selecionada
      if (selectedDimension !== 'Todas') {
        if (selectedDimension === 'Favoritas') {
          filteredTasks = filteredTasks.filter(t => t.is_favorite);
        } else {
          filteredTasks = filteredTasks.filter(t => t.dimensao === selectedDimension);
        }
      }

      const widgetTasks = filteredTasks.map(t => ({
        id: t.id,
        nome: t.nome,
        prazo: t.prazo,
        status: t.status,
        dimensao: t.dimensao,
        is_favorite: t.is_favorite,
        created_at: t.created_at || new Date().toISOString()
      }));

      await Preferences.set({ key: 'favorite_tasks', value: JSON.stringify(widgetTasks) });

      // Notificar o Widget Nativo Android via Plugin se estiver no dispositivo
      if (Capacitor.isNativePlatform()) {
        try {
          const { WidgetPlugin } = await import('@/components/dashboard/TasksView');
          await WidgetPlugin.updateWidget();
        } catch (e) {
          console.warn('WidgetPlugin não disponível ou web mode');
        }
      }

      setSavedSuccess(true);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar widget:', e);
      alert('Erro ao salvar preferências do Widget: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 md:p-8 shadow-2xl">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-[#2D2D2D] mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center text-[#FFCC00]">
            <span className="material-symbols-outlined text-[24px]">widgets</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white font-['Bukra'] tracking-tight">Configurações do Widget</h1>
            <p className="text-xs text-[#8E8E8E] mt-0.5">Escolha o que aparece e o que fica oculto no widget do seu celular.</p>
          </div>
        </div>

        <button
          onClick={() => router.back()}
          className="text-[#8E8E8E] hover:text-white transition-colors p-2 rounded-lg"
        >
          <span className="material-symbols-outlined text-[24px]">close</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 bg-[#0f9d58]/20 border border-[#0f9d58] text-[#69f0ae] rounded-lg text-sm font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          Preferências do Widget salvas e atualizadas no celular!
        </div>
      )}

      {/* Regras Gerais */}
      <div className="space-y-6">
        
        {/* Filtro de Status (Substitui o Ocultar Concluídas) */}
        <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0f9d58] text-[20px]">filter_list</span>
            Status Ocultos no Widget
          </h3>
          <p className="text-xs text-[#8E8E8E] mb-3">
            Selecione quais status de tarefas você deseja que NÃO apareçam no widget. Itens selecionados serão ocultados.
          </p>
          <div className="flex flex-wrap gap-2">
            {uniqueStatuses.map(status => {
              const isHidden = hiddenStatuses.includes(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatusVisibility(status)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border flex items-center gap-1 ${
                    isHidden
                      ? 'bg-[#2D2D2D] text-[#8E8E8E] border-[#3D3D3D]'
                      : 'bg-[#9D4EDD]/20 text-[#9D4EDD] border-[#9D4EDD]/30 hover:border-[#9D4EDD]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isHidden ? 'visibility_off' : 'visibility'}
                  </span>
                  {status}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ordenação */}
        <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4285f4] text-[20px]">sort</span>
            Ordem de Exibição
          </h3>
          <p className="text-xs text-[#8E8E8E] mb-3">
            Escolha a ordem em que as tarefas serão mostradas no widget.
          </p>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-2.5 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#9D4EDD] transition-colors"
          >
            <option value="recentes">Mais recentes primeiro</option>
            <option value="antigas">Mais antigas primeiro</option>
            <option value="prazo_asc">Prazo mais próximo</option>
            <option value="alfabetica">Ordem alfabética (A-Z)</option>
          </select>
        </div>

        {/* Filtro por Dimensão Inicial */}
        <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">category</span>
            Dimensão Padrão do Widget
          </h3>
          <p className="text-xs text-[#8E8E8E] mb-3">
            Selecione qual dimensão de tarefas deve ser carregada por padrão ao abrir a tela inicial.
          </p>
          
          <select
            value={selectedDimension}
            onChange={(e) => setSelectedDimension(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-2.5 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#9D4EDD] transition-colors"
          >
            <option value="Todas">Todas as Dimensões</option>
            <option value="Favoritas">Apenas Favoritas (★)</option>
            {dimensions.map(dim => (
              <option key={dim} value={dim}>{dim}</option>
            ))}
          </select>
        </div>

        {/* Seleção Individual de Visibilidade de Tarefas */}
        <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">visibility</span>
                Visibilidade Individual por Tarefa
              </h3>
              <p className="text-xs text-[#8E8E8E] mt-1">
                Desative manualmente qualquer tarefa específica que você não queira ver no widget.
              </p>
            </div>
            <span className="text-xs text-[#9D4EDD] font-bold">
              {tasks.length - hiddenTaskIds.length} de {tasks.length} visíveis
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {tasks.map(task => {
              const isHidden = hiddenTaskIds.includes(task.id);
              const isDoneStatus = hiddenStatuses.includes(task.status || 'não iniciada');
              const opacityClass = (isHidden || isDoneStatus) ? 'opacity-50' : '';
              
              return (
                <div 
                  key={task.id} 
                  onClick={() => toggleTaskVisibility(task.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
                    isHidden 
                      ? 'bg-[#1A1A1A]/50 border-[#2D2D2D] opacity-50' 
                      : 'bg-[#1A1A1A] border-[#3D3D3D] hover:border-[#9D4EDD]'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`material-symbols-outlined text-[20px] ${isHidden ? 'text-[#8E8E8E]' : 'text-[#FFCC00]'}`}>
                      {isHidden ? 'visibility_off' : 'visibility'}
                    </span>
                    <div className="truncate">
                      <p className={`text-sm font-bold truncate ${isDoneStatus ? 'line-through text-[#8E8E8E]' : 'text-white'}`}>
                        {task.nome}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[#A0A0A0] bg-[#252525] px-2 py-0.5 rounded font-mono">
                          {task.dimensao || 'Geral'}
                        </span>
                        <span className="text-[10px] text-[#8E8E8E]">
                          Status: {task.status || 'não iniciada'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`text-xs font-bold px-3 py-1 rounded-md transition-colors ${
                    isHidden ? 'bg-[#252525] text-[#8E8E8E]' : 'bg-[#9D4EDD]/20 text-[#9D4EDD]'
                  }`}>
                    {isHidden ? 'Oculto' : 'Exibir'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Botões de Ação */}
      <div className="mt-8 pt-6 border-t border-[#2D2D2D] flex justify-end gap-3">
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg text-sm font-bold text-[#E0E0E0] hover:bg-[#2D2D2D] transition-colors"
          disabled={isSaving}
        >
          Voltar
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || savedSuccess}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-70 ${
            savedSuccess 
              ? 'bg-[#0f9d58] text-white hover:bg-[#0b8043]' 
              : 'bg-[#FFCC00] text-[#121212] hover:bg-[#e6b800]'
          }`}
        >
          {isSaving ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              Salvando...
            </>
          ) : savedSuccess ? (
            <>
              <span className="material-symbols-outlined text-[18px]">check</span>
              Salvo!
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">save</span>
              Salvar Configurações
            </>
          )}
        </button>
      </div>

    </div>
  );
}
