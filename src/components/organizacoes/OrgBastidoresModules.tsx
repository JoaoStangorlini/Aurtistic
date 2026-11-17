// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useCallback, useEffect, useState } from 'react';

export type ApparatusStatus = 'disponivel' | 'manutencao' | 'indisponivel';

export interface ApparatusItem {
  id: string;
  title: string;
  concept: string;
  act: string;
  status: ApparatusStatus;
  notes: string;
}

export interface LiveQuestionItem {
  id: string;
  session_id?: string;
  student_name: string | null;
  school_origin: string | null;
  free_text_answer: string | null;
  is_highlighted: boolean;
  is_answered: boolean;
  monitor_reply: string | null;
  created_at: string;
}

const DEFAULT_SHOW_APPARATUS: ApparatusItem[] = [
  { id: 'basket', title: 'Basket', concept: 'Mecânica e Lançamento Oblíquo', act: 'Pré-Show', status: 'disponivel', notes: '' },
  { id: 'galao', title: 'Galão', concept: 'Termodinâmica e Pressão dos Gases', act: 'Pré-Show', status: 'disponivel', notes: '' },
  { id: 'torque', title: 'Torque', concept: 'Rotação e Conservação do Momento Angular', act: 'Pré-Show', status: 'disponivel', notes: '' },
  { id: 'marie-curie', title: 'Ato da Marie Curie', concept: 'História da Ciência e Física Nuclear', act: 'Abertura', status: 'disponivel', notes: '' },
  { id: 'albert-einstein', title: 'Ato do Albert Einstein', concept: 'Física Moderna e Pensamento Científico', act: 'Abertura', status: 'disponivel', notes: '' },
  { id: 'wimshurst', title: 'Gerador de Wimshurst', concept: 'Indução Eletrostática e Descargas', act: 'Principal', status: 'disponivel', notes: '' },
  { id: 'fumaca', title: 'Canhão de Fumaça', concept: 'Aerodinâmica e Vórtices Toroidais', act: 'Principal', status: 'disponivel', notes: '' },
  { id: 'tesla', title: 'Bobina de Tesla', concept: 'Ressonância Eletromagnética e Alta Frequência', act: 'Principal', status: 'disponivel', notes: '' },
  { id: 'nitrogenio', title: 'Nitrogênio Líquido', concept: 'Criogenia Extrema (-196°C) e Transição de Fase', act: 'Encerramento', status: 'disponivel', notes: '' },
  { id: 'batata-fria', title: 'Batata Fria', concept: 'Transição Vítrea Instantânea', act: 'Encerramento', status: 'disponivel', notes: '' },
  { id: 'reels', title: 'Reels', concept: 'Iluminação Estroboscópica & Divulgação', act: 'Encerramento', status: 'disponivel', notes: '' },
];

const DEFAULT_LABDIV_APPARATUS: ApparatusItem[] = [
  { id: 'sony-a7', title: 'Câmera Sony Alpha + Lente 50mm', concept: 'Captação Editorial e Entrevistas', act: 'Audiovisual', status: 'disponivel', notes: '' },
  { id: 'zoom-h6', title: 'Gravador Zoom H6 + Lapelas', concept: 'Captação de Áudio & Podcast', act: 'Áudio', status: 'disponivel', notes: '' },
  { id: 'iluminacao-led', title: 'Kit Softbox LED Bicolor', concept: 'Estúdio Ed. Novo Milênio', act: 'Iluminação', status: 'disponivel', notes: '' },
];

const DEFAULT_HS_APPARATUS: ApparatusItem[] = [
  { id: 'prusa-mk4', title: 'Impressora 3D Prusa / Ender', concept: 'Prototipagem Rápida PLA/PETG', act: 'Fabricação', status: 'disponivel', notes: '' },
  { id: 'osciloscopio', title: 'Osciloscópio Digital 100MHz', concept: 'Bancada de Eletrônica', act: 'Medição', status: 'disponivel', notes: '' },
  { id: 'estacao-solda', title: 'Estação de Solda SMD & Ferro', concept: 'Montagem de PCBs', act: 'Eletrônica', status: 'disponivel', notes: '' },
];

