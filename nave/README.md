# NAVE — Canal WhatsApp (MVP técnico)

Esta implementação fica isolada no diretório `nave/` e na branch `nave-whatsapp-mvp`. **Não modifica nem publica o serviço ZAP Entregas**.
O número da Retirada Inteligente **ainda não foi migrado**. O backend não envia ofertas a motoristas e não aceita corridas comerciais.

## Configuração no Render

- Serviço separado, branch `nave-whatsapp-mvp` do mesmo repositório enquanto não houver um repositório NAVE dedicado.
- `buildCommand`: `npm --prefix nave install --omit=dev`
- `startCommand`: `node nave/server.js`
- `WA_VERIFY_TOKEN`: valor aleatório próprio, configurado também no WhatsApp Manager.
- `META_APP_SECRET`: segredo do aplicativo Meta, usado para validar assinaturas do webhook.
- `META_PHONE_NUMBER_ID`: ID do número da Retirada Inteligente, somente após confirmar no Meta.
- `META_ACCESS_TOKEN`: token permanente de usuário de sistema, com permissões WhatsApp.
- `SUPABASE_URL`: URL do projeto NAVE, **não** do projeto Retirada ou ZAP.
- `SUPABASE_SERVICE_ROLE_KEY`: segredo Supabase **apenas** no Render, nunca no repositório, app ou site.
- `META_GRAPH_VERSION`: opcional, padrão v26.0.

Endpoint de callback da Meta: `https://<novo-servico>.onrender.com/webhook`.
Teste: `GET /healthz` indica integração e corridas comerciais desativadas.

## Segurança e limitações

- Valida assinatura de mensagens recebidas com `X-Hub-Signature-256`.
- Salva contatos e IDs de mensagens em tabelas privadas com RLS; não armazena texto de conversas.
- IDs de eventos garantem idempotência de recebimento.
- Resposta inicial é somente institucional; nenhuma viagem será solicitada ou despachada.
- Não ativa contas de motorista pendentes; não faz pagamentos; não rastreia localização.
- Antes da produção: fluxo de cadastro/aceite, opt-in, LGPD, limites de tarifa, distribuição transacional, templates, suporte e regras de operação.

Para reutilizar o número antigo: confirmar WABA, número e Phone Number ID no WhatsApp Manager, solicitar alteração do nome de exibição para **NAVE** e aguardar aprovação antes de apontar o webhook para este serviço.
