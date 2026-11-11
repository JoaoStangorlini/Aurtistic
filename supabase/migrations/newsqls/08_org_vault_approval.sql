-- Este programa é um software livre (Licença AGPLv3)
-- ============================================================================
-- 08_org_vault_approval.sql
-- Fluxo de Governança e Aprovação do Cofre de Organização
-- Membros sem aprovação têm acesso estritamente Read-Only
-- Este programa é um software livre (Licença AGPLv3)
-- ============================================================================

-- 1. Novas colunas de rastreamento de solicitação e aprovação
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS vault_access_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vault_access_approved_by UUID REFERENCES auth.users(id);

-- 2. View para admins auditarem solicitações pendentes de cofre
CREATE OR REPLACE VIEW public.org_vault_pending_requests AS
  SELECT 
    om.organization_id,
    om.user_id,
    om.full_name,
    om.email,
    om.vault_access_requested_at,
    o.name AS org_name,
    o.slug AS org_slug
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.can_upload_org_vault = false
    AND om.vault_access_requested_at IS NOT NULL
    AND om.is_placeholder = false;

-- 3. RPC: Membro solicita permissão de upload/escrita no cofre da organização
CREATE OR REPLACE FUNCTION public.request_org_vault_access(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_member public.organization_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado.';
  END IF;

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não pertence a esta organização.';
  END IF;

  IF v_member.can_upload_org_vault THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_approved');
  END IF;

  UPDATE public.organization_members
  SET vault_access_requested_at = timezone('utc'::text, now())
  WHERE organization_id = p_org_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'status', 'requested');
END;
$$;

-- 4. RPC: Admin da organização ou ADM Geral aprova acesso de escrita no cofre
CREATE OR REPLACE FUNCTION public.approve_org_vault_access(
  p_org_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_primary_admin BOOLEAN := (v_uid = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e'::uuid);
  v_is_org_admin BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado.';
  END IF;

  IF NOT v_is_primary_admin THEN
    v_is_org_admin := public.is_org_admin(p_org_id, v_uid);
    IF NOT v_is_org_admin THEN
      RAISE EXCEPTION 'Acesso negado: apenas administradores da organização podem aprovar acesso ao cofre.';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET 
    can_upload_org_vault = true,
    vault_access_approved_by = v_uid,
    vault_access_requested_at = NULL
  WHERE organization_id = p_org_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro alvo não encontrado nesta organização.';
  END IF;

  RETURN jsonb_build_object('ok', true, 'approved_user_id', p_target_user_id);
END;
$$;

