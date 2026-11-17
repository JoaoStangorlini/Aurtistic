-- Este programa é um software livre (Licença AGPLv3)
-- Fase 4: Seed de Administradores Fundadores e Convites Padrão das 4 Organizações do HUB
BEGIN;

DO $$
DECLARE
  v_stan_uuid UUID := 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid;
  v_hub_uuid UUID := '7dcfe172-1cf0-4389-9abd-f340b1408386'::uuid;
  v_org_labdiv UUID := '1ab41410-0000-4000-8000-000000000001'::uuid;
  v_org_show UUID := '1ab41410-0000-4000-8000-000000000002'::uuid;
  v_org_hs UUID := '1ab41410-0000-4000-8000-000000000003'::uuid;
  v_org_profis UUID := '1ab41410-0000-4000-8000-000000000004'::uuid;
  org_rec RECORD;
BEGIN
  -- 1. Garante que João Paulo Stangorlini e a conta HUB LabDiv sejam administradores em todas as 4 organizações
  FOR org_rec IN
    SELECT unnest(ARRAY[v_org_labdiv, v_org_show, v_org_hs, v_org_profis]) AS org_id
  LOOP
    -- João Paulo Stangorlini
    INSERT INTO public.organization_members (
      organization_id, user_id, full_name, email, org_role, can_upload_org_vault, is_placeholder
    ) VALUES (
      org_rec.org_id,
      v_stan_uuid,
      'João Paulo Stangorlini',
      'joaopaulostangorlini@usp.br',
      'admin',
      true,
      false
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE SET
      org_role = 'admin',
      can_upload_org_vault = true;

    -- HUB LabDiv Institucional
    INSERT INTO public.organization_members (
      organization_id, user_id, full_name, email, org_role, can_upload_org_vault, is_placeholder
    ) VALUES (
      org_rec.org_id,
      v_hub_uuid,
      'HUB LabDiv Institucional',
      'hublabdiv@gmail.com',
      'admin',
      true,
      false
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE SET
      org_role = 'admin',
      can_upload_org_vault = true;
  END LOOP;

  -- 2. Convites Oficiais das 4 Organizações com validade até 2035
  -- LabDiv
  INSERT INTO public.organization_invites (organization_id, token, assigned_role, expires_at, created_by)
  VALUES
    (v_org_labdiv, 'LABDIV-IFUSP-2026', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_labdiv, 'LABDIV-2026', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_labdiv, 'LABDIV', 'member', '2035-12-31 23:59:59+00', v_stan_uuid)
  ON CONFLICT (token) DO UPDATE SET
    expires_at = EXCLUDED.expires_at,
    accepted_at = NULL;

  -- Show da Física
  INSERT INTO public.organization_invites (organization_id, token, assigned_role, expires_at, created_by)
  VALUES
    (v_org_show, 'SHOW-FISICA-2026', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_show, 'SHOW-DA-FISICA', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_show, 'SHOW', 'member', '2035-12-31 23:59:59+00', v_stan_uuid)
  ON CONFLICT (token) DO UPDATE SET
    expires_at = EXCLUDED.expires_at,
    accepted_at = NULL;

  -- Hackerspace IFUSP
  INSERT INTO public.organization_invites (organization_id, token, assigned_role, expires_at, created_by)
  VALUES
    (v_org_hs, 'HACKERSPACE-IFUSP', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_hs, 'HACKERSPACE-2026', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_hs, 'HS', 'member', '2035-12-31 23:59:59+00', v_stan_uuid)
  ON CONFLICT (token) DO UPDATE SET
    expires_at = EXCLUDED.expires_at,
    accepted_at = NULL;

  -- Pró-Física (ProFis)
  INSERT INTO public.organization_invites (organization_id, token, assigned_role, expires_at, created_by)
  VALUES
    (v_org_profis, 'PROFIS-IFUSP-2026', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_profis, 'PROFIS-2026', 'member', '2035-12-31 23:59:59+00', v_stan_uuid),
    (v_org_profis, 'PROFIS', 'member', '2035-12-31 23:59:59+00', v_stan_uuid)
  ON CONFLICT (token) DO UPDATE SET
    expires_at = EXCLUDED.expires_at,
    accepted_at = NULL;
END $$;

-- 3. RPC de contingência com SECURITY DEFINER para garantir associação via SSO
CREATE OR REPLACE FUNCTION public.ensure_sso_member(
  p_org_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_user_name TEXT;
  v_member RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.';
  END IF;

  SELECT email, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  INTO v_user_email, v_user_name
  FROM auth.users
  WHERE id = v_user_id;

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
    v_user_id,
    COALESCE(v_user_name, 'Membro'),
    v_user_email,
    p_role,
    true,
    false
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    org_role = CASE WHEN p_role = 'admin' THEN 'admin' ELSE organization_members.org_role END,
    can_upload_org_vault = true
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_org_id,
    'member_id', v_member.id,
    'org_role', v_member.org_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_sso_member(UUID, TEXT) TO authenticated, service_role;

COMMIT;

