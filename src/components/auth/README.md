<!-- Este programa é um software livre (Licença AGPLv3) -->
# Módulo de Autenticação, SSO e Vinculação (`src/components/auth`)

Este módulo implementa a camada de autenticação unificada do Aurtistic, oferecendo suporte nativo a credenciais locais (usuário/senha, `@username`, e-mail, criação direta de conta) e Single Sign-On (SSO) federado com o ecossistema **HUB LabDiv**.

---

## 1. Arquitetura de SSO & Protocolo de Tickets Criptográficos

A comunicação de identidade entre o **HUB LabDiv** (porta 3001) e o **Aurtistic** (porta 3000) baseia-se em tokens assinados com HMAC-SHA256 e credenciais locais cifradas com AES-256-GCM.

### Fluxo de Autenticação Federada:
1. **Início:** O usuário clica em `Entrar via HUB LabDiv` no [`UnifiedAuthCard.tsx`](file:///home/stangorlini/Aurtistic/src/components/auth/UnifiedAuthCard.tsx).
2. **CSRF State:** É gerado um identificador criptográfico `state`, armazenado em cookie seguro `SameSite=Lax` e enviado como query parameter.
3. **Redirecionamento ao HUB:** O navegador navega para `${HUB_URL}/auth/sso/authorize?redirect_uri=...&state=...`.
4. **Consentimento no HUB:** O HUB autentica o membro, emite um ticket assinado e redireciona de volta para `/auth/hub-callback?ticket=...&state=...`.
5. **Validação no Callback:** O servidor Aurtistic valida:
   - Integridade da assinatura HMAC (`HUB_SSO_SECRET` ou fallback `EDGE_HMAC_SECRET`).
   - Expiração do ticket (TTL de 300 segundos).
   - Validação de CSRF state contra o cookie do cliente.
6. **Resolução de Sessão:**
   - **Cenário A:** Usuário já logado no Aurtistic -> vincula o HUB ao perfil ativo (`user_profiles.features_config.hub_connection`).
   - **Cenário B:** Usuário deslogado com vínculo prévio e segredo cifrado (`AES-256-GCM`) -> login instantâneo com 1 clique.
   - **Cenário C:** Provisionamento direto solicitado (`action=provision_direct`) -> provisiona conta e inicia sessão.
   - **Cenário D:** Primeiro acesso sem conta vinculada -> redireciona para `/auth/vincular-conta`.

---

## 2. Componentes Principais

| Componente | Responsabilidade |
| :--- | :--- |
| [`UnifiedAuthCard.tsx`](file:///home/stangorlini/Aurtistic/src/components/auth/UnifiedAuthCard.tsx) | Cartão principal de login e cadastro. Permite autenticação por usuário, `@username`, e-mail, criação direta de conta e botão com identidade visual oficial do HUB LabDiv. |
| [`HubLinkCard.tsx`](file:///home/stangorlini/Aurtistic/src/components/auth/HubLinkCard.tsx) | Cartão de gerenciamento da conexão com o HUB na tela de Configurações Avançadas, permitindo desvincular ou ressincronizar perfil e organizações. |
| [`/auth/vincular-conta`](file:///home/stangorlini/Aurtistic/src/app/auth/vincular-conta/page.tsx) | Página de consentimento para vincular uma conta Aurtistic preexistente ou criar uma nova conta a partir do HUB. |
| [`/auth/hub-callback`](file:///home/stangorlini/Aurtistic/src/app/auth/hub-callback/route.ts) | Endpoint de troca de ticket, validação anti-tampering, verificação CSRF e emissão de cookies de sessão Supabase. |

---

## 3. Migração Integral de Ativos na Vinculação

Quando o usuário vincula sua identidade HUB a uma conta Aurtistic já existente via [`linkExistingAccountAction`](file:///home/stangorlini/Aurtistic/src/app/auth/actions.ts):

- **Tarefas (`tasks.user_id`):** Transferidas integralmente para o usuário mestre.
- **Eventos (`events.user_id`):** Transferidos integralmente para a agenda do usuário mestre.
- **Arquivos do Cofre (`user_files_index.user_id`):** Reindexados sob a titularidade do usuário mestre.
- **Links de Clientes (`share_links.user_id`):** Reatribuídos para o usuário mestre.
- **Filiações Organizacionais (`organization_members`):** Perfis secundários e placeholders com o mesmo e-mail são consolidados no registro do usuário mestre.

