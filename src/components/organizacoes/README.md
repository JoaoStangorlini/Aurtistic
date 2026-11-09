<!-- Este programa é um software livre (Licença AGPLv3) -->
# Módulo de Organizações e Gestão Institucional (`src/components/organizacoes`)

Este módulo implementa o subsistema multi-tenant e de governança colaborativa do Aurtistic, projetado com foco em neurodivergência e alta densidade cognitiva (destacadamente para o **LabDiv - Laboratório de Divulgação Científica do IFUSP** e organizações federadas).

---

## 1. Arquitetura Multi-Tenant & Entidades

O modelo relacional suporta múltiplas organizações por usuário com alternância instantânea de escopo:

- **Organizações (`public.organizations`):** Armazena slug, nome, descrição, quota de armazenamento dedicada e limites operacionais.
- **Membros (`public.organization_members`):** Mapeia a participação do usuário com papéis (`admin`, `member`, `guest`), permissões de cofre (`can_upload_org_vault`) e bateria cognitiva (`cognitive_capacity`).
- **Subequipes (`public.organization_subteams`):** Divisões funcionais internas (ex.: *Física & Divulgação*, *Mídia & Fotografia*, *Dev & Infra*, *Gestão & Articulação*).
- **Reuniões (`public.organization_meetings`):** Agendamento colaborativo com pauta em JSONB, integração When2Meet e anexação de atas e notas `.md`.

---

## 2. Componentes Principais

| Componente | Responsabilidade Principal |
| :--- | :--- |
| [`LabDivWorkspaceClient.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/LabDivWorkspaceClient.tsx) | Workspace unificado da aba **Gestão** (`/labdiv`), com alternador macro `[ Equipe & Projetos ] \| [ Cofre de Arquivos ]`, seletor multi-org e agregação de reuniões e tarefas. |
| [`TeamProgressPanel.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/TeamProgressPanel.tsx) | Painel visual de progresso da equipe com barra percentual geral, filtros por subequipe e cartões de carga por membro com estado da bateria cognitiva. |
| [`OrganizationScopeToolbar.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/OrganizationScopeToolbar.tsx) | Barra de alternância rápida de escopo (`[ 👤 Individual ]`, `[ 🏛️ Organização ]`, `[ 🌐 Tudo ]`) e acesso aos modais de criar ou entrar por código. |
| [`LiveMeetingSplitWorkspace.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/LiveMeetingSplitWorkspace.tsx) | Workspace de reunião em tempo real com tela dividida (pauta estruturada + anotações `.md` in-place + transcrição de áudio). Permite converter pautas em tarefas em 1 clique com `converted_task_id`. |
| [`When2MeetSchedulerGrid.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/When2MeetSchedulerGrid.tsx) | Grade interativa de disponibilidade temporal em matriz de 30 minutos com sobreposição de calor visual para localização de consenso de agenda. |
| [`MemberCapacityQuickSelector.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/MemberCapacityQuickSelector.tsx) | Seletor de capacidade cognitiva do próprio usuário (`🟢 Normal`, `🟡 Reduzida`, `🔴 Esgotada`), ajustável em 1 clique. |
| [`JoinOrganizationModal.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/JoinOrganizationModal.tsx) | Modal de entrada via código de convite de 8 caracteres normalizado (`.trim().toUpperCase()`) com reivindicação automática de perfis placeholder. |
| [`CreateOrganizationModal.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/CreateOrganizationModal.tsx) | Criação rápida de novas entidades organizacionais com geração de slug sem acentos e subequipes padrão. |
| [`OrganizationPlaybooksModal.tsx`](file:///home/stangorlini/Aurtistic/src/components/organizacoes/OrganizationPlaybooksModal.tsx) | Visualizador e editor de Procedimentos Operacionais Padrão (POPs) e playbooks da equipe. |

---

## 3. Gestão de Carga Cognitiva & Prevenção de Esgotamento

Cada membro da organização possui um estado de capacidade cognitiva explicitamente visível para coordenadores e colegas:

- 🟢 **Normal (Verde):** Membro com plena energia disponível para receber novas tarefas de alta complexidade.
- 🟡 **Reduzida (Amarelo):** Membro com energia parcial ou sobrecarga temporária. O sistema recomenda atribuição moderada.
- 🔴 **Esgotada (Vermelho):** Alerta de risco iminente de esgotamento/burnout ou hiperfoco exaustivo. O modal de tarefas emite aviso caso mais atribuições sejam feitas.

---

## 4. Integração com o Cofre de Arquivos

Membros com a flag `can_upload_org_vault = true` podem alternar na interface do Servidor entre:
1. `👤 Meu Cofre Pessoal`: Armazenamento sob quota individual do usuário.
2. `🏛️ Cofre da Organização`: Armazenamento compartilhado da equipe, validado via ticket HMAC com escopo organizacional e isolamento criptográfico no Edge Node.

