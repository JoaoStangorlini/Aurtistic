// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import type { StorageApprovalStatus, StorageRole } from '@/types';
import { formatStorageBytes } from '@/lib/edge-urls';

export interface StorageQuotaCardProps {
  usedBytes: number;
  effectiveQuotaBytes: number;
  baseQuotaBytes: number;
  approvalStatus: StorageApprovalStatus;
  storageRole: StorageRole;
  hasActiveEventBoost: boolean;
  tempQuotaExpiresAt?: string | null;
  tempQuotaReason?: string | null;
  isEdgeOnline: boolean | null;
  isHdConnected?: boolean | null;
  publicSlug?: string | null;
  orgName?: string | null;
}

export function StorageQuotaCard({
  usedBytes,
  effectiveQuotaBytes,
  approvalStatus,
  storageRole,
  hasActiveEventBoost,
  tempQuotaExpiresAt,
  tempQuotaReason,
  isEdgeOnline,
  isHdConnected,
  publicSlug,
  orgName,
}: StorageQuotaCardProps) {
  const safeQuota = Math.max(1, effectiveQuotaBytes);
  const percent =
    effectiveQuotaBytes > 0
      ? Math.min(100, Math.max(0, Math.round((usedBytes / safeQuota) * 100)))
      : 0;

  const isNearLimit = percent >= 85;
  const isCritical = percent >= 95;

  const barColor = isCritical
    ? 'bg-[#F14343]'
    : isNearLimit
      ? 'bg-[#FFCC00]'
      : hasActiveEventBoost
        ? 'bg-[#9D4EDD]'
        : 'bg-[#FFCC00]';

  const [renderNow] = React.useState(() => Date.now());

  const remainingDays = React.useMemo(() => {
    if (!hasActiveEventBoost || !tempQuotaExpiresAt) return null;
    const diffMs = new Date(tempQuotaExpiresAt).getTime() - renderNow;
    if (diffMs <= 0) return null;
    return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }, [hasActiveEventBoost, tempQuotaExpiresAt, renderNow]);

  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-app border border-border-subtle flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[#FFCC00] text-[24px]">
            {storageRole === 'admin' ? 'dns' : 'cloud_done'}
          </span>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-fg">
              {orgName
                ? `Cofre da Organização: ${orgName}`
                : storageRole === 'admin'
                  ? 'Meu Espaço & Servidor (Admin)'
                  : 'Meu Espaço Pessoal'}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                isEdgeOnline === null
                  ? 'bg-surface-hover/50 text-fg-secondary border-border-strong'
                  : isEdgeOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isEdgeOnline === null
                    ? 'bg-[#8E8E8E]'
                    : isEdgeOnline
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                }`}
              />
              {isEdgeOnline === null
                ? 'Verificando servidor...'
                : isEdgeOnline
                  ? 'Servidor Online'
                  : 'Servidor em Espera'}
            </span>

            {isEdgeOnline && (
              isHdConnected === true ? (
                <span
                  title="O HD USB externo de 750 GB está montado e operando com sucesso no Fire TV Stick."
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  HD USB Conectado
                </span>
              ) : isHdConnected === false ? (
                <span
                  title="O HD USB externo de 750 GB não está montado no Fire TV Stick. O servidor está restrito à memória interna de contingência da TV (~800 MB). Verifique o cabo OTG e a fonte de alimentação do HD."
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                  HD USB Desconectado
                </span>
              ) : (
                <span
                  title="Consultando estado do barramento USB..."
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface text-fg-muted border border-border-subtle"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-fg-muted/50 animate-ping" />
                  Verificando HD...
                </span>
              )
            )}

            {hasActiveEventBoost && (
              <span
                title={tempQuotaReason || 'Boost temporário de evento ativo'}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#9D4EDD]/20 text-[#E0AAFF] border border-[#9D4EDD]/40"
              >
                <span className="material-symbols-outlined text-[14px]">bolt</span>
                Boost Evento{remainingDays ? ` (+${remainingDays}d)` : ''}
              </span>
            )}
          </div>

          <p className="text-xs text-fg-secondary mt-0.5">
            {approvalStatus === 'pending' ? (
              'Aguardando aprovação do administrador para liberar 25 GB de espaço físico.'
            ) : approvalStatus === 'suspended' ? (
              'Armazenamento temporariamente suspenso (somente leitura).'
            ) : (
              <>
                Isolamento criptográfico ativo •{' '}
                {publicSlug ? (
                  <>
                    Vitrine pública:{' '}
                    <a
                      href={`/portfolio/${publicSlug}`}
                      className="text-[#FFCC00] hover:underline font-medium"
                    >
                      /portfolio/{publicSlug}
                    </a>
                  </>
                ) : (
                  '4 pastas integradas aos seus projetos'
                )}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Barra calma de uso de disco */}
      <div className="w-full md:w-80 shrink-0 bg-app border border-border-subtle rounded-lg p-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-fg-secondary font-medium">Espaço utilizado</span>
          <span className="text-fg font-bold">
            {formatStorageBytes(usedBytes)}{' '}
            <span className="text-fg-muted font-normal">
              / {effectiveQuotaBytes > 0 ? formatStorageBytes(effectiveQuotaBytes) : 'Bloqueado'}
            </span>
          </span>
        </div>
        <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {hasActiveEventBoost && tempQuotaReason && (
          <div className="mt-1.5 text-[11px] text-[#E0AAFF] truncate">
            Evento: {tempQuotaReason}
          </div>
        )}
      </div>
    </div>
  );
}

