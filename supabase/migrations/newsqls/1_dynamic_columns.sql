-- Este programa é um software livre (Licença AGPLv3)

-- 1. Criação da tabela de configuração de colunas
CREATE TABLE IF NOT EXISTS public.task_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'text',
    options JSONB DEFAULT '[]'::jsonb,
    is_native BOOLEAN DEFAULT false,
    order_num INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Habilitar RLS e criar políticas
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.task_columns;
CREATE POLICY "Enable read access for all users" ON public.task_columns FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.task_columns;
CREATE POLICY "Enable insert for authenticated users only" ON public.task_columns FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.task_columns;
CREATE POLICY "Enable update for authenticated users only" ON public.task_columns FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.task_columns;
CREATE POLICY "Enable delete for authenticated users only" ON public.task_columns FOR DELETE USING (auth.role() = 'authenticated');

-- 3. Inserir as colunas nativas (Status, Prioridade, Categoria, Responsável, Dimensão)
INSERT INTO public.task_columns (key, name, type, options, is_native, order_num) VALUES
('status', 'Status', 'select', '[
    {"value": "não iniciada", "label": "Não iniciada", "color": "#E0E0E0"},
    {"value": "em progresso", "label": "Em progresso", "color": "#4285f4"},
    {"value": "falta testar", "label": "Falta testar", "color": "#f4b400"},
    {"value": "completa", "label": "Completa", "color": "#0f9d58"},
    {"value": "descartada", "label": "Descartada", "color": "#db4437"}
]'::jsonb, true, 1),
('prioridade', 'Prioridade', 'select', '[
    {"value": "", "label": "Nenhuma", "color": "#2D2D2D"},
    {"value": "Baixa", "label": "Baixa", "color": "#4285f4"},
    {"value": "Média", "label": "Média", "color": "#f4b400"},
    {"value": "Alta", "label": "Alta", "color": "#db4437"}
]'::jsonb, true, 2),
('categoria', 'Categoria', 'select', '[
    {"value": "Programar", "label": "Programar", "color": "#9D4EDD"},
    {"value": "Pesquisar", "label": "Pesquisar", "color": "#4285f4"},
    {"value": "touch the grass", "label": "touch the grass", "color": "#0f9d58"},
    {"value": "reunir", "label": "reunir", "color": "#FF8C8C"},
    {"value": "post", "label": "post", "color": "#f4b400"},
    {"value": "outros", "label": "outros", "color": "#E0E0E0"}
]'::jsonb, true, 3),
('responsavel', 'Responsável', 'select', '[
    {"value": "", "label": "Nenhum", "color": "#2D2D2D"},
    {"value": "João", "label": "João", "color": "#9D4EDD"},
    {"value": "Andy", "label": "Andy", "color": "#db4437"},
    {"value": "Leo", "label": "Leo", "color": "#0f9d58"},
    {"value": "Dani", "label": "Dani", "color": "#4285f4"},
    {"value": "Lorenzo", "label": "Lorenzo", "color": "#FFCC00"},
    {"value": "Nacky", "label": "Nacky", "color": "#FF8C8C"}
]'::jsonb, true, 4),
('dimensao', 'Dimensão', 'select', '[
    {"value": "HUB", "label": "HUB", "color": "#9D4EDD"},
    {"value": "urgente", "label": "urgente", "color": "#db4437"},
    {"value": "USP", "label": "USP", "color": "#4285f4"},
    {"value": "filmes/series", "label": "filmes/series", "color": "#f4b400"},
    {"value": "cin", "label": "cin", "color": "#0f9d58"},
    {"value": "tatuagens", "label": "tatuagens", "color": "#FF8C8C"},
    {"value": "compras", "label": "compras", "color": "#E0E0E0"},
    {"value": "hobbys", "label": "hobbys", "color": "#2D2D2D"},
    {"value": "livros", "label": "livros", "color": "#E0E0E0"},
    {"value": "stangorlini.web", "label": "stangorlini.web", "color": "#9D4EDD"},
    {"value": "fotografia", "label": "fotografia", "color": "#FFCC00"}
]'::jsonb, true, 5)
ON CONFLICT (key) DO NOTHING;

-- 4. Adicionar coluna JSONB `custom_fields` na tabela `tasks`
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- 4_quick_filters_sorts.sql
-- Adiciona a coluna quick_sorts na tabela user_profiles para salvar preferências do usuário
-- sobre quais colunas aparecem na barra horizontal de Ordem.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS quick_sorts JSONB DEFAULT '["status", "prazo", "prioridade", "manual"]'::jsonb;
