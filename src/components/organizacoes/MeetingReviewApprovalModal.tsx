// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/MeetingReviewApprovalModal.tsx
'use client';

import React, { useState } from 'react';
import type {
  OrganizationMeeting,
  ReviewDecision,
} from '@/types/organizations';
import {
  submitMeetingReviewAction,
  publishMeetingAtaAction,
} from '@/app/(dashboard)/organizacoes/actions';

export interface MeetingReviewApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: OrganizationMeeting;
  isOrgAdmin?: boolean;
  onUpdated?: () => void;
}

export function MeetingReviewApprovalModal({
  isOpen,
  onClose,
  meeting,
  isOrgAdmin = false,
  onUpdated,
}: MeetingReviewApprovalModalProps) {
  const [decision, setDecision] = useState<ReviewDecision>('approved');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmitReview = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await submitMeetingReviewAction({
        meetingId: meeting.id,
        decision,
        feedback: feedback.trim() || undefined,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao registrar parecer de revisão.');
        return;
      }

      setSuccessMsg('Parecer de revisão registrado com sucesso!');
      onUpdated?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishAta = async () => {
    setIsPublishing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await publishMeetingAtaAction({
        meetingId: meeting.id,
        ataMarkdown: meeting.published_ata_markdown,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao publicar ata oficial.');
        return;
      }

      setSuccessMsg('Ata publicada e homologada oficialmente!');
      onUpdated?.();
      setTimeout(() => onClose(), 2000);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[24px] text-[var(--accent-secondary)]">
              verified
            </span>
            <div>
              <h2 className="text-base font-bold text-fg font-['Bukra']">
                Revisão & Homologação de Ata
              </h2>
              <p className="text-xs text-fg-secondary">
                {meeting.title} • Status atual:{' '}
                <span className="font-bold text-[var(--accent-secondary)] uppercase">
                  {meeting.review_status}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-secondary hover:text-fg hover:bg-app transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Conteúdo da Ata */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-4 flex-1">
          <div>
            <h3 className="text-xs font-bold text-fg-secondary uppercase tracking-wider mb-2">
              Texto da Ata Proposta
            </h3>
            <div className="p-4 rounded-xl bg-app border border-border-subtle font-mono text-xs text-fg leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
              {meeting.published_ata_markdown || 'Nenhuma ata gerada ainda para esta reunião.'}
            </div>
          </div>

          {/* Registro do Parecer */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
              Seu Parecer de Revisão
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDecision('approved')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  decision === 'approved'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                    : 'bg-app text-fg-secondary border-border-subtle hover:border-emerald-500/30'
                }`}
              >
                Aprovar Ata
              </button>
              <button
                type="button"
                onClick={() => setDecision('changes_requested')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  decision === 'changes_requested'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-app text-fg-secondary border-border-subtle hover:border-amber-500/30'
                }`}
              >
                Pedir Ajustes
              </button>
              <button
                type="button"
                onClick={() => setDecision('rejected')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  decision === 'rejected'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                    : 'bg-app text-fg-secondary border-border-subtle hover:border-rose-500/30'
                }`}
              >
                Rejeitar
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-fg-secondary mb-1">
                Comentários & Justificativa (opcional)
              </label>
              <textarea
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Insira apontamentos sobre a ata antes de homologar..."
                className="w-full bg-app border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-fg outline-none focus:border-[var(--accent-secondary)]"
              />
            </div>
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 md:p-6 border-t border-border-subtle flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSubmitReview}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl bg-app border border-border-subtle hover:border-[var(--accent-secondary)] text-fg text-xs font-bold transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Registrando...' : 'Registrar Parecer'}
          </button>

          {isOrgAdmin && (
            <button
              type="button"
              disabled={isPublishing}
              onClick={handlePublishAta}
              className="px-6 py-2.5 bg-[var(--accent-secondary)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md disabled:opacity-50 flex items-center gap-1.5"
            >
              {isPublishing ? (
                <span className="w-4 h-4 border-2 border-transparent border-t-[#121212] rounded-full animate-spin"></span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">publish</span>
              )}
              <span>Publicar Ata Oficial</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

