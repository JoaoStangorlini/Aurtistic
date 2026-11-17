# ACTIVE_STATE — Aurtistic & HUB LabDiv

## ✅ Concluído — Auditoria Final Frente 5 (Studio v4 Fechado)

1. **Ponto 1 — PDF Multi-Página + Alt Text:**
   - `studio-exporter.ts`: `exportCarouselToPdf()` com `jsPDF` (dynamic import, proporção exata por `ASPECT_DIMENSIONS`).
   - `StudioPublishModal.tsx`: Botão `PDF (N pág.)` com estado `pdfLoading`.

2. **Ponto 2 — `user_files_index` + Galeria de Modelos Dinâmica:**
   - `src/app/api/studio/vault-save/route.ts`: UPSERT em `user_files_index` (album, category, visibility, is_directory).
   - `src/app/api/studio/org-templates/route.ts`: Lê modelos da tabela por `relative_path LIKE '%/studio/modelos/%'`.

3. **Ponto 3 — Re-hidratação de `resolvedUrl` + Preservação de Uploads Locais:**
   - `studio-idb.ts`: `rehydrateDraft()` exportada — reconstrói `resolvedUrl` e `src` para camadas com `vaultRelativePath`.
   - `sanitizeDraftForStorage()`: Uploads locais (sem `vaultRelativePath`) são preservados intactos com data URL.
   - `StudioImagePanel.tsx`: Upload local agora usa `FileReader.readAsDataURL()` (data URL persistível) em vez de `URL.createObjectURL()` (blob temporário).
   - `types.ts`: Campo `resolvedUrl?: string` adicionado em `StudioImageLayer`.

4. **Ponto 4 — Guarda de Foco em Inputs (`useStudioKeyboard.ts`):**
   - Verificação dupla: `document.activeElement` E `e.target`, cobrindo `input`, `textarea`, `select` e `isContentEditable`.
   - Se digitando em campo: apenas `Ctrl+S` (salvar rascunho) é processado; todos os demais atalhos de canvas são bloqueados.

5. **Ponto 5 — StudioContext ⇄ studio-idb + Supabase UPSERT:**
   - `StudioContext.tsx`: Substituído `localStorage` provisório por `getAllDraftsFromIdb()` + sync com `/api/studio/drafts` (GET).
   - `saveCurrentToDraftSlot()`: Grava em `saveDraftToIdb()` + POST para `/api/studio/drafts` (Supabase UPSERT `ON CONFLICT (user_id, org_id, slot_index)`).
   - `src/app/api/studio/drafts/route.ts`: GET + POST com UPSERT correto na tabela `studio_draft_versions`.

## Verificação Final
- `npm run verify:full` → ✅ TSC + Lint + Server.js + Testes + Build Next.js (0 erros)
- Build prod: 22 rotas (3 novas API Studio visíveis no manifest)
- Todos os 25 arquivos do Studio abaixo de 250 LOC

## Próximo Passo
- Aplicar migration SQL `13_studio_draft_versions_v4.sql` no banco de produção via Dashboard do Supabase.
