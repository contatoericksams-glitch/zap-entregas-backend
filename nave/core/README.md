# NAVE Core V5 — API de prévia, não publicada

O módulo `preview-router.js` é um roteador Express isolado: `GET /status` e
`POST /quote-preview`. O código **não é montado** em `nave/server.js`, não faz
consultas ou alterações no Supabase e não aciona motoristas ou pagamentos.

**Importante:** os metros e segundos são recebidos do cliente e não são validados
por serviço de rotas. Portanto os resultados são apenas simulações demonstrativas,
nunca preços comerciais nem provas de percurso.

Para testar localmente, instale dependências no diretório `nave` e execute
`node --test core/ride-contract.test.js core/preview-router.test.js`.
Antes de publicar será necessário configurar limites de requisição, autenticação
quando aplicável, calcular rotas exclusivamente no servidor, reconciliar as tabelas
`rides` e `nave_wa_ride_requests` e realizar testes integrados.
