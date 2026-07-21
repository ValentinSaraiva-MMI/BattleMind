-- db/migrations/seed_questions_demo.sql
-- Jeu de DÉMONSTRATION (versionné). Permet de déployer et tester une partie.
insert into public.questions (category, question_text, answers, correct_key, abundance_answer) values
('culture_generale', 'Quelle est la capitale de la France ?',
 '[{"key":"A","text":"Lyon"},{"key":"B","text":"Paris"},{"key":"C","text":"Marseille"},{"key":"D","text":"Nice"}]', 'B',
 '{"key":"E","text":"Toulouse"}'),
('sciences', 'Quelle est la formule chimique de l''eau ?',
 '[{"key":"A","text":"CO2"},{"key":"B","text":"O2"},{"key":"C","text":"H2O"},{"key":"D","text":"NaCl"}]', 'C',
 '{"key":"E","text":"CH4"}'),
('histoire', 'En quelle année a débuté la Première Guerre mondiale ?',
 '[{"key":"A","text":"1912"},{"key":"B","text":"1914"},{"key":"C","text":"1916"},{"key":"D","text":"1918"}]', 'B',
 '{"key":"E","text":"1910"}'),
('musique', 'Combien de cordes possède une guitare classique standard ?',
 '[{"key":"A","text":"4"},{"key":"B","text":"5"},{"key":"C","text":"6"},{"key":"D","text":"7"}]', 'C',
 '{"key":"E","text":"8"}'),
('tech', 'Que signifie le sigle "CPU" ?',
 '[{"key":"A","text":"Central Processing Unit"},{"key":"B","text":"Computer Personal Unit"},{"key":"C","text":"Central Program Utility"},{"key":"D","text":"Core Processing Utility"}]', 'A',
 '{"key":"E","text":"Central Power Unit"}'),
('sciences', 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?',
 '[{"key":"A","text":"Oxygène"},{"key":"B","text":"Azote"},{"key":"C","text":"Hydrogène"},{"key":"D","text":"Dioxyde de carbone"}]', 'D',
 '{"key":"E","text":"Hélium"}');