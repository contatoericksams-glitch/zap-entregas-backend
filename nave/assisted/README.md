# NAVE — pacote de atendimento assistido persistente

Este pacote implementa um fluxo separado de homologação: cadastro de passageiro ou solicitação de perfil de motorista, confirmação/recuperação por email com PKCE, sessão em cookies HttpOnly, renovação, saída, aprovação manual de motoristas, solicitações com endereços livres nas quatro categorias, atribuição pela Central, aceite/recusa, chegada, embarque, conclusão, cancelamento anterior ao embarque e histórico persistente.

Não é montado por `nave/server.js` e não altera Home V8, Central premium V4, piloto WhatsApp ou tabelas de corridas existentes. Não basta publicar os arquivos estáticos: a API e o esquema isolado precisam estar configurados juntos. Sem despacho automático, GPS, cotação, cobranças ou mensagens WhatsApp. `test_only=true` é obrigatório no banco; não se desloque para esses pedidos.

## Dados e autorização

`schema.sql` é um script DRAFT para banco descartável/isolado. Cinco tabelas privadas em `nave_assisted` guardam membros, pedidos, eventos, decisões de aprovação e comprovantes de idempotência. RLS fica ativo, sem acesso direto de anon/authenticated. Três RPCs públicas são executáveis somente por service_role; o servidor verifica identidade no Supabase Auth e deriva MFA, nunca aceita identidade ou perfil administrativo do navegador.

Cadastro pode criar passageiro ou motorista **pendente**. O papel e a aprovação vêm da tabela privada, reconsultada a cada comando/consulta; `user_metadata` não autoriza motorista nem Central. Administrador inicial precisa ser provisionado por operador autorizado no banco isolado e ter TOTP verificado. Não há endpoint público para criar administradores. Os helpers `ci/assisted-fixture.sql` são exclusivos de CI e **não devem ser instalados em ambiente hospedado**.

Uma conta conectada pode abrir **Configurar autenticador**, preparar o QR/chave e confirmar o código atual do seu aplicativo TOTP. A chave fica apenas na resposta privada sem cache e na tela durante a configuração; é removida da tela ao confirmar ou sair. A API valida a identidade e a propriedade do fator, não substitui fatores já verificados e não concede privilégios administrativos. O operador só deve liberar a Central depois da confirmação do email e do TOTP. Não há recuperação automática de fator perdido neste pacote; não remover fatores de outras contas nem usar os helpers de CI no banco hospedado.

Um passageiro e um motorista só podem ter um pedido ativo cada, imposto por índices únicos. Comandos usam versão, UUID por ação, locks e transações; repetição da mesma chave retorna o resultado anterior, corpo diferente é recusado. Histórico e resultado são gravados na mesma transação. Recusa ou vencimento de oferta de 120 segundos devolve o pedido à Central, sem redistribuição automática. Vencimento é materializado na próxima consulta autorizada; aceite fora do prazo é recusado mesmo antes dessa consulta. Não existe relógio/background job garantido para expiração em tempo real.

As telas consultam o mesmo banco, bloqueiam comandos sem confirmação de conexão e não usam localStorage/sessionStorage para tokens. Consultas anteriores a um comando não reconciliam resultado incerto. Sessões de passageiro são retomadas após recarga; refresh fica em cookie HttpOnly. Saída tenta revogar a sessão e limpa cookies. Isso não promete invalidação imediata de todos os JWTs já emitidos nem saída de todos os dispositivos.

## Configuração do ambiente isolado

Usar as versões fixadas em `nave/package-lock.json` com `npm ci --prefix nave --ignore-scripts`. O runtime requer Node >=22.

Antes de instalar em banco isolado, inspecionar tabelas/roles existentes, gerar uma migração com `supabase migration new assisted_pilot` na versão adequada do CLI, incluir o conteúdo revisado de `schema.sql`, executar no ambiente isolado e revisar advisors/grants. O script cria objetos novos e falha se já existirem; não possui `drop`, não deve ser reaplicado automaticamente e não migra contatos ou corridas antigas. O rollback/retention operacional ainda precisa ser definido antes de lançamento.

Configuração explícita do processo separado:

- `NODE_ENV=staging`
- `NAVE_ASSISTED_ENABLED=true`
- `NAVE_ASSISTED_SUPABASE_URL`: banco de homologação isolado, diferente do piloto existente.
- `NAVE_ASSISTED_PUBLISHABLE_KEY` e `NAVE_ASSISTED_SERVICE_KEY`: somente no ambiente do servidor; nunca no cliente ou Git.
- `NAVE_ASSISTED_ORIGIN`: origem HTTPS exata. Para desenvolvimento descartável, aceita `http://127.0.0.1:4318`.
- `PORT`: porta do serviço, padrão 4318.

Executar `node nave/assisted/server.js` e acessar `/assistido/`. O entrypoint recusa os projetos NAVE/WIFLY hospedados conhecidos, a URL operacional existente e ambientes não explicitamente marcados como staging. O SDK não é enviado ao navegador.

No Auth do banco isolado: confirmar email, permitir o redirect exato `<origem>/assistido/confirm`, configurar entrega de email e TOTP administrativo. Confirmação/recuperação devem ser abertas no mesmo navegador que iniciou o pedido por causa do vínculo PKCE. O pacote não configura SMTP nem envia emails em contas hospedadas. As políticas do provedor de email e sua capacidade para piloto ainda precisam ser verificadas; não há garantia de email operacional gratuito.

## Validação agrupada

