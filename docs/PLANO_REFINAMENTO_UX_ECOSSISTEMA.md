<!-- Este programa é um software livre (Licença AGPLv3) -->
# Plano de Implementação: Refinamentos de UX, Identidade Visual e Ecossistema Aurtistic ↔ HUB LabDiv (v3.1)

Este documento detalha a arquitetura, modificações cirúrgicas e plano de execução para atender integralmente às 8 demandas de UX, consistência visual e integração entre o **Aurtistic** e o **HUB LabDiv**, incorporando os 7 ajustes técnicos obrigatórios.

---

## Índice das 8 Frentes de Trabalho

1. [Frente 1: Modal de Tarefa Simplificado & Expansível (Material Design 3)](#frente-1-modal-de-tarefa-simplificado--expansível-material-design-3)
2. [Frente 2: Correção do Modo Fotos (Timeline) no Servidor / Cofre](#frente-2-correção-do-modo-fotos-timeline-no-servidor--cofre)
3. [Frente 3: Inversão do Switch de Gestão (Cofre em 1º, Organizações em 2º)](#frente-3-inversão-do-switch-de-gestão-cofre-em-1º-organizações-em-2º)
4. [Frente 4: Seletor de Organização em Material Design 3](#frente-4-seletor-de-organização-em-material-design-3)
5. [Frente 5: Apoio Mútuo sem Tarefas do Próprio Usuário](#frente-5-apoio-mútuo-sem-tarefas-do-próprio-usuário)
6. [Frente 6: IDV da Organização nas Bordas, Cores dos Cards e Fundos](#frente-6-idv-da-organização-nas-bordas-cores-dos-cards-e-fundos)
7. [Frente 7: Editor Modular do Portfólio (Estilo Currículo & Resumo)](#frente-7-editor-modular-do-portfólio-estilo-currículo--resumo)
8. [Frente 8: Cards das Organizações no HUB LabDiv com Painel Restrito & HUB Studio](#frente-8-cards-das-organizações-no-hub-labdiv-com-painel-restrito--hub-studio)

---

## Frente 1: Modal de Tarefa Simplificado & Expansível (Material Design 3)

### Diagnóstico
No arquivo `src/components/dashboard/TaskFormModal.tsx`, mais de 15 campos ficam abertos simultaneamente (título, escopo, equipes, membros, subtarefas, delegações por subtarefa, prioridade, status, prazo, recorrência, dimensão, categoria, notas e anexos do cofre). Isso gera sobrecarga cognitiva e poluição visual.

### Solução Proposta (Progressive Disclosure - M3)
- **Área Essencial (Sempre Visível no Topo):**
  - Título da Tarefa (`nome`) com tipografia de destaque.
  - Seletor de Escopo (`Individual` vs `Organização`). Se Organização for escolhida, pílula de seleção rápida da organização.
  - Linha Compacta M3 (Grid de 3 Colunas): `Status`, `Prioridade` e `Prazo`.
- **Seções Expansíveis (Accordions Material Design 3 com Chips de Resumo):**
  - **Accordion 1 — Delegação (Equipes & Indivíduos):**
    - Visível apenas quando o escopo for Organização.
    - Cabeçalho exibe chip resumido: ex.: `"2 equipes • 1 membro"` ou `"Apenas você"`.
    - Ao expandir: seleção múltipla de subequipes (`assigned_subteam_ids`), busca de membros (`assigned_member_ids`) e campo de apoio textual.
  - **Accordion 2 — Subtarefas / Checklist:**
    - Cabeçalho exibe badge com progresso: ex.: `"0 subtarefas"` ou `"2/4 concluídas"`.
    - Ao expandir: input rápido `+ Adicionar subtarefa`, lista reordenável e botão discreto `Delegar` individual por subtarefa.
  - **Accordion 3 — Mais Opções (Dimensão, Categoria, Recorrência, Notas & Cofre):**
    - Cabeçalho exibe chip resumido: ex.: `"Dimensão • Sem recorrência • 1 anexo"`.
    - Ao expandir: campos de Dimensão, Categoria, Recorrência periódica, Descrição/Links e botão do picker de arquivos do cofre (`TaskFilePickerModal`).
- **Comportamento Inteligente:**
  - Na edição de tarefa existente que já contenha subtarefas ou delegações, os respectivos accordions iniciam abertos.

---

## Frente 2: Correção do Modo Fotos (Timeline) no Servidor / Cofre

### Diagnóstico de Causa Raiz
1. Em `src/app/(dashboard)/servidor/actions.ts` (`getGalleryTimelinePageAction`), a query SQL solicita explicitamente `.select('..., captured_at, device_source')`. Quando o banco remoto Supabase ainda não executou a migration `11`, o PostgREST emite o erro `42703` (`column user_files_index.captured_at does not exist`), fazendo a action falhar silenciosamente e retornar `items: []`.
2. A consulta filtrava `.is('organization_id', null)`, ignorando o cofre de organizações selecionadas (`selectedOrgId`).
3. O `UserVaultWorkspace.tsx` possui em memória os arquivos reais do servidor (`indexedFiles` e `folderEntries`), mas não os repassa como fallback para o `<GooglePhotosTimelineView />`.

### Solução Proposta
1. **Query Resiliente em `getGalleryTimelinePageAction`:**
   - Suportar parâmetro `organizationId?: string | null`.
   - Tentar a query com `captured_at, device_source`. Se capturar erro `42703`, executar fallback sem essas colunas, derivando a data de captura a partir de `exif_data->>'DateTimeOriginal'` ou `created_at`.
   - Caso o cofre pessoal esteja vazio na primeira consulta, chamar `ensurePortfolioCatalogLoaded(supabase, user.id)` para auto-popular o catálogo.
2. **Fallback no Cliente (`GooglePhotosTimelineView.tsx` e `UserVaultWorkspace.tsx`):**
   - Passar `fallbackEntries` com as fotos já carregadas no cofre ativo do Edge Server.
   - Agrupar e renderizar a timeline cronológica imediatamente com base nesses arquivos caso a API do banco ainda esteja indexando.

---

## Frente 3: Inversão do Switch de Gestão (Cofre em 1º, Organizações em 2º)

### Arquivos
- `src/components/servidor/UserVaultWorkspace.tsx`
- `src/components/organizacoes/LabDivWorkspaceClient.tsx`

### Modificação
Inverter a ordem física e visual dos botões no switch de navegação:
- **1ª Opção (Esquerda):** `[ Cofre de Arquivos ]` (`/servidor`)
- **2ª Opção (Direita):** `[ Organizações ]` (`/labdiv` ou `/organizacoes`)

---

## Frente 4: Seletor de Organização em Material Design 3

### Diagnóstico
O atual `<select>` HTML nativo é simples, quebra o padrão visual do Material Design 3 e não oferece contexto sobre cargos ou monogramas de identidade visual.

### Novo Componente: `OrganizationMaterialSelector.tsx`
- **Gatilho (M3 Outlined/Filled Surface Trigger):**
  - Monograma/Avatar com gradiente característico da IDV da organização ativa.
  - Nome da Organização + Badge de Cargo do Usuário (`Administrador` / `Membro`).
  - Indicador cromático da IDV (pontos com as cores da organização).
  - Ícone de seta `expand_more` com transição e rotação de 180° no estado aberto.
- **Menu Popover M3 (Dropdown com Acessibilidade WAI-ARIA):**
  - Lista de organizações disponíveis com estado selecionado marcado com `check_circle`.
  - Divisor de superfície M3.
  - **Ações Integradas no Rodapé:**
    - Botão `+ Nova Organização` (abre modal de criação).
    - Botão `Entrar com Código` (abre modal de código de convite).

---

## Frente 5: Apoio Mútuo sem Tarefas do Próprio Usuário

### Diagnóstico
Em `src/components/organizacoes/TeamProgressPanel.tsx` (`overloadedMembersData`), a lista de membros sobrecarregados não exclui o próprio usuário logado (`m.user_id === currentUserId`), fazendo com que o usuário veja suas próprias tarefas na seção "Apoiar colega sobrecarregado". Além disso, a filtragem usa `t.user_id === m.user_id` (autor da tarefa) em vez de checar quem é o responsável atribuído.

### Solução Proposta
1. Excluir o próprio usuário da lista de membros analisados:
   `if (m.user_id === currentUserId || (myMember && m.id === myMember.id)) return null;`
2. Filtrar as tarefas pendentes do colega garantindo que:
   - A tarefa esteja atribuída ao colega (`t.assigned_member_ids?.includes(m.id)` ou `t.assignee_id === m.user_id`).
   - A tarefa **não** esteja atribuída ao usuário logado (`t.assignee_id !== currentUserId` e `!t.assigned_member_ids?.includes(myMember.id)`).

---

## Frente 6: IDV da Organização nas Bordas, Cores dos Cards e Fundos

### Diagnóstico
A identidade visual configurada em `OrganizationBrandProvider.tsx` precisa tingir com mais vigor os fundos, bordas e cards do `LabDivWorkspaceClient.tsx`, `TeamProgressPanel.tsx` e `TasksView.tsx`.

### Solução Proposta
- Injetar no `OrganizationBrandProvider.tsx` variáveis CSS completas e escopadas:
  - `--bg-app`: cor de fundo da organização (`--org-bg-base`).
  - `--bg-surface`: cor das superfícies (`--org-bg-surface`).
  - `--border-subtle`: cor de borda derivada com `color-mix(in srgb, var(--org-primary) 30%, rgba(255,255,255,0.08))`.
  - `--border-strong`: borda de destaque com mix de `--org-primary` e `--org-secondary`.
  - `--card-shadow`: sombra suave colorida na tonalidade primária da organização.
- Nos cards das abas de gestão, aplicar `border: 1px solid var(--border-subtle)` e detalhes cromáticos da paleta da organização:
  - **LabDiv:** Azul IFUSP `#049FFF`, Amarelo `#FFCC00`, Coral `#F14343` sobre `#0b0f19`.
  - **Show da Física:** Azul Neon `#0066FF`, Vermelho Laser `#FF1E1E`, Verde `#00FF66` sobre `#07090e`.
  - **Hackerspace:** Verde Terminal `#00FF66`, Amarelo Maker `#FFCC00` sobre `#080808`.

---

## Frente 7: Editor Modular do Portfólio (Estilo Currículo & Resumo)

### Diagnóstico
O usuário precisa de liberdade para ativar, desativar, reordenar e renomear as seções do seu portfólio (`Fotografia Autoral`, `Na Mídia / Jornal`, `Mural do Instagram`, `Projetos de Software & Design`), seguindo a mesma ergonomia modular já existente no `CurriculoClient` e `ResumoClient`.

### Contrato de Dados
Adicionar ao `profile.features_config.portfolio_sections` o array de seções:
```ts
export type PortfolioSectionKey = 'photos' | 'press' | 'instagram' | 'projects';

export interface PortfolioSectionConfig {
  key: PortfolioSectionKey;
  enabled: boolean;
  order: number;
  title: string;
  subtitle: string;
}
```

### Experiência no Modo Edição (`PortfolioClient.tsx`)
- Ao ativar **"Editar Portfólio"**, exibir o painel construtor:
  - 4 Cards Modulares correspondentes às seções.
  - Switches para exibir/ocultar cada seção no portfólio público e privado.
  - Controles de ordenação (`Subir ↑` / `Descer ↓`).
  - Inputs para editar o título e subtítulo de cada seção.
  - Atalhos diretos para gerenciar os itens de cada módulo (selecionar fotos do cofre, cadastrar matéria na mídia, inserir embed do Instagram, adicionar projeto).
- Salvamento unificado via `saveUserProfileData` com atualização reativa no estado local e `router.refresh()`.

---

## Frente 8: Cards das Organizações no HUB LabDiv com Painel Restrito & HUB Studio

### Arquitetura de Integração (HUB LabDiv ↔ Aurtistic)
- **Localização dos Cards no HUB:**
  - `InitiativeCard.tsx` (Cards de LabDiv e Show da Física no feed de iniciativas).
  - `HackerspaceCard.tsx` (Card temático do Hackerspace com o Chrome Dino).
- **Novos Atalhos nos Cards:**
  - **Botão "Painel de Gestão":** Abre a rota com a aba de gestão do Aurtistic embutida (`?tab=gestao#painel-membros`), com controle estrito: apenas membros verificados da organização têm acesso; não-membros veem tela de solicitação/código de acesso.
  - **Botão "HUB Studio (Cofre)":** Abre o Studio de Posts da organização (`?tab=studio#painel-membros`).
- **HUB Studio Conectado ao Cofre da Organização:**
  - O Studio embutido consome as mídias do cofre da respectiva organização (`selectedOrgId` / diretório da organização no Edge Server).
  - Permite criar posts rápidos com a IDV pré-aplicada.
  - **Dupla Saída:**
    1. *Exportar para Instagram:* download direto em PNG (1:1, 4:5 ou 9:16) ou ZIP de carrossel.
    2. *Publicar no HUB:* ação que integra a arte gerada diretamente com o formulário de submissão rápida do HUB LabDiv.

---

## Plano de Verificação e Qualidade

| Teste | Comando / Rota | Critério de Sucesso |
| :--- | :--- | :--- |
| **Verificação Rápida Aurtistic** | `npm run verify:silent` | 0 erros de TypeScript e ESLint |
| **Verificação Completa Aurtistic** | `npm run verify:full` | 0 erros; 91/91 testes passando em `verify_theme_and_tour.mjs` com AGPLv3 |
| **Rotas HUB LabDiv (Porta 3001)** | `http://localhost:3001/gcif/instituto`<br>`http://localhost:3001/iniciativas/labdiv`<br>`http://localhost:3001/iniciativas/show-da-fisica`<br>`http://localhost:3001/espacos/hackerspace` | HTTP 200; renderização dos cards com novos atalhos e iframe integrado |

