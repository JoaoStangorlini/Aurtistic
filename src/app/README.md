# Módulo `src/app/` — Rotas e Server Actions (App Router Next.js 16)

Esta pasta implementa toda a camada de roteamento, páginas públicas, painéis autenticados e Server Actions do Aurtistic com Next.js 16 (`@webpack`).

## Mapa de Rotas

| Rota | Tipo | Descrição |
| :--- | :--- | :--- |
| `/` | Autenticada | Painel central do usuário com seletor de Tarefas / Eventos / Ambos e personalização do espaço. |
| `/portfolio` | Autenticada | Vitrine de fotografia autoral e projetos do usuário logado. |
| `/resumo` | Autenticada | Apresentação pessoal e resumo profissional. |
| `/curriculo` | Autenticada | Currículo estruturado com certificados e diplomas anexados. |
| `/servidor` | Autenticada | Gerenciador do Cofre de 25 GB, quotas e links de clientes. |
| `/[username]` | **Pública** | Espaço público do criador acessível para qualquer visitante. |
| `/portfolio/[username]` | **Pública** | Galeria fotográfica pública do criador. |
| `/s/[token]` | **Pública com PIN opcional** | Portal do Cliente para seleção e aprovação de fotos em alta fidelidade. |
| `/login` | Pública | Tela de autenticação e login de usuários. |
| `/configuracoes-avancadas` | Autenticada | Painel de preferências avançadas do sistema. |
| `/configurar-notificacoes` | Autenticada | Configuração de alertas e canais de notificação. |
| `/configurar-widget` | Autenticada | Ajustes de widgets móveis para Android via Capacitor. |
| `/exportar-importar` | Autenticada | Backup e restauração de tarefas e dados em lote. |
| `/delete-account` | Autenticada | Fluxo de exclusão de conta e limpeza de dados (LGPD). |
| `/privacy-policy` | Pública | Política de privacidade da plataforma. |

## Server Actions Principais

- `src/app/(dashboard)/actions.ts`: Salvar tarefas, eventos da agenda, preferências do usuário e temas (`updateThemePreferencesAction`).
- `src/app/(dashboard)/servidor/actions.ts`: Sincronização do índice de arquivos (`syncUserFileIndexAction`), reconciliação de pastas (`reconcileFolderIndexAction`), criação de links de clientes (`createShareLinkAction`) e exclusão de links.
- `src/app/s/[token]/actions.ts`: Envio de seleções de prova de clientes com validação de limites e rate-limit de PIN.

