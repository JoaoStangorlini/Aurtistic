-- Este programa é um software livre (Licença AGPLv3)
-- Unificação Aurtistic e stangorlini.web

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS resumo TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS curriculo JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS portfolio JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS features_config JSONB DEFAULT '{"active": ["tasks", "resumo", "curriculo", "portfolio"], "order": ["tasks", "resumo", "curriculo", "portfolio"], "layout_style": "default"}'::jsonb;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Enable public read access for user profiles
DROP POLICY IF EXISTS "Enable read access for user profile" ON public.user_profiles;
CREATE POLICY "Enable read access for user profile" ON public.user_profiles FOR SELECT USING (true);

