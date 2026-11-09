# **Plano de Implementação: Hub Pessoal (V2 - Unificado)**

Este documento é a versão atualizada e complementar do planejamento inicial, unindo as especificações de arquitetura do LabDiv com os novos módulos (Fotografia, Hub, Calendário) e a identidade visual focada em Roxo e Dourado.

## **Diferenças em Relação ao Meu Plano Original:**
1. **Escopo Expandido:** Meu plano original focava apenas no *Gerenciador de Tarefas*. O seu inclui Módulos de Calendário ("When to Meet") e Galeria (Fotografia).
2. **Identidade Visual:** Eu havia proposto o padrão "LabDiv" (Amarelo, Azul, Vermelho). O seu plano traz a nova paleta primária **Roxo (#4B0082)** e **Dourado (#FFD700)**, mantendo a Base Dark (#121212). 
3. **Status das Tarefas:** Seu modelo propôs ENUMS em inglês (`BACKLOG`, `IN_PROGRESS`, `COMPLETED`), o que é uma excelente prática de padronização, que unirei com o conceito de "Dimensão" que você pediu anteriormente.

---

## **1. Arquitetura de Software e Infraestrutura**
- **Framework:** Next.js 14+ (App Router). Server Components por padrão.
- **Linguagem:** TypeScript + Zod (Validação nos Server Actions).
- **Backend/Auth/DB/Storage:** Supabase. Autenticação obrigatória logo de cara, com JWT no Server/Middleware.
- **Hospedagem:** Firebase App Hosting.
- **Estilização:** Tailwind CSS (Dark Mode).

## **2. Identidade Visual (Design System)**
```css
:root {
  --color-primary-purple: #4B0082;
  --color-accent-gold: #FFD700;
  --color-background-dark: #121212;
  --color-surface-dark: #1E1E1E;
  --color-text-light: #F5F5F5;
}
```

## **3. Controle de Acesso e Rotas**
- **Middleware.ts:** Protegerá rotas `/admin/*`. Se não houver sessão ativa do Supabase Auth, redireciona para `/login`.
- **Públicas (ISR):** `/` (Hub), `/fotografia`, `/projetos`, `/profissional`.
- **Privadas:** `/admin/tarefas`, `/admin/servidor`, `/admin/calendario`.

## **4. Especificação dos Módulos (Banco de Dados Supabase)**
*As tabelas usarão RLS (Row Level Security).*

### **4.1. Gerenciador de Tarefas**
Unindo seu planejamento com o sistema de "Dimensões":
```sql
CREATE TYPE task_status AS ENUM ('BACKLOG', 'IN_PROGRESS', 'COMPLETED', 'DISCARDED');
CREATE TYPE task_dimension AS ENUM ('HUB_LABDIV', 'USP', 'PESSOAL');

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status task_status DEFAULT 'BACKLOG',
  priority text, -- 'Low', 'Medium', 'High'
  category text, 
  assignee text,
  due_date timestamptz,
  dimension task_dimension NOT NULL,
  user_id uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now()
);
```
*(As tarefas do Google Tasks/Notion serão importadas para esta estrutura).*

### **4.2. Calendário ("When to Meet")**
```sql
CREATE TABLE time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_available boolean DEFAULT true,
  user_id uuid REFERENCES auth.users
);
```

### **4.3. Galeria (Fotografia)**
galeria seria só um iframe com o link do meu portifolio https://stangorliniphotography.pic-time.com/-portiflio/slidesblog/6a1cf17dfd03398d7fddb00d?slideshowview=AAAAANYAAABdtAdQQXgvsHwiv1E6mUSMuiUAaFz7JkxgkxMPtvfv0JMhf8GQnlaaNiCsf9oYGmXGq7VPHE3RyL2-1gnGziP0iVtidPlPKhb4rzJeFOAgYQ

## **5. Extração e Importação de Tarefas Existentes**
- **Notion:** Como a base é extensa, criarei um script NodeJS focado em interagir com a API do Notion (ou fazer parsing do HTML) para extrair todas as tarefas, ou você poderá exportá-las em CSV no próprio Notion para subirmos tudo via um comando.
- **Google Tasks:** Como a URL exige login pessoal, recomendo baixar as tarefas via Google Takeout (em JSON) ou posso lhe passar um Google Apps Script rápido para gerar a planilha.

---
**Regra Global - Licença:** Em todos os arquivos de código novos, vamos adicionar o aviso de que o programa é um software livre (AGPLv3).
