-- Este programa é um software livre (Licença AGPLv3)
-- ARQUIVO: supabase/migrations/newsqls/07_atomic_cascades_and_auth_provisioning.sql
-- MIGRATION: Cascata Atômica no PostgreSQL, Provisionamento de Contas e RPC Administrativa

BEGIN;

-- ============================================================================
-- 1. CASCATA ATÔMICA DE EXCLUSÃO DE ARQUIVOS/PASTAS NO POSTGRESQL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_file_cascade(
  p_target_path TEXT,
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted_count INT := 0;
  v_freed_bytes BIGINT := 0;
  v_path_prefix TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado.';
  END IF;

  p_target_path := trim(both '/' from p_target_path);
  v_path_prefix := p_target_path || '/%';

  IF p_organization_id IS NOT NULL THEN
    -- Validação de escrita no Org Vault
    IF NOT public.can_write_org_vault(p_organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para excluir arquivos neste cofre organizacional.';
    END IF;

    -- Soma bytes a liberar
    SELECT COALESCE(SUM(size_bytes), 0)
    INTO v_freed_bytes
    FROM public.user_files_index
    WHERE organization_id = p_organization_id
      AND (relative_path = p_target_path OR relative_path LIKE v_path_prefix);

    -- Remove arquivos do índice
    DELETE FROM public.user_files_index
    WHERE organization_id = p_organization_id
      AND (relative_path = p_target_path OR relative_path LIKE v_path_prefix);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Remove links públicos vinculados
    DELETE FROM public.share_links
    WHERE organization_id = p_organization_id
      AND (target_path = p_target_path OR target_path LIKE v_path_prefix);

    -- Recalcula quota da organização
    PERFORM public.recalc_org_vault_used_bytes(p_organization_id);
  ELSE
    -- Soma bytes a liberar do cofre pessoal
    SELECT COALESCE(SUM(size_bytes), 0)
    INTO v_freed_bytes
    FROM public.user_files_index
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND (relative_path = p_target_path OR relative_path LIKE v_path_prefix);

    -- Remove arquivos do índice do usuário
    DELETE FROM public.user_files_index
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND (relative_path = p_target_path OR relative_path LIKE v_path_prefix);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Remove links públicos vinculados
    DELETE FROM public.share_links
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND (target_path = p_target_path OR target_path LIKE v_path_prefix);

    -- Remove pasta dos favoritos pinned_folders preservando a ordem original
    UPDATE public.user_storage_profiles
    SET pinned_folders = ARRAY(
      SELECT elem
      FROM unnest(pinned_folders) WITH ORDINALITY AS t(elem, ord)
      WHERE elem <> p_target_path AND elem NOT LIKE v_path_prefix
      ORDER BY ord ASC
    ),
    updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id;

    -- Atualiza used_bytes no perfil pessoal
    UPDATE public.user_storage_profiles
    SET used_bytes = GREATEST(0, COALESCE(used_bytes, 0) - v_freed_bytes),
        updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'freed_bytes', v_freed_bytes,
    'target_path', p_target_path
  );
END;
$$;

-- ============================================================================
-- 2. CASCATA ATÔMICA DE RENOMEAÇÃO/MOVIMENTAÇÃO NO POSTGRESQL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cascade_rename_user_files_index(
  p_old_path TEXT,
  p_new_path TEXT,
  p_new_filename TEXT,
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated_count INT := 0;
  v_old_prefix TEXT;
  v_new_prefix TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado.';
  END IF;

  p_old_path := trim(both '/' from p_old_path);
  p_new_path := trim(both '/' from p_new_path);
  v_old_prefix := p_old_path || '/%';
  v_new_prefix := p_new_path || '/';

  IF p_organization_id IS NOT NULL THEN
    IF NOT public.can_write_org_vault(p_organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para modificar arquivos neste cofre organizacional.';
    END IF;

    -- Atualiza o próprio item
    UPDATE public.user_files_index
    SET relative_path = p_new_path,
        filename = p_new_filename,
        updated_at = timezone('utc'::text, now())
    WHERE organization_id = p_organization_id
      AND relative_path = p_old_path;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Se for diretório, atualiza todos os filhos descendentes
    UPDATE public.user_files_index
    SET relative_path = v_new_prefix || substring(relative_path FROM length(p_old_path) + 2),
        updated_at = timezone('utc'::text, now())
    WHERE organization_id = p_organization_id
      AND relative_path LIKE v_old_prefix;

    -- Atualiza links de compartilhamento
    UPDATE public.share_links
    SET target_path = p_new_path
    WHERE organization_id = p_organization_id
      AND target_path = p_old_path;

    UPDATE public.share_links
    SET target_path = v_new_prefix || substring(target_path FROM length(p_old_path) + 2)
    WHERE organization_id = p_organization_id
      AND target_path LIKE v_old_prefix;
  ELSE
    -- Atualiza o item pessoal
    UPDATE public.user_files_index
    SET relative_path = p_new_path,
        filename = p_new_filename,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND relative_path = p_old_path;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Atualiza os filhos descendentes no cofre pessoal
    UPDATE public.user_files_index
    SET relative_path = v_new_prefix || substring(relative_path FROM length(p_old_path) + 2),
        updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND relative_path LIKE v_old_prefix;

    -- Atualiza pinned_folders preservando a ordem original
    UPDATE public.user_storage_profiles
    SET pinned_folders = ARRAY(
      SELECT CASE
        WHEN elem = p_old_path THEN p_new_path
        WHEN elem LIKE v_old_prefix THEN v_new_prefix || substring(elem FROM length(p_old_path) + 2)
        ELSE elem
      END
      FROM unnest(pinned_folders) WITH ORDINALITY AS t(elem, ord)
      ORDER BY ord ASC
    ),
    updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id;

    -- Atualiza links de compartilhamento pessoais
    UPDATE public.share_links
    SET target_path = p_new_path
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND target_path = p_old_path;

    UPDATE public.share_links
    SET target_path = v_new_prefix || substring(target_path FROM length(p_old_path) + 2)
    WHERE user_id = v_user_id
      AND organization_id IS NULL
      AND target_path LIKE v_old_prefix;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'old_path', p_old_path,
    'new_path', p_new_path
  );
END;
$$;

-- ============================================================================
-- 3. PROVISIONAMENTO AUTOMÁTICO EM auth.users (SELFCARE v2 + 25GB QUOTA)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_auth_user_provisioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_primary_admin BOOLEAN := (NEW.id = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid);
  v_default_features JSONB;
BEGIN
  -- 3.1. Configuração padrão com Autocuidado v2 (sem alarmes compulsórios)
  v_default_features := jsonb_build_object(
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

  -- 3.2. Upsert no perfil de usuário
  INSERT INTO public.profiles (
    id,
    user_id,
    display_name,
    email,
    features_config,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_default_features,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = timezone('utc'::text, now());

  -- 3.3. Inicialização do perfil de armazenamento (25 GB padrão / 500 GB admin)
  INSERT INTO public.user_storage_profiles (
    user_id,
    root_folder_slug,
    public_slug,
    storage_role,
    approval_status,
    quota_limit_bytes,
    used_bytes,
    pinned_folders,
    preferences,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1)),
    CASE WHEN v_is_primary_admin THEN 'admin' ELSE 'member' END,
    'approved',
    CASE WHEN v_is_primary_admin THEN 536870912000 ELSE 26843545600 END, -- 500 GB admin / 25 GB member
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

DROP TRIGGER IF EXISTS on_auth_user_created_provisioning ON auth.users;
CREATE TRIGGER on_auth_user_created_provisioning
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_provisioning();

-- ============================================================================
-- 4. RPC ADMINISTRATIVA PARA VINCULAR MEMBRO DO LABDIV (SERVICE_ROLE ONLY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.link_hublabdiv_member(
  p_user_id UUID,
  p_org_id UUID,
  p_target_placeholder_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_member RECORD;
BEGIN
  SELECT id, email, raw_user_meta_data->>'full_name' as full_name
  INTO v_user
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário % não encontrado em auth.users.', p_user_id;
  END IF;

  IF p_target_placeholder_id IS NOT NULL THEN
    UPDATE public.organization_members
    SET user_id = v_user.id,
        full_name = COALESCE(v_user.full_name, full_name),
        email = COALESCE(v_user.email, email),
        is_placeholder = false,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_target_placeholder_id
      AND organization_id = p_org_id
    RETURNING * INTO v_member;
  END IF;

  IF v_member.id IS NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      full_name,
      email,
      org_role,
      can_upload_org_vault,
      is_placeholder
    ) VALUES (
      p_org_id,
      v_user.id,
      COALESCE(v_user.full_name, 'Membro LabDiv'),
      v_user.email,
      'member',
      false,
      false
    )
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_member;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'organization_id', p_org_id,
    'user_id', v_user.id
  );
END;
$$;

-- Blindagem estrita: somente service_role pode executar link_hublabdiv_member
REVOKE ALL ON FUNCTION public.link_hublabdiv_member(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_hublabdiv_member(UUID, UUID, UUID) TO service_role;

COMMIT;

