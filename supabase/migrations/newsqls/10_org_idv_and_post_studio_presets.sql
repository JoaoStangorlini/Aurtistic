-- Este programa é um software livre (Licença AGPLv3)
-- Fase 2: Normalização de public.organizations, correção de create_new_organization e seed de IDV (LabDiv, Show da Física, HS)
BEGIN;

-- 1. Adiciona brand_config JSONB e normaliza colunas potencialmente divergentes em public.organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Bloco defensivo: caso o banco tenha sido criado por script legado com owner_id ou vault_quota_bytes NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.organizations ALTER COLUMN owner_id DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'vault_quota_bytes'
  ) THEN
    EXECUTE 'ALTER TABLE public.organizations ALTER COLUMN vault_quota_bytes SET DEFAULT 53687091200';
    EXECUTE 'ALTER TABLE public.organizations ALTER COLUMN vault_quota_bytes DROP NOT NULL';
  END IF;
END $$;

-- 2. Corrige a RPC create_new_organization (que na migration 06 L798 referenciava vault_quota_bytes inexistente)
CREATE OR REPLACE FUNCTION public.create_new_organization(
  p_name TEXT,
  p_slug TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_name TEXT := trim(COALESCE(p_name, ''));
  v_clean_slug TEXT := lower(trim(COALESCE(p_slug, '')));
  v_org public.organizations%ROWTYPE;
  v_user_name TEXT;
  v_user_email TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para criar organização.';
  END IF;
  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Nome da organização é obrigatório.';
  END IF;
  IF v_clean_slug = '' THEN
    v_clean_slug := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  END IF;
  v_clean_slug := trim(both '-' from v_clean_slug);

  INSERT INTO public.organizations (
    name, slug, description, created_by, storage_quota_bytes, storage_used_bytes, storage_policy
  ) VALUES (
    v_clean_name, v_clean_slug, p_description, v_user_id, 53687091200, 0, 'admin_or_permitted'
  )
  RETURNING * INTO v_org;

  SELECT COALESCE(raw_user_meta_data->>'full_name', email), email
  INTO v_user_name, v_user_email
  FROM auth.users WHERE id = v_user_id;

  INSERT INTO public.organization_members (
    organization_id, user_id, full_name, email, org_role, can_upload_org_vault, cognitive_capacity
  ) VALUES (
    v_org.id, v_user_id, COALESCE(v_user_name, 'Admin'), v_user_email, 'admin', true, 'normal'
  );

  INSERT INTO public.organization_subteams (organization_id, name, color)
  VALUES
    (v_org.id, 'Coordenação', '#9D4EDD'),
    (v_org.id, 'Comunicação', '#06B6D4'),
    (v_org.id, 'Pesquisa', '#10B981')
  ON CONFLICT (organization_id, name) DO NOTHING;

  RETURN to_jsonb(v_org);
END;
$$;

-- 3. Seed completo das 3 Organizações Institucionais respeitando 100% das constraints NOT NULL
INSERT INTO public.organizations (
  id, slug, name, description, primary_color, secondary_color,
  storage_quota_bytes, storage_used_bytes, storage_policy, brand_config
)
VALUES
  (
    '1ab41410-0000-4000-8000-000000000001',
    'labdiv',
    'LabDiv',
    'Laboratório de Comunicação e Divulgação Científica do IFUSP',
    '#049FFF',
    '#FFCC00',
    53687091200,
    0,
    'admin_or_permitted',
    '{"themeId":"labdiv","bgApp":"#0b0f19","bgSurface":"#111827","textPrimary":"#f8fafc","accents":["#049fff","#ffcc00","#ef4444","#9d4edd"],"fontDisplay":"Space Grotesk","fontBody":"Inter","uppercaseTitles":false,"glowIntensity":0.4}'::jsonb
  ),
  (
    '1ab41410-0000-4000-8000-000000000002',
    'show-da-fisica',
    'Show da Física',
    'Demonstrações teatrais e lúdicas de fenômenos físicos — IFUSP',
    '#0066ff',
    '#ff1e1e',
    53687091200,
    0,
    'admin_or_permitted',
    '{"themeId":"show-da-fisica","bgApp":"#07090e","bgSurface":"#0d111a","textPrimary":"#e2e8f0","accents":["#ff1e1e","#0066ff","#00ff44","#ffcc00"],"fontDisplay":"Orbitron","fontBody":"Inter","uppercaseTitles":true,"glowIntensity":1.0}'::jsonb
  ),
  (
    '1ab41410-0000-4000-8000-000000000003',
    'hs',
    'Hackerspace IFUSP',
    'Laboratório comunitário de cultura maker, eletrônica e hardware livre',
    '#00FF66',
    '#FFCC00',
    53687091200,
    0,
    'admin_or_permitted',
    '{"themeId":"hs","bgApp":"#080808","bgSurface":"#101412","textPrimary":"#e2f1e8","accents":["#00ff66","#ffcc00","#06b6d4"],"fontDisplay":"JetBrains Mono","fontBody":"Open Sans","uppercaseTitles":true,"glowIntensity":0.75}'::jsonb
  ),
  (
    '1ab41410-0000-4000-8000-000000000004',
    'profis',
    'Pró-Física (ProFis)',
    'Incentivo à formação acadêmica, nivelamento e pesquisa científica no IFUSP',
    '#F59E0B',
    '#FFCC00',
    53687091200,
    0,
    'admin_or_permitted',
    '{"themeId":"profis","bgApp":"#080c16","bgSurface":"#0f172a","textPrimary":"#f8fafc","accents":["#F59E0B","#FFCC00","#F97316","#38BDF8"],"fontDisplay":"Space Grotesk","fontBody":"Inter","uppercaseTitles":false,"glowIntensity":0.9}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  primary_color = EXCLUDED.primary_color,
  secondary_color = EXCLUDED.secondary_color,
  brand_config = EXCLUDED.brand_config,
  updated_at = timezone('utc'::text, now());

-- Subequipes padrão para Show da Física, Hackerspace e Pró-Física (ProFis)
INSERT INTO public.organization_subteams (organization_id, name, description, color)
VALUES
  ('1ab41410-0000-4000-8000-000000000002', 'Apresentações & Palco', 'Monitores de palco e roteiros de sessões', '#ff1e1e'),
  ('1ab41410-0000-4000-8000-000000000002', 'Manutenção & Bancada', 'Oficina, reparo e montagem de experimentos', '#0066ff'),
  ('1ab41410-0000-4000-8000-000000000002', 'Comunicação & Redes', 'Divulgação, fotografia e posts científicos', '#00ff44'),
  ('1ab41410-0000-4000-8000-000000000003', 'Hardware & Eletrônica', 'Bancadas de solda, sensores e IoT', '#00ff66'),
  ('1ab41410-0000-4000-8000-000000000003', 'Fabricação Digital & 3D', 'Impressoras 3D, CNC e corte a laser', '#ffcc00'),
  ('1ab41410-0000-4000-8000-000000000003', 'Comunidade & Oficinas', 'Cursos, eventos e comunicação do HS', '#06b6d4'),
  ('1ab41410-0000-4000-8000-000000000004', 'Apoio Pedagógico & Nivelamento', 'Monitorias e nivelamento em cálculo e física básica', '#f59e0b'),
  ('1ab41410-0000-4000-8000-000000000004', 'Pesquisa & Iniciação Científica', 'Projetos avançados de pesquisa e bolsas de estudo', '#ffcc00'),
  ('1ab41410-0000-4000-8000-000000000004', 'Comunicação & Divulgação', 'Materiais didáticos, mídias e seminários do ProFis', '#f97316')
ON CONFLICT (organization_id, name) DO NOTHING;

COMMIT;

