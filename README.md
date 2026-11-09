# Aurtistic — Creative Manager & Unified Ecosystem

> **Licença:** GNU Affero General Public License v3 (AGPLv3)  
> **Ambiente:** Next.js 16 (App Router + Webpack) • React 19 • Tailwind CSS v4 • Supabase (PostgreSQL) • Capacitor (Android) • Amazon Fire TV Stick Edge Node

O **Aurtistic** é um ecossistema completo para gestão ágil de tarefas, apresentação profissional, vitrine fotográfica autoral com metadados EXIF em alta fidelidade e armazenamento privado descentralizado com nós de borda (Edge Nodes).

---

## 1. Visão Geral da Arquitetura

O sistema opera de forma unificada em 4 pilares tecnológicos:

```
┌────────────────────────────────────────────────────────┐
│                   Aurtistic Web & PWA                  │
│       Next.js 16 • React 19 • Tailwind CSS v4          │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       Supabase │ (PostgreSQL)           │ Tickets Efêmeros HMAC
       Auth, RLS, Tasks & Metadados      │ Direct Browser-to-Edge
                │                        │
┌───────────────▼────────┐      ┌────────▼───────────────┐
│     Cloud Backend      │      │  Fire Stick Edge Node  │
│  Tabelas, RPCs SQL e   │      │  Node.js • USB OTG     │
│  Políticas de Acesso   │      │  Cache AVIF • Range    │
└────────────────────────┘      └────────────────────────┘
```

1. **Camada Web & Mobile:** Aplicação Next.js 16 com SSR, suporte completo para PWA e empacotamento nativo Android via Capacitor (`@capacitor/core`).
2. **Banco de Dados (Supabase PostgreSQL):** Gerenciamento de tarefas, perfis de usuários, quotas, índice de arquivos dos 4 Pilares e links de prova de clientes protegidos por RLS.
3. **Servidor Edge Node (Fire TV Stick):** Servidor HTTP Node.js acoplado a um HD USB de 750 GB, fornecendo streaming zero-copy, geração de miniaturas `.avif` e uploads diretos sem tráfego de dados pelo servidor principal.
4. **Segurança por Tickets Efêmeros:** Tokens assinados criptograficamente via HMAC-SHA256 concedem permissões transitórias de leitura/escrita com TTL restrito e validação em memória.

---

## 2. Árvore de Diretórios

```
Aurtistic/
├── servidor/               # Servidor Edge Node (daemon de borda para Fire TV Stick)
│   ├── server.js           # API REST de streaming, upload e miniaturas AVIF
│   └── lib/                # Módulos do daemon (store atômico, busca, deduplicação)
├── scripts/                # Scripts utilitários de manutenção, dados e deploy
│   └── servidor/           # Automação do servidor (deploy-firestick, status, watchdog)
├── docs/                   # Documentação técnica e arquitetural consolidada
│   └── servidor/           # Especificações da API e arquitetura do daemon de borda
├── supabase/
│   └── migrations/newsqls/ # Migrações SQL com triggers e RPCs do PostgreSQL
├── tests/                  # Suíte de testes arquiteturais e validação WCAG
├── public/                 # Assets públicos, ícones e logos adaptativas
├── src/
│   ├── app/                # Rotas do Next.js App Router e Server Actions
│   ├── components/         # Catálogo de componentes divididos por domínio
│   │   ├── dashboard/      # Workspaces principais, Navbar e Tarefas
│   │   ├── media/          # Dock de áudio contínuo e modais de preview
│   │   ├── onboarding/     # Tutorial guiado interativo (Coach Marks '?')
│   │   ├── portfolio/      # Galeria Passe-Partout e Lightbox fotográfico
│   │   ├── servidor/       # Explorer do Cofre, Quotas e Pastas com PIN
│   │   ├── share/          # Portal do Cliente para aprovação de álbuns
│   │   ├── tarefas/        # Seletor e vinculador de arquivos em tarefas
│   │   └── theme/          # Provedor do tema multi-eixo e seletor
│   ├── hooks/              # React Hooks de renovação de ticket e estado
│   ├── lib/                # Criptografia, motor de temas e clientes edge
│   ├── types/              # Contratos de dados e interfaces TypeScript
│   └── utils/              # Fábricas de clientes Supabase SSR/Browser
├── LICENSE                 # GNU Affero General Public License v3
└── README.md               # Esta documentação
```

---

## 3. Como Rodar, Compilar e Testar

### Pré-requisitos
- Node.js >= 20.0.0
- npm ou pnpm

### Instalação e Desenvolvimento
```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Compilar para produção
npm run build

# Iniciar build de produção
npm start
```

### Executar a Suíte de Testes
```bash
# Validação de contraste WCAG, seletores do tour e integridade de licenças
node tests/verify_theme_and_tour.mjs

# Teste de integração do portal de clientes (/s/[token])
node tests/test_sprint6_proofing.mjs

# Verificação de segurança e arquitetura geral
node tests/verify_v4_architecture.mjs
```

---

## 4. Guia Rápido: "Onde Mudar Cada Coisa"

| O que você deseja fazer? | Onde alterar no código? |
| :--- | :--- |
| **Adicionar uma nova cor ou paleta bicolor** | Adicione a definição em `src/lib/theme-config.ts` (`THEME_PALETTES`) e as respectivas regras CSS em `src/app/globals.css`. |
| **Editar ou adicionar passos do tutorial `?`** | Edite `src/lib/coach-marks-steps.ts`, adicionando ou alterando os passos da rota desejada e o respectivo atributo `data-tour` no componente JSX. |
| **Ajustar quotas de armazenamento padrão** | Altere a migration em `supabase/migrations/newsqls/01_aurtistic_unified_ecosystem.sql` (na tabela `user_profiles`) e os limites de governança em `src/components/servidor/AdminQuotaGovernancePanel.tsx`. |
| **Adicionar novas páginas ou rotas** | Crie a pasta correspondente dentro de `src/app/<nome-da-rota>/page.tsx`. Se exigir navegação pelo menu superior, registre a chave em `src/components/dashboard/AurtisticNavbar.tsx`. |
| **Criar uma nova Server Action** | Adicione a função exportada com `'use server'` em `src/app/(dashboard)/actions.ts` ou `src/app/(dashboard)/servidor/actions.ts`. |
| **Alterar o comportamento do player de áudio global** | Edite `src/components/media/GlobalAudioDock.tsx` ou o provedor `src/components/media/AurtisticMediaContext.tsx`. |
| **Modificar a API do Edge Node (Fire Stick)** | Altere os endpoints em `servidor/server.js` e execute o deploy com `bash scripts/servidor/deploy-firestick.sh --remote`. |
| **Ajustar proteções de PIN e Rate-Limit** | Modifique as regras de salt e tempo em `src/lib/pin-scrypt.ts` e `src/lib/pin-rate-limit.ts`. |

---

## 5. Licença

Este projeto é um software livre distribuído sob os termos da **GNU Affero General Public License v3 (AGPLv3)**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.
