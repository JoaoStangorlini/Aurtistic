-- Este programa é um software livre (Licença AGPLv3)
-- Seed Extra: Tarefas extraídas manualmente pelo subagente a partir do Google Tarefas

-- 1. Minhas tarefas (PESSOAL)
INSERT INTO tasks (title, status, dimension, due_date) VALUES ('Conta de luz', 'BACKLOG', 'PESSOAL', now() - interval '1 day');
INSERT INTO tasks (title, status, dimension, due_date) VALUES ('Fechamento cartão (BB)', 'BACKLOG', 'PESSOAL', now() - interval '7 days');
INSERT INTO tasks (title, status, dimension) VALUES ('Chubacci', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Cornejo', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Stable difusion Leon', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Dentista', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Dermato', 'BACKLOG', 'PESSOAL');

-- 2. USP (USP)
INSERT INTO tasks (title, status, dimension) VALUES ('Estudar para calc III', 'BACKLOG', 'USP');
INSERT INTO tasks (title, status, dimension) VALUES ('Rever cálculo II', 'BACKLOG', 'USP');
INSERT INTO tasks (title, status, dimension) VALUES ('Rever cálculo I e fazer anotações', 'BACKLOG', 'USP');

-- 3. Projeto (HUB_LABDIV)
INSERT INTO tasks (title, status, dimension) VALUES ('Deixar um q a força esteja com vc ou alguma frase filosófica ou ...', 'BACKLOG', 'HUB_LABDIV');
INSERT INTO tasks (title, status, dimension) VALUES ('Posts mais tarde: Swide, Marcelo, Galerinha do hepic', 'BACKLOG', 'HUB_LABDIV');
INSERT INTO tasks (title, status, dimension) VALUES ('Realizar os primeiros posts: Termodinâmica do mosh, Visita ao rk-1, Físicos também resenham, Cristalografia, Física dos materiais, Post de fotodetectores - com objeto 3d (germano)', 'BACKLOG', 'HUB_LABDIV');
INSERT INTO tasks (title, status, dimension) VALUES ('Reuniões: Comunicação (MaluTipp), Diretora IF, Ccifusp', 'BACKLOG', 'HUB_LABDIV');
INSERT INTO tasks (title, status, dimension) VALUES ('Labdiv: Email do HUB, divulgar hub nas redes, Criar perfil de moderadores', 'BACKLOG', 'HUB_LABDIV');
INSERT INTO tasks (title, status, dimension) VALUES ('Pesquisar/ver/ler: Colabits, Ver no cloudinary se tem como mover para um servidor local após, Ver se rola tirar do supabase e tranferir para outro servidor a parte pesada de arquivos, Edu comunicação/jornalismo científico (ECA), Nome dql rede social sem bigtechs com o ewout', 'BACKLOG', 'HUB_LABDIV');
INSERT INTO tasks (title, status, dimension) VALUES ('Produção de materiais: Ir com o Bruno na helen, Comprar câmera, Rever teoria fotográfica, Falar com o Ivan (história), Tirar fotos do cotidiano', 'BACKLOG', 'HUB_LABDIV');

-- 4. Filmes/séries (PESSOAL)
INSERT INTO tasks (title, status, dimension) VALUES ('O aviador', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Dungeon mesh', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Vinland saga', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Filhos do vento', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Pro dia nascer feliz', 'BACKLOG', 'PESSOAL');

-- 5. CIN (PESSOAL)
INSERT INTO tasks (title, status, dimension) VALUES ('Tirar uma CIN', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Criar assinatura', 'BACKLOG', 'PESSOAL');

-- 6. Tatuagens (PESSOAL)
INSERT INTO tasks (title, status, dimension) VALUES ('F (letra grega q lembra a vida) = oceano', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('{Sofia} (estrela verspetina, Chester e GP do hospital circulando)', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Retocar antiga e fazer as dos irmãos', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Falar com o Leandro de novo', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Ver valor', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Ver se parcela', 'BACKLOG', 'PESSOAL');

-- 7. Compras (PESSOAL)
INSERT INTO tasks (title, status, dimension) VALUES ('Hidratante', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Protetor', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Day after cachinhos', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Nécessaire/bolsinha', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Papel de parede', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Lenço umedecido', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Leds', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Estantes', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Bastão de led', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Cosmos', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Linkin 1', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Linkin 2', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Ghost', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Estampar camisas', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Estampar moletom', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Câmera', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Alexa', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Robô de passar pano', 'BACKLOG', 'PESSOAL');

-- 8. Hobbys (PESSOAL)
INSERT INTO tasks (title, status, dimension) VALUES ('Costurar porta garrafinha na pasta', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Costurar zíper nas calças', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Shorts com os tópicos do vídeo', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Vídeos novos para o ytb', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Crackear o kindle', 'BACKLOG', 'PESSOAL');

-- 9. Livros (PESSOAL)
INSERT INTO tasks (title, status, dimension) VALUES ('Cloroquination', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Salário preço e lucro', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Boa noite pum pum', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('O leitor de nietzch Oswald giacoia', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Marx', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Hegel', 'BACKLOG', 'PESSOAL');
INSERT INTO tasks (title, status, dimension) VALUES ('Kant', 'BACKLOG', 'PESSOAL');
