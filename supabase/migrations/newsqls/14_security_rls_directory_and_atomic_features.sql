-- Este programa é um software livre (Licença AGPLv3)
-- ARQUIVO: supabase/migrations/newsqls/14_security_rls_directory_and_atomic_features.sql
-- MIGRATION 14 (Onda 1): Blindagem de RLS (user_profiles + user_private_secrets),
-- diretório seguro de membros (get_org_member_directory), merge atômico JSONB,
-- anti-escalação em organization_members e hardening criptográfico de /s/[token].

BEGIN;

-- 1. Extensão pgcrypto para hash/validação bcrypt de PIN no Postgres
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Segredos privados de autenticação/vinculação HUB (service_role only)
CREATE TABLE IF NOT EXISTS public.user_private_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hub_user_id TEXT,
  linked_email TEXT,
  encrypted_link_secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_private_secrets_hub_user_id
  ON public.user_private_secrets(hub_user_id)
  WHERE hub_user_id IS NOT NULL;

ALTER TABLE public.user_private_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_private_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_private_secrets TO service_role;

-- Backfill seguro dos segredos existentes em user_profiles.features_config->hub_connection
INSERT INTO public.user_private_secrets (user_id, hub_user_id, linked_email, encrypted_link_secret, updated_at)
SELECT
  up.id,
  NULLIF(btrim(up.features_config->'hub_connection'->>'hub_user_id'), ''),
  NULLIF(btrim(up.features_config->'hub_connection'->>'linked_email'), ''),
  NULLIF(btrim(up.features_config->'hub_connection'->>'encrypted_link_secret'), ''),
  timezone('utc'::text, now())
FROM public.user_profiles up
WHERE up.features_config IS NOT NULL
  AND jsonb_typeof(up.features_config->'hub_connection') = 'object'
  AND (
    (up.features_config->'hub_connection') ? 'encrypted_link_secret'
    OR (up.features_config->'hub_connection') ? 'hub_user_id'
  )
ON CONFLICT (user_id) DO UPDATE
SET
  hub_user_id = COALESCE(EXCLUDED.hub_user_id, public.user_private_secrets.hub_user_id),
  linked_email = COALESCE(EXCLUDED.linked_email, public.user_private_secrets.linked_email),
  encrypted_link_secret = COALESCE(EXCLUDED.encrypted_link_secret, public.user_private_secrets.encrypted_link_secret),
  updated_at = timezone('utc'::text, now());

-- Remove encrypted_link_secret do JSON público de perfil
UPDATE public.user_profiles
SET features_config = jsonb_set(
  features_config,
  '{hub_connection}',
  (features_config->'hub_connection') - 'encrypted_link_secret',
  false
)
WHERE features_config IS NOT NULL
  AND jsonb_typeof(features_config->'hub_connection') = 'object'
  AND (features_config->'hub_connection') ? 'encrypted_link_secret';

