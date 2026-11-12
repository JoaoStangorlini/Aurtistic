// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationScheduleAttendancePanel.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
} from '@/types/organizations';

export interface ScheduleShiftItem {
  id: string;
  subteam_id: string;
  title: string;
  dayOfWeek: 'Seg' | 'Ter' | 'Qua' | 'Qui' | 'Sex' | 'Sáb' | 'Dom';
  startTime: string; // "14:00"
  endTime: string; // "18:00"
  assignedMemberIds: string[];
  locationOrEvent?: string;
}

export interface AttendanceRecordItem {
  id: string;
  userId: string;
  userName: string;
  shiftId?: string;
  shiftTitle?: string;
  qrPayload: string;
  timestamp: string;
}

export interface OrganizationScheduleAttendancePanelProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  members: OrganizationMember[];
  currentUserId?: string;
  currentUserName?: string;
  isAdmin?: boolean;
  onRemoveMember?: (memberId: string) => Promise<void>;
}

const SHIFTS_KEY_PREFIX = 'aurtistic_shifts_';
const ATTENDANCE_KEY_PREFIX = 'aurtistic_attendance_';

export function OrganizationScheduleAttendancePanel({
  organization,
  subteams,
  members,
  currentUserId,
  currentUserName = 'Membro da Equipe',
  isAdmin = false,
  onRemoveMember,
}: OrganizationScheduleAttendancePanelProps) {
  const shiftsStorageKey = `${SHIFTS_KEY_PREFIX}${organization.id}`;
  const attendanceStorageKey = `${ATTENDANCE_KEY_PREFIX}${organization.id}`;

  const [shifts, setShifts] = useState<ScheduleShiftItem[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecordItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Estados de UI
  const [activeTab, setActiveTab] = useState<'grade' | 'presencas' | 'equipe'>('grade');
  const [isCreateShiftOpen, setIsCreateShiftOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [simulatedQrInput, setSimulatedQrInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Formulário de novo turno / edição de turno
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newSubteamId, setNewSubteamId] = useState(subteams[0]?.id || '');
  const [newDay, setNewDay] = useState<ScheduleShiftItem['dayOfWeek']>('Seg');
  const [newStart, setNewStart] = useState('14:00');
  const [newEnd, setNewEnd] = useState('18:00');
  const [newLocation, setNewLocation] = useState('');
  const [newAssigned, setNewAssigned] = useState<string[]>([]);

  const handleOpenNewShiftForm = () => {
    setEditingShiftId(null);
    setNewTitle('');
    setNewSubteamId(subteams[0]?.id || '');
    setNewDay('Seg');
    setNewStart('14:00');
    setNewEnd('18:00');
    setNewLocation('');
    setNewAssigned([]);
    setIsCreateShiftOpen(true);
    setActiveTab('grade');
  };

  const handleOpenEditShift = (shift: ScheduleShiftItem) => {
    setEditingShiftId(shift.id);
    setNewTitle(shift.title);
    setNewSubteamId(shift.subteam_id || subteams[0]?.id || '');
    setNewDay(shift.dayOfWeek);
    setNewStart(shift.startTime);
    setNewEnd(shift.endTime);
    setNewLocation(shift.locationOrEvent || '');
    setNewAssigned(shift.assignedMemberIds || []);
    setIsCreateShiftOpen(true);
    setActiveTab('grade');
  };

  const handleDeleteShift = (shiftId: string) => {
    saveShifts(shifts.filter((s) => s.id !== shiftId));
    setFeedbackMsg({ text: 'Escala removida com sucesso.', ok: true });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  useEffect(() => {
    try {
      const storedShifts = localStorage.getItem(shiftsStorageKey);
      if (storedShifts) {
        setShifts(JSON.parse(storedShifts));
      } else {
        // Turnos semente
        const seedShifts: ScheduleShiftItem[] = [
          {
            id: 'shift-seed-1',
            subteam_id: subteams[0]?.id || '',
            title: 'Plantão Técnico & Desenvolvimento',
            dayOfWeek: 'Seg',
            startTime: '14:00',
            endTime: '18:00',
            assignedMemberIds: members.slice(0, 2).map((m) => m.id),
            locationOrEvent: 'LabDiv / Sala 204',
          },
          {
            id: 'shift-seed-2',
            subteam_id: subteams.find((s) => s.name.includes('Pesquis'))?.id || subteams[0]?.id || '',
            title: 'Ensaio de Experimentos & Coleta de Dados',
            dayOfWeek: 'Qua',
            startTime: '10:00',
            endTime: '12:00',
            assignedMemberIds: members.slice(1, 3).map((m) => m.id),
            locationOrEvent: 'Bancada Experimental',
          },
        ];
        setShifts(seedShifts);
        localStorage.setItem(shiftsStorageKey, JSON.stringify(seedShifts));
      }

      const storedAtt = localStorage.getItem(attendanceStorageKey);
      if (storedAtt) {
        setAttendances(JSON.parse(storedAtt));
      }
    } catch {}
    setIsLoaded(true);
  }, [shiftsStorageKey, attendanceStorageKey, subteams, members]);

  const saveShifts = useCallback(
    (newShifts: ScheduleShiftItem[]) => {
      setShifts(newShifts);
      try {
        localStorage.setItem(shiftsStorageKey, JSON.stringify(newShifts));
      } catch {}
    },
    [shiftsStorageKey]
  );

  const saveAttendances = useCallback(
    (newAtt: AttendanceRecordItem[]) => {
      setAttendances(newAtt);
      try {
        localStorage.setItem(attendanceStorageKey, JSON.stringify(newAtt));
      } catch {}
    },
    [attendanceStorageKey]
  );

  const handleCreateShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    if (editingShiftId) {
      const updated = shifts.map((s) =>
        s.id === editingShiftId
          ? {
              ...s,
              subteam_id: newSubteamId || subteams[0]?.id || '',
              title: newTitle.trim(),
              dayOfWeek: newDay,
              startTime: newStart,
              endTime: newEnd,
              locationOrEvent: newLocation.trim() || undefined,
              assignedMemberIds: newAssigned,
            }
          : s
      );
      saveShifts(updated);
      setFeedbackMsg({ text: 'Escala atualizada com sucesso!', ok: true });
    } else {
      const newShift: ScheduleShiftItem = {
        id: `shift_${Date.now()}`,
        subteam_id: newSubteamId || subteams[0]?.id || '',
        title: newTitle.trim(),
        dayOfWeek: newDay,
        startTime: newStart,
        endTime: newEnd,
        locationOrEvent: newLocation.trim() || undefined,
        assignedMemberIds: newAssigned,
      };
      saveShifts([...shifts, newShift]);
      setFeedbackMsg({ text: 'Nova escala definida com sucesso!', ok: true });
    }

    setTimeout(() => setFeedbackMsg(null), 3500);
    setEditingShiftId(null);
    setNewTitle('');
    setNewLocation('');
    setNewAssigned([]);
    setIsCreateShiftOpen(false);
  };

  // Simulação / Leitor de QR Code para Registro de Presença
  const handleRegisterQrAttendance = (payloadCode?: string) => {
    const code = payloadCode || simulatedQrInput || `aurtistic-checkin:${organization.id}:${Date.now()}`;
    const newRecord: AttendanceRecordItem = {
      id: `att_${Date.now()}`,
      userId: currentUserId || 'anonymous-user',
      userName: currentUserName,
      qrPayload: code,
      timestamp: new Date().toISOString(),
    };

    saveAttendances([newRecord, ...attendances]);
    setFeedbackMsg({ text: 'Presença confirmada com sucesso via QR Code!', ok: true });
    setIsScannerOpen(false);
    setSimulatedQrInput('');
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const myShifts = useMemo(() => {
    const myMember = members.find((m) => m.user_id === currentUserId);
    if (!myMember) return shifts;
    return shifts.filter((s) => s.assignedMemberIds.includes(myMember.id));
  }, [shifts, members, currentUserId]);

  if (!isLoaded) return null;

  return (
    <div className="p-4 md:p-5 bg-surface border border-border-subtle rounded-2xl shadow-lg space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[22px] text-teal-400">
            calendar_clock
          </span>
          <div>
            <h3 className="text-sm font-bold text-fg uppercase tracking-wider font-['Bukra']">
              Horários, Escalas & Controle de Presenças
            </h3>
            <p className="text-xs text-fg-secondary">
              Acompanhamento de plantões, turnos da semana e registro de presença com leitor de QR Code.
            </p>
          </div>
        </div>

        {/* Ações Rápidas: Definir Escala e Registro com QR Code */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleOpenNewShiftForm}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-500/40 bg-teal-500/15 text-teal-300 font-bold text-xs hover:bg-teal-500/25 transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
            <span>Definir Escala / Turno</span>
          </button>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
            <span>Registrar Presença (QR Code)</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            feedbackMsg.ok
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {feedbackMsg.ok ? 'verified' : 'error'}
          </span>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Alternador de Abas */}
      <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('grade')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'grade'
              ? 'bg-app text-white border border-border-subtle shadow-sm'
              : 'text-fg-muted hover:text-white'
          }`}
        >
          📅 Grade de Horários e Escalas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('presencas')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'presencas'
              ? 'bg-app text-white border border-border-subtle shadow-sm'
              : 'text-fg-muted hover:text-white'
          }`}
        >
          📋 Presenças Confirmadas ({attendances.length})
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('equipe')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'equipe'
                ? 'bg-app text-white border border-border-subtle shadow-sm'
                : 'text-fg-muted hover:text-white'
            }`}
          >
            👥 Gestão de Membros & Alocações
          </button>
        )}
      </div>

      {/* ABA 1: Grade de Horários e Escalas */}
      {activeTab === 'grade' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-fg-muted">
              Visualização dos turnos e alocações de horários da equipe no {organization.name}.
            </span>
            <button
              type="button"
              onClick={handleOpenNewShiftForm}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-500/15 border border-teal-500/40 text-teal-300 hover:bg-teal-500/25 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              <span>Nova Escala / Horário</span>
            </button>
          </div>

          {/* Modal / Form de Criação e Edição de Turno */}
          {isCreateShiftOpen && (
            <form
              onSubmit={handleCreateShift}
              className="p-4 rounded-xl bg-app border border-teal-500/40 space-y-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                  {editingShiftId ? 'Editar Escala / Turno' : 'Definir Nova Escala de Horário'}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateShiftOpen(false);
                    setEditingShiftId(null);
                  }}
                  className="text-xs text-fg-muted hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Título do Turno / Plantão *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Plantão de Atendimento, Suporte Técnico..."
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Categoria da Escala
                  </label>
                  <select
                    value={newSubteamId}
                    onChange={(e) => setNewSubteamId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  >
                    {subteams.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Local / Sala / Modalidade
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Ex: LabDiv Sala 204 / Remoto"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Dia da Semana
                  </label>
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(e.target.value as ScheduleShiftItem['dayOfWeek'])}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  >
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Horário de Início
                  </label>
                  <input
                    type="time"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Horário de Término
                  </label>
                  <input
                    type="time"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                  Membros Alocados
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface border border-border-subtle max-h-28 overflow-y-auto">
                  {members.map((m) => {
                    const isChecked = newAssigned.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setNewAssigned((prev) =>
                            isChecked ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${
                          isChecked
                            ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                            : 'bg-app border-border-subtle text-fg-muted'
                        }`}
                      >
                        {m.full_name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateShiftOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-500 text-slate-950 hover:bg-teal-400"
                >
                  Salvar Turno
                </button>
              </div>
            </form>
          )}

          {/* Cards de Turnos por Dia */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {shifts.map((s) => {
              const sub = subteams.find((sb) => sb.id === s.subteam_id);
              const assignedMembers = members.filter((m) => s.assignedMemberIds.includes(m.id));

              return (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl bg-app border border-border-subtle flex flex-col justify-between gap-3 hover:border-teal-500/30 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono">
                        {s.dayOfWeek} • {s.startTime} - {s.endTime}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-fg-muted font-bold">
                          {sub?.name || 'Geral'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditShift(s)}
                          className="p-1 rounded hover:bg-surface text-fg-muted hover:text-teal-300 transition-colors cursor-pointer"
                          title="Editar escala"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteShift(s.id)}
                          className="p-1 rounded hover:bg-rose-500/10 text-fg-muted hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remover escala"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-fg">{s.title}</h4>
                    {s.locationOrEvent && (
                      <p className="text-[11px] text-fg-muted flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">location_on</span>
                        <span>{s.locationOrEvent}</span>
                      </p>
                    )}
                  </div>

                  <div className="border-t border-border-subtle pt-2 space-y-1">
                    <span className="text-[10px] font-bold text-fg-muted uppercase block">
                      Escalados ({assignedMembers.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {assignedMembers.length === 0 ? (
                        <span className="text-[10px] text-amber-300 italic">Sem membros alocados</span>
                      ) : (
                        assignedMembers.map((m) => (
                          <span
                            key={m.id}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-fg-secondary"
                          >
                            {m.full_name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 2: Presenças Confirmadas */}
      {activeTab === 'presencas' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>Auditoria e histórico de check-ins registrados via QR Code na organização.</span>
          </div>

          {attendances.length === 0 ? (
            <div className="p-4 rounded-xl bg-app border border-border-subtle text-xs text-fg-muted text-center italic">
              Nenhuma presença registrada ainda. Utilize o botão &quot;Registrar Presença&quot; acima.
            </div>
          ) : (
            <div className="space-y-2">
              {attendances.map((att) => (
                <div
                  key={att.id}
                  className="p-3 rounded-xl bg-app border border-border-subtle flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-emerald-400 text-[18px]">
                      check_circle
                    </span>
                    <div>
                      <span className="font-bold text-fg block">{att.userName}</span>
                      <span className="text-[10px] text-fg-muted font-mono">{att.qrPayload}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-fg-muted">
                    {new Date(att.timestamp).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: Gestão de Membros (Admin) */}
      {activeTab === 'equipe' && isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>Gestão direta de membros, categorias e permissões do {organization.name}.</span>
          </div>

          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-xl bg-app border border-border-subtle flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-surface border border-border-subtle flex items-center justify-center font-bold text-fg">
                    {m.full_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-bold text-fg block">{m.full_name}</span>
                    <span className="text-[10px] text-fg-muted">
                      {m.email || 'Sem e-mail'} • Papel: {m.org_role}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg-secondary">
                    {m.subteam?.name || 'Sem categoria'}
                  </span>
                  {onRemoveMember && m.org_role !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => onRemoveMember(m.id)}
                      className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10 text-xs font-bold"
                      title="Remover membro da organização"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Scanner de QR Code */}
      {isScannerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-400 text-[22px]">
                  qr_code_scanner
                </span>
                <h3 className="text-sm font-bold text-white">
                  Leitor de QR Code • Registro de Presença
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="text-fg-muted hover:text-white"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-6 rounded-xl bg-app border border-dashed border-teal-500/40 flex flex-col items-center justify-center text-center space-y-3">
              <span className="material-symbols-outlined text-teal-400 text-[48px] animate-pulse">
                center_focus_strong
              </span>
              <p className="text-xs text-fg-secondary max-w-xs">
                Aponte a câmera para o QR Code do laboratório ou confirme o código da sessão ativa.
              </p>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-black/40 text-teal-300">
                Sessão: {organization.name}
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-fg-muted uppercase block">
                Código QR Detectado (ou digite para validar)
              </label>
              <input
                type="text"
                value={simulatedQrInput}
                onChange={(e) => setSimulatedQrInput(e.target.value)}
                placeholder="Ex: aurtistic-checkin:labdiv-presencial-123"
                className="w-full px-3 py-1.5 rounded-lg bg-app border border-border-subtle text-xs text-fg focus:outline-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleRegisterQrAttendance()}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-500 text-slate-950 hover:bg-teal-400 shadow-sm"
              >
                Confirmar Presença ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

