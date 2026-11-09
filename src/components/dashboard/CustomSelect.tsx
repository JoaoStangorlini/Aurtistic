// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge, getBadgeColorClass } from './Badge';

interface Option {
  label: string;
  value: string;
  color?: string;
}

interface CustomSelectProps {
  name: string;
  value: string;
  options: Option[];
  onChange: (e: any) => void;
  type: string;
  disabled?: boolean;
  allowCustom?: boolean;
  onEditColumn?: () => void;
}

export function CustomSelect({ name, value, options: initialOptions, onChange, type, disabled, allowCustom, onEditColumn }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [localOptions, setLocalOptions] = useState(initialOptions);

  useEffect(() => {
    setLocalOptions(initialOptions);
  }, [initialOptions]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsAddingCustom(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange({ target: { name, value: optionValue } });
    setIsOpen(false);
    setIsAddingCustom(false);
    setCustomValue('');
  };

  const handleCustomSubmit = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!customValue.trim()) return;
    
    // Add to local options so it displays nicely if they open it again
    const newOption = { label: customValue.trim(), value: customValue.trim() };
    if (!localOptions.find(o => o.value === newOption.value)) {
      setLocalOptions([...localOptions, newOption]);
    }
    handleSelect(newOption.value);
  };

  // Allow displaying a custom value even if it's not in the initial options
  let selectedLabel = value || '';
  const selectedOption = localOptions.find(o => o.value === value);
  if (selectedOption) {
    selectedLabel = selectedOption.label;
  }
  
  // Standard input box look
  const boxClasses = disabled 
    ? "w-full border rounded-md px-4 py-2 opacity-50 cursor-not-allowed bg-app border-border-subtle text-fg-muted"
    : "w-full border border-border-subtle rounded-md px-4 py-2 cursor-pointer focus:outline-none transition-colors flex justify-between items-center bg-app hover:border-[#FFCC00]";

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={boxClasses} 
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setIsAddingCustom(false);
          }
        }}
      >
        <div>
          {selectedOption ? (
            <Badge type={type} value={selectedOption.label} customColor={selectedOption.color} />
          ) : value ? (
            <Badge type={type} value={selectedLabel} />
          ) : (
            <span className="text-fg-muted">Selecione...</span>
          )}
        </div>
        <div className="flex items-center">
          {onEditColumn && (
            <span 
              className="material-symbols-outlined text-[16px] text-fg-muted mr-2 hover:text-fg"
              onClick={(e) => {
                e.stopPropagation();
                onEditColumn();
              }}
            >
              edit
            </span>
          )}
          <span className="material-symbols-outlined text-[18px] text-fg-muted" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
            expand_more
          </span>
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-[100] mt-1 w-full bg-surface border border-border-subtle rounded-md shadow-2xl overflow-hidden max-h-60 flex flex-col">
          {isAddingCustom ? (
            <div className="p-3 flex gap-2 border-b border-border-subtle">
              <input 
                type="text" 
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomSubmit();
                  }
                }}
                placeholder="Novo valor..."
                autoFocus
                className="flex-1 bg-app border border-border-subtle rounded px-3 py-1 text-sm text-fg focus:outline-none focus:border-[#9D4EDD]"
              />
              <button type="button" onClick={() => handleCustomSubmit()} className="bg-[var(--accent-primary)] text-white rounded px-3 py-1 text-sm font-bold hover:bg-[#8338C7]">
                OK
              </button>
            </div>
          ) : (
            <div className="overflow-y-auto">
              {localOptions.map((option) => {
                return (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className="px-4 py-2 cursor-pointer transition-colors hover:bg-surface-hover flex items-center"
                  >
                    <Badge type={type} value={option.label} customColor={option.color} />
                  </div>
                );
              })}
              
              {(allowCustom || onEditColumn) && (
                <div className="flex border-t border-border-subtle">
                  {allowCustom && (
                    <div
                      onClick={() => setIsAddingCustom(true)}
                      className="flex-1 px-4 py-2 cursor-pointer transition-colors text-[#FFCC00] hover:bg-surface-hover font-bold text-sm flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      Adicionar Novo
                    </div>
                  )}
                  {onEditColumn && (
                    <div
                      onClick={() => {
                        setIsOpen(false);
                        onEditColumn();
                      }}
                      className="px-4 py-2 cursor-pointer transition-colors text-fg-muted hover:bg-surface-hover hover:text-fg border-l border-border-subtle flex items-center justify-center"
                      title="Editar Coluna"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