-- 3. Coluna canônica de nick exibível (display_name) e RLS estrita de user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE public.user_profiles up
SET display_name = COALESCE(
  NULLIF(btrim(up.display_name), ''),
  NULLIF(btrim(to_jsonb(up)->>'full_name'), ''),
  NULLIF(btrim(au.raw_user_meta_data->>'full_name'), ''),
  NULLIF(btrim(au.raw_user_meta_data->>'name'), ''),
  NULLIF(btrim(up.username), '')
)
FROM auth.users au
WHERE au.id = up.id
  AND (up.display_name IS NULL OR btrim(up.display_name) = '');

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for user profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 4. RPC segura de diretório de colegas de organização (sem expor features_config nem segredos)
CREATE OR REPLACE FUNCTION public.get_org_member_directory(p_org_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_org_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_org_member(p_org_id)
    OR v_uid = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(
      NULLIF(btrim(up.display_name), ''),
      NULLIF(btrim(to_jsonb(up)->>'full_name'), ''),
      NULLIF(btrim(au.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(au.raw_user_meta_data->>'name'), ''),
      NULLIF(btrim(om.full_name), ''),
      NULLIF(btrim(up.username), '')
    ) AS display_name,
    up.username,
    COALESCE(
      NULLIF(btrim(to_jsonb(up)->>'avatar_url'), ''),
      NULLIF(btrim(au.raw_user_meta_data->>'avatar_url'), ''),
      NULLIF(btrim(au.raw_user_meta_data->>'picture'), ''),
      NULLIF(btrim(to_jsonb(om)->>'avatar_url'), '')
    ) AS avatar_url
  FROM public.organization_members om
  LEFT JOIN public.user_profiles up ON up.id = om.user_id
  LEFT JOIN auth.users au ON au.id = om.user_id
  WHERE om.organization_id = p_org_id
    AND om.user_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_member_directory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_member_directory(UUID) TO authenticated, service_role;

-- 5. RPC sanitizada resolve_public_creator_profile (remove hub_connection, notifications, advanced_settings, etc.)
CREATE OR REPLACE FUNCTION public.resolve_public_creator_profile(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT := lower(btrim(COALESCE(p_slug, '')));
  v_user_id UUID;
  v_public_slug TEXT;
  v_profile_row RECORD;
  v_raw_json JSONB;
  v_fc JSONB;
  v_safe_fc JSONB := '{}'::jsonb;
  v_allowed_keys TEXT[] := ARRAY[
    'active',
    'order',
    'layout_style',
    'labels',
    'custom_links',
    'theme',
    'portfolio_sections',
    'hidden_photo_ids',
    'hidden_photo_folders',
    'press_clippings',
    'instagram_embeds',
    'gallery_iframe_url',
    'portfolio_album_order',
    'portfolio_subfolder_order'
  ];
  v_k TEXT;
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'userId', v_user_id,
      'publicSlug', v_public_slug,
      'userProfile', NULL
    );
  END IF;

  v_raw_json := to_jsonb(v_profile_row);
  v_fc := COALESCE(v_raw_json->'features_config', '{}'::jsonb);
  IF jsonb_typeof(v_fc) <> 'object' THEN
    v_fc := '{}'::jsonb;
  END IF;

  FOREACH v_k IN ARRAY v_allowed_keys LOOP
    IF v_fc ? v_k THEN
      v_safe_fc := v_safe_fc || jsonb_build_object(v_k, v_fc->v_k);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'userId', v_user_id,
    'publicSlug', v_public_slug,
    'userProfile', jsonb_build_object(
      'id', v_profile_row.id,
      'username', v_profile_row.username,
      'display_name', COALESCE(NULLIF(btrim(v_raw_json->>'display_name'), ''), NULLIF(btrim(v_raw_json->>'full_name'), ''), v_profile_row.username),
      'full_name', v_raw_json->>'full_name',
      'avatar_url', v_raw_json->>'avatar_url',
      'resumo', v_raw_json->'resumo',
      'curriculo', COALESCE(v_raw_json->'curriculo', '[]'::jsonb),
      'portfolio', COALESCE(v_raw_json->'portfolio', '[]'::jsonb),
      'features_config', v_safe_fc
    )
  );
END;
$$;

-- 6. Merge atômico JSONB para user_profiles.features_config (cria linha se ainda não existir)
CREATE OR REPLACE FUNCTION public.merge_user_features_config(p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_patch JSONB := COALESCE(p_patch, '{}'::jsonb);
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.';
  END IF;

  IF jsonb_typeof(v_patch) <> 'object' THEN
    RAISE EXCEPTION 'Patch de configuração inválido.';
  END IF;

  -- Defesa em profundidade: impede gravação de encrypted_link_secret em features_config
  IF (v_patch ? 'hub_connection') AND jsonb_typeof(v_patch->'hub_connection') = 'object' THEN
    v_patch := jsonb_set(
      v_patch,
      '{hub_connection}',
      (v_patch->'hub_connection') - 'encrypted_link_secret',
      false
    );
  END IF;

  INSERT INTO public.user_profiles (id, features_config)
  VALUES (v_uid, v_patch)
  ON CONFLICT (id) DO UPDATE
  SET features_config = COALESCE(public.user_profiles.features_config, '{}'::jsonb) || v_patch
  RETURNING features_config INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_user_features_config(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_user_features_config(JSONB) TO authenticated, service_role;

-- 7. Blindagem de privilégios em organization_members e revogação de ensure_sso_member
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_sso_member'
  ) THEN
    REVOKE ALL ON FUNCTION public.ensure_sso_member(UUID, TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ensure_sso_member(UUID, TEXT) TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_org_member_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR v_jwt_role = 'service_role'
     OR auth.uid() IS NULL
     OR auth.uid() = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid
     OR public.is_org_admin(OLD.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.org_role IS DISTINCT FROM OLD.org_role
     OR NEW.can_upload_org_vault IS DISTINCT FROM OLD.can_upload_org_vault
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Sem permissão para alterar privilégios ou vínculo de membro da organização.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_org_member_privileges ON public.organization_members;
CREATE TRIGGER trg_protect_org_member_privileges
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_member_privileges();

-- 8. Blindagem completa de /s/[token]: revogação das 3 RPCs antigas + bcrypt no Postgres + brute-force lock
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_share_link_by_token_internal'
  ) THEN
    REVOKE ALL ON FUNCTION public.get_share_link_by_token_internal(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_share_link_by_token_internal(TEXT) TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_share_link_files_by_token'
  ) THEN
    REVOKE ALL ON FUNCTION public.get_share_link_files_by_token(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_share_link_files_by_token(TEXT) TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_client_proofing_selection'
  ) THEN
    REVOKE ALL ON FUNCTION public.submit_client_proofing_selection(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.submit_client_proofing_selection(TEXT, TEXT, TEXT, TEXT[]) TO service_role;
  END IF;
END $$;

ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS pin_pg_hash TEXT,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_share_link_pin_pg_hash(p_share_id UUID, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_pin TEXT := NULLIF(btrim(COALESCE(p_pin, '')), '');
  v_jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF current_setting('role', true) <> 'service_role' AND v_jwt_role <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.id = p_share_id AND (
        sl.user_id = auth.uid() OR (
          sl.organization_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = sl.organization_id
              AND om.user_id = auth.uid()
              AND om.org_role IN ('admin', 'owner')
          )
        )
      )
    ) THEN
      RAISE EXCEPTION 'Sem permissão para atualizar PIN deste compartilhamento.';
    END IF;
  END IF;

  UPDATE public.share_links
  SET
    pin_pg_hash = CASE
      WHEN v_clean_pin IS NULL THEN NULL
      ELSE extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 10))
    END,
    pin_hash = CASE
      WHEN v_clean_pin IS NULL THEN NULL
      ELSE pin_hash
    END,
    failed_pin_attempts = 0,
    pin_locked_until = NULL
  WHERE id = p_share_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_share_link_pin_pg_hash(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_share_link_pin_pg_hash(UUID, TEXT) TO authenticated, service_role;

-- Metadados públicos seguros para SSR (/s/[token] — nunca retorna pin_hash ou pin_pg_hash)
CREATE OR REPLACE FUNCTION public.get_share_link_public_meta(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean TEXT := btrim(COALESCE(p_token, ''));
  v_link public.share_links%ROWTYPE;
  v_org RECORD;
  v_up_json JSONB;
  v_meta JSONB;
  v_creator_name TEXT;
  v_creator_avatar TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_link
  FROM public.share_links
  WHERE token = v_clean
    AND (expires_at IS NULL OR expires_at > v_now)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_link.organization_id IS NOT NULL THEN
    SELECT o.slug, o.name, o.avatar_url INTO v_org
    FROM public.organizations o
    WHERE o.id = v_link.organization_id
    LIMIT 1;
  END IF;

  SELECT to_jsonb(up) INTO v_up_json
  FROM public.user_profiles up
  WHERE up.id = v_link.user_id
  LIMIT 1;

  SELECT au.raw_user_meta_data INTO v_meta
  FROM auth.users au
  WHERE au.id = v_link.user_id
  LIMIT 1;

  v_creator_name := COALESCE(
    NULLIF(btrim(v_org.name), ''),
    NULLIF(btrim(v_up_json->>'display_name'), ''),
    NULLIF(btrim(v_meta->>'full_name'), ''),
    NULLIF(btrim(v_meta->>'name'), ''),
    NULLIF(btrim(v_up_json->>'full_name'), ''),
    NULLIF(btrim(v_up_json->>'username'), ''),
    'Acervo Compartilhado'
  );

  v_creator_avatar := COALESCE(
    NULLIF(btrim(v_org.avatar_url), ''),
    NULLIF(btrim(v_meta->>'avatar_url'), ''),
    NULLIF(btrim(v_meta->>'picture'), ''),
    NULLIF(btrim(v_up_json->>'avatar_url'), ''),
    CASE
      WHEN v_link.user_id = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid
           AND COALESCE((v_up_json->'features_config'->'advanced_settings'->>'sync_curriculum_photo')::boolean, true)
      THEN '/perfil.jpeg'
      ELSE NULL
    END
  );

  RETURN jsonb_build_object(
    'found', true,
    'id', v_link.id,
    'album_title', v_link.album_title,
    'folder_path', v_link.folder_path,
    'mode', v_link.mode,
    'allow_download', v_link.allow_download,
    'has_pin', (v_link.pin_pg_hash IS NOT NULL OR v_link.pin_hash IS NOT NULL),
    'pin_legacy_only', (v_link.pin_hash IS NOT NULL AND v_link.pin_pg_hash IS NULL),
    'is_locked_out', (v_link.pin_locked_until IS NOT NULL AND v_link.pin_locked_until > v_now),
    'locked_until', v_link.pin_locked_until,
    'expires_at', v_link.expires_at,
    'organization_id', v_link.organization_id,
    'org_slug', v_org.slug,
    'org_name', v_org.name,
    'org_avatar_url', v_org.avatar_url,
    'creator_display_name', v_creator_name,
    'creator_avatar_url', v_creator_avatar,
    'is_submitted', v_link.is_submitted,
    'submitted_at', v_link.submitted_at,
    'selected_file_paths', COALESCE(to_jsonb(v_link.selected_file_paths), '[]'::jsonb),
    'client_name', v_link.client_name,
    'client_feedback', v_link.client_feedback
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_share_link_public_meta(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_link_public_meta(TEXT) TO anon, authenticated, service_role;

-- Helper interno compartilhado para verificação de PIN + brute-force lock
CREATE OR REPLACE FUNCTION public._verify_and_track_share_link_pin(p_link_id UUID, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.share_links%ROWTYPE;
  v_clean_pin TEXT := NULLIF(btrim(COALESCE(p_pin, '')), '');
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
  v_is_service BOOLEAN := (current_setting('role', true) = 'service_role' OR v_jwt_role = 'service_role');
  v_attempts INT;
  v_wait_secs INT;
BEGIN
  SELECT * INTO v_link FROM public.share_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Link de compartilhamento inválido ou expirado.');
  END IF;

  -- Trava anti-brute-force no banco
  IF v_link.pin_locked_until IS NOT NULL AND v_link.pin_locked_until > v_now THEN
    v_wait_secs := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_link.pin_locked_until - v_now)))::INT);
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'LOCKED',
      'lockedUntil', v_link.pin_locked_until,
      'waitSeconds', v_wait_secs,
      'error', format('Muitas tentativas incorretas. Aguarde %ss antes de tentar novamente.', v_wait_secs)
    );
  END IF;

  -- Caso 1: Link aberto (sem PIN)
  IF v_link.pin_hash IS NULL AND v_link.pin_pg_hash IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'pinMode', 'open');
  END IF;

  -- Caso 2: PIN moderno em bcrypt (pin_pg_hash)
  IF v_link.pin_pg_hash IS NOT NULL THEN
    IF v_clean_pin IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PIN_REQUIRED', 'error', 'Digite o PIN de acesso fornecido pelo criador.');
    END IF;

    IF extensions.crypt(v_clean_pin, v_link.pin_pg_hash) = v_link.pin_pg_hash THEN
      UPDATE public.share_links
      SET failed_pin_attempts = 0, pin_locked_until = NULL
      WHERE id = v_link.id;
      RETURN jsonb_build_object('ok', true, 'pinMode', 'bcrypt');
    END IF;

    v_attempts := COALESCE(v_link.failed_pin_attempts, 0) + 1;
    IF v_attempts >= 5 THEN
      UPDATE public.share_links
      SET failed_pin_attempts = 0, pin_locked_until = v_now + interval '60 seconds'
      WHERE id = v_link.id;
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'LOCKED',
        'lockedUntil', v_now + interval '60 seconds',
        'waitSeconds', 60,
        'error', '5 tentativas incorretas. Bloqueado temporariamente por 60 segundos.'
      );
    ELSE
      UPDATE public.share_links
      SET failed_pin_attempts = v_attempts
      WHERE id = v_link.id;
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INVALID_PIN',
        'attemptsRemaining', 5 - v_attempts,
        'error', 'PIN incorreto. Verifique os dígitos e tente novamente.'
      );
    END IF;
  END IF;

  -- Caso 3: Link legado (apenas pin_hash scrypt) -> fail-closed fora do service_role
  IF NOT v_is_service THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PIN_LEGACY_SERVICE_REQUIRED',
      'error', 'Este link usa proteção legada e requer validação segura no servidor (service_role).'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'pinMode', 'legacy_service');
