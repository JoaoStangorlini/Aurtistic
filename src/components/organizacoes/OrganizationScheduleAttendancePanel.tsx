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
  startTime: string;
  endTime: string;
  assignedMemberIds: string[];
  locationOrEvent?: string;
}

export type AttendanceDirection = 'entrada' | 'saida';

export interface AttendanceRecordItem {
  id: string;
  userId: string;
  userName: string;
  direction?: AttendanceDirection;
  shiftId?: string;
  shiftTitle?: string;
  qrPayload: string;
  timestamp: string;
}

export type PeriodKey = 'manha' | 'tarde' | 'noite';
export type MatrixDayKey = 'Seg' | 'Ter' | 'Qua' | 'Qui' | 'Sex' | 'Sáb';

export interface WeeklyAvailabilityMap {
  // key: `${day}-${period}` -> array de userIds que vão
  [slotKey: string]: string[];
}

export interface OrganizationScheduleAttendancePanelProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  members: OrganizationMember[];
  currentUserId?: string;
  currentUserName?: string;
  isAdmin?: boolean;
  onRemoveMember?: (memberId: string) => Promise<void>;
  onAttendanceStatusChange?: (status: { isCheckedIn: boolean; lastRecord: AttendanceRecordItem | null }) => void;
  externalOpenScanner?: AttendanceDirection | null;
  onExternalScannerHandled?: () => void;
}

const SHIFTS_KEY_PREFIX = 'aurtistic_shifts_';
const ATTENDANCE_KEY_PREFIX = 'aurtistic_attendance_';
const MATRIX_KEY_PREFIX = 'aurtistic_weekly_matrix_';

const MATRIX_DAYS: MatrixDayKey[] = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MATRIX_PERIODS: { id: PeriodKey; label: string; range: string; icon: string }[] = [
  { id: 'manha', label: 'Manhã', range: '08h–12h', icon: 'wb_sunny' },
  { id: 'tarde', label: 'Tarde', range: '13h–18h', icon: 'partly_cloudy_day' },
  { id: 'noite', label: 'Noite', range: '18h–22h', icon: 'dark_mode' },
];

