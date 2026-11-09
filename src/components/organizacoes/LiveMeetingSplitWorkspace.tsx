// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/LiveMeetingSplitWorkspace.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { OrganizationMeeting, AgendaItem } from '@/types/organizations';
import {
  updateMeetingNotesAction,
  getMeetingDetailsAction,
  convertMeetingAgendaItemToTaskAction,
} from '@/app/(dashboard)/organizacoes/actions';
import { useBackgroundSpeechTranscription } from '@/hooks/useBackgroundSpeechTranscription';
import { MeetingReviewApprovalModal } from './MeetingReviewApprovalModal';

export interface LiveMeetingSplitWorkspaceProps {
  meeting: OrganizationMeeting;
  isOpen: boolean;
  onClose: () => void;
  isOrgAdmin?: boolean;
  onMeetingFinished?: () => void;
}

export function LiveMeetingSplitWorkspace({
  meeting: initialMeeting,
  isOpen,
  onClose,
  isOrgAdmin = false,
  onMeetingFinished,
}: LiveMeetingSplitWorkspaceProps) {
  const [meeting, setMeeting] = useState<OrganizationMeeting>(initialMeeting);
  const [activeTab, setActiveTab] = useState<'personal' | 'process'>('personal');
  const [personalNotes, setPersonalNotes] = useState('');
  const [processNotes, setProcessNotes] = useState(
    initialMeeting.process_notes_markdown || initialMeeting.live_notes_markdown || ''
  );
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>(
    Array.isArray(initialMeeting.agenda_items) ? initialMeeting.agenda_items : []
  );
  const [newAgendaTitle, setNewAgendaTitle] = useState('');
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [convertingAgendaId, setConvertingAgendaId] = useState<string | null>(null);
  const [conversionSuccessId, setConversionSuccessId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const personalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  // Hook de transcrição híbrida em tempo real
  const {
    isRecording,
    transcribedText,
    isProcessingLastChunk,
    startRecording,
    stopAndFlushRecording,
  } = useBackgroundSpeechTranscription({
    meetingId: meeting.id,
    onChunkTranscribed: () => {
      // Auto-rola painel de transcrição
      if (transcriptScrollRef.current) {
        transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
      }
    },
    onError: (err) => {
      setErrorMsg(err.message || 'Erro no microfone ou captura de áudio.');
    },
    onDisplayTrackEnded: () => {
      // Notifica usuário que o compartilhamento de tela/aba terminou
      setSaveStatus('Compartilhamento de áudio do sistema encerrado.');
    },
  });

  // Carrega notas prévias ao abrir
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    async function loadData() {
      const res = await getMeetingDetailsAction(initialMeeting.id);
      if (!isCancelled && res.ok && res.meeting) {
        setMeeting(res.meeting as OrganizationMeeting);
        setProcessNotes(
          res.meeting.process_notes_markdown || res.meeting.live_notes_markdown || ''
        );
        setPersonalNotes(res.personalNotes || '');
        if (Array.isArray(res.meeting.agenda_items)) {
          setAgendaItems(res.meeting.agenda_items as AgendaItem[]);
        }
      }
    }

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialMeeting.id]);

  // Salvar notas debounced / manual
  const handleSaveNotes = useCallback(async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const res = await updateMeetingNotesAction({
        meetingId: meeting.id,
        processNotes,
        personalNotes,
        agendaItems,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao salvar notas.');
      } else {
        setSaveStatus('Salvo!');
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }, [meeting.id, processNotes, personalNotes, agendaItems]);

  // Promover trecho selecionado (ou texto total) das notas pessoais para as de processo
  const handlePromoteSelectedToProcess = () => {
    const textarea = personalTextareaRef.current;
    let textToPromote = '';

    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      textToPromote = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    } else {
      textToPromote = personalNotes;
    }

    if (!textToPromote.trim()) return;

    const separator = processNotes.trim() ? '\n\n' : '';
    const updated = `${processNotes}${separator}> 💡 *[Encaminhado de nota pessoal]*\n> ${textToPromote.trim().split('\n').join('\n> ')}`;
    setProcessNotes(updated);
    setActiveTab('process');
    setSaveStatus('Promovido para o Processo!');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Exportar notas pessoais em .md
  const handleDownloadPersonalNotes = () => {
    const blob = new Blob([personalNotes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notas-pessoais-reuniao-${meeting.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Pautas: marcar/desmarcar
  const handleToggleAgendaItem = (itemId: string) => {
    const updated = agendaItems.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setAgendaItems(updated);
  };

  // Pautas: adicionar nova
  const handleAddAgendaItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgendaTitle.trim()) return;
    const newItem: AgendaItem = {
      id: crypto.randomUUID(),
      title: newAgendaTitle.trim(),
      completed: false,
    };
    setAgendaItems([...agendaItems, newItem]);
    setNewAgendaTitle('');
  };

  // Pautas: converter em tarefa oficial
  const handleConvertAgendaToTask = async (item: AgendaItem) => {
    setConvertingAgendaId(item.id);
    setErrorMsg(null);
    try {
      const res = await convertMeetingAgendaItemToTaskAction({
        meetingId: meeting.id,
        itemTitle: item.title,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao converter pauta em tarefa.');
      } else {
        setConversionSuccessId(item.id);
        setTimeout(() => setConversionSuccessId(null), 3000);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro na conversão.');
    } finally {
      setConvertingAgendaId(null);
    }
  };

  // Encerrar reunião e analisar com IA / heurística
  const handleEndMeetingAndAnalyze = async () => {
    if (!window.confirm('Deseja realmente encerrar a gravação e gerar a síntese/ata da reunião?')) {
      return;
    }

    setIsEndingMeeting(true);
    setErrorMsg(null);

    try {
      // 1. Aguarda gravação e flush do último bloco de áudio
      if (isRecording) {
        await stopAndFlushRecording();
      }

      // 2. Salva últimas anotações no banco
      await updateMeetingNotesAction({
        meetingId: meeting.id,
        processNotes,
        personalNotes,
        transcriptText: transcribedText,
        agendaItems,
      });

      // 3. Aciona o extrator estruturado da ata
      const res = await fetch('/api/meetings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha na sintetização da ata.');
      }

      // 4. Abre modal de aprovação/revisão
      setShowReviewModal(true);
      onMeetingFinished?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao finalizar reunião.');
    } finally {
      setIsEndingMeeting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md text-slate-100 overflow-hidden">
      {/* Barra Superior */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 py-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <span
              className={`material-symbols-outlined text-[20px] ${
                isRecording ? 'animate-spin text-rose-400' : ''
              }`}
            >
              radio_button_checked
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">{meeting.title}</h1>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {meeting.organization?.name || 'Organização'}
              </span>
              {isRecording && (
                <span className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-400 border border-rose-500/20 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  GRAVANDO AO VIVO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {meeting.scheduled_at
                ? new Date(meeting.scheduled_at).toLocaleString('pt-BR')
                : 'Em andamento'}
              {' • '}
              {meeting.duration_minutes || 60} min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meeting.meet_url && (
            <a
              href={meeting.meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-teal-400">open_in_new</span>
              Entrar na Chamada
            </a>
          )}

          <button
            onClick={handleSaveNotes}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {saveStatus || 'Salvar'}
          </button>

          <button
            onClick={handleEndMeetingAndAnalyze}
            disabled={isEndingMeeting || isProcessingLastChunk}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">stop_circle</span>
            ⏹️ Encerrar e Gerar Ata
          </button>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </header>

      {/* Alerta de Erro */}
      {errorMsg && (
        <div className="flex items-center gap-2 bg-rose-950/80 border-b border-rose-800/60 px-5 py-2 text-xs text-rose-200">
          <span className="material-symbols-outlined text-[16px] text-rose-400">error</span>
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-rose-400 hover:text-rose-200">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Grid Principal Dividido em 2 Colunas */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
        {/* COLUNA ESQUERDA: Transcrição Híbrida + Pautas */}
        <div className="flex flex-col h-full overflow-hidden bg-slate-900/40">
          {/* Seção 1: Controles de Áudio & Transcrição */}
          <div className="flex flex-col border-b border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-teal-400">volume_up</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Transcrição Contínua em 2º Plano
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeSystemAudio}
                    onChange={(e) => setIncludeSystemAudio(e.target.checked)}
                    disabled={isRecording}
                    className="rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-0"
                  />
                  <span>Capturar Áudio da Aba/Sistema</span>
                </label>

                {!isRecording ? (
                  <button
                    onClick={() => startRecording(includeSystemAudio)}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">mic</span>
                    Iniciar Captura
                  </button>
                ) : (
                  <button
                    onClick={() => stopAndFlushRecording()}
                    disabled={isProcessingLastChunk}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">mic_off</span>
                    Pausar Microfone
                  </button>
                )}
              </div>
            </div>

            {/* Caixa de Texto da Transcrição */}
            <div
              ref={transcriptScrollRef}
              className="h-36 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-300 overflow-y-auto font-mono scrollbar-thin scrollbar-thumb-slate-800"
            >
              {transcribedText ? (
                <span>{transcribedText}</span>
              ) : isRecording ? (
                <span className="italic text-slate-500">
                  Ouvindo conversa... O texto transcreve a cada 12 segundos em segundo plano.
                </span>
              ) : (
                <span className="italic text-slate-500">
                  A captura de áudio está pausada. Clique em &quot;Iniciar Captura&quot; para transcrever.
                </span>
              )}
            </div>
          </div>

          {/* Seção 2: Checklist da Pauta */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-indigo-400">checklist</span>
                Pauta da Reunião & Encaminhamentos
              </h2>
              <span className="text-xs text-slate-500">
                {agendaItems.filter((a) => a.completed).length}/{agendaItems.length} concluídas
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {agendaItems.length === 0 ? (
                <p className="text-xs italic text-slate-500 py-4 text-center">
                  Nenhuma pauta adicionada para esta reunião ainda.
                </p>
              ) : (
                agendaItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors ${
                      item.completed
                        ? 'border-slate-800/60 bg-slate-900/30 text-slate-500'
                        : 'border-slate-800 bg-slate-900/70 text-slate-200'
                    }`}
                  >
                    <button
                      onClick={() => handleToggleAgendaItem(item.id)}
                      className="flex items-center gap-2.5 text-left text-xs flex-1"
                    >
                      <span className="material-symbols-outlined text-[18px] text-teal-400 shrink-0">
                        {item.completed ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <span className={item.completed ? 'line-through text-slate-500' : 'font-medium'}>
                        {item.title}
                      </span>
                    </button>

                    {item.converted_task_id ? (
                      <span
                        className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300"
                        title="Esta pauta já foi convertida em uma tarefa oficial da organização"
                      >
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Tarefa Criada
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConvertAgendaToTask(item)}
                        disabled={convertingAgendaId === item.id || conversionSuccessId === item.id}
                        title="Transformar esta pauta em uma Tarefa oficial da equipe"
                        className="flex items-center gap-1 rounded border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[11px] font-bold text-teal-300 hover:bg-teal-500/20 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {conversionSuccessId === item.id ? 'check_circle' : 'add_task'}
                        </span>
                        {conversionSuccessId === item.id ? 'Gerada!' : '+ Converter em Tarefa'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Input Nova Pauta */}
            <form onSubmit={handleAddAgendaItem} className="mt-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Adicionar novo tópico à pauta..."
                value={newAgendaTitle}
                onChange={(e) => setNewAgendaTitle(e.target.value)}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newAgendaTitle.trim()}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Adicionar
              </button>
            </form>
          </div>
        </div>

        {/* COLUNA DIREITA: Bloco de Notas Duplo com Abas */}
        <div className="flex flex-col h-full overflow-hidden bg-slate-900/30">
          {/* Cabeçalho das Abas */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 pt-2">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('personal')}
                className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'personal'
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">lock</span>
                🔒 Anotações Pessoais
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] text-emerald-400">
                  Só Você Vê
                </span>
              </button>

              <button
                onClick={() => setActiveTab('process')}
                className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'process'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">group</span>
                📋 Processo / Ata Coletiva
                <span className="rounded-full bg-blue-500/10 px-1.5 py-0.2 text-[10px] text-blue-400">
                  Equipe
                </span>
              </button>
            </div>

            {/* Ações da Aba */}
            {activeTab === 'personal' ? (
              <div className="flex items-center gap-2 pb-1.5">
                <button
                  onClick={handlePromoteSelectedToProcess}
                  title="Promove a seleção (ou todo o texto pessoal) para as notas da Ata"
                  className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] text-emerald-400">arrow_forward</span>
                  Copiar p/ Processo
                </button>
                <button
                  onClick={handleDownloadPersonalNotes}
                  title="Baixar notas pessoais em arquivo .md"
                  className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] text-slate-400">download</span>
                  .md
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pb-1.5">
                <span className="text-[11px] text-slate-500 italic">
                  Alimenta a Ata pós-reunião
                </span>
              </div>
            )}
          </div>

          {/* Área de Edição */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            {activeTab === 'personal' ? (
              <div className="flex-1 flex flex-col">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-emerald-400">description</span>
                    Rascunho de ideias privadas, dúvidas ou notas reflexivas
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {personalNotes.length} caracteres
                  </span>
                </div>
                <textarea
                  ref={personalTextareaRef}
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="Escreva suas anotações pessoais aqui. Ninguém mais na organização tem acesso a este texto..."
                  className="flex-1 resize-none rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-blue-400">description</span>
                    Decisões acordadas, prazos e notas oficiais para a Ata
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {processNotes.length} caracteres
                  </span>
                </div>
                <textarea
                  value={processNotes}
                  onChange={(e) => setProcessNotes(e.target.value)}
                  placeholder="Registre as deliberações oficiais, combinados e pontos acordados que devem constar na ata da equipe..."
                  className="flex-1 resize-none rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Revisão da Ata */}
      {showReviewModal && (
        <MeetingReviewApprovalModal
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            onClose();
          }}
          meeting={meeting}
          isOrgAdmin={isOrgAdmin}
          onUpdated={() => {
            setShowReviewModal(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
