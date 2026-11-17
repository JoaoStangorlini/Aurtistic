# Plano de Implementação: Atalhos de Cofre, IDV LabDiv e Separação Arquitetural HUB / Aurtistic

## 1. Visão Geral e Princípio Arquitetural

Conforme definido pela arquitetura do ecossistema:
- **Aurtistic:** Plataforma de infraestrutura, gestão de tarefas, reuniões, pautas, escalas When2Meet, estoque de bancada, cofre de arquivos criptográfico e compartilhamento de materiais entre membros.
- **HUB LabDiv:** Plataforma de comunicação, rede social científica, vitrine institucional e ferramentas criativas (HUB Studio, geração de posts, identidade visual e divulgação).

---

## 2. Lista de Entregas

### 1. Navegador Hierárquico de Pastas Pessoais para Atalhos (`UserVaultWorkspace.tsx`)
- Mini explorador de diretórios com navegação recursiva no modal de atalhos.
- Breadcrumbs interativos de navegação (`/ Meus Arquivos / Portfolio / Subpasta / ...`).
- Botão para subir nível (`..`) e clique em pasta para navegar no espaço pessoal.
- Botão "Selecionar esta pasta" para vincular tanto pastas raiz quanto subpastas profundas.

### 2. Suporte Completo a Atalhos no Cofre Pessoal
- Opção `Atalho para Pasta de Organização` no menu `+ Novo` do cofre pessoal (mapeia pastas do LabDiv, Show, HS ou ProFis para o cofre pessoal).
- Opção `Criar Atalho em Organização...` no menu de contexto (três pontos) de qualquer pasta pessoal.

### 3. IDV Oficial do LabDiv na Página de Organizações do Aurtistic (`/labdiv`)
- Integração completa com `OrganizationBrandProvider` na rota `/labdiv`.
- Aplicação dos tokens oficiais do LabDiv:
  - Fundo cósmico escuro `#0b0f19` / `#111827`.
  - Azul LabDiv `#049FFF` e Amarelo `#FFCC00`.
  - Acentos `#ef4444` e `#9d4edd`.
  - Tipografia oficial `Space Grotesk`.
  - Fórmulas matemáticas discretas de fundo e badges luminosas que espelham o portal do HUB.

### 4. Remoção do Botão HUB Studio da Gestão no Aurtistic
- Exclusão do botão `HUB Studio` do cabeçalho de organizações em `LabDivWorkspaceClient.tsx`.
- O Aurtistic preserva foco exclusivo em arquivos, tarefas, reuniões, escalas e operações de equipe.

---

## 3. Plano de Execução Passo a Passo

| Etapa | Arquivo Alvo | Ação Técnica |
| :--- | :--- | :--- |
| **Passo 1** | `src/components/servidor/UserVaultWorkspace.tsx` | Implementar estado de navegação interna `shortcutBrowserPath`, função `loadPersonalSubfolder(path)` e breadcrumbs interativos no modal de atalhos. |
| **Passo 2** | `src/components/servidor/UserVaultWorkspace.tsx` | Adicionar opção `Atalho para Pasta` no menu `+ Novo` do cofre pessoal e a ação `Criar Atalho...` no menu de contexto de pastas pessoais. |
| **Passo 3** | `src/app/(dashboard)/labdiv/page.tsx` | Envolver o retorno da página no `OrganizationBrandProvider` com a IDV oficial do LabDiv, ativando classes cósmicas e tokens de cores. |
| **Passo 4** | `src/components/organizacoes/LabDivWorkspaceClient.tsx` | Remover o botão de atalho `HUB Studio` do topo do painel de gestão. |
| **Passo 5** | Validação Silenciosa | Executar `npm run verify:silent` no Aurtistic e `npx tsc --noEmit` no HUB LabDiv, atualizando `.context/ACTIVE_STATE.md`. |

