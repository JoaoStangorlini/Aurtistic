-- Este programa é um software livre (Licença AGPLv3)
-- ============================================================================
-- MIGRATION 15: Eventos, Reuniões, Convites Case-Insensitive e Storage Boost
-- ============================================================================

-- 1. Status formal de Eventos de Agenda
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('confirmed', 'tentative', 'cancelled'));

-- 2. Itens de Pauta em Reuniões de Organização (JSONB)
ALTER TABLE public.organization_meetings
  ADD COLUMN IF NOT EXISTS agenda_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Coluna de governança para Storage Boost e Cooldown
ALTER TABLE public.user_storage_profiles
  ADD COLUMN IF NOT EXISTS last_boost_granted_at TIMESTAMPTZ;

-- 4. Atualizar trigger protect_storage_profile_privileges para manter last_boost_granted_at imutável por client
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
    NEW.last_boost_granted_at := OLD.last_boost_granted_at;
    NEW.used_bytes := OLD.used_bytes;
    NEW.root_folder_slug := OLD.root_folder_slug;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. RPC Segura: Pedido de Storage Boost com Cooldown de 30 dias e Teto de +10 GB
CREATE OR REPLACE FUNCTION public.request_personal_storage_boost(p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile RECORD;
  v_boost_bytes BIGINT := 10737418240; -- 10 GB
  v_duration INTERVAL := interval '7 days';
  v_cooldown INTERVAL := interval '30 days';
  v_expires_at TIMESTAMPTZ;
  v_cooldown_until TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para solicitar boost de armazenamento.';
  END IF;

  SELECT * INTO v_profile
  FROM public.user_storage_profiles
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de armazenamento do usuário não encontrado.';
  END IF;

  -- Valida cooldown de 30 dias desde a última concessão
  IF v_profile.last_boost_granted_at IS NOT NULL AND (v_profile.last_boost_granted_at + v_cooldown) > now() THEN
    v_cooldown_until := v_profile.last_boost_granted_at + v_cooldown;
    RAISE EXCEPTION 'Boost indisponível: o intervalo mínimo entre pedidos é de 30 dias. Disponível novamente em %',
      to_char(v_cooldown_until, 'DD/MM/YYYY HH24:MI');
  END IF;

  v_expires_at := now() + v_duration;
  v_cooldown_until := now() + v_cooldown;

  UPDATE public.user_storage_profiles
  SET
    temp_quota_bytes = v_boost_bytes,
    temp_quota_expires_at = v_expires_at,
    temp_quota_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Boost Pessoal Temporário (+10 GB)'),
    last_boost_granted_at = now(),
    updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'boost_bytes', v_boost_bytes,
    'expires_at', v_expires_at,
    'cooldown_until', v_cooldown_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_personal_storage_boost(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_personal_storage_boost(TEXT) TO authenticated, service_role;

-- 6. Resiliência a Case em Convites de Organização (LOWER(token) = LOWER(p_token))
CREATE OR REPLACE FUNCTION public.get_organization_invite_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_org RECORD;
  v_placeholders JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE LOWER(token) = LOWER(btrim(p_token))
    AND accepted_at IS NULL
    AND expires_at > timezone('utc'::text, now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Convite inexistente, expirado ou já utilizado.');
  END IF;

  SELECT id, name, slug, avatar_url, description INTO v_org
  FROM public.organizations
  WHERE id = v_invite.organization_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'full_name', m.full_name,
        'email', m.email,
        'subteam_id', m.subteam_id
      )
    ),
    '[]'::jsonb
  ) INTO v_placeholders
  FROM public.organization_members m
  WHERE m.organization_id = v_invite.organization_id
    AND m.is_placeholder = true
    AND m.user_id IS NULL;

  RETURN jsonb_build_object(
    'valid', true,
    'organization', to_jsonb(v_org),
    'target_email', v_invite.target_email,
    'target_name', v_invite.target_name,
    'assigned_role', v_invite.assigned_role,
    'assigned_subteam_id', v_invite.assigned_subteam_id,
    'placeholder_member_id', v_invite.placeholder_member_id,
    'available_placeholders', v_placeholders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invite(
  p_token TEXT,
  p_claim_placeholder_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite RECORD;
  v_member RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
  v_target_placeholder UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para aceitar convite.';
  END IF;

  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE LOWER(token) = LOWER(btrim(p_token))
    AND accepted_at IS NULL
    AND expires_at > timezone('utc'::text, now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido, já utilizado ou expirado.';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  SELECT COALESCE(full_name, username, v_user_email) INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;

  v_target_placeholder := COALESCE(p_claim_placeholder_id, v_invite.placeholder_member_id);

  IF v_target_placeholder IS NOT NULL THEN
    UPDATE public.organization_members
    SET
      user_id = v_user_id,
      email = COALESCE(v_user_email, email),
      is_placeholder = false,
      org_role = v_invite.assigned_role,
      subteam_id = COALESCE(v_invite.assigned_subteam_id, subteam_id),
      updated_at = timezone('utc'::text, now())
    WHERE id = v_target_placeholder
      AND organization_id = v_invite.organization_id
      AND is_placeholder = true
      AND user_id IS NULL
    RETURNING * INTO v_member;
  END IF;

  IF v_member IS NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      full_name,
      email,
      org_role,
      subteam_id,
      can_upload_org_vault,
      is_placeholder
    ) VALUES (
      v_invite.organization_id,
      v_user_id,
      COALESCE(v_invite.target_name, v_user_name, 'Membro'),
      COALESCE(v_invite.target_email, v_user_email),
      v_invite.assigned_role,
      v_invite.assigned_subteam_id,
      (v_invite.assigned_role = 'admin'),
      false
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      org_role = EXCLUDED.org_role,
      subteam_id = COALESCE(EXCLUDED.subteam_id, organization_members.subteam_id),
      updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_member;
  END IF;

  UPDATE public.organization_invites
  SET
    accepted_at = timezone('utc'::text, now()),
    accepted_by = v_user_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_invite.organization_id,
    'member_id', v_member.id,
    'org_role', v_member.org_role
  );
END;
$$;
