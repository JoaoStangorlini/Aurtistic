# Módulo Dashboard (`src/components/dashboard`)

Componentes do painel central, navegação de topo, cabeçalhos, barra de links rápidos e componentes de visualização de tarefas do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `AurtisticNavbar.tsx` | Barra de navegação superior com logo camaleão, abas de módulos, botão de ajuda `?` e menu de perfil. |
| `AurtisticWorkspaceClient.tsx` | Container principal do dashboard que orquestra tarefas, barra de links rápidos, hub de autocuidado e modais. |
| `AurtisticQuickLinks.tsx` | Barra expansível de links rápidos / gerais com pins de 1 clique, adição sob demanda e persistência local. |
| `TasksView.tsx` | Visualização em lista/kanban de tarefas com filtros rápidos e vinculação bidirecional com arquivos. |
| `TaskFilePickerModal.tsx` | Modal de seleção e upload de anexos de tarefas direto no cofre do Edge Node. |

---

## Filosofia de Design

- **Eficiência de Espaço:** Redução da altura da barra de links para `min-h-[44px]` para manter foco total no conteúdo.
- **Acessibilidade Cognitiva:** Cores com alto contraste (WCAG AA >= 4.5:1) e hierarquia visual clara sem ruído desnecessário.

