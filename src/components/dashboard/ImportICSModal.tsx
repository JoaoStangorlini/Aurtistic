// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState } from 'react';
import { parseICSFile, ParsedICSEvent } from '@/utils/ics';
import { createEventsBatch } from '@/app/(dashboard)/actions';

interface ImportICSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportICSModal({ isOpen, onClose, onSuccess }: ImportICSModalProps) {
  const [fileContent, setFileContent] = useState<string>('');
  const [parsedEvents, setParsedEvents] = useState<ParsedICSEvent[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setFileContent(text);
        const parsed = parseICSFile(text);
        setParsedEvents(parsed);
        setSelectedIndices(new Set(parsed.map((_, i) => i)));
      }
    };
    reader.readAsText(file);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === parsedEvents.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedEvents.map((_, i) => i)));
    }
  };

  const toggleSelectIndex = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  const handleImport = async () => {
    const eventsToImport = parsedEvents.filter((_, i) => selectedIndices.has(i));
    if (eventsToImport.length === 0) return;

    setIsSubmitting(true);
    try {
      await createEventsBatch(eventsToImport);
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Erro ao importar eventos: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
      <div className="bg-app border border-border-subtle rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border-subtle bg-surface">
          <h2 className="text-lg font-bold text-fg flex items-center gap-2">
            <span className="material-symbols-outlined text-[#9D4EDD]">download</span>
            Importar Google Agenda / .ICS
          </h2>
          <button onClick={onClose} className="text-fg-muted hover:text-fg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar flex flex-col gap-4">
          
          {/* File Picker */}
          <div className="border-2 border-dashed border-border-subtle hover:border-[#9D4EDD] transition-colors rounded-lg p-6 text-center bg-surface cursor-pointer relative">
            <input 
              type="file" 
              accept=".ics,.ical" 
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <span className="material-symbols-outlined text-4xl text-[#9D4EDD] mb-2">upload_file</span>
            <p className="text-sm font-medium text-fg">
              {fileName ? fileName : 'Clique ou arraste um arquivo .ics do Google Agenda'}
            </p>
            <p className="text-xs text-fg-muted mt-1">
              Exporte seus eventos no Google Agenda (Configurações &gt; Importar &amp; Exportar) e selecione o arquivo baixado.
            </p>
          </div>

          {/* Parsed Events List */}
          {parsedEvents.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                  Eventos Encontrados ({selectedIndices.size} de {parsedEvents.length} selecionados)
                </span>
                <button 
                  onClick={toggleSelectAll}
                  className="text-xs text-[#9D4EDD] hover:underline font-medium"
                >
                  {selectedIndices.size === parsedEvents.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto border border-border-subtle rounded-lg bg-surface divide-y divide-[#2D2D2D]">
                {parsedEvents.map((ev, idx) => (
                  <label 
                    key={idx}
                    className="flex items-center gap-3 p-3 hover:bg-surface cursor-pointer transition-colors"
                  >
                    <input 
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => toggleSelectIndex(idx)}
                      className="w-4 h-4 rounded border-border-subtle text-[#9D4EDD] focus:ring-[#9D4EDD] bg-surface"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{ev.nome}</p>
                      {ev.data_inicio && (
                        <p className="text-xs text-fg-secondary">
                          {ev.data_inicio.replace('T', ' ')}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-fg-secondary hover:text-fg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={isSubmitting || selectedIndices.size === 0}
            className="px-5 py-2 text-sm font-bold bg-[#9D4EDD] hover:bg-[#8338EC] text-fg rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <span>Importando...</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">download</span>
                Importar {selectedIndices.size} Evento(s)
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
