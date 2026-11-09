-- Este programa é um software livre (Licença AGPLv3)
-- ARQUIVO: supabase/migrations/newsqls/01_aurtistic_unified_ecosystem.sql
-- OBJETIVO: Governança Multi-Tenant (Aprovação + 25 GB Padrão + Boost de Evento),
--           Sinergia dos 4 Pilares, Auto-Heal, Cascata Segura e Provas (/s/:token)
-- ============================================================================

-- 1. ENUMS DO ECOSSISTEMA
DO $$ BEGIN
  CREATE TYPE public.share_mode_enum AS ENUM ('view', 'proofing', 'upload_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.item_visibility_enum AS ENUM ('public', 'private', 'unlisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. CONFIGURAÇÃO GLOBAL DE GOVERNANÇA DO SERVIDOR (PAINEL ADMIN)
CREATE TABLE IF NOT EXISTS public.storage_global_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_quota_bytes BIGINT NOT NULL DEFAULT 26843545600, -- 25 GB padrão após aprovação
  require_admin_approval BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.storage_global_settings (id, default_quota_bytes, require_admin_approval)
VALUES (1, 26843545600, true)
ON CONFLICT (id) DO NOTHING;

-- 3. PERFIL DE ARMAZENAMENTO POR USUÁRIO (APROVAÇÃO, 25 GB & QUOTA TEMPORÁRIA DE EVENTO)
CREATE TABLE IF NOT EXISTS public.user_storage_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  root_folder_slug TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  public_slug TEXT UNIQUE,
  storage_role TEXT NOT NULL DEFAULT 'member' CHECK (storage_role IN ('member', 'admin')),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'suspended')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  quota_limit_bytes BIGINT NOT NULL DEFAULT 26843545600, -- 25 GB padrão quando aprovado
  temp_quota_bytes BIGINT CHECK (temp_quota_bytes IS NULL OR temp_quota_bytes >= 0),
  temp_quota_expires_at TIMESTAMPTZ,
  temp_quota_reason TEXT,
  used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  pinned_folders TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferences JSONB NOT NULL DEFAULT '{"defaultView": "grid", "reducedMotion": true}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. ÍNDICE UNIFICADO DE ARQUIVOS & PONTE DOS 4 PILARES
CREATE TABLE IF NOT EXISTS public.user_files_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  is_directory BOOLEAN NOT NULL DEFAULT false,
  has_pin BOOLEAN NOT NULL DEFAULT false,
  linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  linked_task_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  show_in_portfolio BOOLEAN NOT NULL DEFAULT false,
  show_in_curriculum BOOLEAN NOT NULL DEFAULT false,
  curriculum_label TEXT,
  title TEXT,
  description TEXT,
  album TEXT NOT NULL DEFAULT 'Geral',
  category TEXT NOT NULL DEFAULT 'Projeto',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  exif_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  visibility public.item_visibility_enum NOT NULL DEFAULT 'private',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, relative_path)
);

-- 5. LINKS DE COMPARTILHAMENTO E PROVAS DE CLIENTES (/s/:token)
CREATE TABLE IF NOT EXISTS public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  folder_path TEXT NOT NULL,
  album_title TEXT NOT NULL,
  mode public.share_mode_enum NOT NULL DEFAULT 'proofing',
  pin_hash TEXT,
  allow_download BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  client_name TEXT,
  client_feedback TEXT,
  selected_file_paths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  auto_create_task BOOLEAN NOT NULL DEFAULT true,
  created_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  is_submitted BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. ÍNDICES B-TREE E GIN
