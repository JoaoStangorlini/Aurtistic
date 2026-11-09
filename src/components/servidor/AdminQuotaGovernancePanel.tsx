// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AdminStorageUserSummary,
  EdgeTelemetrySnapshot,
  StorageGlobalSettings,
} from '@/types';
import {
  adminListStorageUsersAction,
  adminUpdateGovernanceAction,
  syncLegacyPortfolioCatalogAction,
} from '@/app/(dashboard)/servidor/actions';
import { fetchEdgeTelemetryDirect } from '@/lib/edge-client';
import { formatStorageBytes } from '@/lib/edge-urls';

export interface AdminQuotaGovernancePanelProps {
  mode: 'governance' | 'telemetry';
  ticket: string;
  serverUrl?: string;
}

export function AdminQuotaGovernancePanel({
  mode,
  ticket,
  serverUrl,
}: AdminQuotaGovernancePanelProps) {
  const [users, setUsers] = useState<AdminStorageUserSummary[]>([]);
  const [globalSettings, setGlobalSettings] = useState<StorageGlobalSettings | null>(null);
  const [defaultGbInput, setDefaultGbInput] = useState('25');
  const [requireApprovalInput, setRequireApprovalInput] = useState(true);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estado do modal de Boost de Evento / Ajuste Individual
  const [selectedUser, setSelectedUser] = useState<AdminStorageUserSummary | null>(null);
  const [baseQuotaGb, setBaseQuotaGb] = useState('25');
  const [tempQuotaGb, setTempQuotaGb] = useState('');
  const [tempQuotaDays, setTempQuotaDays] = useState('7');
  const [tempQuotaReason, setTempQuotaReason] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Sincronização em lote das 2.369 fotos do Fire Stick
  const [syncingLegacy, setSyncingLegacy] = useState(false);

  // Telemetria ARM
  const [telemetry, setTelemetry] = useState<EdgeTelemetrySnapshot | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [renderTimestamp] = useState(() => Date.now());

  const loadGovernanceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminListStorageUsersAction();
    if (!res.ok) {
      setError(res.error || 'Erro ao carregar governança.');
      setLoading(false);
      return;
    }
    setUsers(res.users || []);
    if (res.globalSettings) {
      setGlobalSettings(res.globalSettings);
      const gb = Math.round(res.globalSettings.default_quota_bytes / (1024 * 1024 * 1024));
      setDefaultGbInput(String(gb || 25));
      setRequireApprovalInput(Boolean(res.globalSettings.require_admin_approval));
    }
    setLoading(false);
  }, []);

  const loadTelemetry = useCallback(async () => {
    setTelemetryLoading(true);
    setError(null);
    try {
      const snap = await fetchEdgeTelemetryDirect({ ticket, serverUrl });
      setTelemetry(snap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao ler telemetria do Fire Stick.');
    } finally {
      setTelemetryLoading(false);
    }
  }, [ticket, serverUrl]);

  useEffect(() => {
    let ignore = false;
    if (mode === 'governance') {
      adminListStorageUsersAction().then((res) => {
        if (ignore) return;
        if (!res.ok) {
          setError(res.error || 'Erro ao carregar governança.');
          setLoading(false);
          return;
        }
        setUsers(res.users || []);
        if (res.globalSettings) {
          setGlobalSettings(res.globalSettings);
          const gb = Math.round(res.globalSettings.default_quota_bytes / (1024 * 1024 * 1024));
          setDefaultGbInput(String(gb || 25));
          setRequireApprovalInput(Boolean(res.globalSettings.require_admin_approval));
        }
        setLoading(false);
      });
    } else {
      fetchEdgeTelemetryDirect({ ticket, serverUrl })
        .then((snap) => {
          if (ignore) return;
          setTelemetry(snap);
          setTelemetryLoading(false);
        })
        .catch((err: unknown) => {
          if (ignore) return;
          setError(err instanceof Error ? err.message : 'Erro ao ler telemetria do Fire Stick.');
          setTelemetryLoading(false);
        });
    }
    return () => {
      ignore = true;
    };
  }, [mode, ticket, serverUrl]);

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);
    const gbNum = Math.max(1, Number(defaultGbInput) || 25);
    const res = await adminUpdateGovernanceAction({
      newGlobalDefaultGb: gbNum,
      requireAdminApproval: requireApprovalInput,
    });
    if (!res.ok) {
      setError(res.error || 'Erro ao salvar padrão global.');
      return;
    }
    setFeedback(`Padrão global atualizado para ${gbNum} GB!`);
    void loadGovernanceData();
  };

  const handleQuickApproveOrSuspend = async (
    u: AdminStorageUserSummary,
    nextStatus: 'approved' | 'suspended'
  ) => {
    setFeedback(null);
    setError(null);
    const defaultGb = globalSettings
      ? Math.round(globalSettings.default_quota_bytes / (1024 * 1024 * 1024))
      : 25;

    const res = await adminUpdateGovernanceAction({
      targetUserId: u.user_id,
      approvalStatus: nextStatus,
      quotaLimitGb:
        u.quota_limit_bytes > 0
          ? Math.round(u.quota_limit_bytes / (1024 * 1024 * 1024))
          : defaultGb,
      updateTempBoost: false, // Preserva qualquer Boost de Evento ativo!
    });
    if (!res.ok) {
      setError(res.error || 'Falha ao atualizar status.');
      return;
    }
    setFeedback(
      nextStatus === 'approved'
        ? `Conta ${u.email} aprovada com sucesso!`
        : `Conta ${u.email} suspensa.`
    );
    void loadGovernanceData();
  };

  const openBoostModal = (u: AdminStorageUserSummary) => {
    setSelectedUser(u);
    setBaseQuotaGb(String(Math.max(1, Math.round(u.quota_limit_bytes / (1024 * 1024 * 1024)))));
    setTempQuotaGb(
      u.temp_quota_bytes
        ? String(Math.round(u.temp_quota_bytes / (1024 * 1024 * 1024)))
        : '120'
    );
    setTempQuotaDays('7');
    setTempQuotaReason(u.temp_quota_reason || '');
  };

  const handleSaveUserBoost = async (clearBoost = false) => {
    if (!selectedUser) return;
    setSavingUser(true);
    setError(null);
    setFeedback(null);

    const res = await adminUpdateGovernanceAction({
      targetUserId: selectedUser.user_id,
      approvalStatus: 'approved',
      quotaLimitGb: Math.max(1, Number(baseQuotaGb) || 25),
      updateTempBoost: true,
      tempQuotaGb: clearBoost ? null : Math.max(1, Number(tempQuotaGb) || 100),
      tempQuotaDays: clearBoost ? null : Math.max(1, Number(tempQuotaDays) || 7),
      tempQuotaReason: clearBoost ? null : tempQuotaReason.trim() || 'Cobertura de Evento',
    });

    setSavingUser(false);
    if (!res.ok) {
      setError(res.error || 'Erro ao aplicar quota temporária.');
      return;
    }

    setFeedback(
      clearBoost
        ? `Boost temporário removido de ${selectedUser.email}.`
        : `Boost de Evento aplicado para ${selectedUser.email}!`
    );
    setSelectedUser(null);
    void loadGovernanceData();
  };

  const handleSyncLegacyCatalog = async () => {
    setSyncingLegacy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await syncLegacyPortfolioCatalogAction();
      if (!res.ok) {
        setError(res.error || 'Falha ao sincronizar catálogo legado.');
      } else {
        setFeedback(
          `Acervo sincronizado! ${res.importedCount} fotos (.avif + EXIF) vinculadas ao índice do Supabase.`
        );
      }
    } finally {
      setSyncingLegacy(false);
    }
  };

  if (mode === 'telemetry') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-fg flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FFCC00]">monitoring</span>
              Telemetria de Hardware (Fire TV Stick • Termux ARM)
            </h3>
            <p className="text-xs text-fg-secondary">
              Monitoramento em tempo real do nó físico e HD externo USB FAT32
            </p>
          </div>
          <button
            type="button"
            onClick={loadTelemetry}
            disabled={telemetryLoading}
            className="px-3.5 py-2 rounded-lg bg-surface hover:bg-surface-hover border border-border-subtle text-xs font-bold text-fg flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            {telemetryLoading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[#F14343]/10 border border-[#F14343]/40 text-xs text-[#ffb4ab]">
            {error}
          </div>
        )}

        {telemetry && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <div className="text-xs text-fg-secondary font-bold uppercase">Dispositivo & Uptime</div>
              <div className="text-lg font-bold text-fg mt-1">{telemetry.device}</div>
              <div className="text-xs text-emerald-400 mt-1">
                Ativo há {Math.floor((telemetry.uptime || 0) / 3600)}h{' '}
                {Math.floor(((telemetry.uptime || 0) % 3600) / 60)}m • v{telemetry.version}
              </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <div className="text-xs text-fg-secondary font-bold uppercase">Carga CPU & Térmica</div>
              <div className="text-lg font-bold text-[#FFCC00] mt-1">
                {telemetry.cpuLoadPercent ?? 0}% CPU
              </div>
              <div className="text-xs text-fg-secondary mt-1">
                Temperatura SoC:{' '}
                {telemetry.tempCelsius !== null && telemetry.tempCelsius !== undefined
                  ? `${telemetry.tempCelsius} °C`
                  : 'Normal'}
              </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <div className="text-xs text-fg-secondary font-bold uppercase">Memória RAM</div>
              <div className="text-lg font-bold text-[#9D4EDD] mt-1">
                {telemetry.ramUsedMb ?? 0} MB / {telemetry.ramTotalMb ?? 0} MB
              </div>
              <div className="text-xs text-fg-secondary mt-1">Concorrência máx de thumbs: 2</div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <div className="text-xs text-fg-secondary font-bold uppercase">HD USB Externo (FAT32)</div>
              <div className="text-lg font-bold text-fg mt-1">
                {formatStorageBytes(telemetry.diskUsedBytes || 0)}
              </div>
              <div className="text-xs text-fg-secondary mt-1 truncate" title={telemetry.storageDir}>
                Mount: {telemetry.storageDir || '/storage'}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho + Padrão Global 25 GB + Botão Sync 2.369 fotos */}
      <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-fg flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FFCC00]">admin_panel_settings</span>
              Governança de Armazenamento, Aprovações (25 GB) & Boost de Eventos
            </h3>
            <p className="text-xs text-fg-secondary mt-0.5">
              Aprove novos usuários para liberar a quota padrão de 25 GB ou conceda limite maior temporário para colegas em cobertura de eventos.
            </p>
          </div>

          <button
            type="button"
            disabled={syncingLegacy}
            onClick={handleSyncLegacyCatalog}
            className="px-4 py-2.5 rounded-xl bg-[#9D4EDD]/20 hover:bg-[#9D4EDD]/30 border border-[#9D4EDD]/50 text-xs font-bold text-[#E0AAFF] flex items-center gap-2 shrink-0 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
            {syncingLegacy
              ? 'Sincronizando acervo...'
              : 'Sincronizar Acervo Fire Stick (2.369 fotos .avif)'}
          </button>
        </div>

        <form
          onSubmit={handleSaveGlobalSettings}
          className="pt-3 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-fg-secondary font-medium">
              <span>Quota Padrão para Aprovados:</span>
              <input
                type="number"
                min={1}
                max={2000}
                value={defaultGbInput}
                onChange={(e) => setDefaultGbInput(e.target.value)}
                className="w-20 bg-app border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#FFCC00] outline-none"
              />
              <span className="text-fg-secondary font-bold">GB</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={requireApprovalInput}
                onChange={(e) => setRequireApprovalInput(e.target.checked)}
                className="accent-[#FFCC00] w-4 h-4 rounded"
              />
              <span>Exigir minha aprovação antes de liberar escrita no HD</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-bold transition-colors shrink-0"
          >
            Salvar Padrão Global
          </button>
        </form>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[#F14343]/10 border border-[#F14343]/40 text-xs text-[#ffb4ab]">
          {error}
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          {feedback}
        </div>
      )}

      {/* Tabela de Usuários */}
      <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-subtle bg-app text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Uso Atual</th>
                <th className="py-3 px-4">Quota Efetiva</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D2D2D] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-fg-secondary">
                    Carregando lista de usuários...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-fg-secondary">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const hasBoost =
                    Boolean(u.temp_quota_bytes) &&
                    (!u.temp_quota_expires_at ||
                      new Date(u.temp_quota_expires_at).getTime() > renderTimestamp);
                  return (
                    <tr key={u.user_id} className="hover:bg-surface transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-fg">{u.email}</div>
                        <div className="text-[11px] text-fg-muted">
                          @{u.username || u.user_id.slice(0, 8)} •{' '}
                          {u.storage_role === 'admin' ? 'Administrador' : 'Membro'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            u.approval_status === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : u.approval_status === 'pending'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-[#F14343]/15 text-[#ffb4ab] border border-[#F14343]/30'
                          }`}
                        >
                          {u.approval_status === 'approved'
                            ? 'Aprovado'
                            : u.approval_status === 'pending'
                              ? 'Pendente'
                              : 'Suspenso'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-fg">
                        {formatStorageBytes(u.used_bytes)}
                      </td>
                      <td className="py-3 px-4">
                        {u.approval_status !== 'approved' && u.storage_role !== 'admin' ? (
                          <span className="text-fg-muted">0 B (aguardando aprovação)</span>
                        ) : hasBoost ? (
                          <div>
                            <span className="font-bold text-[#E0AAFF]">
                              ⚡ {formatStorageBytes(u.temp_quota_bytes || 0)}
                            </span>
                            {u.temp_quota_reason && (
                              <div className="text-[11px] text-fg-secondary">
                                {u.temp_quota_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-fg-secondary">
                            {formatStorageBytes(u.quota_limit_bytes)} (Padrão)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {u.approval_status !== 'approved' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickApproveOrSuspend(u, 'approved')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#121212] font-bold transition-colors"
                          >
                            Aprovar (25 GB)
                          </button>
                        ) : (
                          u.storage_role !== 'admin' && (
                            <button
                              type="button"
                              onClick={() => handleQuickApproveOrSuspend(u, 'suspended')}
                              className="px-2.5 py-1.5 rounded-lg bg-surface-hover hover:bg-[#F14343]/20 hover:text-[#F14343] text-fg-secondary font-bold transition-colors"
                            >
                              Suspender
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => openBoostModal(u)}
                          className="px-3 py-1.5 rounded-lg bg-[#9D4EDD]/20 hover:bg-[#9D4EDD]/30 border border-[#9D4EDD]/40 text-[#E0AAFF] font-bold transition-colors"
                        >
                          Ajustar / Evento ⚡
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Ajuste Individual / Boost de Evento */}
      {selectedUser && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-fg">
                  Ajustar Quota / Boost de Evento
                </h4>
                <p className="text-xs text-fg-secondary">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg text-fg-secondary hover:text-fg"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-fg-secondary uppercase mb-1">
                  Quota Base Permanente (GB)
                </label>
                <input
                  type="number"
                  min={1}
                  value={baseQuotaGb}
                  onChange={(e) => setBaseQuotaGb(e.target.value)}
                  className="w-full bg-app border border-border-subtle rounded-lg px-3 py-2 text-sm text-fg outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-app border border-[#9D4EDD]/40 space-y-3">
                <div className="text-xs font-bold text-[#E0AAFF] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                  Boost Temporário para Cobertura de Evento
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-fg-secondary mb-1">
                      Quota Temporária (GB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={tempQuotaGb}
                      onChange={(e) => setTempQuotaGb(e.target.value)}
                      placeholder="Ex: 120"
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-fg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-fg-secondary mb-1">
                      Duração (Dias)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={tempQuotaDays}
                      onChange={(e) => setTempQuotaDays(e.target.value)}
                      placeholder="Ex: 7"
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-fg outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-fg-secondary mb-1">
                    Motivo / Nome do Evento
                  </label>
                  <input
                    type="text"
                    value={tempQuotaReason}
                    onChange={(e) => setTempQuotaReason(e.target.value)}
                    placeholder="Ex: Cobertura Festival de Fotografia"
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-fg outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedUser.temp_quota_bytes ? (
                <button
                  type="button"
                  disabled={savingUser}
                  onClick={() => handleSaveUserBoost(true)}
                  className="text-xs font-bold text-[#F14343] hover:underline"
                >
                  Remover Boost Ativo
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-bold text-fg-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingUser}
                  onClick={() => handleSaveUserBoost(false)}
                  className="px-4 py-2 rounded-lg bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-bold"
                >
                  {savingUser ? 'Salvando...' : 'Salvar Quota & Boost'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

