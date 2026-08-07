// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { WidgetTasksPreview, WidgetCalendarPreview, WidgetEventsPreview } from '@/components/dashboard/WidgetPreviews';

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
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'tarefas' | 'calendario' | 'eventos'>('tarefas');

  // Extrair dimensões únicas existentes
  const dimensions = Array.from(new Set(tasks.map(t => t.dimensao).filter(Boolean)));
  // Extrair status únicos existentes (com fallback)
  const uniqueStatuses = Array.from(new Set(tasks.map(t => t.status || 'não iniciada').filter(Boolean)));

  useEffect(() => {
    // Carregar preferências salvas no Capacitor Preferences
    const loadPrefs = async () => {
      const safeParse = (str: string | null, fallback: any) => {
        if (!str) return fallback;
        try { return JSON.parse(str); } catch (e) { return fallback; }
      };
      
      try {
        const { value: hiddenStats } = await Preferences.get({ key: 'widget_hidden_statuses' });
        if (hiddenStats) {
          setHiddenStatuses(safeParse(hiddenStats, ['completa', 'descartada', 'concluída']));
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
          setHiddenTaskIds(safeParse(hiddenVal, []));
        }
      } catch (err) {
        console.error('Erro ao carregar preferências do widget', err);
      }
    };
    loadPrefs();
  }, []);

  const toggleTaskVisibility = (taskId: string) => {
    setIsDirty(true);
    setHiddenTaskIds(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleStatusVisibility = (status: string) => {
    setIsDirty(true);
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
      setIsDirty(false);
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
    <>
      {isDirty && !savedSuccess && (
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
      <div className="max-w-6xl mx-auto bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 md:p-8 shadow-2xl flex flex-col">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center pb-6 border-b border-[#2D2D2D] mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center text-[#FFCC00]">
            <span className="material-symbols-outlined text-[24px]">widgets</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white font-['Bukra'] tracking-tight">Configurações do Widget</h1>
            <p className="text-xs text-[#8E8E8E] mt-0.5">Personalize os widgets que aparecem na tela inicial do seu celular.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-[#8E8E8E] hover:text-white transition-colors p-2 rounded-lg"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 bg-[#0f9d58]/20 border border-[#0f9d58] text-[#69f0ae] rounded-lg text-sm font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          Preferências do Widget salvas e atualizadas no celular!
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2D2D2D] mb-8 pb-1 overflow-x-auto custom-scrollbar">
        {[
          { id: 'tarefas', label: 'Tarefas', icon: 'task_alt' },
          { id: 'calendario', label: 'Calendário', icon: 'calendar_month' },
          { id: 'eventos', label: 'Eventos', icon: 'event_list' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-[#9D4EDD] text-[#9D4EDD]' : 'border-transparent text-[#8E8E8E] hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        
        {/* Lado Esquerdo: Configurações */}
        <div className="space-y-6">
          {activeTab === 'tarefas' && (
            <>
              {/* Filtro de Status */}
              <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0f9d58] text-[20px]">filter_list</span>
                  Status Ocultos
                </h3>
                <p className="text-xs text-[#8E8E8E] mb-3">Selecione quais status NÃO aparecerão no widget.</p>
                <div className="flex flex-wrap gap-2">
                  {uniqueStatuses.map(status => {
                    const isHidden = hiddenStatuses.includes(status);
                    return (
                      <button key={status} onClick={() => toggleStatusVisibility(status)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border flex items-center gap-1 ${isHidden ? 'bg-[#2D2D2D] text-[#8E8E8E] border-[#3D3D3D]' : 'bg-[#9D4EDD]/20 text-[#9D4EDD] border-[#9D4EDD]/30'}`}>
                        <span className="material-symbols-outlined text-[14px]">{isHidden ? 'visibility_off' : 'visibility'}</span>
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
                  <label className="text-[#A0A0A0] text-sm font-bold uppercase tracking-wider mb-2 block">Critério de Ordenação</label>
                </h3>
                <select value={sortOrder} onChange={(e) => { setIsDirty(true); setSortOrder(e.target.value); }} className="w-full mt-2 bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-2.5 rounded-lg text-sm font-semibold">
                  <option value="recentes">Criados Recentemente</option>
                  <option value="antigas">Mais antigas primeiro</option>
                  <option value="prazo_asc">Prazo mais próximo</option>
                  <option value="alfabetica">Ordem alfabética (A-Z)</option>
                </select>
              </div>

              {/* Filtro por Dimensão */}
              <div className="p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">category</span>
                  <label className="text-[#A0A0A0] text-sm font-bold uppercase tracking-wider mb-2 block">Filtrar por Dimensão</label>
                </h3>
                <select value={selectedDimension} onChange={(e) => { setIsDirty(true); setSelectedDimension(e.target.value); }} className="w-full mt-2 bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-2.5 rounded-lg text-sm font-semibold">
                  <option value="Todas">Todas as Tarefas</option>
                  <option value="Favoritas">Apenas Favoritas (★)</option>
                  {dimensions.map(dim => <option key={dim} value={dim}>{dim}</option>)}
                </select>
              </div>
            </>
          )}

          {activeTab === 'calendario' && (
            <div className="text-[#8E8E8E] text-sm p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
              <h3 className="text-white font-bold mb-4">Configurações do Calendário</h3>
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-between text-white">
                  <span>Modo de Visualização</span>
                  <select className="bg-[#1A1A1A] border border-[#2D2D2D] rounded p-2 text-sm font-semibold">
                    <option>Mensal</option>
                    <option>Semanal</option>
                  </select>
                </label>
                <label className="flex items-center justify-between text-white">
                  <span>Mostrar Marcadores de Tarefas</span>
                  <input type="checkbox" className="accent-[#9D4EDD] w-4 h-4" defaultChecked />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'eventos' && (
            <div className="text-[#8E8E8E] text-sm p-4 bg-[#121212] border border-[#2D2D2D] rounded-lg">
              <h3 className="text-white font-bold mb-4">Configurações de Eventos</h3>
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-between text-white">
                  <span>Mostrar Horários</span>
                  <input type="checkbox" className="accent-[#9D4EDD] w-4 h-4" defaultChecked />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Lado Direito: Preview */}
        <div className="flex flex-col border border-[#2D2D2D] rounded-xl bg-[#1A1A1A] overflow-hidden">
          <div className="bg-[#252525] p-3 border-b border-[#2D2D2D] text-center">
            <span className="text-[#E0E0E0] text-xs font-bold uppercase tracking-wider">Preview do Widget Android</span>
          </div>
          <div className="flex-1 p-8 flex items-center justify-center bg-[#121212]/50" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"20\\" height=\\"20\\" viewBox=\\"0 0 20 20\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cg fill=\\"%23252525\\" fill-opacity=\\"0.4\\" fill-rule=\\"evenodd\\"%3E%3Ccircle cx=\\"3\\" cy=\\"3\\" r=\\"1\\"/%3E%3Ccircle cx=\\"13\\" cy=\\"13\\" r=\\"1\\"/%3E%3C/g%3E%3C/svg%3E")' }}>
            {activeTab === 'tarefas' && <WidgetTasksPreview tasks={tasks} config={{ hiddenStatuses, hiddenTaskIds, sortOrder, selectedDimension }} />}
            {activeTab === 'calendario' && <WidgetCalendarPreview />}
            {activeTab === 'eventos' && <WidgetEventsPreview events={[]} />}
          </div>
        </div>
        
      </div>

      {/* Botões de Ação */}
      <div className="mt-8 pt-6 border-t border-[#2D2D2D] flex justify-end gap-3">
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
    </>
  );
}
