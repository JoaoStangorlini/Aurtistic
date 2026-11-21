// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface EmbedAuthBridgeProps {
  ticket?: string | null;
  orgSlug?: string | null;
  hasServerUser: boolean;
  children: React.ReactNode;
}

/**
 * Garante autenticação híbrida dentro de iframes cross-origin:
 * 1) Troca o ticket HMAC via POST /api/auth/hub-embed (cookies Partitioned + access_token).
 * 2) Intercepta window.fetch same-origin (RSC refreshes + Next-Action) para injetar `x-supabase-auth-token`.
 * 3) Dispara router.refresh() se o SSR inicial ainda não tinha sessão autenticada.
 */
export function EmbedAuthBridge({
  ticket,
  orgSlug,
  hasServerUser,
  children,
}: EmbedAuthBridgeProps) {
  const router = useRouter();
  const [ready, setReady] = useState(hasServerUser || !ticket);
  const [authError, setAuthError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const inFlightTicketRef = useRef<string | null>(null);
  const exchangedTicketsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = tokenRef.current;
      if (!token) return origFetch(input, init);

      try {
        const rawUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const resolvedUrl = new URL(rawUrl, window.location.origin);
        if (resolvedUrl.origin !== window.location.origin) {
          return origFetch(input, init);
        }

        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        );
        if (!headers.has('x-supabase-auth-token')) {
          headers.set('x-supabase-auth-token', token);
        }
        return origFetch(input, { ...(init || {}), headers });
      } catch {
        return origFetch(input, init);
      }
    };

    return () => {
      window.fetch = origFetch;
    };
  }, []);

  useEffect(() => {
    if (!ticket) return;
    if (exchangedTicketsRef.current.has(ticket)) return;
    if (inFlightTicketRef.current === ticket) return;
    inFlightTicketRef.current = ticket;
    let cancelled = false;

    fetch('/api/auth/hub-embed', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, orgSlug }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        exchangedTicketsRef.current.add(ticket);
        inFlightTicketRef.current = null;
        if (data?.ok) {
          if (data.access_token) tokenRef.current = data.access_token;
          setReady(true);
          if (!hasServerUser) {
            router.refresh();
          }
        } else {
          setAuthError(data?.error || 'Falha na autenticação do embed.');
          setReady(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          inFlightTicketRef.current = null;
          setAuthError(err instanceof Error ? err.message : 'Erro de rede no embed.');
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
      inFlightTicketRef.current = null;
    };
  }, [ticket, orgSlug, hasServerUser, router]);

  // Notifica o host pai (HUB LabDiv) quando o embed estiver pronto e autenticado
  useEffect(() => {
    if (ready && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      let targetOrigin = '*';
      if (document.referrer) {
        try { targetOrigin = new URL(document.referrer).origin; } catch {}
      }
      window.parent.postMessage(
        {
          type: 'AURTISTIC_EMBED_READY',
          org: orgSlug || null,
        },
        targetOrigin
      );
    }
  }, [ready, orgSlug]);

  if (!ready) {
    return (
      <div className="min-h-[320px] flex items-center justify-center text-xs text-slate-300 font-mono">
        Autenticando sessão segura no Aurtistic...
      </div>
    );
  }

  return (
    <>
      {authError && (
        <div className="m-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
          Aviso de autenticação embed: {authError}
        </div>
      )}
      {children}
    </>
  );
}
