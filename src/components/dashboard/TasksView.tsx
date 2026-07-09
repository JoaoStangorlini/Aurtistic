'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Task } from '@/types';
import { Badge, getBadgeColorClass } from './Badge';
import { TaskFormModal } from './TaskFormModal';
import { BulkEditModal } from './BulkEditModal';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { updateTaskOrders } from '@/app/(dashboard)/actions';

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getStatusWeight(status: string | null) {
  const s = (status || '').toLowerCase();
  if (s.includes('descartada')) return 1;
  if (s.includes('completa') || s.includes('conclu')) return 2;
  if (s.includes('falta testar')) return 3;
  if (s.includes('progresso') || s.includes('andamento')) return 4;
  if (s.includes('não iniciada') || s.includes('nao iniciada')) return 5;
  return 6;
}

function getPriorityWeight(p: string | null) {
  const v = (p || '').toLowerCase();
  if (v.includes('alta')) return 3;
  if (v.includes('média') || v.includes('media')) return 2;
  if (v.includes('baixa')) return 1;
  return 0;
}

const HighlightedText = ({ text, highlight }: { text: string | null, highlight: string }) => {
  if (!text) return null;
  if (!highlight.trim()) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={index} className="bg-purple-500/50 text-white rounded-sm px-0.5">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};