O workflow existente de Auth isolado instala este script apenas no Supabase temporário do runner. Mailpit captura emails exclusivamente de fixtures `@example.invalid`, sem envio externo. A rodada final inclui os testes anteriores e `ci/assisted.ci.cjs`: cadastro/PKCE, recuperação/senha, cookies/refresh/logout, driver pendente/aprovação/retirada, Central com TOTP, isolamento, quatro categorias, múltiplos pedidos, concorrência, replay/conflito, expiração, cancelamento, reinício em PID distinto com Postgres preservado e jornada em três contextos Chromium. Nenhum teste escreve em banco hospedado.

## Limites que permanecem

O ambiente interativo persistente existe no serviço separado nave-assistido-homologacao; o piloto assistido da versão 45dff4c6d613e5ccf9f28a6eb76f94fe830b63b5 foi aprovado expressamente em 27/10/2026, com limites. Novas funções de mapa/rota ainda precisam de validação humana própria; CI não substitui essa aprovação. Cadastro documental completo, geocodificação validada, preços/aceite financeiro, pagamentos, operação comercial, suporte/legal e notificações em segundo plano permanecem fora deste pacote. Apenas endereços digitados: não há validação geográfica nem ETA operacional. Categoria é preferência do pedido; a elegibilidade física do veículo ainda exige implementação antes de despacho real.

Há no máximo 50 pedidos por snapshot, 500 eventos retornados e limite de 5.000 chaves por participante. Ainda não há paginação completa, política de retenção/eliminação, rate limit distribuído, recuperação de incidente ou tratamento operacional de motorista retirado durante viagem; a aprovação só pode ser retirada quando não há pedido ativo. Não interpretar essas limitações como autorização para reduzir segurança ou iniciar corridas comerciais.

O PMC só deve mudar com evidência de critérios completos. Este pacote não declara homologação nem Marco Histórico.

## Mapa e trajeto do piloto assistido

A seleção é opcional e feita pelo próprio passageiro no mapa: não usa geocodificação/autocomplete nem GPS. O texto de embarque/destino é referência e deve ser conferido com os pontos escolhidos. Os serviços públicos não estão aprovados para tráfego comercial ou escala.

Leaflet 1.9.4 é servido localmente, com versão fixa no lockfile. Imagens do mapa são carregadas diretamente de https://tile.openstreetmap.org/{z}/{x}/{y}.png apenas após autorização e ação do usuário, com atribuição visível, Referer de origem, cache normal do navegador e sem prefetch/download em massa. Política: https://operations.osmfoundation.org/policies/tiles/ .

A rota é calculada pelo servidor em https://routing.openstreetmap.de/routed-car/route/v1/driving/ , com identificação da aplicação, timeout, cache de cinco minutos e limite agregado de uma chamada a cada 1,1 segundo, uma única instância/processo. Sem filas/bulk e sem requisições automáticas. Fonte e atribuição OSRM/FOSSGIS/OpenStreetMap visíveis. Política/privacidade: https://routing.openstreetmap.de/about.html . Provedor pode registrar os pontos; não são enviados nomes, email, endereço digitado ou tokens de sessão. Mapas públicos recebem a região visualizada e IP do navegador. Não é ETA do motorista nem considera trânsito.

A prévia produz token opaco vinculado à identidade, válido por cinco minutos. O cliente não pode fornecer geometria, distância ou duração no comando. Ao criar o pedido, o servidor resolve o token e grava o trajeto na mesma transação da solicitação/evento. RLS e acesso exclusivo por RPC do servidor permanecem; somente participantes e Central veem o trajeto salvo. O token não é autorização para atuar em outro perfil. Trocar pontos invalida a prévia; erro do provedor não inventa uma rota. Usuário pode remover os pontos e continuar explicitamente só com endereços.

Migração aditiva gerada com CLI 2.122.0: supabase/migrations/20261027125036_assisted_route_preview.sql. Instalar somente no projeto isolado mxtunjeyjxbhpjyitcqk, depois de CI. Adiciona route_preview anulável; pedidos antigos continuam válidos. Rollback da aplicação pode reter a coluna e os trajetos, sem apagar dados; não reaplicar a migração nem remover histórico automaticamente. NAVE_ASSISTED_MAP_ENABLED=false desativa novas prévias e configuração de mapas. Não subir várias instâncias com este limitador em memória.

CI usa apenas um servidor de rota loopback e imagens de mapa interceptadas, sem consultas públicas ou coordenadas reais. NAVE_ASSISTED_ROUTING_FIXTURE_URL só é aceita pelo entrypoint com GITHUB_ACTIONS=true, Supabase loopback e origem loopback do runner; projetos hospedados recusam a fixture. Cobertura: consentimento, validação, limites, cache, falhas, token de outra conta, rejeição de geometria do cliente, persistência após reinício e seleção/visualização entre os perfis.

A homologação concedida à versão anterior não é estendida automaticamente a este bloco novo.

## Recuperação de acesso da Central

Uma sessão criada pelo link de recuperação ainda precisa confirmar o TOTP existente antes de abrir a Central. A interface apresenta Confirmar acesso protegido quando a sessão está em AAL1 e há fator verificado. Após validar o código do próprio autenticador, o servidor emite a sessão AAL2; só então o painel e Alterar minha senha ficam disponíveis. Também funciona quando o login por senha foi feito sem preencher o segundo fator inicialmente.

GET /api/assisted/mfa/status retorna apenas se a sessão da própria conta precisa de segundo fator. POST /api/assisted/mfa/challenge aceita somente o código; a identidade e o fator verificado são escolhidos no servidor a partir da sessão, sem IDs fornecidos pelo cliente. Não remove fatores nem concede papéis. Código inválido mantém o formulário e sua mensagem, sem abrir a Central. Senha e código não são armazenados no navegador. Perda do próprio autenticador continua exigindo procedimento autorizado separado; o link de email não contorna o MFA.
