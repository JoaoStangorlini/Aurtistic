# ACTIVE_STATE — Aurtistic & HUB LabDiv

## ✅ Entregas Recentes
1. **ScrollJellyCard (HUB LabDiv):** Corrigida física de squash & stretch — scroll vertical achata topo/base (scaleY↓) e compensa laterais (scaleX↑).
2. **Login Primeira Tentativa (HUB LabDiv):** Resolvida falha de cookies SameSite=Lax em redirect chain OAuth; callback agora usa página intermediária com assentamento de cookies e `window.location.replace()`.
3. **Show de Física (Aurtistic & HUB):** Varredura de copy completa "Show da Física" → "Show de Física" em texto visível, preservando slugs e identificadores de banco.
4. **Resolução de Atalhos do Cofre & Studio (Aurtistic):**
   - `servidor/server.js`: Adicionada resolução resiliente `resolveResilientPhysicalFile` e busca case-insensitive para atalhos de pastas do Portfólio (ex.: Show de Física) em `/api/tenant/stream`, `/api/tenant/thumb` e rotas de vault.
   - `studio-actions.ts`: Ajustado `{ download: false }` para carregar imagens inline sem acionar download forçado via `Content-Disposition`.
   - `canvas-renderer.ts` & `StudioImagePanel.tsx`: Suporte a `layer.resolvedUrl` e fallback gracioso para decodificação no Canvas.
5. **Serviços Ativos:** Aurtistic (3000), HUB LabDiv (3001) e Portal Storage Daemon (8080).

## 📌 Status
- Verificação: `npm run verify:silent` (0 erros) e `verify_theme_and_tour.mjs` (91/91).
