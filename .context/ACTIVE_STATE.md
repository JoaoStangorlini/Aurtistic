# Active State — Aurtistic Studio Pro
Atualizado em: 2026-11-19

## Estado Final Consolidado (13 Fases + Pacote 12 Itens Studio Pro & Cofre)
- **Temas & UI Global:** `@custom-variant dark` vinculado a `[data-theme-mode="dark"]`, Navbar mobile (`365px`), Cofre com bottom sheet e Portfólio/Currículo responsivos.
- **Cofre & Atalhos (Item 5):** `studio-actions.ts` com `.or('mime_type.eq."inode/directory+shortcut",exif_data->>isShortcut.eq.true')`, suporte `org → pessoal` e `org → org`, segmentos NFC/NFD, ponte `Portfolio/` + fallback `user_files_index` estrito ao prefixo com `allowedPrefix` obrigatório (Anti-IDOR) replicado em `rehydrateStudioDraftAction`; `StudioVaultBrowserModal` preserva `breadcrumbs` com botões `Voltar` e `Tentar novamente`.
- **Studio Pro (Itens 1–4, 6–12):**
  - Alças de seleção inline (`left/top` 0%/50%/100%), header `Editar` com `stopPropagation`, dock ancorado via `OrganizationBrandProvider` (`isStudioActive`), título `"SHOW DE FÍSICA"`, `StudioInstagramPreviewModal` com `flex-col md:flex-row`.
  - Texto centralizado (`boxHeight` em `canvas-tokenized-text.ts`), altura inicial proporcional ao formato (`computeInitialTextBoxHeight`), auto-expansão anti-colisão, pivô único `[x+w/2, y+h/2]` (incluindo `StudioDesignAssistant.tsx`), haste inferior (`top: calc(100%+10px)`) com `atan2 - 90`.
  - `Ctrl/Cmd+C` e `Ctrl/Cmd+V` cascateado (`pasteCountRef`, guarda `window.getSelection()`), 1 slider estilo Lightroom com faixa de chips em 1 clique (`StudioEditionPanel` e `StudioMaskPanel`), composição única `composePhotoFilters` + botão `Original` híbrido (clique/segurar `220ms`), barra superior `onWheel` + popover `Mais` sem aninhamento, Paleta compacta e `Cor Rápida` no botão direito (camadas + fundo + IDV + 1 Undo + clamp H/V).

## Validação Final
- `npm run verify:full` -> `✅ OK: TSC + Lint + Server.js + Testes + Build Next.js (0 erros)`
- `npm run server:check` -> exit `0`
- Testes unitários (`latex-canvas-renderer.test.mjs`, `stroke-simplify.test.mjs`) -> `9/9 pass`
