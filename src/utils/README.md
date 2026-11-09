# Módulo `src/utils/` — Utilitários de Infraestrutura e Supabase

Esta pasta contém as fábricas de clientes do Supabase preparadas para o modelo híbrido Server/Client do Next.js App Router (SSR, Server Components, Server Actions e Client Components).

## Estrutura de Arquivos

| Pasta / Arquivo | Contexto de Execução | Descrição |
| :--- | :--- | :--- |
| `supabase/client.ts` | Navegador (`'use client'`) | Cria instância singleton do cliente Supabase para o browser utilizando `createBrowserClient` do `@supabase/ssr`. |
| `supabase/server.ts` | Servidor (`'use server'` / RSC) | Cria cliente Supabase assíncrono vinculado aos cookies da requisição HTTP via `createServerClient` do `@supabase/ssr`. |
| `supabase/middleware.ts` | Edge Middleware | Atualiza tokens de sessão e cookies durante a passagem pelo middleware de roteamento. |

## Padrão de Uso

```tsx
// Em Server Components / Server Actions:
import { createClient } from '@/utils/supabase/server';
const supabase = await createClient();

// Em Client Components:
import { createClient } from '@/utils/supabase/client';
const [supabase] = useState(() => createClient());
```

