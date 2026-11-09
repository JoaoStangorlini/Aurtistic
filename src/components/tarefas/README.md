# Módulo Tarefas (`src/components/tarefas`)

Componentes e diálogos voltados especificamente à gestão de tarefas, criação, detalhamento e anotações rápidas do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `TaskDetailDialog.tsx` | Diálogo modal com detalhes completos da tarefa, anexos vinculados e histórico. |
| `TaskFormModal.tsx` | Formulário rápido para cadastro e edição de tarefas com suporte a prioridade, tags e prazos. |

---

## Integração de Arquivos

- Cada tarefa pode estar associada a múltiplos arquivos em `user_files_index` através da coluna relacional `linked_task_ids UUID[]`.

