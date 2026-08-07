'use client';

import { useState } from 'react';
import { Task, TaskColumn } from '@/types';
import { updateMultipleTasks, deleteMultipleTasks } from '@/lib/offlineActions';
import { getBadgeColorClass } from './Badge';
import { CustomSelect } from './CustomSelect';
import { downloadICS } from '@/utils/ics';
import { downloadCSV } from '@/utils/csv';

const CheckboxToggle = ({ field, label, isActive, onToggle }: { field: string, label: string, isActive: boolean, onToggle: (field: string) => void }) => (
  <label className="flex items-center gap-2 cursor-pointer mb-2 w-fit">
    <input 
      type="checkbox" 
      checked={isActive} 
      onChange={() => onToggle(field)} 
      className="accent-[#9D4EDD] w-4 h-4 rounded-sm"
    />
    <span className="text-xs text-[#8E8E8E] uppercase tracking-wider font-bold hover:text-white transition-colors">{label}</span>
  </label>
);

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskIds: string[];
  tasks: Task[];
  onSuccess: () => void;
  uniqueCategories?: string[];
  uniqueDimensions?: string[];
  columns?: TaskColumn[];
  onEditColumn?: (col: TaskColumn) => void;
}

export function BulkEditModal({ isOpen, onClose, taskIds, tasks, onSuccess, uniqueCategories, uniqueDimensions, columns = [], onEditColumn }: BulkEditModalProps) {
  const [loading, setLoading] = useState(false);
  
  // Track which fields are active for bulk update
  const [activeFields, setActiveFields] = useState<Record<string, boolean>>({
    status: false,
    prioridade: false,
    categoria: false,
    responsavel: false,
    dimensao: false,
    frequencia: false,
    inicio: false,
    prazo: false,
  });

  const [formData, setFormData] = useState<Partial<Task>>({
    status: 'não iniciada',
    prioridade: '',
    categoria: '',
    responsavel: '',
    dimensao: '',
    inicio: '',
    prazo: '',
    frequencia: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Build the updates object with only the active fields
    const updates: Partial<Task> = {};
    let hasUpdates = false;
    
    (Object.keys(activeFields) as Array<keyof typeof activeFields>).forEach(key => {
      if (activeFields[key]) {
        (updates as any)[key] = formData[key as keyof Task];
        hasUpdates = true;
      }
    });

    if (!hasUpdates) {
      alert("Selecione ao menos um campo para editar.");
      return;
    }

    setLoading(true);
    try {
      await updateMultipleTasks(taskIds, updates);
      onSuccess();
    } catch (err) {
      alert('Erro ao editar em massa: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Tem certeza que deseja excluir as ${taskIds.length} tarefas selecionadas?`)) return;
    setLoading(true);
    try {
      await deleteMultipleTasks(taskIds);
      onSuccess();
    } catch (err) {
      alert('Erro ao excluir tarefas: ' + String(err));
      setLoading(false);
    }
  };


  const handleExportCalendar = () => {
    const selectedTasks = tasks.filter(t => taskIds.includes(t.id));
    if (selectedTasks.length === 0) return;
    downloadICS(selectedTasks, 'tarefas_hub.ics');
  };

  const handleExportCSV = () => {
    const selectedTasks = tasks.filter(t => taskIds.includes(t.id));
    if (selectedTasks.length === 0) return;
    downloadCSV(selectedTasks, 'tarefas_hub.csv');
  };

  const handleFieldToggle = (field: string) => {
    setActiveFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    // Automatically check the checkbox if they type/select something, but only if it was unchecked.
    if (!activeFields[e.target.name]) {
      setActiveFields(prev => ({ ...prev, [e.target.name]: true }));
    }
  };

  // Helper to get options for a column key
  const getColumnOptions = (key: string, defaultOptions: any[] = []) => {
    const col = columns.find(c => c.key === key);
    if (!col) return defaultOptions;
    return col.options.map(o => ({ label: o.label, value: o.value, color: o.color }));
  };

  const statusOptions = getColumnOptions('status', [
    { label: 'Não iniciada', value: 'não iniciada' },
    { label: 'Em progresso', value: 'em progresso' },
    { label: 'Falta testar', value: 'falta testar' },
    { label: 'Completa', value: 'completa' },
    { label: 'Descartada', value: 'descartada' }
  ]);
  
  const prioridadeOptions = getColumnOptions('prioridade', [
    { label: 'Nenhuma', value: '' },
    { label: 'Baixa', value: 'Baixa' },
    { label: 'Média', value: 'Média' },
    { label: 'Alta', value: 'Alta' }
  ]);
  
  const responsavelOptions = getColumnOptions('responsavel', [
    { label: 'Nenhum', value: '' },
    { label: 'João', value: 'João' },
    { label: 'Andy', value: 'Andy' },
    { label: 'Leo', value: 'Leo' },
    { label: 'Dani', value: 'Dani' },
    { label: 'Lorenzo', value: 'Lorenzo' },
    { label: 'Nacky', value: 'Nacky' }
  ]);

  const baseCategoriaOptions = getColumnOptions('categoria', []);
  const extraCategoriaOptions = (uniqueCategories || [])
    .filter(c => c && !baseCategoriaOptions.some(o => o.value === c))
    .map(c => ({ label: c, value: c }));
  const categoriaOptions = baseCategoriaOptions.length > 0
    ? [...baseCategoriaOptions, ...extraCategoriaOptions]
    : (extraCategoriaOptions.length > 0 ? [{label: 'Nenhuma', value: ''}, ...extraCategoriaOptions] : []);

  const baseDimensaoOptions = getColumnOptions('dimensao', []);
  const extraDimensaoOptions = (uniqueDimensions || [])
    .filter(d => d && d !== 'favoritas' && !baseDimensaoOptions.some(o => o.value === d))
    .map(d => ({ label: d, value: d }));
  const dimensaoOptions = baseDimensaoOptions.length > 0
    ? [...baseDimensaoOptions, ...extraDimensaoOptions]
    : (extraDimensaoOptions.length > 0 ? [{label: 'Nenhuma', value: ''}, ...extraDimensaoOptions] : []);

  const handleEditCol = (key: string) => {
    if (!onEditColumn) return;
    const col = columns.find(c => c.key === key);
    if (col) onEditColumn(col);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 pb-24 sm:pb-4">
      <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-lg shadow-xl w-full max-w-3xl max-h-[75vh] sm:max-h-[90vh] flex flex-col">
        
        <div className="flex justify-between items-center p-6 border-b border-[#2D2D2D]">
          <div>
            <h2 className="text-xl font-bold text-[#9D4EDD]">Edição em Massa</h2>
            <p className="text-xs text-[#A0A0A0] mt-1">Alterando {taskIds.length} tarefas selecionadas. Marque os campos que deseja sobrescrever.</p>
          </div>
          <button onClick={onClose} className="text-[#A0A0A0] hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Status */}
            <div className={`p-3 rounded-lg border transition-colors ${activeFields.status ? 'border-[#9D4EDD]/50 bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="status" label="Status" isActive={!!activeFields.status} onToggle={handleFieldToggle} />
              <CustomSelect name="status" value={formData.status || ''} onChange={handleChange} type="status" options={statusOptions} disabled={!activeFields.status} allowCustom={true} onEditColumn={columns.find(c => c.key === 'status') ? () => handleEditCol('status') : undefined} />
            </div>

            {/* Prioridade */}
            <div className={`p-3 border rounded-md transition-colors ${activeFields.prioridade ? 'border-[#9D4EDD] bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="prioridade" label="Prioridade" isActive={activeFields.prioridade} onToggle={handleFieldToggle} />
              <CustomSelect name="prioridade" value={formData.prioridade || ''} onChange={handleChange} type="prioridade" options={prioridadeOptions} disabled={!activeFields.prioridade} allowCustom={true} onEditColumn={columns.find(c => c.key === 'prioridade') ? () => handleEditCol('prioridade') : undefined} />
            </div>

            {/* Categoria */}
            <div className={`p-3 border rounded-md transition-colors ${activeFields.categoria ? 'border-[#9D4EDD] bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="categoria" label="Categoria" isActive={activeFields.categoria} onToggle={handleFieldToggle} />
              <CustomSelect name="categoria" value={formData.categoria || ''} onChange={handleChange} type="categoria" options={categoriaOptions} allowCustom={true} disabled={!activeFields.categoria} onEditColumn={columns.find(c => c.key === 'categoria') ? () => handleEditCol('categoria') : undefined} />
            </div>

            {/* Responsável */}
            <div className={`p-3 border rounded-md transition-colors ${activeFields.responsavel ? 'border-[#9D4EDD] bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="responsavel" label="Responsável" isActive={activeFields.responsavel} onToggle={handleFieldToggle} />
              <CustomSelect name="responsavel" value={formData.responsavel || ''} onChange={handleChange} type="responsavel" options={responsavelOptions} disabled={!activeFields.responsavel} allowCustom={true} onEditColumn={columns.find(c => c.key === 'responsavel') ? () => handleEditCol('responsavel') : undefined} />
            </div>

            {/* Dimensão */}
            <div className={`p-3 border rounded-md transition-colors ${activeFields.dimensao ? 'border-[#9D4EDD] bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="dimensao" label="Dimensão" isActive={activeFields.dimensao} onToggle={handleFieldToggle} />
              <CustomSelect name="dimensao" value={formData.dimensao || ''} onChange={handleChange} type="dimensao" options={dimensaoOptions} allowCustom={true} disabled={!activeFields.dimensao} onEditColumn={columns.find(c => c.key === 'dimensao') ? () => handleEditCol('dimensao') : undefined} />
            </div>

            {/* Frequência */}
            <div className={`p-3 rounded-lg border transition-colors ${activeFields.frequencia ? 'border-[#9D4EDD]/50 bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="frequencia" label="Frequência" isActive={!!activeFields.frequencia} onToggle={handleFieldToggle} />
              <input disabled={!activeFields.frequencia} placeholder="Ex: Diária, Semanal, Mensal" name="frequencia" value={formData.frequencia || ''} onChange={handleChange} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] disabled:opacity-50" />
            </div>

            {/* Início */}
            <div className={`p-3 rounded-lg border transition-colors ${activeFields.inicio ? 'border-[#9D4EDD]/50 bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="inicio" label="Início" isActive={!!activeFields.inicio} onToggle={handleFieldToggle} />
              <input disabled={!activeFields.inicio} type="date" name="inicio" value={formData.inicio || ''} onChange={handleChange} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark] disabled:opacity-50" />
            </div>

            {/* Prazo */}
            <div className={`p-3 rounded-lg border transition-colors ${activeFields.prazo ? 'border-[#9D4EDD]/50 bg-[#9D4EDD]/5' : 'border-[#2D2D2D]'}`}>
              <CheckboxToggle field="prazo" label="Prazo" isActive={!!activeFields.prazo} onToggle={handleFieldToggle} />
              <input disabled={!activeFields.prazo} type="date" name="prazo" value={formData.prazo || ''} onChange={handleChange} className="w-full bg-[#121212] border border-[#2D2D2D] rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#FFCC00] [color-scheme:dark] disabled:opacity-50" />
            </div>

          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button type="button" onClick={handleExportCalendar} disabled={loading} className="px-6 py-2 border border-[#4285f4]/50 text-[#4285f4] rounded-md hover:bg-[#4285f4]/10 text-sm font-semibold transition-colors mr-auto flex items-center gap-2" title="Exportar para o Google Agenda">
              <span className="material-symbols-outlined text-[18px]">calendar_month</span>
              Agenda
            </button>
            <button type="button" onClick={handleExportCSV} disabled={loading} className="px-6 py-2 border border-[#0f9d58]/50 text-[#0f9d58] rounded-md hover:bg-[#0f9d58]/10 text-sm font-semibold transition-colors mr-auto flex items-center gap-2" title="Exportar para CSV">
              <span className="material-symbols-outlined text-[18px]">table</span>
              CSV
            </button>
            <button type="button" onClick={handleDelete} disabled={loading} className="px-6 py-2 border border-red-500/50 text-red-500 rounded-md hover:bg-red-500/10 text-sm font-semibold transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Excluir
            </button>
            <button type="button" onClick={onClose} disabled={loading} className="px-6 py-2 border border-[#2D2D2D] text-white rounded-md hover:bg-[#252525] text-sm font-semibold transition-colors">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-[#9D4EDD] text-white rounded-md hover:bg-[#8338C7] text-sm font-bold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">done_all</span>
              {loading ? 'Aplicando...' : 'Aplicar a Todas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