export function OrganizationScheduleAttendancePanel({
  organization,
  subteams,
  members,
  currentUserId,
  currentUserName = 'Membro da Equipe',
  isAdmin = false,
  onRemoveMember,
  onAttendanceStatusChange,
  externalOpenScanner,
  onExternalScannerHandled,
}: OrganizationScheduleAttendancePanelProps) {
  const shiftsStorageKey = `${SHIFTS_KEY_PREFIX}${organization.id}`;
  const attendanceStorageKey = `${ATTENDANCE_KEY_PREFIX}${organization.id}`;
  const matrixStorageKey = `${MATRIX_KEY_PREFIX}${organization.id}`;

  const [shifts, setShifts] = useState<ScheduleShiftItem[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecordItem[]>([]);
  const [weeklyMatrix, setWeeklyMatrix] = useState<WeeklyAvailabilityMap>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Estados de UI (M3)
  const [activeTab, setActiveTab] = useState<'horarios' | 'ponto' | 'escalas'>('horarios');
  const [isCreateShiftOpen, setIsCreateShiftOpen] = useState(false);
  const [scannerDirection, setScannerDirection] = useState<AttendanceDirection | null>(null);
  const [simulatedQrInput, setSimulatedQrInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Formulário de turno
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newSubteamId, setNewSubteamId] = useState(subteams[0]?.id || '');
  const [newDay, setNewDay] = useState<ScheduleShiftItem['dayOfWeek']>('Seg');
  const [newStart, setNewStart] = useState('14:00');
  const [newEnd, setNewEnd] = useState('18:00');
  const [newLocation, setNewLocation] = useState('');
  const [newAssigned, setNewAssigned] = useState<string[]>([]);

  const effectiveUserId = currentUserId || 'local-member';

  useEffect(() => {
    if (externalOpenScanner) {
      setScannerDirection(externalOpenScanner);
      onExternalScannerHandled?.();
    }
  }, [externalOpenScanner, onExternalScannerHandled]);

  useEffect(() => {
    try {
      const storedShifts = localStorage.getItem(shiftsStorageKey);
      if (storedShifts) {
        setShifts(JSON.parse(storedShifts));
      } else {
        const seedShifts: ScheduleShiftItem[] = [
          {
            id: 'shift-seed-1',
            subteam_id: subteams[0]?.id || '',
            title: 'Plantão Técnico & Bancada',
            dayOfWeek: 'Seg',
            startTime: '14:00',
            endTime: '18:00',
            assignedMemberIds: members.slice(0, 2).map((m) => m.id),
            locationOrEvent: 'Sala 204 / Laboratório',
          },
          {
            id: 'shift-seed-2',
            subteam_id: subteams[0]?.id || '',
            title: 'Ensaio & Coleta Experimental',
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

      const storedMatrix = localStorage.getItem(matrixStorageKey);
      if (storedMatrix) {
        setWeeklyMatrix(JSON.parse(storedMatrix));
      } else {
        const seedMatrix: WeeklyAvailabilityMap = {
          'Seg-tarde': [effectiveUserId],
          'Qua-manha': [effectiveUserId],
        };
        setWeeklyMatrix(seedMatrix);
        localStorage.setItem(matrixStorageKey, JSON.stringify(seedMatrix));
      }
    } catch {}
    setIsLoaded(true);
  }, [shiftsStorageKey, attendanceStorageKey, matrixStorageKey, subteams, members, effectiveUserId]);

  const myLastAttendance = useMemo(() => {
    return attendances.find((a) => a.userId === effectiveUserId) || null;
  }, [attendances, effectiveUserId]);

  const isCheckedIn = useMemo(() => {
    if (!myLastAttendance) return false;
    return (myLastAttendance.direction || 'entrada') === 'entrada';
  }, [myLastAttendance]);

  useEffect(() => {
    onAttendanceStatusChange?.({ isCheckedIn, lastRecord: myLastAttendance });
  }, [isCheckedIn, myLastAttendance, onAttendanceStatusChange]);

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

  const toggleMatrixSlot = (day: MatrixDayKey, period: PeriodKey) => {
    const slotKey = `${day}-${period}`;
    const currentList = weeklyMatrix[slotKey] || [];
    const exists = currentList.includes(effectiveUserId);
    const nextList = exists
      ? currentList.filter((id) => id !== effectiveUserId)
      : [...currentList, effectiveUserId];

    const updated: WeeklyAvailabilityMap = {
      ...weeklyMatrix,
      [slotKey]: nextList,
    };
    setWeeklyMatrix(updated);
    try {
      localStorage.setItem(matrixStorageKey, JSON.stringify(updated));
    } catch {}
  };

  const myGoingCount = useMemo(() => {
    return Object.values(weeklyMatrix).filter((list) => list.includes(effectiveUserId)).length;
  }, [weeklyMatrix, effectiveUserId]);

  const handleRegisterQrAttendance = (direction: AttendanceDirection, payloadCode?: string) => {
    const code =
      payloadCode?.trim() ||
      simulatedQrInput.trim() ||
      `aurtistic-${direction}:${organization.slug}:${Date.now()}`;

    const newRecord: AttendanceRecordItem = {
      id: `att_${Date.now()}`,
      userId: effectiveUserId,
      userName: currentUserName,
      direction,
      qrPayload: code,
      timestamp: new Date().toISOString(),
    };

    saveAttendances([newRecord, ...attendances]);
    setFeedbackMsg({
      text:
        direction === 'entrada'
          ? 'Entrada registrada via QR Code! Bom turno.'
          : 'Saída registrada via QR Code! Turno encerrado.',
      ok: true,
    });
    setScannerDirection(null);
    setSimulatedQrInput('');
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

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
    setActiveTab('escalas');
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
    setActiveTab('escalas');
  };

  const handleDeleteShift = (shiftId: string) => {
    saveShifts(shifts.filter((s) => s.id !== shiftId));
    setFeedbackMsg({ text: 'Escala removida.', ok: true });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

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
      setFeedbackMsg({ text: 'Escala atualizada!', ok: true });
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
      setFeedbackMsg({ text: 'Escala criada!', ok: true });
    }

    setTimeout(() => setFeedbackMsg(null), 3500);
    setEditingShiftId(null);
    setNewTitle('');
    setNewLocation('');
    setNewAssigned([]);
    setIsCreateShiftOpen(false);
  };

  if (!isLoaded) return null;

  return (
    <div className="org-card p-4 md:p-6 bg-surface border border-border-subtle rounded-2xl shadow-lg space-y-6">
      {/* Cabeçalho + Marcador de Ponto QR (Entrada vs Saída) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-primary)]/15 border border-[var(--md-sys-color-primary)]/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px] text-[var(--md-sys-color-primary)]">
              calendar_clock
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-fg uppercase tracking-wider">
                Horários & Ponto QR • {organization.name}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  isCheckedIn
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-app text-fg-muted border-border-subtle'
                }`}
              >
                {isCheckedIn ? 'Em Turno Agora' : 'Fora de Turno'}
              </span>
            </div>
            <p className="text-xs text-fg-muted mt-1">
              Marque os dias e períodos em que você vai e bata seu ponto de entrada ou saída via QR Code.
            </p>
          </div>
        </div>

        {/* Botões Distintos: Entrada (#1F9FCF no LabDiv) vs Saída (#F14343 no LabDiv) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScannerDirection('entrada')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 ${
              !isCheckedIn
                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary,var(--on-accent-primary))] shadow-md hover:brightness-110'
                : 'bg-[var(--md-sys-color-primary)]/15 text-[var(--md-sys-color-primary)] border border-[var(--md-sys-color-primary)]/40 hover:bg-[var(--md-sys-color-primary)]/25'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            <span>Bater Entrada (QR)</span>
          </button>

          <button
            type="button"
            onClick={() => setScannerDirection('saida')}
            style={{
              backgroundColor: isCheckedIn ? 'var(--md-sys-color-tertiary)' : 'transparent',
              borderColor: 'var(--md-sys-color-tertiary)',
              color: isCheckedIn ? '#ffffff' : 'var(--md-sys-color-tertiary)',
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-200 cursor-pointer active:scale-[0.98] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Bater Saída (QR)</span>
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

      {/* Segmented M3 Tabs */}
      <div className="inline-flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-app border border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('horarios')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] ${
            activeTab === 'horarios'
              ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary,var(--on-accent-primary))] shadow-sm'
              : 'text-fg-muted hover:text-fg hover:bg-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">grid_on</span>
          <span>Meus Horários ({myGoingCount} períodos)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ponto')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] ${
            activeTab === 'ponto'
              ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary,var(--on-accent-primary))] shadow-sm'
              : 'text-fg-muted hover:text-fg hover:bg-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
          <span>Histórico de Ponto ({attendances.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('escalas')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] ${
            activeTab === 'escalas'
              ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary,var(--on-accent-primary))] shadow-sm'
              : 'text-fg-muted hover:text-fg hover:bg-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">event_note</span>
          <span>Plantões ({shifts.length})</span>
        </button>
      </div>

      {/* ABA 1: Matriz Semanal Manhã / Tarde / Noite (Seg a Sáb) */}
      {activeTab === 'horarios' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span>
              Clique em qualquer período para alternar entre <strong className="text-fg">Vou</strong> e{' '}
              <strong className="text-fg">Não vou</strong>.
            </span>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--md-sys-color-primary)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
                Vou
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-fg-muted">
                <span className="w-2.5 h-2.5 rounded-full border border-border-subtle bg-app" />
                Não vou
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px] grid grid-cols-[120px_repeat(6,minmax(0,1fr))] gap-2">
              <div className="p-2 text-[11px] font-bold uppercase tracking-wider text-fg-muted flex items-end">
                Período
              </div>
              {MATRIX_DAYS.map((day) => (
                <div
                  key={day}
                  className="p-2 rounded-xl bg-app border border-border-subtle text-center text-xs font-black uppercase tracking-wider text-fg"
                >
                  {day}
                </div>
              ))}

              {MATRIX_PERIODS.map((period) => (
                <React.Fragment key={period.id}>
                  <div className="p-3 rounded-xl bg-app border border-border-subtle flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                      <span className="material-symbols-outlined text-[15px] text-[var(--md-sys-color-secondary)]">
                        {period.icon}
                      </span>
                      <span>{period.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-fg-muted mt-0.5">{period.range}</span>
                  </div>

                  {MATRIX_DAYS.map((day) => {
                    const slotKey = `${day}-${period.id}`;
                    const goingUsers = weeklyMatrix[slotKey] || [];
                    const isGoing = goingUsers.includes(effectiveUserId);
                    const othersCount = goingUsers.filter((id) => id !== effectiveUserId).length;

                    return (
                      <button
                        key={slotKey}
                        type="button"
                        onClick={() => toggleMatrixSlot(day, period.id)}
                        aria-pressed={isGoing}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between min-h-[72px] ${
                          isGoing
                            ? 'bg-[var(--md-sys-color-primary)]/18 border-[var(--md-sys-color-primary)] text-fg shadow-sm'
                            : 'bg-app/60 border-dashed border-border-subtle text-fg-muted hover:border-border-strong hover:bg-app'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-black uppercase tracking-wide">
                            {isGoing ? 'Vou' : 'Não vou'}
                          </span>
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              isGoing ? 'text-[var(--md-sys-color-primary)]' : 'opacity-40'
                            }`}
                          >
                            {isGoing ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                        </div>
                        {othersCount > 0 && (
                          <span className="text-[10px] text-fg-muted mt-1">
                            +{othersCount} colega{othersCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: Histórico de Ponto (Entrada / Saída) */}
      {activeTab === 'ponto' && (
        <div className="space-y-3">
          {attendances.length === 0 ? (
            <div className="p-6 rounded-xl bg-app border border-border-subtle text-xs text-fg-muted text-center">
              Nenhum registro de ponto ainda. Use os botões <strong>Bater Entrada (QR)</strong> ou{' '}
              <strong>Bater Saída (QR)</strong> acima.
            </div>
          ) : (
            <div className="space-y-2">
              {attendances.map((att) => {
                const dir = att.direction || 'entrada';
                const isIn = dir === 'entrada';
                return (
                  <div
                    key={att.id}
                    className="p-3 rounded-xl bg-app border border-border-subtle flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        style={{
                          color: isIn ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-tertiary)',
                        }}
                        className="material-symbols-outlined text-[20px]"
                      >
                        {isIn ? 'login' : 'logout'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-fg">{att.userName}</span>
                          <span
                            style={{
                              borderColor: isIn ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-tertiary)',
                              color: isIn ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-tertiary)',
                            }}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
                          >
                            {isIn ? 'Entrada' : 'Saída'}
                          </span>
                        </div>
                        <span className="text-[10px] text-fg-muted font-mono block mt-0.5">
                          {att.qrPayload}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-fg-muted">
                      {new Date(att.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: Escalas Específicas / Plantões */}
      {activeTab === 'escalas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-fg-muted">
              Plantões específicos e eventos da semana em {organization.name}.
            </span>
            <button
              type="button"
              onClick={handleOpenNewShiftForm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--md-sys-color-primary)]/15 border border-[var(--md-sys-color-primary)]/40 text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/25 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Novo Plantão</span>
            </button>
          </div>

          {isCreateShiftOpen && (
            <form
              onSubmit={handleCreateShift}
              className="p-4 rounded-xl bg-app border border-[var(--md-sys-color-primary)]/40 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[var(--md-sys-color-primary)] uppercase tracking-wider">
                  {editingShiftId ? 'Editar Plantão' : 'Definir Novo Plantão'}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateShiftOpen(false);
                    setEditingShiftId(null);
                  }}
                  className="text-xs text-fg-muted hover:text-fg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Título *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Plantão de Atendimento"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Dia
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
                    Local
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Ex: Sala 204"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                    Início
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
                    Término
                  </label>
                  <input
                    type="time"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateShiftOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary,var(--on-accent-primary))]"
                >
                  Salvar Plantão
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {shifts.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl bg-app border border-border-subtle flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black px-2 py-0.5 rounded bg-[var(--md-sys-color-primary)]/15 text-[var(--md-sys-color-primary)] font-mono">
                      {s.dayOfWeek} • {s.startTime}–{s.endTime}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditShift(s)}
                        className="p-1 rounded hover:bg-surface text-fg-muted hover:text-fg cursor-pointer"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteShift(s.id)}
                        className="p-1 rounded hover:bg-rose-500/10 text-fg-muted hover:text-rose-400 cursor-pointer"
                        title="Remover"
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal / Bottom Sheet de Leitor QR Code (Entrada & Saída) */}
      {scannerDirection && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-surface border border-border-subtle rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  style={{
                    color:
                      scannerDirection === 'entrada'
                        ? 'var(--md-sys-color-primary)'
                        : 'var(--md-sys-color-tertiary)',
                  }}
                  className="material-symbols-outlined text-[24px]"
                >
                  qr_code_scanner
                </span>
                <h4 className="text-sm font-black uppercase tracking-wide text-fg">
                  {scannerDirection === 'entrada' ? 'Ponto QR — Entrada' : 'Ponto QR — Saída'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setScannerDirection(null)}
                className="p-1 rounded-lg text-fg-muted hover:text-fg cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Alternador rápido Entrada / Saída dentro do modal */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-app border border-border-subtle">
              <button
                type="button"
                onClick={() => setScannerDirection('entrada')}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  scannerDirection === 'entrada'
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary,var(--on-accent-primary))]'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">login</span>
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setScannerDirection('saida')}
                style={{
                  backgroundColor:
                    scannerDirection === 'saida' ? 'var(--md-sys-color-tertiary)' : 'transparent',
                  color: scannerDirection === 'saida' ? '#ffffff' : undefined,
                }}
                className="py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all text-fg-muted hover:text-fg"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Saída
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-fg-muted uppercase block">
                Código do QR da Porta / Bancada (ou confirme direto)
              </label>
              <input
                type="text"
                value={simulatedQrInput}
                onChange={(e) => setSimulatedQrInput(e.target.value)}
                placeholder={`Ex: QR-${organization.slug.toUpperCase()}-${scannerDirection.toUpperCase()}`}
                className="w-full px-3 py-2.5 rounded-xl bg-app border border-border-subtle text-xs text-fg focus:outline-none focus:border-[var(--md-sys-color-primary)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setScannerDirection(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-fg-muted hover:text-fg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleRegisterQrAttendance(scannerDirection)}
                style={{
                  backgroundColor:
                    scannerDirection === 'entrada'
                      ? 'var(--md-sys-color-primary)'
                      : 'var(--md-sys-color-tertiary)',
                  color: scannerDirection === 'entrada' ? '#040714' : '#ffffff',
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide shadow-md hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                Confirmar {scannerDirection === 'entrada' ? 'Entrada' : 'Saída'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
