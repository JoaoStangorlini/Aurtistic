-- Corrige get_share_link_public_meta para links pessoais (organization_id IS NULL),
-- evitando erro PL/pgSQL 55000 ("record v_org is not assigned yet").

CREATE OR REPLACE FUNCTION public.get_share_link_public_meta(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean TEXT := btrim(COALESCE(p_token, ''));
  v_link public.share_links%ROWTYPE;
  v_org_slug TEXT := NULL;
  v_org_name TEXT := NULL;
  v_org_avatar TEXT := NULL;
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
    SELECT o.slug, o.name, o.avatar_url
      INTO v_org_slug, v_org_name, v_org_avatar
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
    NULLIF(btrim(v_org_name), ''),
    NULLIF(btrim(v_up_json->>'display_name'), ''),
    NULLIF(btrim(v_meta->>'full_name'), ''),
    NULLIF(btrim(v_meta->>'name'), ''),
    NULLIF(btrim(v_up_json->>'full_name'), ''),
    NULLIF(btrim(v_up_json->>'username'), ''),
    'Acervo Compartilhado'
  );

  v_creator_avatar := COALESCE(
    NULLIF(btrim(v_org_avatar), ''),
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
    'org_slug', v_org_slug,
    'org_name', v_org_name,
    'org_avatar_url', v_org_avatar,
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
