-- Atualiza o email e o display name/metadata do usuário stangorlini para o padrão do Aurtistic
UPDATE auth.users 
SET 
  email = 'stangorlini@aurtistic.local',
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"full_name": "Stangorlini", "username": "stangorlini", "display_name": "Stangorlini"}'::jsonb
WHERE email = 'stangorlini@email.com' OR email = 'stangorlini@aurtistic.local';

