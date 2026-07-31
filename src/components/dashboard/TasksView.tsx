'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Task, TaskColumn } from '@/types';
import { Badge, getBadgeColorClass } from './Badge';
import { TaskFormModal } from './TaskFormModal';
import { BulkEditModal } from './BulkEditModal';
import { OptionsEditorModal } from './OptionsEditorModal';
import TaskCalendar from './TaskCalendar';
import { useSearchParams, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { updateTaskOrders, saveTaskColumn } from '@/app/(dashboard)/actions';
import { saveTask, deleteMultipleTasks, updateMultipleTasks } from '@/lib/offlineActions';
import { Preferences } from '@capacitor/preferences';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { saveTasksToCache, getTasksFromCache, getMutations, removeMutation } from '@/lib/offlineSync';
import { syncTaskNotifications } from '@/lib/notifications';
import { downloadICS } from '@/utils/ics';
import { downloadCSV } from '@/utils/csv';

interface WidgetPluginPlugin {
  updateWidget(): Promise<void>;
}
const WidgetPlugin = registerPlugin<WidgetPluginPlugin>('WidgetPlugin');

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDaysUntil(dateStr: string | null, concluidaEm: string | null = null) {
  if (!dateStr) return null;
  const today = new Date();
  if (concluidaEm) {
    const concluida = new Date(concluidaEm);
    if (!isNaN(concluida.getTime())) {
      today.setTime(concluida.getTime());
    }
  }
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  deadline.setHours(0, 0, 0, 0);
  const diffTime = deadline.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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

export function TasksView({ initialTasks: rawInitialTasks, initialColumns = [], isPersonalScope = false, userId, initialQuickFilters = ['responsavel', 'dimensao'], initialQuickSorts = ['status', 'prazo', 'prioridade', 'manual'] }: { initialTasks: Task[], initialColumns?: TaskColumn[], isPersonalScope?: boolean, userId?: string, initialQuickFilters?: string[], initialQuickSorts?: string[] }) {

  const searchParams = useSearchParams();
  const globalQuery = searchParams.get('q') || '';
  
  const [columns, setColumns] = useState<TaskColumn[]>(initialColumns);
  
  const getColColor = (key: string, val: string | null | undefined) => {
    const col = columns.find(c => c.key === key);
    if (!col || !col.options) return undefined;
    const opt = col.options.find(o => o.value === (val || ''));
    return opt?.color;
  };

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarCurrentDate, setCalendarCurrentDate] = useState(new Date());
  
  // Normalizar os dados que vêm do banco (migração temporária na UI)
  const initialTasks = useMemo(() => 
    rawInitialTasks.map(t => 
      t.dimensao && t.dimensao.toLowerCase() === 'pessoal' 
        ? { ...t, dimensao: 'urgente' } 
        : t
    ), 
  [rawInitialTasks]);
  
  const [localTasks, setLocalTasks] = useState(initialTasks);


  const [visibleExtraCols, setVisibleExtraCols] = useState<string[]>(userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? ['responsavel', 'concluida_em', 'frequencia'] : []);
  
  useEffect(() => {
    import('@capacitor/preferences').then(({ Preferences }) => {
      Preferences.get({ key: 'visibleExtraCols' }).then(res => {
        if (res.value) setVisibleExtraCols(JSON.parse(res.value));
      });
    });
  }, []);

  const toggleExtraCol = (col: string) => {
    const newCols = visibleExtraCols.includes(col) ? visibleExtraCols.filter(c => c !== col) : [...visibleExtraCols, col];
    setVisibleExtraCols(newCols);
    import('@capacitor/preferences').then(({ Preferences }) => {
      Preferences.set({ key: 'visibleExtraCols', value: JSON.stringify(newCols) });
    });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<TaskColumn | null>(null);
  
  useEffect(() => {
    const syncOffline = async () => {
      if (window.navigator.onLine) {
        // We are online. The initialTasks from server are fresh.
        setLocalTasks(initialTasks);
        await saveTasksToCache(initialTasks);
        
        // Check if we have pending mutations
        const mutations = await getMutations();
        if (mutations.length > 0) {
          console.log('Processing offline mutations...', mutations);
          for (const m of mutations) {
            try {
              if (m.type === 'update') await saveTask(m.payload);
              if (m.type === 'delete') await deleteMultipleTasks([m.taskId]);
              await removeMutation(m.id);
            } catch (e) {
              console.error('Failed to sync mutation', m, e);
            }
          }
        }
      } else {
        // We are offline. Load from cache.
        const cached = await getTasksFromCache();
        if (cached && cached.length > 0) {
          setLocalTasks(cached);
        } else {
          setLocalTasks(initialTasks);
        }
      }
    };

    syncOffline();

    const handleOnline = () => syncOffline();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [initialTasks]);

  // Keep offline cache in sync with local UI state
  useEffect(() => {
    if (localTasks) {
      saveTasksToCache(localTasks).catch(e => console.error("Erro salvando cache offline", e));
    }
  }, [localTasks]);

  // Sync Favorites to Native Android Widget
  useEffect(() => {
    const syncFavorites = async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const activeTasks = localTasks.filter(t => t.status !== 'completa' && t.status !== 'descartada');
        const widgetTasks = activeTasks.map(t => ({
          id: t.id,
          nome: t.nome,
          prazo: t.prazo,
          status: t.status,
          dimensao: t.dimensao,
          is_favorite: t.is_favorite
        }));
        await Preferences.set({
          key: 'favorite_tasks',
          value: JSON.stringify(widgetTasks)
        });
        
        // Extract and save unique dimensions for the widget filter
        const dims = Array.from(new Set(localTasks.map(t => t.dimensao).filter(Boolean)));
        await Preferences.set({
          key: 'unique_dimensions',
          value: JSON.stringify(dims)
        });

        // Save status colors mapping for Widget pencil icons
        const statusColors: Record<string, string> = {
          'completa': '#0f9d58',
          'concluída': '#0f9d58',
          'concluida': '#0f9d58',
          'falta testar': '#f4b400',
          'descartada': '#db4437',
          'em progresso': '#4285f4',
          'em andamento': '#4285f4',
          'não iniciada': '#E0E0E0',
          'nao iniciada': '#E0E0E0',
          'rascunho': '#8E8E8E'
        };
        await Preferences.set({
          key: 'status_colors',
          value: JSON.stringify(statusColors)
        });
        
        await WidgetPlugin.updateWidget();
      } catch (err) {
        console.error('Error syncing favorites to native widget', err);
      }
    };
    syncFavorites();
  }, [localTasks]);

  // Sync Notifications
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      syncTaskNotifications(localTasks);
    }
  }, [localTasks]);

  // Handle App Open from Widget
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const processWidgetIntents = async () => {
      try {
        // 1. Process pending status updates
        const { value: pendingStr } = await Preferences.get({ key: 'pending_widget_updates' });
        if (pendingStr && pendingStr !== '[]') {
          const updates = JSON.parse(pendingStr);
          if (updates.length > 0) {
            console.log("Processando fila do widget", updates);
            await Preferences.set({ key: 'pending_widget_updates', value: '[]' });
            
            let newTasks = [...localTasks];
            let modified = false;
            
            for (const update of updates) {
              if (update.action === 'create') {
                const { taskId, taskName, taskDimension } = update;
                const newTask = {
                  id: taskId,
                  nome: taskName || 'Novo Rascunho',
                  status: 'rascunho',
                  is_favorite: true,
                  ordem: 0,
                  prazo: new Date(Date.now() + 7 * 86400000).toISOString(),
                  dimensao: 'Rascunho'
                };
                newTasks.unshift(newTask as any);
                modified = true;
                // Save to Supabase (assuming saveTask creates a new one if UUID is not in DB)
                saveTask(newTask as any).catch(e => console.error("Erro criando task do widget", e));
              } else {
                const { taskId, status } = update;
                const taskIndex = newTasks.findIndex(t => t.id === taskId);
                if (taskIndex !== -1) {
                  newTasks[taskIndex] = { ...newTasks[taskIndex], status };
                  modified = true;
                  saveTask({ ...newTasks[taskIndex], status }).catch(e => console.error(e));
                }
              }
            }
            if (modified) setLocalTasks(newTasks);
          }
        }

        // 2. Process open task intent
        const { value: openTaskId } = await Preferences.get({ key: 'widget_action_open_task' });
        if (openTaskId) {
          console.log("Abrindo tarefa a partir do widget:", openTaskId);
          await Preferences.remove({ key: 'widget_action_open_task' });
          const taskToOpen = localTasks.find(t => t.id === openTaskId);
          if (taskToOpen) {
            setTaskToEdit(taskToOpen);
            setIsModalOpen(true);
          }
        }
      } catch (err) {
        console.error('Error processing widget intent', err);
      }
    };

    // Run immediately
    processWidgetIntents();

    // Run on resume
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        processWidgetIntents();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [localTasks]); // Depends on localTasks to correctly update states if something changes

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  
  const [history, setHistory] = useState<Task[][]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom'>('top');

  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();
  const isAurtistic = pathname?.includes('aurtistic');


  const [activeTooltip, setActiveTooltip] = useState<{
    text: string;
    top: number | 'auto';
    bottom?: number | 'auto';
    left: number;
  } | null>(null);

  const handleTooltipClick = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceNeeded = 100;

    setActiveTooltip({
      text,
      top: spaceBelow < spaceNeeded ? 'auto' : rect.bottom + 5,
      bottom: spaceBelow < spaceNeeded ? window.innerHeight - rect.top + 5 : 'auto',
      left: Math.max(10, rect.left - 64)
    });
  };

  const [quickEdit, setQuickEdit] = useState<{
    taskId: string;
    field: 'status' | 'responsavel' | 'prioridade' | 'categoria' | 'dimensao';
    top: number | 'auto';
    bottom?: number | 'auto';
    left: number;
    value: string | null;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => { setQuickEdit(null); setActiveTooltip(null); };
    const handleScroll = () => { setQuickEdit(null); setActiveTooltip(null); };
    if (quickEdit || activeTooltip) {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    }
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [quickEdit, activeTooltip]);

  const handleBadgeClick = (e: React.MouseEvent, task: Task, field: 'status' | 'responsavel' | 'prioridade' | 'categoria' | 'dimensao') => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceNeeded = 250;

    if (spaceBelow < spaceNeeded) {
      setQuickEdit({
        taskId: task.id,
        field,
        top: 'auto',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        value: task[field] || ''
      });
    } else {
      setQuickEdit({
        taskId: task.id,
        field,
        top: rect.bottom + 4,
        bottom: 'auto',
        left: rect.left,
        value: task[field] || ''
      });
    }
  };

  const handleFavoriteToggle = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    const task = localTasks.find(t => t.id === taskId);
    if (!task) return;

    const newValue = !task.is_favorite;
    
    // Find children to cascade the favorite status
    const children = localTasks.filter(t => t.parent_id === taskId);
    const taskIdsToUpdate = [taskId, ...children.map(c => c.id)];

    const updatedTasks = localTasks.map(t => taskIdsToUpdate.includes(t.id) ? { ...t, is_favorite: newValue } : t);
    setLocalTasks(updatedTasks);
    
    try {
      for (const id of taskIdsToUpdate) {
        const t = localTasks.find(x => x.id === id);
        if (t) await saveTask({ ...t, is_favorite: newValue });
      }
    } catch (err: any) {
      alert("Erro ao atualizar favorito: " + err.message);
    }
  };

  const handleQuickSave = async (taskId: string, field: 'status' | 'responsavel' | 'prioridade' | 'categoria' | 'dimensao', newValue: string) => {
    setQuickEdit(null);

    const isBulkEdit = selectedTasks.has(taskId) && selectedTasks.size > 1;
    const taskIdsToUpdate = isBulkEdit ? Array.from(selectedTasks) : [taskId];

    const updatedTasks = localTasks.map(t => taskIdsToUpdate.includes(t.id) ? { ...t, [field]: newValue } : t);
    setLocalTasks(updatedTasks);
    
    try {
      if (isBulkEdit) {
        await updateMultipleTasks(taskIdsToUpdate, { [field]: newValue });
      } else {
        const task = localTasks.find(t => t.id === taskId);
        if (task) await saveTask({ ...task, [field]: newValue });
      }
    } catch (err: any) {
      alert("Erro ao atualizar: " + err.message);
    }
  };


  // Filters UI State
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

  const toggleExpand = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setCollapsedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Filters State
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  
  // Se a Navbar global mandar ?q=... nós usamos ela. Senão a local.
  const searchTerm = globalQuery || localSearchTerm;
  
  type SortOption = 'status' | 'status_inv' | 'prazo' | 'categoria' | 'prioridade_desc' | 'prioridade_asc' | 'manual' | string;
  const [sortBy, setSortBy] = useState<SortOption>('status');

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [showDraftsOnly, setShowDraftsOnly] = useState<boolean>(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Quick Filters & Custom Filters
  const [quickFilters, setQuickFilters] = useState<string[]>(initialQuickFilters || ['responsavel', 'dimensao']);
  const [quickSorts, setQuickSorts] = useState<string[]>(initialQuickSorts || ['status', 'prazo', 'prioridade', 'manual']);
  const [isQuickFiltersModalOpen, setIsQuickFiltersModalOpen] = useState(false);
  const [quickFiltersTab, setQuickFiltersTab] = useState<'visibilidade' | 'ordem'>('visibilidade');
  const [customFilters, setCustomFilters] = useState<Record<string, string[]>>({});

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
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global Keybinds (Escape and Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if any modal is open
      if (isModalOpen || isBulkEditModalOpen) return;
      
      if (e.key === 'Escape') {
        setSelectedTasks(new Set());
        setLastSelectedTaskId(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        if (selectedTasks.size > 0) {
          if (confirm(`Tem certeza que deseja excluir as ${selectedTasks.size} tarefas selecionadas?`)) {
            const taskIds = Array.from(selectedTasks);
            deleteMultipleTasks(taskIds).then(() => {
              setSelectedTasks(new Set());
              setLastSelectedTaskId(null);
            }).catch(err => alert("Erro ao excluir tarefas: " + err.message));
          }
        }
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
  }, [isModalOpen, isBulkEditModalOpen, selectedTasks, localTasks]);

  const handleEdit = (task: Task) => {
    // Inject subtasks if this is a parent task
    const subtasks = localTasks.filter(t => t.parent_id === task.id);
    setTaskToEdit({ ...task, subtasks } as any);
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
    let newTask: any = { id: crypto.randomUUID(), status: 'não iniciada', prioridade: 'Baixa', categoria: 'Programar' };
    
    if (selectedDimensions.length === 1 && selectedDimensions[0] !== 'favoritas') {
      newTask.dimensao = selectedDimensions[0];
    }
    if (isPersonalScope) {
      newTask.is_personal = true;
    }
    
    setTaskToEdit(newTask);
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
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: mainElement.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const uniqueStatuses = useMemo(() => {
    const statusCol = columns.find(c => c.key === 'status');
    const predefined = statusCol ? statusCol.options.map(o => o.value) : ['não iniciada', 'em progresso', 'falta testar', 'completa', 'descartada'];
    const fromTasks = localTasks.map(t => t.status).filter(Boolean) as string[];
    return Array.from(new Set([...predefined, ...fromTasks]));
  }, [localTasks, columns]);

  const uniqueCategories = useMemo(() => {
    const isJoao = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
    const catCol = columns.find(c => c.key === 'categoria');
    let predefined = catCol ? catCol.options.map(o => o.value) : ['Programar', 'Design', 'Marketing', 'Geral'];
    if (!isJoao) predefined = ['Trabalho', 'Estudo', 'Casa', 'Geral'];
    
    const fromTasks = localTasks.map(t => t.categoria).filter(Boolean) as string[];
    return Array.from(new Set([...predefined, ...fromTasks]));
  }, [localTasks, columns, userId]);

  const uniqueUsers = useMemo(() => {
    const isJoao = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
    const userCol = columns.find(c => c.key === 'responsavel');
    let predefined = userCol ? userCol.options.map(o => o.value) : ['João', 'Andy', 'Leo', 'Dani', 'Lorenzo', 'Nacky'];
    if (!isJoao) predefined = ['Você'];

    const fromTasks = localTasks.map(t => t.responsavel).filter(Boolean) as string[];
    return Array.from(new Set([...predefined, ...fromTasks])).sort();
  }, [localTasks, columns, userId]);

  const uniqueDimensions = useMemo(() => {
    const isJoao = userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
    const dimCol = columns.find(c => c.key === 'dimensao');
    let predefined = dimCol ? dimCol.options.map(o => o.value) : ['Pessoal', 'Trabalho', 'Estudos', 'Saúde'];
    
    // For non-Stangorlini users, ignore the database options since they are polluted with Stangorlini's tags
    if (!isJoao) {
      predefined = ['Pessoal', 'Trabalho', 'Estudos', 'Saúde'];
    }

    const fromTasks = localTasks.map(t => t.dimensao).filter(Boolean) as string[];
    let dims = Array.from(new Set([...predefined, ...fromTasks]));

    // Remove "favoritas" que estava repetido com visibilidade
    dims = dims.filter(d => d !== 'favoritas');

    if (isPersonalScope && isJoao) {
      dims = dims.filter(d => !['HUB', 'cin', 'stangorlini.web', 'tatuagens'].includes(d));
    }

    return dims.sort();
  }, [localTasks, columns, isPersonalScope, userId]);

  const toggleFilter = (list: string[], setList: (l: string[]) => void, value: string) => {
    if (list.includes(value)) {
      setList(list.filter(item => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  const toggleCustomFilter = (key: string, value: string) => {
    setCustomFilters(prev => {
      const current = prev[key] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [key]: updated };
    });
  };

  // Process Tasks: Filter and Sort
  const processedTasks = (() => {
    let tasks = [...localTasks];

    // 1. Filter Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      tasks = tasks.filter(t => 
        t.parent_id || (t.nome && t.nome.toLowerCase().includes(term)) || 
        (t.descricao && t.descricao.toLowerCase().includes(term))
      );
    }
    // 2. Filter Statuses
    if (selectedStatuses.length > 0) {
      tasks = tasks.filter(t => t.parent_id || (t.status && selectedStatuses.includes(t.status)));
    }
    // 2.5 Filter Favorites
    if (showFavoritesOnly) {
      tasks = tasks.filter(t => t.parent_id || t.is_favorite);
    }
    // 2.6 Filter Drafts
    if (showDraftsOnly) {
      tasks = tasks.filter(t => t.parent_id || t.status === 'rascunho');
    }
    // 3. Filter Categories
    if (selectedCategories.length > 0) {
      tasks = tasks.filter(t => t.parent_id || (t.categoria && selectedCategories.includes(t.categoria)));
    }
    // 4. Filter Users
    if (selectedUsers.length > 0) {
      tasks = tasks.filter(t => t.parent_id || (t.responsavel && selectedUsers.includes(t.responsavel)));
    }
    // 5. Filter Dimensions
    if (selectedDimensions.length > 0) {
      if (selectedDimensions.includes('favoritas')) {
        tasks = tasks.filter(t => 
           t.parent_id || (t.is_favorite && selectedDimensions.includes('favoritas')) ||
           (t.dimensao && selectedDimensions.includes(t.dimensao))
        );
      } else {
        tasks = tasks.filter(t => t.parent_id || (t.dimensao && selectedDimensions.includes(t.dimensao)));
      }
    }

    // Keep only children whose parents survived the filtering
    const survivingParentIds = new Set(tasks.filter(t => !t.parent_id).map(t => t.id));
    tasks = tasks.filter(t => !t.parent_id || survivingParentIds.has(t.parent_id));

    const getColIndex = (key: string, val: string | null | undefined) => {
      const col = columns.find(c => c.key === key);
      if (!col || !col.options) return 9999;
      const idx = col.options.findIndex(opt => opt.value === (val || ''));
      return idx === -1 ? 9999 : idx;
    };

    // 5. Sort
    tasks.sort((a, b) => {
      let primaryDiff = 0;
      
      switch(sortBy) {
        case 'status':
          primaryDiff = getColIndex('status', a.status) - getColIndex('status', b.status);
          break;
        case 'status_inv':
          primaryDiff = getColIndex('status', b.status) - getColIndex('status', a.status);
          break;
        case 'prazo':
          const pA = a.prazo ? new Date(a.prazo).getTime() : Infinity;
          const pB = b.prazo ? new Date(b.prazo).getTime() : Infinity;
          primaryDiff = pA - pB;
          break;
        case 'categoria':
          primaryDiff = getColIndex('categoria', a.categoria) - getColIndex('categoria', b.categoria);
          if (primaryDiff === 0) {
            primaryDiff = (a.categoria || '').localeCompare(b.categoria || '');
          }
          break;
        case 'prioridade_desc':
          primaryDiff = getColIndex('prioridade', a.prioridade) - getColIndex('prioridade', b.prioridade);
          break;
        case 'prioridade_asc':
          primaryDiff = getColIndex('prioridade', b.prioridade) - getColIndex('prioridade', a.prioridade);
          break;
        case 'manual':
          primaryDiff = (a.ordem_manual || 0) - (b.ordem_manual || 0);
          if (primaryDiff === 0) {
            primaryDiff = getColIndex('status', a.status) - getColIndex('status', b.status);
          }
          break;
        default:
          if (sortBy.startsWith('custom_')) {
            const colKey = sortBy.replace('custom_', '');
            const col = columns.find(c => c.key === colKey);
            const vA = (a as any)[colKey] ?? (a.custom_fields as any)?.[colKey] ?? '';
            const vB = (b as any)[colKey] ?? (b.custom_fields as any)?.[colKey] ?? '';
            if (col && col.options && col.options.length > 0) {
              const idxA = col.options.findIndex(opt => opt.value === vA);
              const idxB = col.options.findIndex(opt => opt.value === vB);
              const finalIdxA = idxA === -1 ? 9999 : idxA;
              const finalIdxB = idxB === -1 ? 9999 : idxB;
              primaryDiff = finalIdxA - finalIdxB;
            } else {
              primaryDiff = vA.localeCompare(vB);
            }
          }
          break;
      }

      if (primaryDiff !== 0) return primaryDiff;
      
      // Secundário: created_at DESC (mais novas no topo, mais antigas no fundo)
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

    const interleaved: Task[] = [];
    const parentTasks = tasks.filter(t => !t.parent_id);
    
    // Group children by parent
    const childTasksByParent: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (t.parent_id) {
        if (!childTasksByParent[t.parent_id]) childTasksByParent[t.parent_id] = [];
        childTasksByParent[t.parent_id].push(t);
      }
    }

    for (const parent of parentTasks) {
       interleaved.push(parent);
       if (!collapsedTasks.has(parent.id) && childTasksByParent[parent.id]) {
           interleaved.push(...childTasksByParent[parent.id]);
       }
    }

    return interleaved;
  })();

  const hasAnyPrazo = processedTasks.some(t => t.prazo);

  return (
    <div className="w-full flex flex-col relative">
      
      {/* Header & Toolbar */}
      <div className="flex flex-col gap-4 mb-6 shrink-0">
        <div className="flex items-center mb-2 justify-between">
          <h3 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-wider flex items-center gap-2">
            Filtros Rápidos
            <button onClick={() => setIsQuickFiltersModalOpen(true)} className="text-[#A0A0A0] hover:text-[#9D4EDD] transition-colors" title="Configurar Filtros Rápidos">
              <span className="material-symbols-outlined text-[16px]">settings</span>
            </button>
          </h3>
        </div>

        {/* Toolbar de Filtros Rápidos */}
        <div className="flex flex-col items-end gap-3 w-full mb-2">
          
          {/* Row 1: Ordenação dinâmica */}
          {quickSorts.length > 0 && (
            <div className="flex w-full overflow-x-auto hide-scrollbar items-center justify-start gap-3 shrink-0 pb-1">
              <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">Ordem:</span>
              
              <div className="flex items-center gap-2 shrink-0">
                {quickSorts.map(sortKey => {
                  if (sortKey === 'status') {
                    return (
                      <React.Fragment key="status">
                        <button onClick={() => setSortBy('status')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'status' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Padrão</button>
                        <button onClick={() => setSortBy('status_inv')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'status_inv' ? 'bg-[#FFCC00]/15 border-[#FFCC00] text-[#FFCC00]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Padrão (inv)</button>
                      </React.Fragment>
                    );
                  }
                  if (sortKey === 'manual') {
                    return <button key="manual" onClick={() => setSortBy('manual')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'manual' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Manual</button>;
                  }
                  if (sortKey === 'prazo') {
                    return <button key="prazo" onClick={() => setSortBy('prazo')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'prazo' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Prazo</button>;
                  }
                  if (sortKey === 'prioridade') {
                    return (
                      <React.Fragment key="prioridade">
                        <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider hidden sm:inline ml-1">Prio:</span>
                        <button onClick={() => setSortBy('prioridade_desc')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center gap-1 ${sortBy === 'prioridade_desc' ? getBadgeColorClass('prioridade', 'alta') : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}><span className="material-symbols-outlined text-[12px]">arrow_upward</span> Alta</button>
                        <button onClick={() => setSortBy('prioridade_asc')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center gap-1 ${sortBy === 'prioridade_asc' ? getBadgeColorClass('prioridade', 'baixa') : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}><span className="material-symbols-outlined text-[12px]">arrow_downward</span> Baixa</button>
                      </React.Fragment>
                    );
                  }
                  if (sortKey === 'categoria') {
                    return <button key="categoria" onClick={() => setSortBy('categoria')} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === 'categoria' ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>Categoria</button>;
                  }
                  
                  const col = columns.find(c => c.key === sortKey);
                  if (col) {
                    return (
                      <button key={sortKey} onClick={() => setSortBy(`custom_${sortKey}`)} className={`px-3 py-1 text-[11px] rounded-md border transition-colors font-bold shrink-0 ${sortBy === `custom_${sortKey}` ? 'bg-[#9D4EDD]/20 border-[#9D4EDD] text-[#9D4EDD]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}>{col.name}</button>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          )}

          {/* Row 2: Status (Visibilidade) */}
          <div className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start">
            <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">Visibilidade:</span>
            
            <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`h-[26px] px-2 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center justify-center gap-1
                  ${showFavoritesOnly ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-[#FFCC00]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#FFCC00]/50 hover:text-white'}`}
            >
                <span className={`material-symbols-outlined text-[12px] ${showFavoritesOnly ? 'text-[#FFCC00]' : ''}`}>star</span>
            </button>

            <button
                onClick={() => setShowDraftsOnly(!showDraftsOnly)}
                className={`h-[26px] px-3 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center justify-center gap-1
                  ${showDraftsOnly ? 'bg-[#8E8E8E]/20 border-[#8E8E8E] text-[#8E8E8E]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#8E8E8E]/50 hover:text-white'}`}
            >
                <span className={`material-symbols-outlined text-[12px] ${showDraftsOnly ? 'text-[#8E8E8E]' : ''}`}>draft</span> Rascunhos
            </button>
            
            {uniqueStatuses.map(s => (
              <button 
                key={s} 
                onClick={() => toggleFilter(selectedStatuses, setSelectedStatuses, s)}
                className={`h-[26px] px-3 text-[11px] rounded-md border transition-colors font-bold shrink-0 flex items-center justify-center
                  ${selectedStatuses.includes(s) ? getBadgeColorClass('status', s) : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Filtros Customizados baseados no quickFilters */}
          {quickFilters.map(filterKey => {
            const col = columns.find(c => c.key === filterKey);
            // Casos nativos que usam unique do hook
            let options: string[] = [];
            let isSelected: (val: string) => boolean = () => false;
            let onToggle: (val: string) => void = () => {};
            let onClear: () => void = () => {};
            let isAllSelected = false;
            let isHidden = false;

            if (filterKey === 'responsavel') {
              options = uniqueUsers;
              isSelected = (v) => selectedUsers.includes(v);
              onToggle = (v) => toggleFilter(selectedUsers, setSelectedUsers, v);
              onClear = () => setSelectedUsers([]);
              isAllSelected = selectedUsers.length === 0;
              if (isPersonalScope) isHidden = true;
            } else if (filterKey === 'dimensao') {
              options = uniqueDimensions;
              isSelected = (v) => selectedDimensions.includes(v);
              onToggle = (v) => toggleFilter(selectedDimensions, setSelectedDimensions, v);
              onClear = () => setSelectedDimensions([]);
              isAllSelected = selectedDimensions.length === 0;
            } else if (filterKey === 'status') {
              options = uniqueStatuses;
              isSelected = (v) => selectedStatuses.includes(v);
              onToggle = (v) => toggleFilter(selectedStatuses, setSelectedStatuses, v);
              onClear = () => setSelectedStatuses([]);
              isAllSelected = selectedStatuses.length === 0;
            } else if (filterKey === 'categoria') {
              options = uniqueCategories;
              isSelected = (v) => selectedCategories.includes(v);
              onToggle = (v) => toggleFilter(selectedCategories, setSelectedCategories, v);
              onClear = () => setSelectedCategories([]);
              isAllSelected = selectedCategories.length === 0;
            } else if (col) {
              // Coluna dinâmica
              options = col.options.map(o => o.value);
              isSelected = (v) => (customFilters[filterKey] || []).includes(v);
              onToggle = (v) => toggleCustomFilter(filterKey, v);
              onClear = () => setCustomFilters(prev => ({ ...prev, [filterKey]: [] }));
              isAllSelected = (customFilters[filterKey] || []).length === 0;
            }

            options = options.filter(o => o && o.trim() !== '');
            if (isHidden || options.length === 0) return null;

            return (
              <div key={filterKey} className="flex w-full overflow-x-auto hide-scrollbar items-center gap-2 shrink-0 pb-1 justify-start">
                <span className="text-[10px] text-[#8E8E8E] px-1 font-bold uppercase tracking-wider shrink-0">
                  {col ? col.name : filterKey}:
                </span>
                {options.length > 1 && (
                  <button 
                    onClick={onClear}
                    className={`h-[26px] px-3 text-[11px] rounded-md border transition-colors font-bold shrink-0
                      ${isAllSelected ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-[#FFCC00]' : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}
                  >
                    Todas
                  </button>
                )}
                {options.map(o => (
                  <button 
                    key={o} 
                    onClick={() => onToggle(o)}
                    className={`h-[26px] px-3 text-[11px] ${filterKey === 'responsavel' ? 'rounded-full' : 'rounded-md'} border transition-colors font-bold flex items-center justify-center gap-1 shrink-0
                      ${isSelected(o) ? getBadgeColorClass(filterKey, o) : 'bg-[#1A1A1A] border-[#FFCC00] text-[#8E8E8E] hover:border-[#9D4EDD]/50 hover:text-white'}`}
                  >
                    {filterKey === 'responsavel' && <span className="material-symbols-outlined text-[12px]">person</span>}
                    {o}
                  </button>
                ))}
              </div>
            );
          })}

          {/* Titulo Tarefas e View Mode */}
          <div className="w-full flex items-center justify-between mt-4 mb-2 border-b border-[#2D2D2D] pb-2">
            <h2 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-wider">Tarefas</h2>
            <div className="flex bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'list' ? 'bg-[#333333] text-white' : 'text-[#8E8E8E] hover:text-white'}`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-[#333333] text-white' : 'text-[#8E8E8E] hover:text-white'}`}
              >
                Calendário
              </button>
            </div>
          </div>

          {/* Row 4: Botão de Filtros */}
          <div className="flex flex-col md:flex-row w-full items-end md:items-center justify-end gap-3 shrink-0 pb-1 z-30">
            <div className="flex items-center text-[#8E8E8E] text-[11px] font-bold px-3 shrink-0 bg-[#1A1A1A] rounded-md border border-[#2D2D2D] h-[36px] w-auto justify-center md:justify-start order-2 md:order-1">
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

            <div className="flex items-center gap-3 order-1 md:order-2 w-full md:w-auto justify-end shrink-0 flex-wrap md:flex-nowrap">
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
                {!isPersonalScope && (
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
                )}

                {/* Section: Visibilidade Dimensões */}
                {uniqueDimensions.length > 1 && (
                  <div className="p-4 border-b border-[#2D2D2D]">
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

                {/* Section: Exportação */}
                <div className="p-4 bg-[#1A1A1A]">
                  <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-3">Exportar ({processedTasks.length} tarefas visíveis)</h3>
                  <div className="flex gap-2">
                    <button onClick={() => downloadCSV(processedTasks, 'tarefas_hub.csv')} className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 border border-[#0f9d58]/50 text-[#0f9d58] rounded hover:bg-[#0f9d58]/10 text-xs font-semibold transition-colors" title="Baixar CSV">
                      <span className="material-symbols-outlined text-[16px]">table</span> CSV
                    </button>
                    <button onClick={() => downloadICS(processedTasks, 'tarefas_hub.ics')} className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 border border-[#4285f4]/50 text-[#4285f4] rounded hover:bg-[#4285f4]/10 text-xs font-semibold transition-colors" title="Baixar Google Agenda (ICS)">
                      <span className="material-symbols-outlined text-[16px]">calendar_month</span> Agenda
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>
            
              <div className="relative">
                <button 
                  onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
                  className="bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors border border-[#404040]"
                >
                  <span className="material-symbols-outlined text-[18px]">view_column</span>
                  Editar Colunas
                  <span className="material-symbols-outlined text-[18px]">expand_more</span>
                </button>

                {isColumnsMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[240px] bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-[#2D2D2D]">
                      <h3 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2">Colunas</h3>
                      <div className="flex flex-col gap-1 max-h-[250px] overflow-y-auto">
                        {columns.map(col => (
                          <div key={col.id} className="flex justify-between items-center group px-2 py-1.5 hover:bg-[#252525] rounded-md transition-colors">
                            <span className="text-sm text-white truncate max-w-[150px]">{col.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsColumnsMenuOpen(false);
                                setEditingColumn(col);
                              }}
                              className="text-[#8E8E8E] hover:text-[#FFCC00] transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center p-1"
                              title="Editar Coluna"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        setIsColumnsMenuOpen(false);
                        setEditingColumn({
                          id: crypto.randomUUID(),
                          key: `custom_${Date.now()}`,
                          name: 'Nova Coluna',
                          type: 'select',
                          options: [],
                          is_native: false,
                          order_num: 0
                        });
                      }}
                      className="px-4 py-3 cursor-pointer transition-colors text-[#FFCC00] hover:bg-[#252525] font-bold text-sm flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      Adicionar Nova Coluna
                    </button>
                  </div>
                )}
              </div>
              <button 
                onClick={handleNew}
                className={`bg-[#FFCC00] text-[#121212] font-bold text-sm px-4 py-2 rounded-md hover:bg-[#e6b800] transition-colors shadow-sm shrink-0 ${localTasks.length === 0 ? 'animate-pulse ring-4 ring-[#FFCC00]/50' : ''}`}
              >
                + Nova Tarefa
              </button>
            </div>
          </div>


        </div>
      </div>


      {viewMode === 'list' ? (
        <>
          {/* Desktop View (Table) */}
      <div ref={desktopContainerRef} style={{ overflowAnchor: 'none' }} className="hidden md:block overflow-x-auto bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg relative">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead className="bg-[#252525] border-b border-[#2D2D2D] sticky top-0 z-10">
            <tr>
              <th className="p-4 w-[100px] text-center">
                <input type="checkbox" className="accent-[#9D4EDD] rounded-sm" onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTasks(new Set(processedTasks.map(t => t.id)));
                  } else {
                    setSelectedTasks(new Set());
                  }
                }} checked={selectedTasks.size === processedTasks.length && processedTasks.length > 0} />
              </th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider text-center w-[60px]">
                <div className="flex items-center justify-center gap-1 relative group/tooltip cursor-help w-fit mx-auto">
                  Ação <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    Botões de edição e sub-tarefas.
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider w-[220px]">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Nome <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-left font-normal normal-case tracking-normal left-0">
                    O nome principal da sua tarefa.
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Status <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    O estágio atual da tarefa (Ex: Em progresso).
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Prioridade <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    Nível de urgência (Alta, Média, Baixa).
                  </div>
                </div>
              </th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Categoria <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal left-1/2 -translate-x-1/2">
                    O tipo de ação (Ex: Programar, Estudar).
                  </div>
                </div>
              </th>
              {visibleExtraCols.includes("responsavel") && <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Responsável</th>}
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Criada em</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Início</th>
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Prazo</th>
              {hasAnyPrazo && <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Dias Restantes</th>}
              {visibleExtraCols.includes("concluida_em") && <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Concluída em</th>}
              {visibleExtraCols.includes("frequencia") && <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">Freq.</th>}
              <th className="p-4 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider">
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  Dimensão <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    A grande área da sua vida (Pessoal, Saúde, etc).
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {localTasks.length === 0 && (
              <tr>
                <td colSpan={14} className="p-8 text-center text-[#8E8E8E]">
                  Nenhuma tarefa encontrada. Clique em <span className="text-[#FFCC00] font-bold">+ Nova Tarefa</span> para começar.
                </td>
              </tr>
            )}
            {processedTasks.map(task => (
              <React.Fragment key={task.id}>
              <tr 
                draggable={sortBy === 'manual' ? true : undefined}
                onDragStart={sortBy === 'manual' ? (e) => handleDragStart(e, task.id) : undefined}
                onDragOver={sortBy === 'manual' ? (e) => handleDragOver(e, task.id) : undefined}
                onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
                onDrop={sortBy === 'manual' ? (e) => handleDrop(e, task.id) : undefined}
                onDragEnd={sortBy === 'manual' ? () => setDropTargetId(null) : undefined}
                onClick={(e) => handleRowClick(e, task.id)}
                className={`transition-colors group ${selectedTasks.has(task.id) ? 'bg-[#9D4EDD]/10' : 'hover:bg-[#252525]'} ${draggedTaskId === task.id ? 'opacity-50' : ''} ${dropTargetId === task.id ? (dropPosition === 'top' ? 'border-t-2 border-[#9D4EDD]' : 'border-b-2 border-[#9D4EDD]') : 'border-b border-[#FFCC00]/30 hover:border-[#9D4EDD]'}`}
              >
                <td className="p-4">
                  <div className="flex items-center justify-center gap-2">
                    <span className={`material-symbols-outlined text-[#8E8E8E] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-not-allowed'}`} title={sortBy !== 'manual' ? 'Mude para ordenação Manual para arrastar' : 'Arrastar'}>drag_indicator</span>
                    <input type="checkbox" className="accent-[#9D4EDD] rounded-sm" checked={selectedTasks.has(task.id)} onChange={(e) => toggleCheckbox(e, task.id)} />
                    <button onClick={(e) => handleFavoriteToggle(e, task.id)} className={`transition-colors flex items-center justify-center ${task.is_favorite ? 'text-[#FFCC00]' : 'text-[#8E8E8E] hover:text-[#FFCC00]'}`}>
                      <span className={`material-symbols-outlined text-[18px] ${task.is_favorite ? 'filled' : ''}`} style={task.is_favorite ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
                    </button>
                  </div>
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
                  <div className={`flex items-center gap-2 ${task.parent_id ? 'pl-4 border-l-2 border-[#2D2D2D] ml-2' : ''}`}>
                    {!task.parent_id && localTasks.some(t => t.parent_id === task.id) && (
                      <button onClick={(e) => toggleExpand(e, task.id)} className="text-[#8E8E8E] hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">{!collapsedTasks.has(task.id) ? 'expand_more' : 'chevron_right'}</span>
                      </button>
                    )}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <HighlightedText text={task.nome} highlight={searchTerm} />
                        {(task as any).custom_fields?.foto_url && (
                          <a href={(task as any).custom_fields.foto_url} target="_blank" rel="noopener noreferrer" className="text-[#8E8E8E] hover:text-[#9D4EDD] flex items-center transition-colors" title="Ver foto">
                            <span className="material-symbols-outlined text-[16px]">image</span>
                          </a>
                        )}
                      </div>
                      {task.descricao && (
                        <div className="text-[10px] text-[#A0A0A0] mt-1 line-clamp-1">
                          <HighlightedText text={task.descricao} highlight={searchTerm} />
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'status')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar status"><Badge type="status" value={task.status} customColor={getColColor('status', task.status)} /></div></td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'prioridade')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar prioridade"><Badge type="prioridade" value={task.prioridade} customColor={getColColor('prioridade', task.prioridade)} /></div></td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'categoria')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar categoria"><Badge type="categoria" value={task.categoria} customColor={getColColor('categoria', task.categoria)} /></div></td>
                {!isPersonalScope && <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'responsavel')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar responsável"><Badge type="responsavel" value={task.responsavel} customColor={getColColor('responsavel', task.responsavel)} /></div></td>}
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.created_at)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.inicio)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.prazo)}</td>
                {hasAnyPrazo && (
                  <td className="p-4 text-xs">
                    {task.prazo ? (
                      (() => {
                        if (task.status === 'completa') {
                          const days = getDaysUntil(task.prazo, task.concluida_em);
                          if (days === null) return <span className="text-[#9D4EDD] font-bold">Concluída</span>;
                          return <span className="text-[#9D4EDD] font-bold">Concluída ({days > 0 ? `+${days}d` : `${days}d`})</span>;
                        }
                        if (task.status === 'descartada') return <span className="text-[#8E8E8E] font-bold">-</span>;
                        const days = getDaysUntil(task.prazo);
                        if (days === null) return '-';
                        if (days < 0) return <span className="text-[#db4437] font-bold">Atrasada ({-days}d)</span>;
                        if (days === 0) return <span className="text-[#db4437] font-bold">Hoje!</span>;
                        return <span className="text-[#FFCC00] font-bold">{days} dias</span>;
                      })()
                    ) : '-'}
                  </td>
                )}
                <td className="p-4 text-xs text-[#A0A0A0]">{formatDate(task.concluida_em)}</td>
                <td className="p-4 text-xs text-[#A0A0A0]">{task.frequencia || '-'}</td>
                <td className="p-4" onClick={(e) => handleBadgeClick(e, task, 'dimensao')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block" title="Clique para alterar dimensão"><Badge type="dimensao" value={task.dimensao} customColor={getColColor('dimensao', task.dimensao)} /></div></td>
              </tr>
              </React.Fragment>
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
      <div ref={mobileContainerRef} style={{ overflowAnchor: 'none' }} className="md:hidden space-y-4 pb-20 mt-4">
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
              <button onClick={(e) => handleFavoriteToggle(e, task.id)} className={`transition-colors flex items-center justify-center ${task.is_favorite ? 'text-[#FFCC00]' : 'text-[#8E8E8E] hover:text-[#FFCC00]'}`}>
                <span className={`material-symbols-outlined text-[18px] ${task.is_favorite ? 'filled' : ''}`} style={task.is_favorite ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
              </button>
              <input type="checkbox" className="accent-[#9D4EDD] rounded-sm w-4 h-4" checked={selectedTasks.has(task.id)} onChange={(e) => toggleCheckbox(e, task.id)} />
              <button 
                onClick={() => handleEdit(task)}
                className="text-[#8E8E8E] hover:text-[#9D4EDD]"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            
            <div className={`pr-16 flex items-start gap-2 ${task.parent_id ? 'pl-4 border-l-2 border-[#2D2D2D] ml-2' : ''}`}>
              {!task.parent_id && localTasks.some(t => t.parent_id === task.id) && (
                <button onClick={(e) => toggleExpand(e, task.id)} className="text-[#8E8E8E] hover:text-white transition-colors flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[20px]">{!collapsedTasks.has(task.id) ? 'expand_more' : 'chevron_right'}</span>
                </button>
              )}
              {(!task.parent_id || !localTasks.some(t => t.parent_id === task.id)) && (
                <span className={`material-symbols-outlined text-[#8E8E8E] text-[18px] mt-0.5 ${sortBy === 'manual' ? 'cursor-grab' : 'cursor-not-allowed'}`} title={sortBy !== 'manual' ? 'Mude para ordenação Manual para arrastar' : 'Arrastar'}>drag_indicator</span>
              )}
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  <div className="flex items-center gap-2">
                    <HighlightedText text={task.nome} highlight={searchTerm} />
                    {(task as any).custom_fields?.foto_url && (
                      <a href={(task as any).custom_fields.foto_url} target="_blank" rel="noopener noreferrer" className="text-[#8E8E8E] hover:text-[#9D4EDD] flex items-center transition-colors" title="Ver foto">
                        <span className="material-symbols-outlined text-[16px]">image</span>
                      </a>
                    )}
                  </div>
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
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider truncate">Status</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Estágio atual.")}><span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span></div>
</div>
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider truncate">Prio</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Nível de urgência.")}><span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span></div>
</div>
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider truncate">Categ</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Tipo de ação.")}><span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span></div>
</div>
                {visibleExtraCols.includes("responsavel") && <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider flex-1 truncate">Resp</span>}
                <div className="flex-1 flex justify-center items-center gap-1">
  <span className="text-[9px] text-[#8E8E8E] font-semibold uppercase tracking-wider truncate">Dim</span>
  <div className="flex items-center gap-1 cursor-pointer" onClick={(e) => handleTooltipClick(e, "Área da vida.")}><span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span></div>
</div>
              </div>
              <div className="flex justify-between items-center text-center gap-1">
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'status')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="status" value={task.status} customColor={getColColor('status', task.status)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'prioridade')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="prioridade" value={task.prioridade} customColor={getColColor('prioridade', task.prioridade)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'categoria')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="categoria" value={task.categoria} customColor={getColColor('categoria', task.categoria)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'responsavel')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="responsavel" value={task.responsavel} customColor={getColColor('responsavel', task.responsavel)} /></div></div>
                <div className="flex-1 flex justify-center overflow-hidden" onClick={(e) => handleBadgeClick(e, task, 'dimensao')}><div className="cursor-pointer hover:opacity-80 transition-opacity inline-block"><Badge type="dimensao" value={task.dimensao} customColor={getColColor('dimensao', task.dimensao)} /></div></div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 border-t border-[#2D2D2D] pt-2 pb-1 text-[9px] text-[#A0A0A0] pl-6 pr-2">
              <span className="truncate">Cria: {formatDate(task.created_at)}</span>
              <span className="truncate">Ini: {formatDate(task.inicio)}</span>
              <span className="truncate flex items-center gap-1">
                Fim: {formatDate(task.prazo)}
                {task.prazo && (
                  (() => {
                    if (task.status === 'completa') {
                      const days = getDaysUntil(task.prazo, task.concluida_em);
                      if (days === null) return <span className="text-[#9D4EDD] font-bold">Concluída</span>;
                      return <span className="text-[#9D4EDD] font-bold">Concluída ({days > 0 ? `+${days}d` : `${days}d`})</span>;
                    }
                    if (task.status === 'descartada') return <span className="text-[#8E8E8E] font-bold">-</span>;
                    const days = getDaysUntil(task.prazo);
                    if (days === null) return null;
                    if (days < 0) return <span className="text-[#db4437] font-bold">({-days}d)</span>;
                    if (days === 0) return <span className="text-[#db4437] font-bold">Hoje!</span>;
                    return <span className="text-[#FFCC00] font-bold">{days}d</span>;
                  })()
                )}
              </span>
              <span className="truncate">Concl: {formatDate(task.concluida_em)}</span>
            </div>
            {task.descricao && (
              <div className="mt-2 text-xs text-gray-300">
                <div className="font-semibold text-gray-500 mb-1">Descrição</div>
                <div className="whitespace-pre-wrap">{task.descricao}</div>
              </div>
            )}
          </div>
        ))}
        {localTasks.length === 0 && (
          <div className="p-4 bg-[#1A1A1A] rounded-lg border border-[#FFCC00]/50 shadow-sm relative animate-pulse-slow">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  Bem-vindo! Tarefa de exemplo.
                  <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                    <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                    <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-left font-normal normal-case tracking-normal left-0">
                      O nome principal da sua tarefa.
                    </div>
                  </div>
                </h3>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between text-[10px] bg-[#252525] p-2 rounded">
                <span className="text-[#8E8E8E] font-bold uppercase tracking-wider">Status</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    O estágio atual da tarefa (Ex: Em progresso).
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] bg-[#252525] p-2 rounded">
                <span className="text-[#8E8E8E] font-bold uppercase tracking-wider">Dimensão</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    A grande área da sua vida (Pessoal, Saúde, etc).
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] bg-[#252525] p-2 rounded">
                <span className="text-[#8E8E8E] font-bold uppercase tracking-wider">Prioridade</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    Nível de urgência (Alta, Média, Baixa).
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] bg-[#252525] p-2 rounded">
                <span className="text-[#8E8E8E] font-bold uppercase tracking-wider">Categoria</span>
                <div className="flex items-center gap-1 relative group/tooltip cursor-help w-fit">
                  <span className="material-symbols-outlined text-[6px] text-[#8E8E8E]">help</span>
                  <div className="absolute top-full mt-2 w-48 p-2 bg-[#121212] text-white text-[11px] rounded border border-[#2D2D2D] shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible z-50 text-center font-normal normal-case tracking-normal right-0">
                    O tipo de ação (Ex: Programar, Estudar).
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-center text-[#8E8E8E] text-xs">
              Nenhuma tarefa encontrada.<br/>Clique em <span className="text-[#FFCC00] font-bold">+ Nova Tarefa</span> para começar.
            </div>
          </div>
        )}
        {processedTasks.length === 0 && localTasks.length > 0 && (
          <div className="p-8 text-center text-[#8E8E8E] text-sm bg-[#1A1A1A] rounded-lg border border-[#2D2D2D]">
            Nenhuma tarefa encontrada.
          </div>
        )}
      </div>
      </>
      ) : (
        <TaskCalendar
          tasks={processedTasks}
          currentDate={calendarCurrentDate}
          onDateChange={setCalendarCurrentDate}
          onTaskClick={handleEdit}
        />
      )}

      {/* Floating Bulk Edit Button (Visible only when tasks are selected) */}
      {selectedTasks.size > 0 && (
        <button 
          onClick={() => setIsBulkEditModalOpen(true)}
          className={`fixed right-6 bg-[#9D4EDD] hover:bg-[#8A3BCE] text-[#FFFFFF] p-3 rounded-full shadow-[0_8px_32px_rgba(157,78,221,0.3)] transition-all duration-300 flex items-center justify-center z-[999] group ${isAurtistic ? 'bottom-[22rem] md:bottom-56' : 'bottom-72 md:bottom-40'}`}
          title="Editar Selecionadas"
        >
          <span className="material-symbols-outlined font-bold">edit</span>
        </button>
      )}

      {/* Floating Add Task Button */}
      <button 
        onClick={handleNew}
        className={`fixed right-6 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] p-3 rounded-full shadow-[0_8px_32px_rgba(255,204,0,0.3)] transition-all duration-300 flex items-center justify-center z-[999] group ${isAurtistic ? 'bottom-72 md:bottom-40' : 'bottom-56 md:bottom-24'} ${localTasks.length === 0 ? 'animate-pulse ring-4 ring-[#FFCC00]/50' : ''}`}
        title="Nova Tarefa"
      >
        <span className="material-symbols-outlined font-bold">add</span>
      </button>

      {/* Floating Scroll to Top Button */}
      {isAurtistic && (
        <button 
          onClick={scrollToTop}
          className="fixed bottom-56 md:bottom-24 right-6 bg-[#1A1A1A] hover:bg-[#9D4EDD]/10 border border-[#FFCC00]/50 hover:border-[#9D4EDD] text-[#8E8E8E] hover:text-[#9D4EDD] p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center z-[999] group"
          title="Ir para o topo"
        >
          <span className="material-symbols-outlined">arrow_upward</span>
        </button>
      )}

      {/* Floating Scroll to Bottom Button */}
      <button 
        onClick={scrollToBottom}
        className="fixed bottom-40 md:bottom-8 right-6 bg-[#1A1A1A] hover:bg-[#9D4EDD]/10 border border-[#FFCC00]/50 hover:border-[#9D4EDD] text-[#8E8E8E] hover:text-[#9D4EDD] p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center z-[999] group"
        title="Ir para o fundo (Mais Recentes)"
      >
        <span className="material-symbols-outlined">arrow_downward</span>
      </button>

      {/* Modals */}
      <TaskFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        task={taskToEdit} 
        uniqueCategories={uniqueCategories} 
        uniqueDimensions={uniqueDimensions}
        columns={columns}
        onEditColumn={(col) => setEditingColumn(col)}
      />
      <BulkEditModal 
        isOpen={isBulkEditModalOpen} 
        onClose={() => setIsBulkEditModalOpen(false)} 
        taskIds={Array.from(selectedTasks)} 
        tasks={localTasks} 
        onSuccess={() => { setIsBulkEditModalOpen(false); setSelectedTasks(new Set()); setLastSelectedTaskId(null); }} 
        uniqueCategories={uniqueCategories} 
        uniqueDimensions={uniqueDimensions}
        columns={columns}
        onEditColumn={(col) => setEditingColumn(col)}
      />
      
      {editingColumn && (
        <OptionsEditorModal
          column={editingColumn}
          onClose={() => setEditingColumn(null)}
          onSave={async (updatedColumn) => {
            await saveTaskColumn(updatedColumn);
            setColumns(prev => prev.map(c => c.id === updatedColumn.id ? updatedColumn : c));
          }}
        />
      )}

      
      {/* Active Tooltip Dropdown */}
      {activeTooltip && (
        <div
          className="fixed z-[100] w-32 p-2 bg-[#121212] text-white text-[10px] rounded border border-[#2D2D2D] shadow-xl text-center font-normal normal-case tracking-normal"
          style={{ top: activeTooltip.top, bottom: activeTooltip.bottom, left: activeTooltip.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {activeTooltip.text}
        </div>
      )}

      {/* Quick Edit Dropdown */}
      {quickEdit && (
        <div 
          className="fixed z-[100] bg-[#1A1A1A] border border-[#2D2D2D] rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden min-w-[140px]"
          style={{ top: quickEdit.top, bottom: quickEdit.bottom, left: quickEdit.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-[250px] overflow-y-auto flex flex-col py-1">
            {quickEdit.field === 'status' && ["não iniciada","em progresso","falta testar","completa","descartada"].map(option => (
                  <button key={option} className={`text-left px-3 py-2 text-xs hover:bg-[#252525] transition-colors ${quickEdit.value?.toLowerCase() === option ? 'text-[#9D4EDD] font-bold bg-[#9D4EDD]/10' : 'text-[#E0E0E0]'}`} onClick={() => handleQuickSave(quickEdit.taskId, 'status', option)}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
            ))}
            {quickEdit.field === 'responsavel' && ["João","Andy","Leo","Dani","Lorenzo","Nacky"].map(option => (
                  <button key={option} className={`text-left px-3 py-2 text-xs hover:bg-[#252525] transition-colors ${quickEdit.value === option ? 'text-[#9D4EDD] font-bold bg-[#9D4EDD]/10' : 'text-[#E0E0E0]'}`} onClick={() => handleQuickSave(quickEdit.taskId, 'responsavel', option)}>
                    {option}
                  </button>
            ))}
            {quickEdit.field === 'prioridade' && ["Alta", "Média", "Baixa", ""].map(option => (
                  <button key={option} className={`text-left px-3 py-2 text-xs hover:bg-[#252525] transition-colors ${quickEdit.value === option ? 'text-[#9D4EDD] font-bold bg-[#9D4EDD]/10' : 'text-[#E0E0E0]'}`} onClick={() => handleQuickSave(quickEdit.taskId, 'prioridade', option)}>
                    {option || "Nenhuma"}
                  </button>
            ))}
            {quickEdit.field === 'categoria' && Array.from(new Set([...uniqueCategories, ""])).map(option => (
                  <button key={option} className={`text-left px-3 py-2 text-xs hover:bg-[#252525] transition-colors ${quickEdit.value === option ? 'text-[#9D4EDD] font-bold bg-[#9D4EDD]/10' : 'text-[#E0E0E0]'}`} onClick={() => handleQuickSave(quickEdit.taskId, 'categoria', option)}>
                    {option || "Nenhuma"}
                  </button>
            ))}
            {quickEdit.field === 'dimensao' && Array.from(new Set([...uniqueDimensions.filter(d => d !== 'favoritas'), ""])).map(option => (
                  <button key={option} className={`text-left px-3 py-2 text-xs hover:bg-[#252525] transition-colors ${quickEdit.value === option ? 'text-[#9D4EDD] font-bold bg-[#9D4EDD]/10' : 'text-[#E0E0E0]'}`} onClick={() => handleQuickSave(quickEdit.taskId, 'dimensao', option)}>
                    {option || "Nenhuma"}
                  </button>
            ))}
          </div>
        </div>
      )}
      {/* Modal Quick Filters */}
      {isQuickFiltersModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#2D2D2D] flex items-center justify-between bg-[#121212]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FFCC00]">settings</span>
                Filtros Rápidos
              </h2>
              <button 
                onClick={() => setIsQuickFiltersModalOpen(false)}
                className="text-[#8E8E8E] hover:text-white transition-colors flex items-center justify-center p-1 rounded-full hover:bg-[#2D2D2D]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex w-full border-b border-[#2D2D2D] bg-[#1A1A1A]">
               <button className={`flex-1 py-3 text-sm font-bold transition-colors ${quickFiltersTab === 'visibilidade' ? 'text-[#FFCC00] border-b-2 border-[#FFCC00]' : 'text-[#8E8E8E] hover:text-white'}`} onClick={() => setQuickFiltersTab('visibilidade')}>Visibilidade</button>
               <button className={`flex-1 py-3 text-sm font-bold transition-colors ${quickFiltersTab === 'ordem' ? 'text-[#FFCC00] border-b-2 border-[#FFCC00]' : 'text-[#8E8E8E] hover:text-white'}`} onClick={() => setQuickFiltersTab('ordem')}>Ordem</button>
            </div>
            
            <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              
              {quickFiltersTab === 'visibilidade' ? (
                <>
                  <p className="text-xs text-[#A0A0A0] mb-2">Selecione quais colunas você quer que apareçam como botões para filtrar as tarefas.</p>
                  
                  {['status', 'categoria', 'responsavel', 'dimensao'].map(key => {
                    if (isPersonalScope && key === 'responsavel') return null;
                    const isSelected = quickFilters.includes(key);
                    const labels: Record<string, string> = {
                      'status': 'Status',
                      'categoria': 'Categoria',
                      'responsavel': 'Responsável',
                      'dimensao': 'Dimensão'
                    };
                    return (
                      <label key={key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-[#252525] rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newFilters = [...quickFilters];
                            if (e.target.checked) newFilters.push(key);
                            else newFilters = newFilters.filter(k => k !== key);
                            setQuickFilters(newFilters);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-[#8E8E8E] group-hover:text-[#A0A0A0]'}`}>{labels[key]}</span>
                      </label>
                    );
                  })}

                  {columns.length > 0 && <hr className="border-[#2D2D2D] my-2" />}

                  {columns.map(col => {
                    if (col.type !== 'select') return null;
                    const staticKeys = ['status', 'categoria', 'responsavel', 'dimensao', 'prioridade', 'prazo', 'manual'];
                    if (staticKeys.includes(col.key)) return null;
                    const isSelected = quickFilters.includes(col.key);
                    return (
                      <label key={col.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-[#252525] rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newFilters = [...quickFilters];
                            if (e.target.checked) newFilters.push(col.key);
                            else newFilters = newFilters.filter(k => k !== col.key);
                            setQuickFilters(newFilters);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-[#8E8E8E] group-hover:text-[#A0A0A0]'}`}>{col.name}</span>
                      </label>
                    );
                  })}
                </>
              ) : (
                <>
                  <p className="text-xs text-[#A0A0A0] mb-2">Selecione quais colunas podem ser usadas para ordenar a visualização das tarefas (Linha ORDEM).</p>
                  
                  {['status', 'prazo', 'prioridade', 'categoria', 'manual'].map(key => {
                    const isSelected = quickSorts.includes(key);
                    const labels: Record<string, string> = {
                      'status': 'Status (Padrão)',
                      'prazo': 'Prazo',
                      'prioridade': 'Prioridade',
                      'categoria': 'Categoria',
                      'manual': 'Manual (Arrastar)'
                    };
                    return (
                      <label key={key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-[#252525] rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newSorts = [...quickSorts];
                            if (e.target.checked) newSorts.push(key);
                            else newSorts = newSorts.filter(k => k !== key);
                            setQuickSorts(newSorts);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-[#8E8E8E] group-hover:text-[#A0A0A0]'}`}>{labels[key]}</span>
                      </label>
                    );
                  })}

                  {columns.length > 0 && <hr className="border-[#2D2D2D] my-2" />}

                  {columns.map(col => {
                    const staticKeys = ['status', 'categoria', 'responsavel', 'dimensao', 'prioridade', 'prazo', 'manual'];
                    if (staticKeys.includes(col.key)) return null;
                    const isSelected = quickSorts.includes(col.key);
                    return (
                      <label key={col.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-[#252525] rounded-md transition-colors">
                        <input type="checkbox" className="accent-[#FFCC00] w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => {
                            let newSorts = [...quickSorts];
                            if (e.target.checked) newSorts.push(col.key);
                            else newSorts = newSorts.filter(k => k !== col.key);
                            setQuickSorts(newSorts);
                          }}
                        />
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-[#8E8E8E] group-hover:text-[#A0A0A0]'}`}>{col.name}</span>
                      </label>
                    );
                  })}
                </>
              )}

            </div>

            <div className="p-4 border-t border-[#2D2D2D] bg-[#121212] flex justify-end">
              <button
                onClick={async () => {
                  try {
                    const { saveQuickPreferences } = await import('@/app/(dashboard)/actions');
                    await saveQuickPreferences(quickFilters, quickSorts);
                    setIsQuickFiltersModalOpen(false);
                  } catch(e: any) {
                    alert('Erro ao salvar preferências: ' + e.message);
                  }
                }}
                className="bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold py-2 px-6 rounded-md transition-colors text-sm"
              >
                Salvar Preferências
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
