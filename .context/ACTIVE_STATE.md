# Active State — Aurtistic
Atualizado em: 2026-11-23T19:11Z

## Correção de Cadastro, Fluxo Unificado 2 Etapas e Legal v2026-11
- **Migration (`supabase/migrations/newsqls/18_fix_auth_provisioning_and_terms.sql`):** corrige `handle_auth_user_provisioning` para `public.user_profiles` (removendo `public.profiles` e `on_auth_user_created_storage`), blinda `public_slug`, gera `terms_accepted_at = NOW()` no Postgres (tolerando `NULL` em SSO), adiciona `trg_protect_user_profile_terms` e cria `check_auth_identifier_exists` (`deleted_at IS NULL`, `GRANT EXECUTE TO service_role` exclusivo).
- **Backend (`src/lib/auth-identifier.ts`, `src/lib/auth-actions-core.ts`, `src/app/api/auth/check-identifier/route.ts`):** `MIN_PASSWORD_LENGTH = 8`, validação estrita no cadastro, `createAdminClient()` server-side + `RateLimitStore`, eliminação de duplicação entre `login/actions.ts` e `aurtistic/actions.ts`, sem escrita dupla em `user_profiles`.
- **UI (`src/components/auth/UnifiedAuthCard.tsx`):** fluxo em 2 etapas sem abas/Nome Completo, input `readOnly autoComplete="username"`, recuperação por e-mail, aviso HUB SSO, microcopy pré-criação e modal de Termos/Privacidade.
- **Legal (`src/lib/legal-documents.ts`, `src/components/legal/LegalDocumentView.tsx`, `/terms`, `/privacy-policy`):** versão `2026-11` com LGPD Art. 11/18/33, subprocessadores, `.trash` 15 dias, PIN `scrypt` e AGPLv3 vs. Termos.
- **Avatar de Novos Perfis (`AurtisticNavbar.tsx`, `ResumoClient.tsx`):** removido fallback global para `/perfil.jpeg` (agora restrito ao UUID admin `f2f1e6c9-...`); novos usuários exibem ícone padrão `person` quando sem foto.
- **Pendente manual:** conferir deploy na Vercel e remover conta demo `jorge` após certificação da Microsoft Store.
