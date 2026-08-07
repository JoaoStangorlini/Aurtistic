"use client";

import React, { useState, useEffect } from 'react';
import { AgendaEvent, TaskColumn } from '@/types';
import { createEvent, updateEvent } from '@/app/(dashboard)/actions';
import { CustomSelect } from './CustomSelect';

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: AgendaEvent | null;
  uniqueDimensions: string[];
  isLabdivScope: boolean;
  columns?: TaskColumn[];
  onEditColumn?: (col: TaskColumn) => void;
  onSuccess: () => void;
  defaultValues?: any;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export function EventFormModal({ isOpen, onClose, event, defaultValues, uniqueDimensions, isLabdivScope, columns = [], onEditColumn, onSuccess }: EventFormModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [dimensao, setDimensao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [horarios, setHorarios] = useState<Record<string, { inicio: string; fim: string }>>({});

  useEffect(() => {
    if (isOpen) {
      if (event) {
        setNome(event.nome);
        setDescricao(event.descricao || '');
        setDataInicio(event.data_inicio || '');
        setDataFim(event.data_fim || '');
        setDimensao(event.dimensao || '');
        setHorarios(event.horarios_semanais || {});
      } else {
        setNome('');
        setDescricao('');
        setDataInicio('');
        setDataFim('');
        setDimensao(defaultValues?.dimensao || '');
        setHorarios({});
      }
    }
  }, [isOpen, event]);

  if (!isOpen) return null;

  const handleDiaToggle = (dia: string) => {
    setHorarios(prev => {
      const novo = { ...prev };
      if (novo[dia]) {
        delete novo[dia];
      } else {
        novo[dia] = { inicio: '09:00', fim: '10:00' };
      }
      return novo;
    });
  };

  const handleTimeChange = (dia: string, campo: 'inicio' | 'fim', valor: string) => {
    setHorarios(prev => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        [campo]: valor
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    setIsSubmitting(true);
    try {
      const payload: Partial<AgendaEvent> = {
        nome,
        descricao: descricao || null,
        data_inicio: dataInicio || null,
        data_fim: dataFim || null,
        dimensao: dimensao || null,
        horarios_semanais: Object.keys(horarios).length > 0 ? horarios : null,
        is_labdiv: isLabdivScope
      };

      if (event) {
        await updateEvent(event.id, payload);
      } else {
        await createEvent(payload);
      }
      
      onSuccess();
    } catch (error) {
      console.error("Erro ao salvar evento:", error);
      alert("Ocorreu um erro ao salvar o evento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const colDimensao = columns.find(c => c.key === 'dimensao');
  const dimensaoOptions = colDimensao?.options?.map(o => ({ value: o.value, label: o.label || o.value, color: o.color })) || uniqueDimensions.map(d => ({ value: d, label: d }));

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 pb-24 sm:pb-4 backdrop-blur-sm">
      <div className="bg-[#121212] border border-[#2D2D2D] rounded-xl shadow-2xl w-full max-w-2xl max-h-[75vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-[#2D2D2D] bg-[#1A1A1A]">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#9D4EDD]">event</span>
            {event ? 'Editar Evento' : 'Novo Evento'}
          </h2>
          <button onClick={onClose} className="text-[#8E8E8E] hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <form id="event-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
            
            {/* Nome */}
            <div>
              <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2">Nome do Evento *</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#9D4EDD] focus:ring-1 focus:ring-[#9D4EDD] transition-all"
                placeholder="Ex: Reunião Semanal, Aula de Design..."
                required
              />
            </div>

            {/* Datas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2">Data de Início</label>
                <input
                  type="datetime-local"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#9D4EDD] transition-all color-scheme-dark"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2">Data de Fim (Opcional)</label>
                <input
                  type="datetime-local"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#9D4EDD] transition-all color-scheme-dark"
                />
              </div>
            </div>

            {/* Dimensão */}
            <div>
              <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2">Dimensão</label>
              <CustomSelect 
                name="dimensao" 
                value={dimensao} 
                onChange={(e) => setDimensao(e.target.value)} 
                type="dimensao" 
                options={dimensaoOptions} 
                allowCustom={true} 
                onEditColumn={columns.find(c => c.key === 'dimensao') && onEditColumn ? () => onEditColumn(columns.find(c => c.key === 'dimensao')!) : undefined} 
              />
            </div>

            {/* Rotina Semanal */}
            <div className="mt-2 border border-[#2D2D2D] bg-[#1A1A1A]/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#9D4EDD] text-[18px]">update</span>
                Rotina Semanal
              </h3>
              <p className="text-xs text-[#8E8E8E] mb-4">Selecione os dias em que o evento se repete e defina os horários.</p>
              
              <div className="flex flex-col gap-3">
                {DIAS_SEMANA.map(dia => (
                  <div key={dia} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-[#2D2D2D] bg-[#1A1A1A] hover:border-[#9D4EDD]/50 transition-colors">
                    <label className="flex items-center gap-3 cursor-pointer min-w-[120px]">
                      <input 
                        type="checkbox" 
                        checked={!!horarios[dia]} 
                        onChange={() => handleDiaToggle(dia)}
                        className="w-5 h-5 accent-[#9D4EDD] rounded cursor-pointer"
                      />
                      <span className={`font-bold text-sm ${horarios[dia] ? 'text-white' : 'text-[#8E8E8E]'}`}>{dia}</span>
                    </label>
                    
                    {horarios[dia] && (
                      <div className="flex items-center gap-2 ml-8 sm:ml-auto">
                        <input
                          type="time"
                          value={horarios[dia].inicio}
                          onChange={(e) => handleTimeChange(dia, 'inicio', e.target.value)}
                          className="bg-[#121212] border border-[#333] text-white px-3 py-1.5 rounded text-sm focus:outline-none focus:border-[#9D4EDD] color-scheme-dark"
                        />
                        <span className="text-[#8E8E8E] text-xs font-bold">ATÉ</span>
                        <input
                          type="time"
                          value={horarios[dia].fim}
                          onChange={(e) => handleTimeChange(dia, 'fim', e.target.value)}
                          className="bg-[#121212] border border-[#333] text-white px-3 py-1.5 rounded text-sm focus:outline-none focus:border-[#9D4EDD] color-scheme-dark"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-bold text-[#8E8E8E] uppercase tracking-wider mb-2">Descrição / Anotações</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2D2D2D] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#9D4EDD] transition-all resize-y min-h-[100px] custom-scrollbar"
                placeholder="Detalhes adicionais sobre o evento..."
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2D2D2D] bg-[#1A1A1A] flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg font-bold text-[#8E8E8E] hover:text-white hover:bg-[#2D2D2D] transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            form="event-form"
            disabled={isSubmitting || !nome.trim()}
            className="px-6 py-2.5 rounded-lg font-bold bg-[#9D4EDD] text-white hover:bg-[#8338c7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#9D4EDD]/20"
          >
            {isSubmitting ? (
              <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Salvando...</>
            ) : (
              <><span className="material-symbols-outlined text-[18px]">save</span> Salvar Evento</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
