# Supabase & PostgreSQL Ecosystem (`supabase/`)

Estrutura das migrações SQL, triggers de consistência, Row-Level Security (RLS) e Remote Procedure Calls (RPCs) de governança do Aurtistic.

## Estrutura de Arquivos

```
supabase/
└── migrations/
    └── newsqls/
        └── 01_aurtistic_unified_ecosystem.sql  # Migration unificada v4.1
```

## Principais Componentes do Banco de Dados

### 1. Tabelas
- `public.tasks`: Tarefas e subtarefas, prazos, prioridades e colunas customizadas.
- `public.user_profiles`: Perfis de usuários, quotas de armazenamento e preferências de sistema em `features_config` JSONB.
- `public.user_files_index`: Índice unificado dos 4 Pilares (vínculos com Tarefas, Portfólio, Currículo e Resumo).
- `public.share_links`: Links de clientes (`/s/[token]`) para aprovação fotográfica com proteção por PIN scrypt.

### 2. Triggers de Integridade
- `protect_storage_profile_privileges()`: Impede que papéis `authenticated` ou `anon` manipulem diretamente `used_bytes` ou limites de quota.
- `cleanup_deleted_task_from_file_index()`: Quando uma tarefa é excluída, limpa automaticamente as referências no array `linked_task_ids` (UUID[]) de `user_files_index`.

### 3. RPCs Críticas
- `admin_update_user_storage_governance`: Concessão de quota e aumentos temporários com controle de expiração.
- `submit_client_proofing_selection`: Validação e registro das fotos aprovadas pelo cliente final.
- `resolve_public_creator_profile`: Resolução pública de perfis pelo slug do criador.
- `get_share_link_by_token_internal`: Resolução de links de prova por token criptográfico.

