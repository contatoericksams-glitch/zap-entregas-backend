# NAVE V5 — Migração de idempotência (rascunho)

**Não aplicar automaticamente.** SQL versionado para revisão. Nenhuma alteração realizada no Supabase.

- Cria tabela **nova e separada**: `public.nave_test_request_keys`.
- Restrição UNIQUE em canal, tipo de identidade, UUID do usuário/contato e digest.
- `request_fingerprint` servirá para detectar reutilização de chave com parâmetros diferentes.
- RLS ligada; sem política e sem grants a anon/authenticated, portanto acesso direto negado.
- Não atualiza `rides`, `ride_quotes` ou `nave_wa_ride_requests`.
- Não cria funções SECURITY DEFINER nem habilita operações comerciais.
- Antes de aplicar: revisar privilégios existentes, idempotência de concorrência, limpeza/retenção e exclusão LGPD.
- Antes de desenvolver o endpoint persistente: alterar o código de planejamento para validar UUIDs e
  gerar um fingerprint canônico de toda solicitação. O digest atual é apenas um rascunho de chave,
  não autoriza gravações.
- Integrar somente em transação auditada com identidade validada pelo servidor; nunca confiar
  em `identityId` informado livremente pelo aplicativo.
