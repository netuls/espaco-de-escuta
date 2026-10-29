# Espaço de Escuta — Site dos liderados

Página pública onde o liderado registra o humor (1 a 5) e, se quiser, conversa com uma liderança (anônimo ou identificado), usando um código de acesso.

- Arquivos: `index.html`, `css/`, `js/`.
- Configure `js/config.js` (URL e anon key já preenchidas). Em `ADMIN_URL` coloque o endereço do painel se quiser mostrar o link; deixe `""` para esconder.
- Publicação: GitHub Pages (Settings → Pages → main / root).
- O banco é compartilhado com o painel: rode `../supabase/schema.sql` uma vez no SQL Editor do Supabase.

## Chat ou presencial
No passo 3 o liderado escolhe como prefere conversar. Os agendamentos feitos pela liderança aparecem dentro da conversa (card "Seus agendamentos") e como aviso na tela inicial.

## Login
O site pede login/cadastro na entrada. No cadastro o liderado escolhe a equipe (ver `../supabase/registro-liderados.sql`).
