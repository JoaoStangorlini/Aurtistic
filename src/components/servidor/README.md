# Módulo Servidor & Vault (`src/components/servidor`)

Este diretório contém os componentes da interface do usuário para gerenciamento de arquivos em nuvem pessoal, armazenamento do Edge Node (Fire Stick / Termux) e governança de armazenamento multi-tenant do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `UserVaultWorkspace.tsx` | Espaço de trabalho principal de arquivos, com modos Grid, Lista e IDE (VS Code-like). |
| `VaultIdeTreeSidebar.tsx` | Barra lateral com árvore de diretórios hierárquica e ações de criação/upload estilo VS Code. |
| `VaultPreviewPanel.tsx` | Painel lateral de pré-visualização rápida (`Alt+P`) com metadados EXIF, player e ponte para os 4 Pilares. |
| `StorageQuotaCard.tsx` | Card visual de consumo de cota (espaço utilizado vs. limite efetivo, bar progress). |
| `AdminQuotaGovernancePanel.tsx` | Painel administrativo de controle de cotas globais, aprovação de tenants e boosts de evento. |
| `NoteEditorDrawer.tsx` | Gaveta flutuante de edição in-place de notas Markdown (`.md`) e texto puro (`.txt`). |
| `FileEcosystemMenu.tsx` | Menu de contexto para vinculação de arquivos aos 4 Pilares (Tarefas, Portfólio, Currículo, Resumo). |
| `PinLockModal.tsx` | Modal de desbloqueio por PIN para pastas protegidas via KDF `scrypt`. |

---

## Diretrizes de Arquitetura

1. **Multi-Layout:** Suporta alternância instantânea entre `grid`, `list` e `ide` via estado local persistido.
2. **Preview Pane:** Ativação por clique em arquivos ou atalho de teclado global `Alt+P`.
3. **Tickets HMAC:** Todas as requisições ao Edge Node utilizam tickets HMAC emitidos via Server Actions com finalidade `vault`.

