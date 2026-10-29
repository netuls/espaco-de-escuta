# Espaço de Escuta — Painel da liderança

Login (e-mail e senha) e caixa de conversas de cada liderança (Thais, Victor, Leiliane, Gabriel, Karen). Cada uma vê só as próprias conversas.

- Arquivos: `index.html`, `css/`, `js/`.
- Configure `js/config.js`. Em `SITE_URL` coloque o endereço do site dos liderados (opcional).
- Publicação: GitHub Pages em um repositório separado (ou outro domínio).
- Os usuários são criados em Authentication → Users e ligados ao nome pela tabela `leaders` (ver final de `../supabase/schema.sql`).
- Em Authentication → URL Configuration, coloque a URL deste painel em Site URL.

## Agenda
O botão "📅 Agendar" fica dentro de cada conversa. Os próximos encontros aparecem no card "Agenda de conversas presenciais" no topo do painel.