export function TasksView({ initialTasks: rawInitialTasks }: { initialTasks: Task[] }) {

  const searchParams = useSearchParams();
  const globalQuery = searchParams.get('q') || '';
  
  // Normalizar os dados que vêm do banco (migração temporária na UI)
  const initialTasks = useMemo(() => 
    rawInitialTasks.map(t => 
      t.dimensao && t.dimensao.toLowerCase() === 'pessoal' 
        ? { ...t, dimensao: 'urgente' } 
        : t
    ), 
  [rawInitialTasks]);
  
  const [localTasks, setLocalTasks] = useState(initialTasks);
  useEffect(() => {
    setLocalTasks(initialTasks);
  }, [initialTasks]);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  
  const [history, setHistory] = useState<Task[][]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom'>('top');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

  // Filters UI State
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Filters State
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  
  // Se a Navbar global mandar ?q=... nós usamos ela. Senão a local.
  const searchTerm = globalQuery || localSearchTerm;
  
  type SortOption = 'status' | 'status_inv' | 'prazo' | 'categoria' | 'prioridade_desc' | 'prioridade_asc' | 'manual';
  const [sortBy, setSortBy] = useState<SortOption>('status');

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Selection
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(null);

  // Refs for scrolling
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close filter menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global Keybinds (Escape and Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTasks(new Set());
        setLastSelectedTaskId(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        setHistory(prev => {
          if (prev.length === 0) return prev;
          const prevTasks = prev[prev.length - 1];
          setLocalTasks(prevTasks);
          
          // Sync with Supabase asynchronously using Server Action
          updateTaskOrders(prevTasks.map(t => ({ id: t.id, ordem_manual: t.ordem_manual || 0 })))
            .catch(err => alert("Erro ao desfazer ordem: " + err.message));
          
          return prev.slice(0, -1);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEdit = (task: Task) => {
    setTaskToEdit(task);
    setIsModalOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (sortBy !== 'manual') {
      e.preventDefault();
      alert("Para reordenar, mude a ordenação para 'Manual / Personalizada' nos Filtros.");
      return;
    }
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;
    setDropTargetId(targetId);
    setDropPosition(isTop ? 'top' : 'bottom');
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId || sortBy !== 'manual') return;

    setIsUpdatingOrder(true);
    setDropTargetId(null);

    setHistory(prev => [...prev, [...localTasks]]);

    // Precisamos trabalhar com a lista já ordenada da mesma forma que o usuário vê (manual sort)
    const sortedLocal = [...localTasks].sort((a, b) => {
      let diff = (a.ordem_manual || 0) - (b.ordem_manual || 0);
      if (diff === 0) diff = getStatusWeight(a.status) - getStatusWeight(b.status);
      if (diff === 0) {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        diff = dateA - dateB;
      }
      return diff;
    });

    const draggedIndex = sortedLocal.findIndex(t => t.id === draggedTaskId);
    let targetIndex = sortedLocal.findIndex(t => t.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setIsUpdatingOrder(false);
      return;
    }

    let tasksToMove = [sortedLocal[draggedIndex]];

    if (selectedTasks.has(draggedTaskId) && selectedTasks.size > 1) {
      tasksToMove = sortedLocal.filter(t => selectedTasks.has(t.id));
      for (let i = sortedLocal.length - 1; i >= 0; i--) {
        if (selectedTasks.has(sortedLocal[i].id)) {
          sortedLocal.splice(i, 1);
        }
      }
    } else {
      sortedLocal.splice(draggedIndex, 1);
    }

    let newTargetIndex = sortedLocal.findIndex(t => t.id === targetTaskId);
    if (newTargetIndex === -1) newTargetIndex = sortedLocal.length;
    if (dropPosition === 'bottom') newTargetIndex += 1;

    sortedLocal.splice(newTargetIndex, 0, ...tasksToMove);

    const updatedTasks = sortedLocal.map((t, index) => ({
      ...t,
      ordem_manual: index
    }));

    setLocalTasks(updatedTasks);
    setDraggedTaskId(null);

    try {
      const updates = updatedTasks.map(t => ({
        id: t.id,
        ordem_manual: t.ordem_manual
      }));
      await updateTaskOrders(updates);
    } catch (err: any) {
      console.error("Erro ao atualizar ordem:", err);
      alert("Aviso: Falha ao salvar no banco. A coluna 'ordem_manual' existe no seu Supabase? Erro original: " + err.message);
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleNew = () => {
    setTaskToEdit(null);
    setIsModalOpen(true);
  };

  const handleRowClick = (e: React.MouseEvent, taskId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.tagName === 'INPUT' || target.tagName === 'A' || target.textContent === 'drag_indicator') {
      return;
    }

    const isShift = e.shiftKey;
    const isCtrl = e.ctrlKey || e.metaKey;

    let newSet = new Set(selectedTasks);

    if (isShift && lastSelectedTaskId) {
      const startIdx = processedTasks.findIndex(t => t.id === lastSelectedTaskId);
      const endIdx = processedTasks.findIndex(t => t.id === taskId);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        if (!isCtrl) newSet.clear();
        
        for (let i = minIdx; i <= maxIdx; i++) {
          newSet.add(processedTasks[i].id);
        }
      }
    } else if (isCtrl) {
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
    } else {
      newSet.clear();
      newSet.add(taskId);
    }

    setSelectedTasks(newSet);
    setLastSelectedTaskId(taskId);
  };

  const toggleCheckbox = (e: React.MouseEvent | React.ChangeEvent, taskId: string) => {
    const isShift = (e.nativeEvent as any)?.shiftKey;
    
    let newSet = new Set(selectedTasks);

    if (isShift && lastSelectedTaskId) {
      const startIdx = processedTasks.findIndex(t => t.id === lastSelectedTaskId);
      const endIdx = processedTasks.findIndex(t => t.id === taskId);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        for (let i = minIdx; i <= maxIdx; i++) {
          newSet.add(processedTasks[i].id);
        }
      }
    } else {
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
    }

    setSelectedTasks(newSet);
    setLastSelectedTaskId(taskId);
  };

  const scrollToBottom = () => {
    if (desktopContainerRef.current) {
      desktopContainerRef.current.scrollTo({ top: desktopContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
    if (mobileContainerRef.current) {
      mobileContainerRef.current.scrollTo({ top: mobileContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  // Dynamic filter options
  const uniqueStatuses = useMemo(() => Array.from(new Set(initialTasks.map(t => t.status).filter(Boolean))) as string[], [initialTasks]);
  const uniqueCategories = useMemo(() => Array.from(new Set(initialTasks.map(t => t.categoria).filter(Boolean))) as string[], [initialTasks]);
  const uniqueUsers = useMemo(() => Array.from(new Set([...initialTasks.map(t => t.responsavel).filter(Boolean), 'Dani', 'Leo'])) as string[], [initialTasks]).sort();
  const uniqueDimensions = useMemo(() => Array.from(new Set(initialTasks.map(t => t.dimensao).filter(Boolean))) as string[], [initialTasks]).sort();

  const toggleFilter = (list: string[], setList: (l: string[]) => void, value: string) => {
    if (list.includes(value)) {
      setList(list.filter(item => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  // Process Tasks: Filter and Sort
  const processedTasks = useMemo(() => {
    let tasks = [...localTasks];

    // 1. Filter Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      tasks = tasks.filter(t => 
        (t.nome && t.nome.toLowerCase().includes(term)) || 
        (t.descricao && t.descricao.toLowerCase().includes(term))
      );
    }
    // 2. Filter Statuses
    if (selectedStatuses.length > 0) {
      tasks = tasks.filter(t => t.status && selectedStatuses.includes(t.status));
    }
    // 3. Filter Categories
    if (selectedCategories.length > 0) {
      tasks = tasks.filter(t => t.categoria && selectedCategories.includes(t.categoria));
    }
    // 4. Filter Users
    if (selectedUsers.length > 0) {
      tasks = tasks.filter(t => t.responsavel && selectedUsers.includes(t.responsavel));
    }
    // 5. Filter Dimensions
    if (selectedDimensions.length > 0) {
      tasks = tasks.filter(t => t.dimensao && selectedDimensions.includes(t.dimensao));
    }

    // 5. Sort
    tasks.sort((a, b) => {
      let primaryDiff = 0;
      
      switch(sortBy) {
        case 'status':
          primaryDiff = getStatusWeight(a.status) - getStatusWeight(b.status);
          break;
        case 'status_inv':
          primaryDiff = getStatusWeight(b.status) - getStatusWeight(a.status);
          break;
        case 'prazo':
          const pA = a.prazo ? new Date(a.prazo).getTime() : Infinity;
          const pB = b.prazo ? new Date(b.prazo).getTime() : Infinity;
          primaryDiff = pA - pB;
          break;
        case 'categoria':
          const cA = a.categoria || '';
          const cB = b.categoria || '';
          primaryDiff = cA.localeCompare(cB);
          break;
        case 'prioridade_desc':
          primaryDiff = getPriorityWeight(b.prioridade) - getPriorityWeight(a.prioridade);
          break;
        case 'prioridade_asc':
          primaryDiff = getPriorityWeight(a.prioridade) - getPriorityWeight(b.prioridade);
          break;
        case 'manual':
          primaryDiff = (a.ordem_manual || 0) - (b.ordem_manual || 0);
          if (primaryDiff === 0) {
            primaryDiff = getStatusWeight(a.status) - getStatusWeight(b.status);
          }
          break;
      }

      if (primaryDiff !== 0) return primaryDiff;
      
      // Secundário: created_at ASC (mais antigas no topo, mais novas no fundo)
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });

    return tasks;
  }, [localTasks, searchTerm, selectedStatuses, selectedCategories, selectedUsers, selectedDimensions, sortBy]);

  return (
    <div className="w-full flex flex-col h-full overflow-hidden relative">
      
      {/* Header & Toolbar */}
      <div className="flex flex-col gap-4 mb-6 shrink-0">
        <div className="flex items-center mb-2">
          <h2 className="text-xl font-bold text-white tracking-wide">Tarefas</h2>
        </div>

        {/* Toolbar de Filtros Rápidos */}
        <div className="flex flex-col items-end gap-3 w-full mb-2">
          
          {/* Row 1: Ordenação */}
          <div className="flex w-full overflow-x-auto hide-scrollbar items-center justify-start md:justify-end gap-3 shrink-0 pb-1">
            <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">Ordem:</span>
            
            {/* Ordem Global */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setSortBy('status')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'status' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Padrão</button>
              <button onClick={() => setSortBy('status_inv')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'status_inv' ? 'bg-[#FFCC00]/15 border-[#FFCC00] text-[#FFCC00]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Padrão (inv)</button>
              <button onClick={() => setSortBy('manual')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'manual' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Manual</button>
            </div>

            {/* Prioridade */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider hidden sm:inline">Prio:</span>
              <button onClick={() => setSortBy('prioridade_desc')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center gap-1 ${sortBy === 'prioridade_desc' ? getBadgeColorClass('prioridade', 'alta') : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}><span className="material-symbols-outlined text-[14px]">arrow_upward</span> Alta</button>
              <button onClick={() => setSortBy('prioridade_asc')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center gap-1 ${sortBy === 'prioridade_asc' ? getBadgeColorClass('prioridade', 'baixa') : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}><span className="material-symbols-outlined text-[14px]">arrow_downward</span> Baixa</button>
            </div>
          </div>

          {/* Row 2: Status (Visibilidade) */}
          <div className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start md:justify-end">
            <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">Visibilidade:</span>
            {uniqueStatuses.map(s => (
              <button 
                key={s} 
                onClick={() => toggleFilter(selectedStatuses, setSelectedStatuses, s)}
                className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0
                  ${selectedStatuses.includes(s) ? getBadgeColorClass('status', s) : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Row 3: Responsáveis */}
          <div className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start md:justify-end">
            <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">Responsáveis:</span>
            {uniqueUsers.map(u => (
              <button 
                key={u} 
                onClick={() => toggleFilter(selectedUsers, setSelectedUsers, u)}
                className={`px-3 py-1 text-[11px] rounded-full border transition-colors font-bold flex items-center gap-1 shrink-0
                  ${selectedUsers.includes(u) ? getBadgeColorClass('responsavel', u) : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}
              >
                <span className="material-symbols-outlined text-[12px]">person</span> {u}
              </button>
            ))}
          </div>

          {/* Row 3.5: Dimensões (Apenas no servidor onde há mais de 1 dimensão) */}
          {uniqueDimensions.length > 1 && (
            <div className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start md:justify-end">
              <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">Dimensões:</span>
              {uniqueDimensions.map(d => (
                <button 
                  key={d} 
                  onClick={() => toggleFilter(selectedDimensions, setSelectedDimensions, d)}
                  className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0
                    ${selectedDimensions.includes(d) ? getBadgeColorClass('dimensao', d) : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {/* Row 4: Botão de Filtros */}
          <div className="flex w-full overflow-x-auto hide-scrollbar items-center justify-end gap-3 shrink-0 pb-1 z-30">
            <div className="flex items-center text-[#8E8E8E] text-[11px] font-bold px-3 shrink-0 bg-[#1A1A1A] rounded-md border border-[#2D2D2D] h-[36px]">
              <span className="text-[#FFCC00] text-sm mr-1">{processedTasks.length}</span> 
              <span className="hidden sm:inline">de</span>
              <span className="text-white text-sm mx-1">{localTasks.length}</span> 
              <span className="hidden sm:inline">visíveis</span>
              {selectedTasks.size > 0 && (
                <>
                  <span className="mx-2">|</span>
                  <span className="text-[#9D4EDD] text-sm mr-1">{selectedTasks.size}</span>
                  <span className="hidden sm:inline">selecionadas</span>
                </>
              )}
              {selectedTasks.size > 1 && (
                <button 
                  onClick={() => setIsBulkEditModalOpen(true)}
                  className="bg-[#9D4EDD]/20 text-[#9D4EDD] hover:bg-[#9D4EDD] hover:text-white border border-[#9D4EDD]/50 px-2 py-0.5 rounded text-[10px] ml-2 flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[12px]">edit</span> Editar
                </button>
              )}
            </div>

            <div className="relative shrink-0" ref={filterMenuRef}>
              <button 
                onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className="flex items-center gap-2 bg-[#9D4EDD] text-white font-bold rounded-md px-4 py-2 text-sm hover:bg-[#8338C7] transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Mais filtros
              <span className="material-symbols-outlined text-[18px]">{isFilterMenuOpen ? 'expand_less' : 'expand_more'}</span>
            </button>

            {isFilterMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[320px] bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg shadow-2xl z-50 max-h-[70vh] overflow-y-auto flex flex-col">
                
                {/* Section: Ordenar Por */}
                <div className="p-4 border-b border-[#2D2D2D]">
                  <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-3">Ordenar Por</h3>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                      <input type="radio" name="sort" checked={sortBy === 'status'} onChange={() => setSortBy('status')} className="accent-[#9D4EDD]" />
                      Status (Padrão)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                      <input type="radio" name="sort" checked={sortBy === 'prazo'} onChange={() => setSortBy('prazo')} className="accent-[#9D4EDD]" />
                      Prazo (Mais Curto)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                      <input type="radio" name="sort" checked={sortBy === 'categoria'} onChange={() => setSortBy('categoria')} className="accent-[#9D4EDD]" />
                      Categoria (A-Z)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                      <input type="radio" name="sort" checked={sortBy === 'prioridade_desc'} onChange={() => setSortBy('prioridade_desc')} className="accent-[#9D4EDD]" />
                      Prioridade (Alta para Baixa)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                      <input type="radio" name="sort" checked={sortBy === 'prioridade_asc'} onChange={() => setSortBy('prioridade_asc')} className="accent-[#9D4EDD]" />
                      Prioridade (Baixa para Alta)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                      <input type="radio" name="sort" checked={sortBy === 'manual'} onChange={() => setSortBy('manual')} className="accent-[#9D4EDD]" />
                      Manual / Personalizada (Arrastar)
                    </label>
                  </div>
                </div>

                {/* Section: Visibilidade Status */}
                <div className="p-4 border-b border-[#2D2D2D]">
                  <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-3">Filtrar: Status</h3>
                  <div className="flex flex-col gap-2">
                    {uniqueStatuses.map(status => (
                      <label key={status} className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                        <input type="checkbox" checked={selectedStatuses.includes(status)} onChange={() => toggleFilter(selectedStatuses, setSelectedStatuses, status)} className="accent-[#9D4EDD] rounded-sm" />
                        {status}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Section: Visibilidade Categoria */}
                <div className="p-4 border-b border-[#2D2D2D]">
                  <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-3">Filtrar: Categoria</h3>
                  <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto">
                    {uniqueCategories.map(cat => (
                      <label key={cat} className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                        <input type="checkbox" checked={selectedCategories.includes(cat)} onChange={() => toggleFilter(selectedCategories, setSelectedCategories, cat)} className="accent-[#9D4EDD] rounded-sm" />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>


                {/* Section: Visibilidade Responsável */}
                <div className="p-4 border-b border-[#2D2D2D]">
                  <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-3">Filtrar: Responsável</h3>
                  <div className="flex flex-col gap-2">
                    {uniqueUsers.map(user => (
                      <label key={user} className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                        <input type="checkbox" checked={selectedUsers.includes(user)} onChange={() => toggleFilter(selectedUsers, setSelectedUsers, user)} className="accent-[#9D4EDD] rounded-sm" />
                        {user}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Section: Visibilidade Dimensões */}
                {uniqueDimensions.length > 1 && (
                  <div className="p-4">
                    <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-3">Filtrar: Dimensão</h3>
                    <div className="flex flex-col gap-2">
                      {uniqueDimensions.map(dim => (
                        <label key={dim} className="flex items-center gap-2 text-sm text-white cursor-pointer hover:text-[#9D4EDD] transition-colors">
                          <input type="checkbox" checked={selectedDimensions.includes(dim)} onChange={() => toggleFilter(selectedDimensions, setSelectedDimensions, dim)} className="accent-[#9D4EDD] rounded-sm" />
                          {dim}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
            </div>
            
            <button 
              onClick={handleNew}
              className="bg-[#FFCC00] text-[#121212] font-bold text-sm px-4 py-2 rounded-md hover:bg-[#e6b800] transition-colors shadow-sm shrink-0"
            >
              + Nova Tarefa
            </button>
          </div>


        </div>
      </div>

      {/* Desktop View (Table) */}
      <div ref={desktopContainerRef} className="hidden md:block flex-1 overflow-x-auto overflow-y-auto bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg relative">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead className="bg-[#252525] border-b border-[#2D2D2D] sticky top-0 z-10">
            <tr>
              <th className="p-4 w-[60px] text-center">
                <input type="checkbox" className="accent-[#9D4EDD] rounded-sm" onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTasks(new Set(processedTasks.map(t => t.id)));
                  } else {
                    setSelectedTasks(new Set());
                  }
                }} checked={selectedTasks.size === processedTasks.length && processedTasks.length > 0} />
              </th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider text-center w-[60px]">Ação</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider w-[220px]">Nome</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Status</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Prioridade</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Categoria</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Responsável</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Criada em</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Início</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Prazo</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Concluída em</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Freq.</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Dimensão</th>
            </tr>
          </thead>
          <tbody>
            {processedTasks.map(task => (
              <tr 
                key={task.id} 
                draggable={sortBy === 'manual' ? true : undefined}
                onDragStart={sortBy === 'manual' ? (e) => handleDragStart(e, task.id) : undefined}
                onDragOver={sortBy === 'manual' ? (e) => handleDragOver(e, task.id) : undefined}
                onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
                onDrop={sortBy === 'manual' ? (e) => handleDrop(e, task.id) : undefined}
                onDragEnd={sortBy === 'manual' ? () => setDropTargetId(null) : undefined}
                onClick={(e) => handleRowClick(e, task.id)}
                className={`transition-colors group ${selectedTasks.has(task.id) ? 'bg-[#9D4EDD]/10' : 'hover:bg-[#252525]'} ${draggedTaskId === task.id ? 'opacity-50' : ''} ${dropTargetId === task.id ? (dropPosition === 'top' ? 'border-t-2 border-[#9D4EDD]' : 'border-b-2 border-[#9D4EDD]') : 'border-b border-[#FFCC00]/30 hover:border-[#9D4EDD]'}`}
              >
                <td className="p-4 text-center flex items-center justify-center gap-2">
                  <span className={`material-symbols-outlined text-[#8E8E8E] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-not-allowed'}`} title={sortBy !== 'manual' ? 'Mude para ordenação Manual para arrastar' : 'Arrastar'}>drag_indicator</span>
                  <input type="checkbox" className="accent-[#9D4EDD] rounded-sm" checked={selectedTasks.has(task.id)} onChange={(e) => toggleCheckbox(e, task.id)} />
                </td>
                <td className="p-4 text-center">
                  <button 
                    onClick={() => handleEdit(task)}
                    className="text-[#8E8E8E] hover:text-[#9D4EDD] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </td>
                <td className="p-4 text-sm font-medium text-white break-words" title={task.descricao || ''}>
                  <HighlightedText text={task.nome} highlight={searchTerm} />
                  {task.descricao && (
                    <div className="text-[10px] text-[#A0A0A0] mt-1 line-clamp-1">
                      <HighlightedText text={task.descricao} highlight={searchTerm} />
                    </div>
                  )}
                </td>
                <td className="p-4"><Badge type="status" value={task.status} /></td>
                <td className="p-4"><Badge type="prioridade" value={task.prioridade} /></td>
                <td className="p-4"><Badge type="categoria" value={task.categoria} /></td>
                <td className="p-4"><Badge type="responsavel" value={task.responsavel} /></td>
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.created_at)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.inicio)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.prazo)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.concluida_em)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{task.frequencia || '-'}</td>
                <td className="p-4"><Badge type="dimensao" value={task.dimensao} /></td>
              </tr>
            ))}
            {processedTasks.length === 0 && (
              <tr>
                <td colSpan={13} className="p-8 text-center text-[#8E8E8E] text-sm">Nenhuma tarefa encontrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View (Cards) */}
      <div ref={mobileContainerRef} className="md:hidden flex-1 overflow-y-auto touch-pan-y space-y-4 pb-20 mt-4">
        {processedTasks.map(task => (
          <div 
            key={task.id} 
            draggable={sortBy === 'manual' ? true : undefined}
            onDragStart={sortBy === 'manual' ? (e) => handleDragStart(e, task.id) : undefined}
            onDragOver={sortBy === 'manual' ? (e) => handleDragOver(e, task.id) : undefined}
            onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
            onDrop={sortBy === 'manual' ? (e) => handleDrop(e, task.id) : undefined}
            onDragEnd={sortBy === 'manual' ? () => setDropTargetId(null) : undefined}
            onClick={(e) => handleRowClick(e, task.id)}
            className={`border rounded-lg p-4 flex flex-col gap-3 relative transition-colors ${selectedTasks.has(task.id) ? 'bg-[#9D4EDD]/10 border-[#9D4EDD]/30' : 'bg-[#1A1A1A] border-[#FFCC00]/30 hover:border-[#9D4EDD]'} ${draggedTaskId === task.id ? 'opacity-50' : ''} ${dropTargetId === task.id ? (dropPosition === 'top' ? 'border-t-2 border-[#9D4EDD]' : 'border-b-2 border-[#9D4EDD]') : ''}`}
          >
            <div className="absolute top-4 right-4 flex items-center gap-3">
              <input type="checkbox" className="accent-[#9D4EDD] rounded-sm w-4 h-4" checked={selectedTasks.has(task.id)} onChange={(e) => toggleCheckbox(e, task.id)} />
              <button 
                onClick={() => handleEdit(task)}
                className="text-[#8E8E8E] hover:text-[#9D4EDD]"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            
            <div className="pr-16 flex items-start gap-2">
              <span className={`material-symbols-outlined text-[#8E8E8E] text-[18px] mt-0.5 ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-not-allowed'}`} title={sortBy !== 'manual' ? 'Mude para ordenação Manual para arrastar' : 'Arrastar'}>drag_indicator</span>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  <HighlightedText text={task.nome} highlight={searchTerm} />
                </h3>
                {task.descricao && (
                  <p className="text-[11px] text-[#A0A0A0] line-clamp-2">
                    <HighlightedText text={task.descricao} highlight={searchTerm} />
                  </p>
                )}
              </div>
            </div>
            
            <div className="mt-1 pl-6 pr-2">
              <div className="flex justify-between items-center text-center mb-1 gap-1">
                <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider flex-1 truncate">Status</span>
                <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider flex-1 truncate">Prio</span>
                <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider flex-1 truncate">Categ</span>
                <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider flex-1 truncate">Resp</span>
                <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider flex-1 truncate">Dim</span>
              </div>
              <div className="flex justify-between items-center text-center gap-1">
                <div className="flex-1 flex justify-center overflow-hidden"><Badge type="status" value={task.status} /></div>
                <div className="flex-1 flex justify-center overflow-hidden"><Badge type="prioridade" value={task.prioridade} /></div>
                <div className="flex-1 flex justify-center overflow-hidden"><Badge type="categoria" value={task.categoria} /></div>
                <div className="flex-1 flex justify-center overflow-hidden"><Badge type="responsavel" value={task.responsavel} /></div>
                <div className="flex-1 flex justify-center overflow-hidden"><Badge type="dimensao" value={task.dimensao} /></div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 border-t border-[#2D2D2D] pt-2 pb-1 text-[9px] text-[#A0A0A0] pl-6 pr-2">
              <span className="truncate">Cria: {formatDate(task.created_at)}</span>
              <span className="truncate">Ini: {formatDate(task.inicio)}</span>
              <span className="truncate">Fim: {formatDate(task.prazo)}</span>
              <span className="truncate">Concl: {formatDate(task.concluida_em)}</span>
            </div>
          </div>
        ))}
        {processedTasks.length === 0 && (
          <div className="p-8 text-center text-[#8E8E8E] text-sm bg-[#1A1A1A] rounded-lg border border-[#2D2D2D]">
            Nenhuma tarefa encontrada.
          </div>
        )}
      </div>

      {/* Floating Scroll to Bottom Button */}
      <button 
        onClick={scrollToBottom}
        className="absolute bottom-6 right-6 bg-[#1A1A1A] hover:bg-[#9D4EDD]/10 border border-[#FFCC00]/50 hover:border-[#9D4EDD] text-[#8E8E8E] hover:text-[#9D4EDD] p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center z-20 group"
        title="Ir para o fundo (Mais Recentes)"
      >
        <span className="material-symbols-outlined">arrow_downward</span>
      </button>

      <TaskFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        task={taskToEdit} 
      />

      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        onClose={() => setIsBulkEditModalOpen(false)}
        taskIds={Array.from(selectedTasks)}
        onSuccess={() => {
          setIsBulkEditModalOpen(false);
          setSelectedTasks(new Set());
          setLastSelectedTaskId(null);
        }}
      />
    </div>
  );
}
