-- Função para verificar se um usuário existe pelo email (usado no login unificado)
CREATE OR REPLACE FUNCTION public.check_user_exists(lookup_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE email = lookup_email
  );
END;
$$;
