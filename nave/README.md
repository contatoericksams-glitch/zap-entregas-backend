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

## Vínculo app ↔ WhatsApp (staging isolado, desativado por padrão)

Prévias locais: executar `npm run preview:passenger` dentro de `nave/` e abrir `http://127.0.0.1:4317/passageiro.html` ou `http://127.0.0.1:4317/motorista.html`. O servidor de prévia escuta somente na própria máquina, não carrega credenciais e usa apenas cotações e jornadas fictícias. As quatro categorias compartilham o percurso fixo de demonstração Centro → Região do Lago (4,3 km/12 min). A tela motorista permite disponibilidade local, geração de oferta, aceite/recusa, chegada, embarque, conclusão e valores ilustrativos; recusar encerra a oferta nesta tela e não permite assumir outro piloto. Cada aba tem estado próprio: as duas interfaces não estão sincronizadas. Login, endereços livres, contas independentes de motorista/passageiro, vínculo WhatsApp e viagem real permanecem pendentes. Os controles do motorista na tela do passageiro apenas avançam aquela demonstração local.

O fluxo OTP expõe `POST /api/v5/channel-link/start` e `POST /api/v5/channel-link/confirm`. Ambos exigem um access token Supabase válido; a identidade vem do token verificado no servidor, nunca do corpo da chamada. O início envia uma mensagem somente após solicitação autenticada e apenas ao ativar explicitamente a configuração isolada abaixo.

Contrato para o app passageiro:

**Central local somente de leitura:** abrir `/central-local.html?shared=1` no mesmo servidor de prévia. Mostra disponibilidade, fase, categoria e valores ilustrativos da sala, além das últimas 100 ações aceitas (sequência, horário, papel fictício, ação e fase). Consultas e ações rejeitadas não geram eventos; reiniciar o processo limpa tudo. Não possui autenticação administrativa, controles operacionais, aprovação de motoristas ou pagamentos. Os links nas prévias compartilhadas abrem a Central.

**Demonstração local em duas abas:** no mesmo servidor de prévia, abrir `/passageiro.html?shared=1` e `/motorista.html?shared=1`. Primeiro, ativar a disponibilidade no motorista; depois iniciar a solicitação no passageiro. O motorista recebe a oferta e avança aceite, chegada, embarque e conclusão; o passageiro acompanha automaticamente. Cancelar antes do embarque ou recusar encerra a solicitação. Somente o passageiro reinicia após uma etapa terminal. A sala é única e fictícia, compartilhada por todas as abas deste servidor; os rótulos passageiro/motorista não são autenticação. Estado apenas na memória, consulta a cada segundo, versão para rejeitar ações simultâneas/desatualizadas, identificação da instância para recuperar reinícios. O endpoint `/api/local-demo` existe somente no servidor de prévia em loopback, exige origem local nas chamadas do navegador e não é montado no backend operacional. Não oferece acesso por celular, contas independentes ou teste P09 real.

- Cabeçalho em ambas as chamadas: `Authorization: Bearer <session.access_token>` e `Content-Type: application/json`.
- `POST /api/v5/channel-link/start` recebe `{"phoneE164":"+55..."}` e retorna HTTP 202 com `{"accepted":true,"challengeId":"...","expiresAt":"..."}`. A resposta não revela se o número está cadastrado no WhatsApp nem inclui o OTP.
- `POST /api/v5/channel-link/confirm` recebe `{"challengeId":"...","code":"123456"}` e retorna HTTP 200 com `{"linked":true}` ou `{"linked":false}`. O app não envia `userId`; o código e o desafio são vinculados ao usuário autenticado.
- HTTP 401 indica sessão ausente/inválida; 400 indica formato inválido; 503 indica indisponibilidade/configuração. As respostas incluem `Cache-Control: no-store`.

Para um staging realmente separado, configurar nesse serviço de staging: `NODE_ENV=staging`, `NAVE_CHANNEL_LINK_STAGING_ENABLED=true`, `NAVE_CHANNEL_LINK_STAGING_SUPABASE_URL`, `NAVE_CHANNEL_LINK_STAGING_PUBLISHABLE_KEY`, `NAVE_CHANNEL_LINK_STAGING_SERVICE_ROLE_KEY`, `NAVE_CHANNEL_LINK_STAGING_SECRET` (mínimo de 32 bytes), `NAVE_CHANNEL_LINK_STAGING_META_PHONE_NUMBER_ID`, `NAVE_CHANNEL_LINK_STAGING_META_ACCESS_TOKEN`, `NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_NAME` e, opcionalmente, `NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_LANGUAGE` (`pt_BR` por padrão) e `NAVE_CHANNEL_LINK_STAGING_META_GRAPH_VERSION` (`v26.0` por padrão). O nome deve apontar para um template de autenticação aprovado na Meta e compatível com código no corpo e botão de cópia. A URL e chaves Supabase, o ID/token do remetente precisam ser distintos dos valores do backend existente; se qualquer requisito faltar, a rota não é montada. Não configurar essas chaves no serviço principal. A migration `core/migrations/009_channel_link_otp_DRAFT.sql` continua draft e precisa ser validada/aplicada em uma instância de staging antes de habilitar o fluxo.

Verificação local: `node --test core/*.test.js ../central-master-v4/master-auth.test.js`. Isso não substitui teste com JWT, banco, sender ou app reais em staging.

Para reutilizar o número antigo: confirmar WABA, número e Phone Number ID no WhatsApp Manager, solicitar alteração do nome de exibição para **NAVE** e aguardar aprovação antes de apontar o webhook para este serviço.