END;
$$;

REVOKE ALL ON FUNCTION public._verify_and_track_share_link_pin(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_and_track_share_link_pin(UUID, TEXT) TO service_role;

-- Listagem protegida por PIN/escopo org ou pessoal
CREATE OR REPLACE FUNCTION public.unlock_and_list_share_link(p_token TEXT, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.share_links%ROWTYPE;
  v_pin_res JSONB;
  v_folder_clean TEXT;
  v_folder_prefix TEXT;
  v_org_slug TEXT;
  v_files JSONB;
BEGIN
  SELECT * INTO v_link
  FROM public.share_links
  WHERE token = btrim(COALESCE(p_token, ''))
    AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Link de prova inválido ou expirado.');
  END IF;

  v_pin_res := public._verify_and_track_share_link_pin(v_link.id, p_pin);
  IF NOT COALESCE((v_pin_res->>'ok')::boolean, false) THEN
    RETURN v_pin_res;
  END IF;

  v_folder_clean := regexp_replace(btrim(COALESCE(v_link.folder_path, '')), '^/+|/+$', '', 'g');
  IF v_folder_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SCOPE', 'error', 'Pasta compartilhada inválida.');
  END IF;
  v_folder_prefix := v_folder_clean || '/';

  IF v_link.organization_id IS NOT NULL THEN
    SELECT slug INTO v_org_slug FROM public.organizations WHERE id = v_link.organization_id LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb) INTO v_files
  FROM (
    SELECT *
    FROM public.user_files_index ufi
    WHERE (
        (v_link.organization_id IS NOT NULL AND ufi.organization_id = v_link.organization_id)
        OR
        (v_link.organization_id IS NULL AND ufi.user_id = v_link.user_id AND ufi.organization_id IS NULL)
      )
      AND (ufi.relative_path = v_folder_clean OR left(ufi.relative_path, char_length(v_folder_prefix)) = v_folder_prefix)
      AND ufi.is_directory = false
    ORDER BY ufi.display_order ASC, ufi.filename ASC
  ) f;

  RETURN jsonb_build_object(
    'ok', true,
    'link', jsonb_build_object(
      'id', v_link.id,
      'user_id', v_link.user_id,
      'organization_id', v_link.organization_id,
      'org_slug', v_org_slug,
      'folder_path', v_link.folder_path,
      'album_title', v_link.album_title,
      'mode', v_link.mode,
      'allow_download', v_link.allow_download,
      'expires_at', v_link.expires_at
    ),
    'files', v_files
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_and_list_share_link(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_and_list_share_link(TEXT, TEXT) TO anon, authenticated, service_role;

-- Submissão protegida por PIN dentro do próprio SQL
CREATE OR REPLACE FUNCTION public.submit_client_proofing_selection_v2(
  p_token TEXT,
  p_pin TEXT,
  p_client_name TEXT,
  p_client_feedback TEXT,
  p_selected_paths TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.share_links%ROWTYPE;
  v_pin_res JSONB;
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
  SELECT * INTO v_link
  FROM public.share_links
  WHERE token = btrim(COALESCE(p_token, ''))
    AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Link de compartilhamento inválido ou expirado.');
  END IF;

  v_pin_res := public._verify_and_track_share_link_pin(v_link.id, p_pin);
  IF NOT COALESCE((v_pin_res->>'ok')::boolean, false) THEN
    RETURN v_pin_res || jsonb_build_object('success', false);
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
        nome, status, prioridade, categoria, dimensao, descricao, ordem_manual, user_id, organization_id, is_personal, is_favorite
      ) VALUES (
        format('Seleção aprovada: %s (%s arquivos — %s)', v_link.album_title, v_selected_count, v_clean_name),
        'não iniciada',
        'Alta',
        'Portfólio',
        CASE WHEN v_link.organization_id IS NOT NULL THEN 'LabDiv' ELSE 'Pessoal' END,
        concat_ws(E'\n\n',
          format('Álbum compartilhado: %s (%s)', v_link.album_title, v_folder_clean),
          CASE WHEN NULLIF(btrim(p_client_feedback), '') IS NOT NULL THEN format('Feedback de %s: %s', v_clean_name, btrim(p_client_feedback)) ELSE NULL END,
          format('Arquivos aprovados (%s): %s', v_selected_count, array_to_string(v_valid_paths, ', '))
        ),
        0,
        v_link.user_id,
        v_link.organization_id,
        (v_link.organization_id IS NULL),
        true
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
          user_id, organization_id, relative_path, filename, mime_type, linked_task_id, linked_task_ids
        ) VALUES (
          v_link.user_id, v_link.organization_id, v_path, COALESCE(NULLIF(v_fname, ''), 'arquivo'), v_mime, v_task_id, ARRAY[v_task_id]
        )
        ON CONFLICT (vault_scope_key, relative_path) DO UPDATE
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

REVOKE ALL ON FUNCTION public.submit_client_proofing_selection_v2(TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_client_proofing_selection_v2(TEXT, TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated, service_role;


-- A6 (Passo 0 Onda 1): Blindagem da coluna `role` em user_profiles contra auto-promoção
-- Trigger garante que usuários authenticated não conseguem alterar o próprio campo role
-- Condicionar trigger à existência da coluna 'role' em user_profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'role'
  ) THEN
    CREATE OR REPLACE FUNCTION public.protect_user_profile_role()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
    BEGIN
      -- Bypass para chamadas sem contexto de autenticacao (ex: migracoes internas)
      IF auth.uid() IS NULL THEN
        RETURN NEW;
      END IF;
      -- Permite service_role alterar role livremente (admin do sistema)
      IF current_setting('role', true) = 'service_role' OR v_jwt_role = 'service_role' THEN
        RETURN NEW;
      END IF;
      -- Bloqueia qualquer tentativa de authenticated mudar a propria role
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Sem permissão para alterar o campo role do perfil de usuário.';
      END IF;
      RETURN NEW;
    END;
    $func$;

    DROP TRIGGER IF EXISTS trg_protect_user_profile_role ON public.user_profiles;
    CREATE TRIGGER trg_protect_user_profile_role
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_user_profile_role();
  END IF;
END $$;

COMMIT;
