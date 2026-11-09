// Este programa é um software livre (Licença AGPLv3)
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly, StaleWhileRevalidate, CacheFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: any;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.hostname === "storage.hublabdiv.com.br" ||
        url.pathname.startsWith("/api/tenant/") ||
        url.pathname.startsWith("/api/edge/"),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, url }) => request.mode === "navigate" || request.headers.get("accept")?.includes("text/html"),
      handler: new NetworkFirst({
        cacheName: "html-pages-cache",
        networkTimeoutSeconds: 3,
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