CREATE INDEX IF NOT EXISTS idx_storage_profiles_public_slug ON public.user_storage_profiles(public_slug) WHERE public_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storage_profiles_approval ON public.user_storage_profiles(approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_files_user_path ON public.user_files_index(user_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_user_files_primary_task ON public.user_files_index(user_id, linked_task_id) WHERE linked_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_files_task_ids_gin ON public.user_files_index USING GIN (linked_task_ids);
CREATE INDEX IF NOT EXISTS idx_user_files_portfolio ON public.user_files_index(user_id, show_in_portfolio, visibility, display_order);
CREATE INDEX IF NOT EXISTS idx_user_files_curriculum ON public.user_files_index(user_id, show_in_curriculum) WHERE show_in_curriculum = true;
CREATE INDEX IF NOT EXISTS idx_share_links_token ON public.share_links(token);

-- 7. FUNÇÕES AUXILIARES, TRIGGERS E BLINDAGENS DE SEGURANÇA
CREATE OR REPLACE FUNCTION public.escape_like_pattern(p_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(p_raw, '\', '\\'), '%', '\%'), '_', '\_');
$$;

CREATE OR REPLACE FUNCTION public.set_aurtistic_ecosystem_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_storage_profiles_updated_at ON public.user_storage_profiles;
CREATE TRIGGER trg_user_storage_profiles_updated_at
  BEFORE UPDATE ON public.user_storage_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_aurtistic_ecosystem_updated_at();

DROP TRIGGER IF EXISTS trg_user_files_index_updated_at ON public.user_files_index;
CREATE TRIGGER trg_user_files_index_updated_at
  BEFORE UPDATE ON public.user_files_index
  FOR EACH ROW EXECUTE FUNCTION public.set_aurtistic_ecosystem_updated_at();

-- [CORREÇÃO v4.1 #1]: Trava campos de governança e NEW.used_bytes := OLD.used_bytes contra edição pelo cliente
CREATE OR REPLACE FUNCTION public.protect_storage_profile_privileges()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.storage_role := OLD.storage_role;
    NEW.approval_status := OLD.approval_status;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.quota_limit_bytes := OLD.quota_limit_bytes;
    NEW.temp_quota_bytes := OLD.temp_quota_bytes;
    NEW.temp_quota_expires_at := OLD.temp_quota_expires_at;
    NEW.temp_quota_reason := OLD.temp_quota_reason;
    NEW.used_bytes := OLD.used_bytes;
    NEW.root_folder_slug := OLD.root_folder_slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_storage_profile_privileges ON public.user_storage_profiles;
CREATE TRIGGER trg_protect_storage_profile_privileges
  BEFORE UPDATE ON public.user_storage_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_storage_profile_privileges();

CREATE OR REPLACE FUNCTION public.cleanup_deleted_task_from_file_index()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_files_index
  SET
    linked_task_ids = array_remove(linked_task_ids, OLD.id),
    linked_task_id = (array_remove(linked_task_ids, OLD.id))[1]
  WHERE OLD.id = ANY(linked_task_ids) OR linked_task_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_deleted_task_files ON public.tasks;
CREATE TRIGGER trg_cleanup_deleted_task_files
  AFTER DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_task_from_file_index();

-- 8. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.storage_global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_storage_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_files_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura autenticada das configurações globais de storage" ON public.storage_global_settings;
CREATE POLICY "Leitura autenticada das configurações globais de storage" ON public.storage_global_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuário lê seu próprio perfil de storage" ON public.user_storage_profiles;
CREATE POLICY "Usuário lê seu próprio perfil de storage" ON public.user_storage_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário inicializa seu perfil de storage pendente" ON public.user_storage_profiles;
CREATE POLICY "Usuário inicializa seu perfil de storage pendente" ON public.user_storage_profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND storage_role = 'member' AND approval_status = 'pending' AND used_bytes = 0
  );

DROP POLICY IF EXISTS "Usuário edita preferências e slug do seu storage" ON public.user_storage_profiles;
CREATE POLICY "Usuário edita preferências e slug do seu storage" ON public.user_storage_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário gerencia exclusivamente seus próprios arquivos" ON public.user_files_index;
CREATE POLICY "Usuário gerencia exclusivamente seus próprios arquivos" ON public.user_files_index
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Leitura pública de itens publicados no portfólio ou currículo" ON public.user_files_index;
CREATE POLICY "Leitura pública de itens publicados no portfólio ou currículo" ON public.user_files_index
  FOR SELECT USING ((show_in_portfolio = true OR show_in_curriculum = true) AND visibility = 'public');

DROP POLICY IF EXISTS "Criador gerencia seus próprios links de compartilhamento" ON public.share_links;
CREATE POLICY "Criador gerencia seus próprios links de compartilhamento" ON public.share_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9. AUTO-PROVISIONAMENTO DE CONTA + BACKFILL SEM COLISÃO UNIQUE
CREATE OR REPLACE FUNCTION public.handle_new_user_storage_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_default_quota BIGINT := 26843545600;
  v_require_approval BOOLEAN := true;
  v_base_slug TEXT;
BEGIN
  SELECT default_quota_bytes, require_admin_approval INTO v_default_quota, v_require_approval
  FROM public.storage_global_settings WHERE id = 1;

  v_base_slug := lower(regexp_replace(split_part(COALESCE(NEW.email, ''), '@', 1), '[^a-zA-Z0-9_-]', '', 'g'));
  IF v_base_slug = '' THEN v_base_slug := 'criativo'; END IF;
  v_base_slug := v_base_slug || '-' || substr(NEW.id::text, 1, 6);

  INSERT INTO public.user_storage_profiles (
    user_id, root_folder_slug, public_slug, approval_status, approved_at, quota_limit_bytes
  ) VALUES (
    NEW.id,
    NEW.id::text,
    v_base_slug,
    CASE WHEN COALESCE(v_require_approval, true) THEN 'pending' ELSE 'approved' END,
    CASE WHEN COALESCE(v_require_approval, true) THEN NULL ELSE timezone('utc'::text, now()) END,
    COALESCE(v_default_quota, 26843545600)
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_storage ON auth.users;
CREATE TRIGGER on_auth_user_created_storage
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_storage_profile();

WITH candidate_slugs AS (
  SELECT
    u.id AS user_id,
    COALESCE(
      NULLIF(lower(regexp_replace(btrim(COALESCE(up.username, '')), '[^a-zA-Z0-9_-]', '', 'g')), ''),
      NULLIF(lower(regexp_replace(split_part(COALESCE(u.email, ''), '@', 1), '[^a-zA-Z0-9_-]', '', 'g')), ''),
      'criativo'
    ) AS raw_slug,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.user_profiles up ON up.id = u.id
),
ranked_slugs AS (
  SELECT user_id, raw_slug,
    ROW_NUMBER() OVER (PARTITION BY raw_slug ORDER BY created_at ASC, user_id ASC) AS slug_rank
  FROM candidate_slugs
)
INSERT INTO public.user_storage_profiles (
  user_id, root_folder_slug, public_slug, approval_status, quota_limit_bytes
)
SELECT
  r.user_id,
  r.user_id::text,
  CASE
    WHEN r.slug_rank = 1 AND NOT EXISTS (
      SELECT 1 FROM public.user_storage_profiles existing WHERE existing.public_slug = r.raw_slug
    ) THEN r.raw_slug
    ELSE r.raw_slug || '-' || substr(r.user_id::text, 1, 6)
  END,
  'pending',
  26843545600
FROM ranked_slugs r
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.user_storage_profiles
SET
  storage_role = 'admin',
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, timezone('utc'::text, now())),
  quota_limit_bytes = 536870912000,
  public_slug = COALESCE(public_slug, 'stangorlini')
WHERE user_id = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

-- 10. RPCs TRANSACIONAIS
CREATE OR REPLACE FUNCTION public.sync_user_storage_used_bytes(p_used_bytes BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  UPDATE public.user_storage_profiles
  SET used_bytes = GREATEST(0, COALESCE(p_used_bytes, 0)), last_sync_at = timezone('utc'::text, now())
  WHERE user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_file_cascade(p_target_path TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean TEXT := regexp_replace(btrim(COALESCE(p_target_path, '')), '^/+|/+$', '', 'g');
  v_escaped TEXT;
  v_deleted INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF v_clean = '' THEN RETURN 0; END IF;
  v_escaped := public.escape_like_pattern(v_clean);
  DELETE FROM public.user_files_index
  WHERE user_id = v_uid AND (relative_path = v_clean OR relative_path LIKE v_escaped || '/%' ESCAPE '\');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.cascade_rename_user_files_index(
  p_old_path TEXT, p_new_path TEXT, p_new_filename TEXT
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_old_escaped TEXT := public.escape_like_pattern(p_old_path);
  v_affected INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  UPDATE public.user_files_index
  SET relative_path = p_new_path, filename = COALESCE(NULLIF(btrim(p_new_filename), ''), filename)
  WHERE user_id = v_uid AND relative_path = p_old_path;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_affected := v_affected + v_rows;

  UPDATE public.user_files_index
  SET relative_path = p_new_path || substr(relative_path, char_length(p_old_path) + 1)
  WHERE user_id = v_uid AND relative_path LIKE v_old_escaped || '/%' ESCAPE '\';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_affected := v_affected + v_rows;

  UPDATE public.share_links
  SET folder_path = CASE
    WHEN folder_path = p_old_path THEN p_new_path
    ELSE p_new_path || substr(folder_path, char_length(p_old_path) + 1)
  END
  WHERE user_id = v_uid AND (folder_path = p_old_path OR folder_path LIKE v_old_escaped || '/%' ESCAPE '\');
  RETURN v_affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_public_creator_profile(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clean TEXT := lower(btrim(COALESCE(p_slug, '')));
  v_user_id UUID;
  v_public_slug TEXT;
  v_profile_row RECORD;
BEGIN
  IF v_clean = '' THEN RETURN NULL; END IF;
  SELECT COALESCE(usp.user_id, up.id), COALESCE(usp.public_slug, up.username, v_clean)
  INTO v_user_id, v_public_slug
  FROM public.user_profiles up
  FULL OUTER JOIN public.user_storage_profiles usp ON usp.user_id = up.id
  WHERE lower(COALESCE(up.username, '')) = v_clean OR lower(COALESCE(usp.public_slug, '')) = v_clean
  LIMIT 1;

  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_profile_row FROM public.user_profiles WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'userId', v_user_id,
    'publicSlug', v_public_slug,
    'userProfile', CASE WHEN v_profile_row IS NULL THEN NULL ELSE to_jsonb(v_profile_row) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_storage_users()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role TEXT;
  v_settings RECORD;
  v_users JSONB;
BEGIN
  SELECT storage_role INTO v_caller_role FROM public.user_storage_profiles WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador do servidor.';
  END IF;
  SELECT * INTO v_settings FROM public.storage_global_settings WHERE id = 1;
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_users
  FROM (
    SELECT usp.user_id, u.email, COALESCE(up.username, usp.public_slug) AS username,
      usp.storage_role, usp.approval_status, usp.approved_at, usp.quota_limit_bytes,
      usp.temp_quota_bytes, usp.temp_quota_expires_at, usp.temp_quota_reason,
      usp.used_bytes, usp.last_sync_at, usp.created_at
    FROM public.user_storage_profiles usp
    JOIN auth.users u ON u.id = usp.user_id
    LEFT JOIN public.user_profiles up ON up.id = usp.user_id
    ORDER BY CASE WHEN usp.approval_status = 'pending' THEN 0 ELSE 1 END, usp.created_at DESC
  ) t;
  RETURN jsonb_build_object('globalSettings', to_jsonb(v_settings), 'users', v_users);
END;
$$;

-- [CORREÇÃO v4.1 #3]: Preserva temp_quota_* quando p_update_temp_boost = false
CREATE OR REPLACE FUNCTION public.admin_update_user_storage_governance(
  p_target_user_id UUID,
  p_approval_status TEXT,
  p_quota_limit_bytes BIGINT,
  p_update_temp_boost BOOLEAN DEFAULT false,
  p_temp_quota_bytes BIGINT DEFAULT NULL,
  p_temp_quota_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_temp_quota_reason TEXT DEFAULT NULL,
  p_new_global_default_bytes BIGINT DEFAULT NULL,
  p_require_admin_approval BOOLEAN DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT storage_role INTO v_caller_role FROM public.user_storage_profiles WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador do servidor.';
  END IF;

  IF p_new_global_default_bytes IS NOT NULL OR p_require_admin_approval IS NOT NULL THEN
    UPDATE public.storage_global_settings
    SET
      default_quota_bytes = COALESCE(p_new_global_default_bytes, default_quota_bytes),
      require_admin_approval = COALESCE(p_require_admin_approval, require_admin_approval),
      updated_by = auth.uid(),
      updated_at = timezone('utc'::text, now())
    WHERE id = 1;
  END IF;

  IF p_target_user_id IS NOT NULL THEN
    UPDATE public.user_storage_profiles
    SET
      approval_status = COALESCE(p_approval_status, approval_status),
      approved_at = CASE WHEN p_approval_status = 'approved' AND approved_at IS NULL THEN timezone('utc'::text, now()) ELSE approved_at END,
      approved_by = CASE WHEN p_approval_status = 'approved' THEN auth.uid() ELSE approved_by END,
      quota_limit_bytes = COALESCE(p_quota_limit_bytes, quota_limit_bytes),
      temp_quota_bytes = CASE WHEN COALESCE(p_update_temp_boost, false) THEN p_temp_quota_bytes ELSE temp_quota_bytes END,
      temp_quota_expires_at = CASE WHEN COALESCE(p_update_temp_boost, false) THEN p_temp_quota_expires_at ELSE temp_quota_expires_at END,
      temp_quota_reason = CASE WHEN COALESCE(p_update_temp_boost, false) THEN NULLIF(btrim(COALESCE(p_temp_quota_reason, '')), '') ELSE temp_quota_reason END
    WHERE user_id = p_target_user_id;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_share_link_by_token_internal(p_token TEXT)
RETURNS SETOF public.share_links LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.share_links
  WHERE token = btrim(p_token) AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_share_link_files_by_token(p_token TEXT)
RETURNS SETOF public.user_files_index LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.share_links%ROWTYPE;
  v_folder_clean TEXT;
  v_folder_prefix TEXT;
BEGIN
  SELECT * INTO v_link FROM public.share_links
  WHERE token = btrim(p_token) AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()));
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_folder_clean := regexp_replace(btrim(COALESCE(v_link.folder_path, '')), '^/+|/+$', '', 'g');
  IF v_folder_clean = '' THEN
    RETURN;
  END IF;
  v_folder_prefix := v_folder_clean || '/';

  RETURN QUERY
  SELECT * FROM public.user_files_index
  WHERE user_id = v_link.user_id
    AND (relative_path = v_folder_clean OR left(relative_path, char_length(v_folder_prefix)) = v_folder_prefix)
    AND is_directory = false
  ORDER BY display_order ASC, filename ASC;
END;
$$;

-- [CORREÇÃO v4.1 #2]: Validação estrita de prefixo v_folder_prefix || '/' e bloqueio de '..'
CREATE OR REPLACE FUNCTION public.submit_client_proofing_selection(
  p_token TEXT, p_client_name TEXT, p_client_feedback TEXT, p_selected_paths TEXT[]
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.share_links%ROWTYPE;
  v_folder_clean TEXT;
  v_folder_prefix TEXT;
  v_valid_paths TEXT[] := ARRAY[]::TEXT[];
  v_raw_path TEXT;
  v_path TEXT;
  v_task_id UUID := NULL;
  v_clean_name TEXT;
  v_selected_count INTEGER := 0;
  v_fname TEXT;
  v_mime TEXT;
BEGIN
  SELECT * INTO v_link FROM public.share_links
  WHERE token = btrim(p_token) AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link de compartilhamento inválido ou expirado.');
  END IF;
  IF v_link.mode <> 'proofing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este link está configurado apenas para visualização.');
  END IF;

  v_folder_clean := regexp_replace(btrim(COALESCE(v_link.folder_path, '')), '^/+|/+$', '', 'g');
  IF v_folder_clean = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escopo de pasta compartilhada inválido.');
  END IF;
  v_folder_prefix := v_folder_clean || '/';

  IF p_selected_paths IS NOT NULL THEN
    FOREACH v_raw_path IN ARRAY p_selected_paths LOOP
      v_path := regexp_replace(btrim(COALESCE(v_raw_path, '')), '^/+|/+$', '', 'g');
      IF v_path = ''
         OR position('..' in v_path) > 0
         OR position('\' in v_path) > 0
         OR left(v_path, char_length(v_folder_prefix)) <> v_folder_prefix
      THEN
        RETURN jsonb_build_object('success', false, 'error', 'Caminho selecionado fora do escopo da pasta compartilhada.');
      END IF;
      IF NOT (v_path = ANY(v_valid_paths)) THEN
        v_valid_paths := array_append(v_valid_paths, v_path);
      END IF;
    END LOOP;
  END IF;

  v_clean_name := COALESCE(NULLIF(btrim(p_client_name), ''), 'Cliente');
  v_selected_count := COALESCE(array_length(v_valid_paths, 1), 0);

  IF v_link.auto_create_task THEN
    IF v_link.created_task_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tasks WHERE id = v_link.created_task_id) THEN
      v_task_id := v_link.created_task_id;
      UPDATE public.tasks
      SET
        nome = format('Seleção aprovada: %s (%s arquivos — %s)', v_link.album_title, v_selected_count, v_clean_name),
        descricao = concat_ws(E'\n\n',
          format('Álbum compartilhado: %s (%s)', v_link.album_title, v_folder_clean),
          CASE WHEN NULLIF(btrim(p_client_feedback), '') IS NOT NULL THEN format('Feedback de %s: %s', v_clean_name, btrim(p_client_feedback)) ELSE NULL END,
          format('Arquivos aprovados (%s): %s', v_selected_count, array_to_string(v_valid_paths, ', '))
        ),
        status = 'não iniciada'
      WHERE id = v_task_id;
    ELSE
      INSERT INTO public.tasks (
        nome, status, prioridade, categoria, dimensao, descricao, ordem_manual, user_id, is_personal, is_favorite
      ) VALUES (
        format('Seleção aprovada: %s (%s arquivos — %s)', v_link.album_title, v_selected_count, v_clean_name),
        'não iniciada', 'Alta', 'Portfólio', 'Pessoal',
        concat_ws(E'\n\n',
          format('Álbum compartilhado: %s (%s)', v_link.album_title, v_folder_clean),
          CASE WHEN NULLIF(btrim(p_client_feedback), '') IS NOT NULL THEN format('Feedback de %s: %s', v_clean_name, btrim(p_client_feedback)) ELSE NULL END,
          format('Arquivos aprovados (%s): %s', v_selected_count, array_to_string(v_valid_paths, ', '))
        ),
        0, v_link.user_id, true, true
      ) RETURNING id INTO v_task_id;
    END IF;

    IF v_task_id IS NOT NULL AND v_selected_count > 0 THEN
      FOREACH v_path IN ARRAY v_valid_paths LOOP
        v_fname := regexp_replace(v_path, '^.*/', '');
        v_mime := CASE
          WHEN lower(v_fname) ~ '\.(png)$' THEN 'image/png'
          WHEN lower(v_fname) ~ '\.(webp)$' THEN 'image/webp'
          WHEN lower(v_fname) ~ '\.(avif)$' THEN 'image/avif'
          WHEN lower(v_fname) ~ '\.(gif)$' THEN 'image/gif'
          WHEN lower(v_fname) ~ '\.(pdf)$' THEN 'application/pdf'
          WHEN lower(v_fname) ~ '\.(mp4)$' THEN 'video/mp4'
          WHEN lower(v_fname) ~ '\.(mov)$' THEN 'video/quicktime'
          ELSE 'image/jpeg'
        END;
        INSERT INTO public.user_files_index (
          user_id, relative_path, filename, mime_type, linked_task_id, linked_task_ids
        ) VALUES (
          v_link.user_id, v_path, COALESCE(NULLIF(v_fname, ''), 'arquivo'), v_mime, v_task_id, ARRAY[v_task_id]
        )
        ON CONFLICT (user_id, relative_path) DO UPDATE
        SET
          mime_type = EXCLUDED.mime_type,
          linked_task_id = COALESCE(public.user_files_index.linked_task_id, v_task_id),
          linked_task_ids = array_append(array_remove(public.user_files_index.linked_task_ids, v_task_id), v_task_id);
      END LOOP;
    END IF;
  END IF;

  UPDATE public.share_links
  SET
    client_name = v_clean_name,
    client_feedback = NULLIF(btrim(p_client_feedback), ''),
    selected_file_paths = v_valid_paths,
    created_task_id = v_task_id,
    is_submitted = true,
    submitted_at = timezone('utc'::text, now())
  WHERE id = v_link.id;

  RETURN jsonb_build_object('success', true, 'selectedCount', v_selected_count, 'createdTaskId', v_task_id);
END;
$$;
