-- Este programa é um software livre (Licença AGPLv3)
-- Fase 3: Timeline Estilo Google Fotos, Deduplicação SHA-256 e Blindagem Anti-Loop de Proxy Comprimido
BEGIN;

-- 1. Novas colunas para Timeline Google Fotos, Deduplicação e Proteção Anti-Loop
ALTER TABLE public.user_files_index
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS compressed_proxy_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_local_compressed_proxy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_source TEXT;

-- 2. Função auxiliar IMMUTABLE para converter strings EXIF ('YYYY:MM:DD HH24:MI:SS' ou ISO com fuso)
CREATE OR REPLACE FUNCTION public.try_parse_exif_timestamp(p_raw TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_raw IS NULL OR trim(p_raw) = '' OR trim(p_raw) = 'null' THEN
    RETURN NULL;
  END IF;

  -- Converte '2026:05:14 18:30:00' -> '2026-05-14 18:30:00'
  v_clean := regexp_replace(trim(p_raw), '^(\d{4}):(\d{2}):(\d{2})', '\1-\2-\3');

  -- Se já trouxer fuso explícito (Z ou +HH:MM / -HH:MM), converte preservando o fuso explícito
  IF v_clean ~ '(Z|[+-]\d{2}:?\d{2})$' THEN
    RETURN v_clean::timestamptz;
  END IF;

  -- Sem fuso explícito (EXIF padrão): assume America/Sao_Paulo de forma determinística
  RETURN (v_clean::timestamp AT TIME ZONE 'America/Sao_Paulo');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 3. Backfill imediato de captured_at e original_size_bytes para fotos já indexadas
UPDATE public.user_files_index
SET
  captured_at = COALESCE(
    public.try_parse_exif_timestamp(
      COALESCE(
        exif_data->>'dateTimeOriginal',
        exif_data->>'dateTaken',
        exif_data->>'DateTimeOriginal',
        exif_data->>'CreateDate'
      )
    ),
    created_at
  ),
  original_size_bytes = COALESCE(original_size_bytes, size_bytes)
WHERE captured_at IS NULL;

-- 4. Trigger para manter captured_at e original_size_bytes sincronizados em INSERT e UPDATE de exif_data
CREATE OR REPLACE FUNCTION public.sync_user_files_captured_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.captured_at IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.exif_data IS DISTINCT FROM OLD.exif_data) THEN
    NEW.captured_at := COALESCE(
      public.try_parse_exif_timestamp(
        COALESCE(
          NEW.exif_data->>'dateTimeOriginal',
          NEW.exif_data->>'dateTaken',
          NEW.exif_data->>'DateTimeOriginal',
          NEW.exif_data->>'CreateDate'
        )
      ),
      NEW.captured_at,
      NEW.created_at,
      timezone('utc'::text, now())
    );
  END IF;

  IF NEW.original_size_bytes IS NULL AND NEW.size_bytes > 0 THEN
    NEW.original_size_bytes := NEW.size_bytes;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_files_captured_at ON public.user_files_index;
CREATE TRIGGER trg_sync_user_files_captured_at
  BEFORE INSERT OR UPDATE ON public.user_files_index
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_files_captured_at();

-- 5. Índices Keyset (Timeline Contínua) e Verificação O(1) de Hashes
CREATE INDEX IF NOT EXISTS idx_user_files_timeline_keyset
  ON public.user_files_index (user_id, is_directory, captured_at DESC, id DESC)
  WHERE is_directory = false;

CREATE INDEX IF NOT EXISTS idx_user_files_content_hash
  ON public.user_files_index (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_files_compressed_proxy_hash
  ON public.user_files_index (user_id, compressed_proxy_hash)
  WHERE compressed_proxy_hash IS NOT NULL;

COMMIT;