const DEFAULT_PROFIS_APPARATUS: ApparatusItem[] = [
  { id: 'optica-didatica', title: 'Kit de Óptica Geométrica & Ondulatória', concept: 'Laser He-Ne, Fendas de Young e Difração', act: 'Física IV', status: 'disponivel', notes: '' },
  { id: 'trilho-ar', title: 'Trilho de Ar Linear de Baixo Atrito', concept: 'Colisões Elásticas & Conservação do Momento', act: 'Física I', status: 'disponivel', notes: '' },
  { id: 'bancada-circuitos', title: 'Bancada de Multímetros & Fontes DC', concept: 'Circuitos RLC, Lei de Ohm e Kirchhoff', act: 'Física III', status: 'disponivel', notes: '' },
  { id: 'espectrofotometro', title: 'Espectrofotômetro Educacional', concept: 'Linhas de Emissão de Bohr & Balmer', act: 'Física Moderna', status: 'disponivel', notes: '' },
];

export function OrgBenchStockPanel({ orgSlug }: { orgSlug: string }) {
  const isShow = orgSlug === 'show-da-fisica';
  const baseList = isShow
    ? DEFAULT_SHOW_APPARATUS
    : orgSlug === 'hs'
      ? DEFAULT_HS_APPARATUS
      : orgSlug === 'profis'
        ? DEFAULT_PROFIS_APPARATUS
        : DEFAULT_LABDIV_APPARATUS;

  const [items, setItems] = useState<ApparatusItem[]>(baseList);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setItems(baseList);
    let cancelled = false;
    fetch(`/api/org/${encodeURIComponent(orgSlug)}/ops-state`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        const savedMap = (data.operationalState?.experimentsInventory || {}) as Record<
          string,
          { status?: ApparatusStatus; notes?: string }
        >;
        const hubExps = Array.isArray(data.hubExperiments)
          ? (data.hubExperiments as { slug: string; maintenance_status?: ApparatusStatus }[])
          : [];

        setItems((prev) =>
          prev.map((item) => {
            const localSaved = savedMap[item.id];
            const hubMatch = hubExps.find((e) => e.slug === item.id);
            return {
              ...item,
              status: localSaved?.status || hubMatch?.maintenance_status || item.status,
              notes: localSaved?.notes ?? item.notes,
            };
          })
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const handleSave = async (item: ApparatusItem) => {
    setSavingId(item.id);
    setFeedback(null);
    try {
      const nextMap: Record<string, { status: ApparatusStatus; notes: string }> = {};
      items.forEach((it) => {
        nextMap[it.id] = { status: it.status, notes: it.notes };
      });

      const res = await fetch(`/api/org/${encodeURIComponent(orgSlug)}/ops-state`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationalStatePatch: { experimentsInventory: nextMap },
          hubSyncAction: isShow
            ? { action: 'save_experiment', slug: item.id, status: item.status, notes: item.notes }
            : undefined,
        }),
      });
      if (res.ok) {
        setFeedback(`Aparato "${item.title}" salvo e sincronizado.`);
      } else {
        setFeedback('Erro ao salvar status do aparato.');
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {isShow && (
        <div className={`p-3 text-xs font-mono border ${isShow ? 'neon-border-blue bg-black text-blue-300' : 'rounded-xl border-accent-primary/30 bg-accent-primary/10 text-accent-primary'}`}>
          Aparatos marcados como <span className="text-amber-400 font-bold">MANUTENÇÃO</span> ou{' '}
          <span className="text-red-400 font-bold">INDISPONÍVEL</span> são sinalizados automaticamente na ferramenta pública{' '}
          <strong>Monte seu Show</strong> do HUB, evitando escolhas conflitantes no agendamento das escolas.
        </div>
      )}

      {feedback && (
        <div className="px-3 py-2 text-xs font-mono border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => {
          const borderClass =
            item.status === 'disponivel'
              ? isShow
                ? 'neon-border-green'
                : 'border-emerald-500/40'
              : item.status === 'manutencao'
                ? isShow
                  ? 'neon-border-yellow'
                  : 'border-amber-500/50'
                : isShow
                  ? 'neon-border-red'
                  : 'border-red-500/50';

          return (
            <div
              key={item.id}
              className={`p-4 bg-app border ${borderClass} ${isShow ? 'rounded-none bg-black' : 'rounded-xl'} space-y-3`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wide text-fg">{item.title}</h4>
                  <p className="text-[11px] text-fg-muted">
                    {item.concept} • <span className="opacity-75">{item.act}</span>
                  </p>
                </div>

                <select
                  value={item.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as ApparatusStatus;
                    setItems((prev) =>
                      prev.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it))
                    );
                  }}
                  className={`px-2.5 py-1.5 text-xs font-mono font-bold uppercase bg-surface border ${
                    item.status === 'disponivel'
                      ? 'border-emerald-500/60 text-emerald-400'
                      : item.status === 'manutencao'
                        ? 'border-amber-500/60 text-amber-300'
                        : 'border-red-500/60 text-red-400'
                  } ${isShow ? 'rounded-none bg-black' : 'rounded-lg'}`}
                >
                  <option value="disponivel">DISPONÍVEL</option>
                  <option value="manutencao">MANUTENÇÃO</option>
                  <option value="indisponivel">INDISPONÍVEL</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-fg-muted mb-1">
                  Notas da Oficina / Reparo
                </label>
                <input
                  type="text"
                  value={item.notes}
                  placeholder="Ex: Troca de fusível / aguardando peça"
                  onChange={(e) => {
                    const val = e.target.value;
                    setItems((prev) =>
                      prev.map((it) => (it.id === item.id ? { ...it, notes: val } : it))
                    );
                  }}
                  className={`w-full px-3 py-2 text-xs font-mono bg-surface border border-border-subtle text-fg placeholder:text-fg-muted/50 focus:outline-none focus:border-[var(--org-primary)] ${
                    isShow ? 'rounded-none bg-black' : 'rounded-lg'
                  }`}
                />
              </div>

              <button
                type="button"
                disabled={savingId === item.id}
                onClick={() => handleSave(item)}
                className={`w-full py-2 text-xs font-mono font-bold uppercase tracking-wider border border-border-subtle bg-surface hover:bg-surface-hover text-fg transition-colors cursor-pointer disabled:opacity-50 ${
                  isShow ? 'rounded-none bg-black hover:border-[#0066ff]' : 'rounded-lg'
                }`}
              >
                {savingId === item.id ? 'SALVANDO...' : 'SALVAR APARATO'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrgLiveStageModerationPanel({ orgSlug }: { orgSlug: string }) {
  const isShow = orgSlug === 'show-da-fisica';
  const [questions, setQuestions] = useState<LiveQuestionItem[]>([]);
  const [sessions, setSessions] = useState<
    { id: string; booking_code: string; school_name: string; is_live: boolean; current_experiment_slug: string | null }[]
  >([]);
  const [activeStageExp, setActiveStageExp] = useState<string>('tesla');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadLiveState = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/${encodeURIComponent(orgSlug)}/ops-state`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data?.ok) {
        if (Array.isArray(data.hubLiveQuestions)) {
          setQuestions(data.hubLiveQuestions);
        }
        if (Array.isArray(data.hubSessions)) {
          setSessions(data.hubSessions);
          const liveSess = data.hubSessions.find((s: { is_live: boolean }) => s.is_live) || data.hubSessions[0];
          if (liveSess?.current_experiment_slug) {
            setActiveStageExp(liveSess.current_experiment_slug);
          }
        }
      }
    } catch {
      // ignora erro transitório de polling
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    loadLiveState();
    const timer = setInterval(loadLiveState, 6000);
    return () => clearInterval(timer);
  }, [loadLiveState]);

  const handleToggleHighlight = async (q: LiveQuestionItem) => {
    const nextVal = !q.is_highlighted;
    setQuestions((prev) => prev.map((it) => (it.id === q.id ? { ...it, is_highlighted: nextVal } : it)));
    await fetch(`/api/org/${encodeURIComponent(orgSlug)}/ops-state`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hubSyncAction: {
          action: 'moderate_question',
          questionId: q.id,
          is_highlighted: nextVal,
        },
      }),
    });
  };

  const handleMarkAnswered = async (q: LiveQuestionItem) => {
    const reply = replyDrafts[q.id] || q.monitor_reply || 'Respondido ao vivo no palco.';
    setQuestions((prev) =>
      prev.map((it) => (it.id === q.id ? { ...it, is_answered: true, monitor_reply: reply } : it))
    );
    await fetch(`/api/org/${encodeURIComponent(orgSlug)}/ops-state`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hubSyncAction: {
          action: 'moderate_question',
          questionId: q.id,
          is_answered: true,
          monitor_reply: reply,
        },
      }),
    });
  };

  const handleStageExperimentChange = async (slug: string) => {
    setActiveStageExp(slug);
    const liveSess = sessions.find((s) => s.is_live) || sessions[0];
    await fetch(`/api/org/${encodeURIComponent(orgSlug)}/ops-state`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationalStatePatch: { activeStageExperiment: slug },
        hubSyncAction: {
          action: 'set_stage_experiment',
          sessionId: liveSess?.id || null,
          experimentSlug: slug,
        },
      }),
    });
  };

  return (
    <div className="space-y-5">
      <div className={`p-4 border flex flex-wrap items-center justify-between gap-4 ${isShow ? 'neon-border-green bg-black rounded-none' : 'rounded-xl border-emerald-500/30 bg-surface'}`}>
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
            CONTROLE DE PALCO & TELÃO AO VIVO
          </span>
          <h3 className="text-base font-black uppercase text-fg mt-0.5">
            {sessions[0]?.booking_code ? `Sessão ${sessions[0].booking_code} • ${sessions[0].school_name}` : 'Fila de Perguntas da Plateia (Sincronizada com HUB)'}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-mono text-fg-muted uppercase">
            {isShow ? 'No Palco Agora:' : 'Aparato / Pauta em Foco:'}
          </label>
          <select
            value={activeStageExp}
            onChange={(e) => handleStageExperimentChange(e.target.value)}
            className={`px-3 py-1.5 text-xs font-mono font-bold bg-surface border border-border-subtle text-fg ${isShow ? 'rounded-none bg-black' : 'rounded-lg'}`}
          >
            {(isShow
              ? DEFAULT_SHOW_APPARATUS
              : orgSlug === 'hs'
                ? DEFAULT_HS_APPARATUS
                : orgSlug === 'profis'
                  ? DEFAULT_PROFIS_APPARATUS
                  : DEFAULT_LABDIV_APPARATUS
            ).map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadLiveState}
            className={`px-3 py-1.5 text-xs font-mono font-bold border border-border-subtle hover:bg-surface-hover text-fg cursor-pointer ${isShow ? 'rounded-none' : 'rounded-lg'}`}
          >
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs font-mono text-fg-muted">Sincronizando perguntas do Telão Ao Vivo...</p>
      ) : questions.length === 0 ? (
        <div className={`p-6 border border-border-subtle text-center text-xs font-mono text-fg-muted ${isShow ? 'rounded-none bg-black' : 'rounded-xl bg-surface'}`}>
          Nenhuma pergunta enviada pela plateia no HUB até o momento. Assim que os alunos enviarem dúvidas em <strong>Acompanhe seu Show</strong>, elas aparecerão aqui automaticamente.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className={`p-4 border space-y-3 ${
                q.is_highlighted
                  ? isShow
                    ? 'neon-border-yellow bg-black'
                    : 'border-amber-500/60 bg-amber-500/10'
                  : 'border-border-subtle bg-surface'
              } ${isShow ? 'rounded-none' : 'rounded-xl'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono">
                  <span className="font-bold text-fg">{q.student_name || 'Estudante'}</span>
                  {q.school_origin && <span className="text-fg-muted"> • {q.school_origin}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleHighlight(q)}
                    className={`px-3 py-1 text-[11px] font-mono font-bold uppercase border cursor-pointer ${
                      q.is_highlighted
                        ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                        : 'border-border-subtle text-fg-muted hover:text-fg'
                    } ${isShow ? 'rounded-none' : 'rounded-lg'}`}
                  >
                    {q.is_highlighted ? 'No Telão' : 'Destacar no Telão'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkAnswered(q)}
                    className={`px-3 py-1 text-[11px] font-mono font-bold uppercase border cursor-pointer ${
                      q.is_answered
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'border-border-subtle text-fg-muted hover:text-fg'
                    } ${isShow ? 'rounded-none' : 'rounded-lg'}`}
                  >
                    {q.is_answered ? 'Respondida' : 'Marcar Respondida'}
                  </button>
                </div>
              </div>

              <p className="text-sm text-fg">{q.free_text_answer}</p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyDrafts[q.id] ?? q.monitor_reply ?? ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Resposta rápida do monitor (opcional)..."
                  className={`flex-1 px-3 py-1.5 text-xs bg-app border border-border-subtle text-fg ${isShow ? 'rounded-none' : 'rounded-lg'}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

