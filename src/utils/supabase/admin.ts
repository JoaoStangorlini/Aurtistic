// Este programa é um software livre (Licença AGPLv3)
import { createClient as createSupabaseAdminClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cria cliente administrativo Supabase (service_role) apenas no servidor quando a chave estiver configurada.
 * Retorna null em ambientes locais sem SUPABASE_SERVICE_ROLE_KEY para permitir degradação segura.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return createSupabaseAdminClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
