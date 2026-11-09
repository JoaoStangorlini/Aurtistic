// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/hooks/useTenantTicketRefresh.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TicketPurpose } from '@/types';
import { refreshTenantTicketAction } from '@/app/(dashboard)/servidor/actions';

export function useTenantTicketRefresh(
  initialTicket: string,
  purpose: TicketPurpose = 'vault',
  options?: { unlockedPins?: string[]; readOnly?: boolean }
) {
  const [ticket, setTicket] = useState(initialTicket);
  const [prevInitial, setPrevInitial] = useState(initialTicket);

  if (initialTicket !== prevInitial) {
    setPrevInitial(initialTicket);
    setTicket(initialTicket);
  }

  const unlockedPins = options?.unlockedPins;
  const readOnly = options?.readOnly;

  const refreshTicket = useCallback(async () => {
    try {
      const res = await refreshTenantTicketAction({
        purpose,
        unlockedPins,
        readOnly,
      });
      if (res.ok) {
        const rawToken = res.ticket.ticket;
        setTicket(rawToken);
        return res.ticket;
      }
    } catch (err) {
      console.warn('[useTenantTicketRefresh] Falha silenciosa ao renovar ticket:', err);
    }
    return null;
  }, [purpose, unlockedPins, readOnly]);

  useEffect(() => {
    // 1. Renovação periódica preventiva a cada 10 minutos (TTL padrão de escrita é 15 min)
    const interval = setInterval(() => {
      void refreshTicket();
    }, 10 * 60 * 1000);

    // 2. Renovação ao retornar de background/aba inativa
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshTicket();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [refreshTicket]);

  return { ticket, refreshTicket };
}

