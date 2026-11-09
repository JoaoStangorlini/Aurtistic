-- Este programa é um software livre (Licença AGPLv3)
-- 1. Primeiro, removemos a limitação de ENUM para aceitar qualquer texto
ALTER TABLE tasks ALTER COLUMN dimension DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN dimension TYPE TEXT USING dimension::TEXT;

-- 2. Corrigimos o RLS invisível: Atribuímos todas as tarefas sem dono ao seu usuário
UPDATE tasks 
SET user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1) 
WHERE user_id IS NULL;

-- 3. Atualizamos as dimensões que foram inseridas como 'PESSOAL' e 'HUB_LABDIV' para as novas categorias do Notion!
UPDATE tasks SET dimension = 'Projeto' WHERE dimension = 'HUB_LABDIV';
UPDATE tasks SET dimension = 'Filmes/series' WHERE title IN ('O aviador', 'Dungeon mesh', 'Vinland saga', 'Filhos do vento', 'Pro dia nascer feliz');
UPDATE tasks SET dimension = 'CIN' WHERE title IN ('Tirar uma CIN', 'Criar assinatura');
UPDATE tasks SET dimension = 'tatuagens' WHERE title ILIKE '%letra grega%' OR title ILIKE '%Sofia%' OR title ILIKE '%Retocar%' OR title ILIKE '%Leandro%' OR title IN ('Ver valor', 'Ver se parcela');
UPDATE tasks SET dimension = 'compras' WHERE title IN ('Hidratante', 'Protetor', 'Day after cachinhos', 'Nécessaire/bolsinha', 'Papel de parede', 'Lenço umedecido', 'Leds', 'Estantes', 'Bastão de led', 'Cosmos', 'Linkin 1', 'Linkin 2', 'Ghost', 'Estampar camisas', 'Estampar moletom', 'Câmera', 'Alexa', 'Robô de passar pano');
UPDATE tasks SET dimension = 'hobbys' WHERE title ILIKE '%Costurar%' OR title ILIKE '%Shorts%' OR title ILIKE '%ybt%' OR title ILIKE '%ytb%' OR title ILIKE '%kindle%';
UPDATE tasks SET dimension = 'livros' WHERE title IN ('Cloroquination', 'Salário preço e lucro', 'Boa noite pum pum', 'O leitor de nietzch Oswald giacoia', 'Marx', 'Hegel', 'Kant');
