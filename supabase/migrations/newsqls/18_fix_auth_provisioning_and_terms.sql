-- Este programa é um software livre (Licença AGPLv3)
-- MIGRATION 18: Correção definitiva do provisionamento de novos usuários,
-- blindagem de aceite de Termos/Privacidade e RPC service_role-only para login em 2 etapas.

BEGIN;

-- 1. Garantir colunas necessárias em public.user_profiles (schema canônico com PK `id`)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS features_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_version TEXT;

-- 2. Remover triggers duplicadas em auth.users e consolidar provisionamento único e idempotente
DROP TRIGGER IF EXISTS on_auth_user_created_storage ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_provisioning ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_auth_user_provisioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_primary_admin BOOLEAN := (NEW.id = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid);
  v_raw_username TEXT;
  v_base_username TEXT;
  v_username TEXT;
  v_display_name TEXT;
  v_terms_version TEXT;
  v_privacy_version TEXT;
  v_terms_accepted_at TIMESTAMPTZ;
  v_default_features JSONB;
  v_slug_raw TEXT;
  v_public_slug TEXT;
  v_default_quota BIGINT := 26843545600;
  v_require_approval BOOLEAN := false;
BEGIN
  v_raw_username := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'user'
  );

  v_base_username := COALESCE(
    NULLIF(trim(both '-' from regexp_replace(lower(v_raw_username), '[^a-z0-9._-]+', '', 'g')), ''),
    'user'
  );

  IF EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE username = v_base_username
      AND id <> NEW.id
  ) THEN
    v_username := v_base_username || '-' || substr(NEW.id::text, 1, 6);
  ELSE
    v_username := v_base_username;
  END IF;

  v_display_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    v_username
  );

  -- Segurança: nunca fazer cast de timestamp vindo de raw_user_meta_data;
  -- grava timezone('utc'::text, now()) apenas quando terms_version estiver presente (SSO pode vir NULL).
  v_terms_version := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'terms_version', '')), '');
  v_privacy_version := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'privacy_version', '')), '');
  v_terms_accepted_at := CASE
    WHEN v_terms_version IS NOT NULL THEN timezone('utc'::text, now())
    ELSE NULL
  END;

  v_default_features := jsonb_build_object(
    'active', jsonb_build_array('tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'),
    'order', jsonb_build_array('tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'),
    'layout_style', 'default',
    'selfCare', jsonb_build_object(
      'version', 2,
      'enabled', true,
      'sound', 'chime',
      'soundEnabled', true,
      'visualEnabled', true,
      'dnd', jsonb_build_object(
        'enabled', true,
        'start', '22:00',
        'end', '07:00'
      ),
      'reminders', jsonb_build_object(
        'water', jsonb_build_object('enabled', false, 'intervalMinutes', 45, 'targetPerDay', 8),
        'posture', jsonb_build_object('enabled', false, 'intervalMinutes', 60),
        'stretch', jsonb_build_object('enabled', false, 'intervalMinutes', 90),
        'eyeRest', jsonb_build_object('enabled', false, 'intervalMinutes', 20),
        'meals', jsonb_build_object('enabled', false, 'intervalMinutes', 240, 'targetPerDay', 4),
        'medication', jsonb_build_object('enabled', false, 'times', jsonb_build_array('08:00', '20:00')),
        'breathing', jsonb_build_object('enabled', false, 'intervalMinutes', 120),
        'sleep', jsonb_build_object('enabled', false, 'bedtime', '23:00', 'wakeTime', '07:00')
      )
    ),
    'modules', jsonb_build_object(
      'quickLinks', true,
      'quickFilters', true,
      'selfCareHub', true,
      'agendaIntegrada', true,
      'galeriaPortfolio', true,
      'curriculoProfissional', true,
      'servidorCofre', true
    ),
    'theme', jsonb_build_object(
      'palette', 'purple-gold',
      'mode', 'dark'
    ),
    'onboarding_completed_at', timezone('utc'::text, now())
  );

  -- Upsert na tabela real public.user_profiles (PK id = auth.users.id)
  INSERT INTO public.user_profiles (
    id,
    username,
    display_name,
    features_config,
    terms_accepted_at,
    terms_version,
    privacy_version,
    created_at
  ) VALUES (
    NEW.id,
    v_username,
    v_display_name,
    v_default_features,
    v_terms_accepted_at,
    v_terms_version,
    v_privacy_version,
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(public.user_profiles.username, EXCLUDED.username),
    display_name = COALESCE(NULLIF(btrim(public.user_profiles.display_name), ''), EXCLUDED.display_name),
    features_config = COALESCE(public.user_profiles.features_config, EXCLUDED.features_config),
    terms_accepted_at = COALESCE(public.user_profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    terms_version = COALESCE(public.user_profiles.terms_version, EXCLUDED.terms_version),
    privacy_version = COALESCE(public.user_profiles.privacy_version, EXCLUDED.privacy_version);

  -- Blindagem de public_slug (nunca NULL, nunca vazio, nunca colide UNIQUE)
  v_slug_raw := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'slug'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );
  v_public_slug := COALESCE(
    NULLIF(trim(both '-' from regexp_replace(lower(COALESCE(v_slug_raw, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'user'
  ) || '-' || substr(NEW.id::text, 1, 6);

  SELECT COALESCE(default_quota_bytes, 26843545600), COALESCE(require_admin_approval, false)
  INTO v_default_quota, v_require_approval
  FROM public.storage_global_settings
  WHERE id = 1;

  INSERT INTO public.user_storage_profiles (
    user_id,
    root_folder_slug,
    public_slug,
    storage_role,
    approval_status,
    approved_at,
    quota_limit_bytes,
    used_bytes,
    pinned_folders,
    preferences,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.id::text,
    v_public_slug,
    CASE WHEN v_is_primary_admin THEN 'admin' ELSE 'member' END,
    CASE WHEN v_is_primary_admin OR NOT v_require_approval THEN 'approved' ELSE 'pending' END,
    CASE WHEN v_is_primary_admin OR NOT v_require_approval THEN timezone('utc'::text, now()) ELSE NULL END,
    CASE WHEN v_is_primary_admin THEN 536870912000 ELSE COALESCE(v_default_quota, 26843545600) END,
    0,
    ARRAY[]::TEXT[],
    jsonb_build_object('defaultView', 'grid', 'reducedMotion', true),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_provisioning
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_provisioning();

-- 3. Trigger BEFORE UPDATE em public.user_profiles para impedir alteração indevida de aceite de termos
CREATE OR REPLACE FUNCTION public.protect_user_profile_terms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('role', true) = 'service_role' OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.terms_accepted_at IS NOT NULL AND (
    NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at OR
    NEW.terms_version IS DISTINCT FROM OLD.terms_version OR
    NEW.privacy_version IS DISTINCT FROM OLD.privacy_version
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o registro de aceite de termos do perfil.';
  END IF;

  IF OLD.terms_accepted_at IS NULL AND NEW.terms_version IS NOT NULL THEN
    NEW.terms_accepted_at := timezone('utc'::text, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_profile_terms ON public.user_profiles;
CREATE TRIGGER trg_protect_user_profile_terms
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_profile_terms();

-- 4. RPC segura para checagem de existência no fluxo unificado em 2 etapas (service_role ONLY)
CREATE OR REPLACE FUNCTION public.check_auth_identifier_exists(p_identifier TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean TEXT;
  v_sanitized TEXT;
  v_email TEXT;
BEGIN
  v_clean := btrim(COALESCE(p_identifier, ''));
  IF v_clean = '' THEN
    RETURN FALSE;
  END IF;

  IF left(v_clean, 1) = '@' AND position('@' in substr(v_clean, 2)) = 0 THEN
    v_clean := substr(v_clean, 2);
  END IF;

  IF position('@' in v_clean) > 0 THEN
    v_email := lower(v_clean);
  ELSE
    v_sanitized := regexp_replace(lower(v_clean), '[^a-z0-9._-]+', '', 'g');
    IF v_sanitized = '' THEN
      RETURN FALSE;
    END IF;
    v_email := v_sanitized || '@aurtistic.local';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = v_email
      AND deleted_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_identifier_exists(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_auth_identifier_exists(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.check_auth_identifier_exists(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_identifier_exists(TEXT) TO service_role;

COMMIT;
