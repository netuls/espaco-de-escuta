# Espaço de Escuta · Cardápio Web (versão separada)

- `site-liderados/` → site público dos liderados (publique num repositório/endereço)
- `painel-lideranca/` → painel com login das lideranças (publique em outro repositório/endereço)
- `supabase/schema.sql` → banco de dados compartilhado (rodar uma única vez no SQL Editor)
- `supabase/migracao-agenda.sql` → modo chat/presencial + agenda. Rode depois do schema.sql (pode rodar de novo sem problema).
- `supabase/lideranca-flexivel.sql` → libera nomes de liderança além dos cinco originais (ex.: "Teste").
- `supabase/pesquisa-satisfacao.sql` → **novo**: pesquisa de satisfação quando a conversa é encerrada.
- `supabase/registro-liderados.sql` → **novo**: cadastro e login dos liderados, com escolha da equipe.

Os dois projetos conversam com o mesmo projeto Supabase e não dependem um do outro.

## Novidades
- Identidade da Cardápio Web: roxo + mascote nos dois sites (`assets/`).
- O liderado escolhe **chat** ou **presencial** ao pedir conversa.
- A liderança agenda (data, horário, local, observações) pelo botão "📅 Agendar" na conversa.
- Aviso para o liderado: mensagem automática no chat, selo "Novo agendamento" na tela inicial e card "Seus agendamentos" dentro da conversa.
- Registro nas duas pontas: agenda no painel da liderança e lista de agendamentos no site do liderado.
- Ordem para publicar: 1) rodar `migracao-agenda.sql` no Supabase, 2) subir os dois sites.

## Login dos liderados
1. Rode `registro-liderados.sql` (pode rodar de novo; remove o antigo código da equipe).
2. No cadastro o liderado informa nome, e-mail, senha e **escolhe a equipe** (uma das lideranças da lista `LEADERS`). A liderança da equipe dele aparece primeiro e destacada.
3. Em Authentication > Providers > Email, decida sobre "Confirm email".
4. O login só libera o acesso: `checkins` não guarda o usuário, então o anonimato continua valendo.

## Pesquisa de satisfação
Rode `pesquisa-satisfacao.sql` (depois do `migracao-agenda.sql`). Quando a liderança encerra uma conversa, o liderado vê uma janela com: como está agora (1 a 5), nota da conversa (1 a 5) e comentário opcional. A liderança vê a resposta dentro da conversa (humor antes → depois) e a média no topo do painel.
