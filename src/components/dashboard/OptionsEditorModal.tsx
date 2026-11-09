// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState } from 'react';
import { TaskColumn, TaskColumnOption } from '@/types';
import { Badge } from './Badge';

interface OptionsEditorModalProps {
  column: TaskColumn;
  onClose: () => void;
  onSave: (updatedColumn: TaskColumn) => Promise<void>;
}

export function OptionsEditorModal({ column, onClose, onSave }: OptionsEditorModalProps) {
  const [localColumn, setLocalColumn] = useState<TaskColumn>({ ...column });
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionColor, setNewOptionColor] = useState('#2D2D2D');
  const [loading, setLoading] = useState(false);

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    
    const value = newOptionLabel.trim().toLowerCase().replace(/\s+/g, '_');
    
    if (localColumn.options.find(o => o.value === value)) {
      alert('Esta opção já existe!');
      return;
    }

    const newOption: TaskColumnOption = {
      id: crypto.randomUUID(),
      label: newOptionLabel.trim(),
      value: value,
      color: newOptionColor
    };

    setLocalColumn({
      ...localColumn,
      options: [...localColumn.options, newOption]
    });
    
    setNewOptionLabel('');
  };

  const handleRemoveOption = (valueToRemove: string) => {
    if (confirm('Tem certeza que deseja remover esta opção? Tarefas existentes com esse valor podem perder a formatação.')) {
      setLocalColumn({
        ...localColumn,
        options: localColumn.options.filter(o => o.value !== valueToRemove)
      });
    }
  };

  const handleUpdateOption = (index: number, field: keyof TaskColumnOption, val: string) => {
    const updatedOptions = [...localColumn.options];
    updatedOptions[index] = { ...updatedOptions[index], [field]: val };
    
    setLocalColumn({ ...localColumn, options: updatedOptions });
  };

  const moveOption = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localColumn.options.length - 1) return;
    
    const newOptions = [...localColumn.options];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    const temp = newOptions[index];
    newOptions[index] = newOptions[swapIndex];
    newOptions[swapIndex] = temp;
    
    setLocalColumn({ ...localColumn, options: newOptions });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(localColumn);
      onClose();
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar coluna');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border-subtle rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-border-subtle flex justify-between items-center bg-surface-hover">
          <h2 className="text-lg font-bold text-fg">Editar Coluna: {localColumn.name}</h2>
          <button onClick={onClose} className="text-fg-muted hover:text-fg transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          
          {/* Column Properties */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Nome da Coluna</label>
              <input 
                type="text" 
                value={localColumn.name}
                onChange={(e) => setLocalColumn({...localColumn, name: e.target.value})}
                className="w-full bg-app border border-border-subtle rounded-md px-3 py-2 text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
            </div>
            
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider mb-2">Tipo de Dado</label>
              <select
                value={localColumn.type}
                onChange={(e) => setLocalColumn({...localColumn, type: e.target.value as any})}
                disabled={localColumn.is_native} // Nativas não podem mudar de tipo
                className={`w-full bg-app border border-border-subtle rounded-md px-3 py-2 text-fg focus:outline-none focus:border-[#9D4EDD] ${localColumn.is_native ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <option value="select">Menu suspenso (Seleção)</option>
                <option value="text">Texto livre</option>
                <option value="date">Data</option>
                <option value="checkbox">Caixa de Seleção (Sim/Não)</option>
              </select>
              {localColumn.is_native && <p className="text-[10px] text-[#db4437] mt-1">O tipo de colunas do sistema não pode ser alterado.</p>}
            </div>
          </div>

          {/* Options Manager (only if select) */}
          {localColumn.type === 'select' && (
            <div className="space-y-3">
              <label className="block text-xs text-fg-muted uppercase tracking-wider border-b border-border-subtle pb-2">Opções do Menu</label>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {localColumn.options.map((opt, i) => (
                  <div key={opt.value} className="flex items-center gap-2 bg-surface-hover p-2 rounded-md border border-border-subtle">
                    <div className="flex flex-col gap-1 text-fg-muted">
                      <button onClick={() => moveOption(i, 'up')} disabled={i === 0} className="hover:text-fg disabled:opacity-30"><span className="material-symbols-outlined text-[14px]">expand_less</span></button>
                      <button onClick={() => moveOption(i, 'down')} disabled={i === localColumn.options.length - 1} className="hover:text-fg disabled:opacity-30"><span className="material-symbols-outlined text-[14px]">expand_more</span></button>
                    </div>
                    
                    <input 
                      type="color" 
                      value={opt.color || '#2D2D2D'}
                      onChange={(e) => handleUpdateOption(i, 'color', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                    />
                    
                    <input 
                      type="text" 
                      value={opt.label}
                      onChange={(e) => handleUpdateOption(i, 'label', e.target.value)}
                      className="flex-1 bg-app border border-border-subtle rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-[#FFCC00]"
                    />
                    
                    <button onClick={() => handleRemoveOption(opt.value)} className="text-[#db4437] hover:text-red-400 p-1">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
                
                {localColumn.options.length === 0 && (
                  <p className="text-sm text-fg-muted italic text-center py-4">Nenhuma opção criada.</p>
                )}
              </div>

              {/* Add New Option */}
              <div className="flex items-center gap-2 mt-4 p-3 bg-app border border-border-subtle border-dashed rounded-md">
                <input 
                  type="color" 
                  value={newOptionColor}
                  onChange={(e) => setNewOptionColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0"
                  title="Cor da nova opção"
                />
                <input 
                  type="text" 
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  placeholder="Nome da nova opção..."
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption() }}
                  className="flex-1 bg-transparent border-none text-sm text-fg focus:outline-none"
                />
                <button onClick={handleAddOption} className="text-[#9D4EDD] hover:text-[#b478ed] font-bold text-sm px-2">
                  Adicionar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle flex justify-end gap-3 bg-surface-hover">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-bold text-fg-muted hover:text-fg transition-colors">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-bold bg-[var(--accent-primary)] text-white hover:bg-[#b478ed] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <span className="material-symbols-outlined animate-spin text-[16px]">sync</span> : 'Salvar Alterações'}
          </button>
        </div>

      </div>
    </div>
  );
}
