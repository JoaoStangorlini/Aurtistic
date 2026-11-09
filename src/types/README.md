# Módulo `src/types/` — Definições e Contratos TypeScript

Esta pasta centraliza os tipos de dados fundamentais da aplicação, garantindo tipagem estrita de ponta a ponta entre o banco de dados PostgreSQL (Supabase), o servidor Next.js e a interface do usuário.

## Estrutura de Arquivos

| Arquivo | Domínio de Dados | Principais Tipos Exportados |
| :--- | :--- | :--- |
| `index.ts` | Geral & Tarefas | `Task`, `TaskColumn`, `AgendaEvent`, `UserProfile`, `FeaturesConfig` |
| `storage.ts` | Cofre & Edge Node | `UserStorageProfile`, `UserFileIndexRow`, `ShareLinkRow`, `EdgeVaultEntry`, `EdgeTrashItem`, `StorageTicketPayload` |
| `portfolio.ts` | Portfólio & Mídia | `PhotoInspectItem`, `PortfolioAlbumMetadata`, `ExifMetadata` |

## Boas Práticas

- Todas as interfaces e types devem manter alinhamento estrito com as colunas das tabelas do Supabase (`tasks`, `user_profiles`, `user_files_index`, `share_links`).
- Sempre declare tipos explícitos para propriedades opcionais (`prop?: string | null`) para compatibilidade segura com retornos do banco.

