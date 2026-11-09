-- Este programa é um software livre (Licença AGPLv3)

-- 1. Criação da tabela de perfis de usuários
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY, -- Mapeado para auth.users.id
    quick_links JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for user profile" ON public.user_profiles;
CREATE POLICY "Enable read access for user profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Enable insert for user profile" ON public.user_profiles;
CREATE POLICY "Enable insert for user profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Enable update for user profile" ON public.user_profiles;
CREATE POLICY "Enable update for user profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Atualização da tabela tasks para suportar isolamento pessoal
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false;

-- Atualizar RLS na tabela tasks (se ela tiver RLS, senão não faz nada)
-- Presumindo que tasks NÃO tem RLS bloqueante no momento (todos podem ler), 
-- mas precisamos proteger as "is_personal" para que apenas o dono veja.
-- Portanto, vamos garantir que o RLS está ativo e criar políticas adequadas.
-- NOTA: Se o Servidor depende de acesso aberto a is_personal=false, precisamos garantir isso.

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for tasks" ON public.tasks;
CREATE POLICY "Allow read access for tasks" ON public.tasks FOR SELECT USING (
    is_personal = false OR auth.uid() = user_id
);

DROP POLICY IF EXISTS "Allow all modifications to global tasks" ON public.tasks;
CREATE POLICY "Allow all modifications to global tasks" ON public.tasks FOR ALL USING (
    is_personal = false OR auth.uid() = user_id
);
