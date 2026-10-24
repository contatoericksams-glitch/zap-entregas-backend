# NAVE — PLANO MESTRE DE CRIAÇÃO (PMC)
**PMC v0.8 · 16/10/2026 · Projeto em criação · MC NÃO EXECUTADO**

## 1. Identidade, escopo e comandos

NAVE é uma empresa de tecnologia. Seu primeiro grande produto é a mobilidade urbana **100% elétrica**, começando por Toledo. Quatro categorias: Eco, Confort, Executive e NAVEGATOR. A interface usa **Embarque**, não “Coleta”. Comissão inicialmente definida: **15% plataforma / 85% motorista**, sujeita a homologação financeira.

**ATUALIZE O PMC** = conferir evidências atuais, apresentar TODOS os módulos, 100 critérios, marcos concluídos, pendências, prioridades, dependências, riscos, percentual, versão e próximos passos. Atualizar esta linha de base quando houver avanços comprovados; não marcar como concluído apenas porque o código foi escrito.

**EXECUTAR O MC** = comando exclusivo do proprietário após aplicativo na **versão final aprovada** com **todas as funcionalidades completas, integradas, testadas e homologadas para operar de verdade**. Não executar MC automaticamente, nem na concepção da ideia nem no primeiro protótipo. Se houver bloqueadores, apresentar as pendências. O comando não substitui os testes.

## 2. Marcos da criação e nascimento

| Marco | Situação | Observação |
|---|---|---|
| Marco Semente — concepção da ideia | Realizado, data não homologada | A ideia surgiu; **não é MC** |
| Marco Fundação — arquitetura e infraestrutura | Parcial | Ecossistema GitHub, Supabase, Render disponível |
| Marco Protótipo — WhatsApp piloto | Conquistado no contexto de testes | Operação fictícia; não é lançamento |
| Marco GPS — localização autorizada | Validado em celular | NAVE-0001 com GPS e 2.004 m até embarque fictício |
| Marco Rotas — ETA pelas ruas | Validado em celular | OSRM ~2,69 km e ~6 min; não considera trânsito |
| Marco SmartDispatch — multi-pilotos | Simulador construído e testado | Pontos de motoristas fictícios; sem despacho real |
| Marco Laboratório de Jornada Fictícia | **Validado visualmente** | Passageiro solicita → oferta DEMO-BETA → aceita → chega ao embarque → embarque → finaliza, conforme sequência de capturas enviada pelo proprietário em 16/10/2026; sem dados persistidos |\n| Marco Estado Persistente de Teste | **Homologado em escopo DEMO** | Confirmação humana de jornada em segunda janela + sequência `start → accept → arrive → board → complete`, `phase=completed`, versão 5 no Supabase; ambas as janelas usam a mesma conta administrativa MFA |
| Marco Jornada Integrada Real | **Pendente** | Integração entre sessões independentes, banco, motorista e passageiro ainda não homologada |
| Marco Homologação V1 | Pendente | Recursos finais e operação segura |
| **MC — NASCIMENTO OFICIAL** | **BLOQUEADO / NÃO EXECUTADO** | Apenas após versão final e `EXECUTAR O MC` |

## 3. Arquitetura e condições de segurança

- Produto: interfaces definitivas passageiro e motorista, Central NAVE Master, gestão de usuários, GPS consentido, geocodificação, cotação, despacho, pagamento e suporte.
- Infraestrutura: GitHub com branches independentes; Render V5 staging, piloto WhatsApp separado; Supabase NAVE; CI automatizada; mapas e OSRM de demonstração.
- Segurança: autenticação/MFA, acesso mínimo, posições efêmeras, consentimento, idempotência e auditoria. Nada de disparos WhatsApp não autorizados.
- **Isolamento obrigatório:** preservar Home V8 Página 1 aprovada e Central Master premium V4; não alterar serviços Zap Entregas nem Retirada Inteligente; não promover mudanças à produção operacional sem autorização.
- **MC não é equivalente à viabilidade de um módulo.** Aplicativo está em construção; não existem corridas comerciais habilitadas.

## 4. Progresso e método

**47/100 critérios cumpridos = 47% de avanço no checklist técnico inicial.**

20 módulos × 5 critérios cada, com peso unitário: 1 item comprovado = 1 ponto percentual. `[x]` significa evidência delimitada ao escopo escrito; não significa módulo inteiro homologado. Este número **não é 47% de prontidão para comercialização**. Os sistemas integrados e critérios críticos continuam pendentes.

> A versão final V1 precisa ser formalmente congelada antes da homologação. Mudanças de escopo alteram denominador apenas mediante aprovação e nova linha de base do PMC. Registro da data de concepção só após confirmação, nunca inventar data.

## 5. Módulos e checklist de construção

### M01 — Fundamentos e identidade (3/5)

**Prioridade:** P0 · **Dependências:** —

- [x] Posicionamento NAVE como empresa de tecnologia elétrica
- [x] Quatro categorias Eco Confort Executive e NAVEGATOR definidas
- [x] Termo Embarque adotado
- [ ] Brand book V1 aprovado
- [ ] Escopo definitivo V1 aprovado e congelado

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M02 — Jornadas e UX (2/5)

**Prioridade:** P0 · **Dependências:** M01

- [x] Home V8 Página 1 aprovada e congelada
- [x] Painel mobile de piloto em homologação
- [ ] Telas definitivas do passageiro integradas
- [ ] Telas definitivas do motorista integradas
- [ ] Jornada acessível e UX em aparelho real homologadas

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M03 — Infraestrutura (5/5)

**Prioridade:** P0 · **Dependências:** —

- [x] GitHub e branches isoladas
- [x] Render V5 staging isolado
- [x] Supabase NAVE disponível
- [x] Backend do piloto WhatsApp separado
- [x] CI com testes de núcleo banco e smoke

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M04 — Segurança e privacidade técnica (4/5)

**Prioridade:** P0 · **Dependências:** M03

- [x] Login de administrador com MFA
- [x] GPS RPC restrito ao piloto autorizado
- [x] RLS e exclusão sob comando para GPS
- [x] Webhook Meta bloqueado na V5 staging
- [ ] Auditoria final de segurança e consentimentos

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M05 — Banco e contratos (3/5)

**Prioridade:** P0 · **Dependências:** M03,M04

- [x] Perfis de motoristas e veículos
- [x] Estruturas de solicitações/ofertas de teste WhatsApp
- [x] GPS efêmero e limpeza programada
- [ ] Migrações versionadas e rollback testado
- [ ] Modelo transacional final de viagem homologado

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M06 — Aplicativo do passageiro (1/5)

**Prioridade:** P0 · **Dependências:** M02,M05,M09,M10

- [x] Solicitação fictícia demonstrada via WhatsApp
- [ ] Cadastro e sessão de passageiro completos
- [ ] Embarque destino e categorias no aplicativo
- [ ] Solicitação e confirmação ligadas ao despacho
- [ ] Acompanhamento histórico e encerramento da viagem

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M07 — Aplicativo do motorista (2/5)

**Prioridade:** P0 · **Dependências:** M02,M04,M05

- [x] Piloto NAVE-0001 ONLINE e identificado
- [x] Painel consentido de GPS no celular
- [ ] Tela operacional completa de motorista
- [ ] Aceite recusa e navegação integrados
- [ ] Notificações e GPS em segundo plano homologados

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M08 — GPS e validade (4/5)

**Prioridade:** P0 · **Dependências:** M04,M05

- [x] GPS voluntário autenticado
- [x] Validade 120 s e limpeza agendada
- [x] Seleção GPS real NAVE-0001 comprovada
- [x] Parada e exclusão com testes
- [ ] Múltiplos motoristas reais com privacidade e escala

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M09 — Mapa e endereços (3/5)

**Prioridade:** P0 · **Dependências:** M03,M08

- [x] Fallback de geocodificação implantado
- [x] Mapa Leaflet para embarque fictício
- [x] Embarque remoto de 2004 m comprovado
- [ ] Endereços reais validados em bairros piloto
- [ ] Contingência e limites de fornecedor aprovados

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M10 — Preço e cotação (2/5)

**Prioridade:** P0 · **Dependências:** M01,M09

- [x] Prévia de preço V5
- [x] Cotação fictícia no WhatsApp piloto
- [ ] Cotação integrada ao app com rota
- [ ] Tabela financeira final aprovada
- [ ] Testes de todas as regras por categoria

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M11 — Frota 100% elétrica (2/5)

**Prioridade:** P0 · **Dependências:** M05

- [x] Quatro categorias elétricas nos testes
- [x] Filtro de veículo elétrico aplicado
- [ ] Regras físicas documentais de categoria homologadas
- [ ] Validação de capacidade e categoria em todas ofertas
- [ ] Múltiplos veículos reais elegíveis homologados

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M12 — Rotas e ETA (3/5)

**Prioridade:** P0 · **Dependências:** M08,M09

- [x] OSRM no celular 2,69 km e cerca de 6 min
- [x] Consentimento adicional do provedor externo
- [x] Timeout e ausência de ETA inventado
- [ ] ETA operacional calibrado em rotas reais
- [ ] Escala provedor e custos homologados

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M13 — SmartDispatch (3/5)

**Prioridade:** P0 · **Dependências:** M08,M11,M12

- [x] Seleção isolada por proximidade
- [x] Ranking entre pilotos fictícios por tempo
- [x] Comparação por matriz OSRM construída e testada
- [ ] Ranking de motoristas reais com GPS consentido
- [ ] Concorrência e redistribuição homologadas

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M14 — Ofertas ao motorista (2/5)

**Prioridade:** P0 · **Dependências:** M07,M13

- [x] Ofertas fictícias nas quatro categorias via piloto
- [x] Notificação técnica App para WhatsApp recebida uma vez
- [ ] Integração despacho do app para motorista
- [ ] Idempotência persistente e expiração de oferta
- [ ] Aceite e retorno ao passageiro homologados entre aparelhos

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M15 — Vida da corrida (1/5)

**Prioridade:** P0 · **Dependências:** M06,M07,M13,M14

- [x] Estado preliminar de cotação fictícia implementado
- [ ] Reserva de motorista e viagem idempotente
- [ ] Embarque início e fim integrados
- [ ] Histórico e comprovante da viagem
- [ ] Jornada E2E completa e homologada

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M16 — Cancelamentos e incidentes (1/5)

**Prioridade:** P1 · **Dependências:** M15

- [x] Regra preliminar de cancelamento em 20 s definida
- [ ] Cancelamentos implementados e testados
- [ ] Recuperação a partir de falha de rede
- [ ] Segurança suporte e abuso especificados
- [ ] Incidentes homologados com trilha de auditoria

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M17 — Pagamentos e comissão (1/5)

**Prioridade:** P0 · **Dependências:** M10,M15

- [x] Comissão proposta 15% NAVE e 85% motorista
- [ ] Meios de pagamento e liquidação aprovados
- [ ] Pagamento seguro e estorno implementados
- [ ] Conciliação repasse e tributação testados
- [ ] Ciclo financeiro completo homologado

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M18 — Central NAVE Master (2/5)

**Prioridade:** P1 · **Dependências:** M05,M13,M15

- [x] Central V4 premium preservada
- [x] Login/MFA para homologação
- [ ] Painel de viagens e motoristas em operação
- [ ] Relatórios trilhas de auditoria e métricas
- [ ] Permissões administrativas homologadas

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M19 — Qualidade e operação assistida (3/5)

**Prioridade:** P0 · **Dependências:** M03,M04

- [x] Testes GitHub Actions do núcleo V5
- [x] Banco efêmero e testes RPC de GPS
- [x] Smoke tests e bloqueio de webhook
- [ ] Teste E2E de dois aparelhos e piloto
- [ ] Teste de carga observabilidade e recuperação

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.

### M20 — Homologação final e MC (0/5)

**Prioridade:** P0 · **Dependências:** M01–M19

- [ ] Escopo final V1 aprovado e congelado
- [ ] LGPD legal suporte e operação liberados
- [ ] Todos módulos e E2E homologados pelo proprietário
- [ ] App final publicado e operante sem bloqueadores
- [ ] Comando do proprietário EXECUTAR O MC recebido e registro de nascimento autorizado

**Critério de conclusão:** cinco itens comprovados e homologação da jornada correspondente.
## 6. Dependências, grandes marcos de entrega e próximos passos

**Caminho crítico:** definição V1 → apps completos → GPS/mapas/cotação → SmartDispatch com pilotos autorizados → oferta segura → aceite → vida da corrida → pagamento/conciliação → central/privacidade → testes E2E → publicação final → homologação → MC com autorização.

**Prioridade P0:** blocos críticos para operação final. **Prioridade P1:** operação, resiliência, suporte e controles necessários à homologação.

**Próximo sprint — integração funcional:** (a) especificar contas e sessões independentes de passageiro e motorista com autorização granular; (b) implementar fluxo seguro de reserva idempotente e ofertas com expiração; (c) validar jornada entre dois aparelhos/contas reais em homologação sem corrida comercial; (d) planejar cancelamento, histórico e comprovantes; (e) preservar isolamento WhatsApp, GPS e cobranças até nova autorização.

**Testes em pacotes:** [Plano MACRO-QA](./QA_PACOTES_MASTER.md) — P01–P05 no painel e Node, P06–P08 em PostgreSQL 16 temporário no GitHub, P09 humano de duas telas. Nenhuma bateria de banco executa cargas no Supabase operacional.

**Bloqueadores de MC:** aplicativos definitivos não integrados; despacho real ainda não homologado; ciclo de corrida incompleto; pagamentos pendentes; suporte/legal e homologação final pendentes; usuário ainda não emitiu `EXECUTAR O MC`.

## 7. Evidências e histórico de atualização

- GitHub `contatoericksams-glitch/zap-entregas-backend`, branch `nave-master-v5-dev`.
- Render `nave-v5-homologacao` e piloto operacional `nave-whatsapp-backend` separados.
- Supabase NAVE: piloto autenticado, RPC e GPS com expiração/limpeza.
- Capturas de tela no projeto: radar NAVE-0001, 2.004 m até embarque remoto, rota OSRM de 2,69 km (~6 min); todos são **testes**, não corridas reais.
- GitHub Actions: última bateria da branch V5 verificada com sucesso em 16/10/2026.
- **Versão 0.1 / 16/10/2026:** início do controle PMC NAVE em 20 módulos; 47% por critérios. MC não executado.
- **Versão 0.2 / 16/10/2026:** sprint de laboratório integrado passageiro → cotação fictícia → seleção de DEMO-motorista → oferta na própria tela → aceitar/recusar → chegada → embarque → finalizar. Cenários de motorista ocupado, recusa, cancelamento e ausência de rota. Arquivos `nave/core/journey-lab.js`, `nave/core/journey-lab.test.js`, `nave/public/jornada-integrada.html`, rota `/api/v5/journey-lab`. Protocolo sem banco, sem GPS, sem Meta e sem pagamentos. **47/100 (47%) mantidos**, porque os critérios remanescentes exigem integração real, aparelhos e homologação; não confundir um simulador funcional com conclusão da jornada final. MC não executado.

- **Versão 0.3 / 16/10/2026 — validação visual humana:** capturas do usuário demonstraram toda a sequência do laboratório NAVE Eco, motorista fictício DEMO-BETA, valor ilustrativo R$ 13,00: solicitação / oferta / aceite / chegada ao embarque / confirmação do embarque / conclusão com status “Viagem fictícia finalizada” em ambas as visões e indicação “mensagens enviadas: 0”. **Marco Laboratório de Jornada Fictícia HOMOLOGADO VISUALMENTE**. **Não representa corrida entre aparelhos reais, transação persistida nem operação final.** M15 permanece **1/5** e PMC **47/100 (47%)**, sem extrapolar evidência. MC não executado.

- **Versão 0.4 / 16/10/2026 — sprint de estado compartilhado (migração pendente):** construída uma estrutura isolada de sessões fictícias com persistência PostgreSQL: `006_shared_journey_lab_DRAFT.sql` (tabela de sessões e eventos, RPCs `nave_v5_lab_start`, `nave_v5_lab_snapshot`, `nave_v5_lab_advance`, MFA administrativo, RLS, controle de versão, idempotência, 30 minutos de validade) e `007_shared_journey_purge_DRAFT.sql` para limpeza periódica. Nova interface `jornada-compartilhada.html` para duas sessões independentes **da mesma conta administrativa MFA**; as identidades reais de passageiro/motorista ainda não foram implementadas. Cinco conjuntos de CI, incluindo PostgreSQL temporário, passaram. **Migrações não foram aplicadas no Supabase; sincronização real entre navegadores ainda aguarda autorização.** M15 permanece **1/5**, PMC **47/100 = 47%**, MC não executado.

- **Versão 0.5 / 16/10/2026 — instalação da jornada compartilhada:** com autorização do proprietário, migrações `006_shared_journey_lab_DRAFT.sql` e `007_shared_journey_purge_DRAFT.sql` foram aplicadas **somente no Supabase NAVE**. Criadas tabelas `nave_v5_lab_sessions` e `nave_v5_lab_events`; três RPCs protegidas por conta administrativa/AAL2; RLS e permissões diretas/anon bloqueadas. `pg_cron` ativado para limpeza a cada 10 minutos de sessões após 30 min de validade. Verificações após a instalação: **0 sessões e 0 eventos**, permissões de acesso direto negadas e job ativo. Página de laboratório atualizada no GitHub; **teste visual real entre duas sessões ainda pendente**. M15 permanece 1/5 e progresso global 47/100 (47%), pois ainda não há viagem operacional integrada. MC não executado.

- **Versão 0.6 / 16/10/2026 — MACRO-QA:** criados pacotes P01–P09, suíte extensiva Node `core/macro-qa-batches.test.js`, suíte SQL `core/migrations/008_macro_qa_isolated_test.sql`, teste de segurança da UI `core/macro-qa-ui.test.js` e painel de execução única `public/pacotes-qa.html`. Matriz das 4 categorias, 3 situações, jornadas, recusas, preços, cancelamentos, HTTP, MFA, estado persistente, controle de versão, quota e expiração. CI automatizada na branch V5 aprovada com cinco jobs. Testes de banco somente no PostgreSQL temporário; P09 entre dois navegadores ainda exige homologação manual. **Progresso permanece 47/100 (47%)**: testar mais não altera os critérios finais ainda não entregues. **MC NÃO EXECUTADO**.

- **Versão 0.7 / 16/10/2026 — execução efetiva dos macropacotes:** após comando **“execute”**, rodados **P01–P05 contra a API fictícia publicada na homologação** via workflow específico de GitHub Actions [38928889079](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/38928889079). Evidência: **5/5 pacotes aprovados, 885 verificações aprovadas, 0 falhas, 85 requisições HTTP**. A mesma execução concluiu **6/6 jobs com sucesso**, inclusive PostgreSQL temporário para P06–P08, testes do núcleo, GPS e smoke HTTPS. **P09 (sessões humanas com MFA em duas telas) ainda não homologado.** Relatório detalhado: [`QA_EXECUTION_LOG.md`](./QA_EXECUTION_LOG.md). **Módulos e progresso mantidos em 47/100 (47%)**; cobertura de testes, por si só, não satisfaz critérios finais de integração real. **MC NÃO EXECUTADO**.

- **Versão 0.8 / 16/10/2026 — P09 homologado no laboratório:** após orientação para abrir a mesma sessão em outra janela, o proprietário declarou que a jornada funcionou. Conferência de leitura no Supabase NAVE comprovou `phase=completed`, `version=5` e eventos `start → accept → arrive → board → complete`. **P09 homologado somente para duas janelas de DEMO usando a mesma conta administrativa MFA**; o banco, isoladamente, não demonstra quem clicou em cada janela. Não implica motoristas/passageiros autenticados independentemente nem viagem operacional. **Progresso PMC: 47/100 (47%)**, pois nenhum critério do app final foi encerrado. MC não executado. Evidência no [registro MACRO-QA](./QA_EXECUTION_LOG.md).
- **Versão 0.9 / 23/10/2026 — inspeção Supabase e preparação de vínculo app↔WhatsApp:** consulta somente leitura ao dashboard e às conexões da conta confirmou organização Nave Mobilidade com dois projetos: o projeto principal NAVE (`mkeexsryqnaxsnshrfqn`, `sa-east-1`, compute NANO) e WIFLY. A organização separada Retirada Inteligente contém um projeto inativo (`wvzkjqsbkupevasbjscq`, `us-west-2`), sem evidência de que seja staging do NAVE. O projeto NAVE está `ACTIVE_HEALTHY` pela API de gestão, mas o dashboard exibiu temporariamente “Unhealthy” durante aviso de incidente técnico; requer nova conferência antes de qualquer diagnóstico de indisponibilidade. A página de branches informa **“No branches”**; não há ambiente/branch Supabase isolado identificado para a implementação autorizada. O catálogo lista 15 migrações até `nave_v5_shared_lab_30min_expiry_cleanup`; o esquema WhatsApp mantém contatos por telefone, sem vínculo demonstrado a `user_profiles`, e não há tabela/RPC de desafio OTP. Advisors atuais registram 12 tabelas com RLS sem policies, 14 funções `SECURITY DEFINER` executáveis por `authenticated`, proteção de senha vazada desativada, 15 FKs sem índice cobrindo e dez índices não utilizados (achados INFO/WARN; sem mudança aplicada). O vínculo permanece somente como draft local, com sender desligado e 128 testes locais aprovados. **Nenhuma migração foi aplicada, nenhum dado foi gravado e nenhum OTP foi enviado. PMC mantido em 47/100; sem homologação nem MC.** Evidência detalhada no adendo local de 23/10/2026.
- **Revisão local 0.10 / 23/10/2026 — adapter e migration draft para OTP app↔WhatsApp:** adicionados `core/channel-link-supabase.js`, que resolve contato de passageiro pelo servidor e mapeia operações aos RPCs, `core/migrations/009_channel_link_otp_DRAFT.sql` com desafios HMAC, tentativas limitadas, intervalo de reenvio, vínculo único e limpeza sob retenção de um dia, e roteiro SQL para PostgreSQL efêmero. As funções ficam restritas ao `service_role`; nenhuma rota HTTP foi conectada e o sender segue desligado. A suíte Node passou **131/131**. O roteiro e a migration passaram em PGlite (motor PostgreSQL 17 em memória): o primeiro ensaio detectou o tipo do parâmetro de tentativas incompatível com chamada inteira; a assinatura foi corrigida para `integer` e todos os casos repetidos passaram (grants, throttle, limite de tentativas, expiração, uso único, contato inexistente e vínculo exclusivo). Isso não cobre concorrência entre conexões nem JWT/Data API Supabase. **Nenhuma alteração externa, mensagem ou dado foi enviado; PMC permanece 47/100 e sem homologação/MC.**
- **Revisão local 0.11 / 23/10/2026 — API autenticada de vínculo app↔WhatsApp:** adicionados `core/channel-link-router.js` e testes HTTP. O servidor verifica access tokens com Supabase Auth e usa somente a identidade retornada pelo Supabase; os endpoints start/confirm não aceitam identidade no corpo e não retornam o código OTP. `server.js` só monta a rota em `NODE_ENV=staging`, com flag explícita, projeto Supabase, remetente Meta, template de autenticação e segredos próprios de staging, distintos dos valores do serviço existente. Testes de configuração confirmam que produção, config incompleta, URL/chave Supabase, remetente/token Meta ou template ausente/inválido mantêm a rota fechada. O envio usa template AUTHENTICATION aprovado, nunca texto livre; formato de código no corpo e botão de cópia coberto por teste. Documentada a configuração no `README.md`. Suíte completa local: **144/144 testes aprovados**; verificação sintática e `git diff --check` limpos. A rota ainda não foi conectada a um app real, a configuração isolada não foi preenchida, nenhuma mensagem foi enviada e nenhum endpoint remoto foi exercitado. O draft SQL continua sem aplicação, pois não há projeto NAVE de staging confirmado. **PMC permanece 47/100; sem homologação ou MC.**
- **Revisão local 0.12 / 23/10/2026 — envio OTP por template AUTHENTICATION e contrato de app:** a revisão técnica substituiu o texto livre por payload de template Meta e exige nome e idioma do template; body e botão de cópia recebem o mesmo código. Os testes verificam payload e bloqueio de configuração sem template aprovado. O README documenta os corpos e respostas dos endpoints para o app passageiro. A coleção oficial da WhatsApp Business Platform disponibiliza templates AUTHENTICATION com botão de cópia; não foi consultado/configurado nenhum template da conta NAVE. Rechecagem das abas e do inventário Render: o dashboard Supabase continua em `main`, sem branches, e mostra aviso de investigação técnica; o inventário Render lista `nave-v5-homologacao` na branch `nave-master-v5-dev` com auto-deploy desligado e `nave-whatsapp-backend` na `nave-whatsapp-mvp` com auto-deploy ligado. Nenhum serviço Supabase/Render isolado para o vínculo foi confirmado, e a branch local não foi enviada para evitar deploy automático no backend existente. A suíte completa passa **144/144**. **Nenhuma mudança externa ou mensagem; PMC 47/100, sem homologação/MC.**

- **Revisão local 0.13 / 23/10/2026 — primeira interface de passageiro:** criados `public/passageiro.html`, `.css` e `.js`, com layout responsivo, percurso de demonstração fixo, quatro categorias e cotações calculadas pelo Core existente. A interface percorre solicitação, aceite, chegada, embarque, conclusão e cancelamento fictícios; controles do motorista aparecem em seção de demonstração explícita. Não há login fictício apresentado como real, endereço livre, GPS, persistência ou comunicação externa. Servidor de prévia próprio escuta apenas em loopback e não carrega credenciais. Testes de interface exercitam jornada completa, cancelamento, indisponibilidade de cotações e recusa de flags comerciais. Suíte completa: **147/147**, zero falhas. Navegador local verificou escolha de categoria, sequência completa e cancelamento. Permanece protótipo, não aplicativo definitivo ou integração entre contas. **PMC 47/100 mantido; sem publicação/homologação/MC.**

- **Revisão local 0.14 / 23/10/2026 — interface de motorista:** criados `public/motorista.html`, `.css` e `.js`, com disponibilidade local, oferta fictícia, aceite/recusa e etapas chegada/embarque/conclusão. Valores são obtidos do Core, com parcela NAVE de 15% e repasse ilustrativo antes de despesas. Recusa encerra a oferta do piloto original nesta interface; não permite agir pela identidade do próximo piloto. Adicionados links entre as prévias, sem sincronização ou contas reais. Testes de interface cobrem opt-in de disponibilidade, jornada completa, valores, isolamento após recusa e respostas inseguras/indisponíveis. Navegador local confirmou conclusão e recusa. Suíte completa: **150/150**, zero falhas. Sem estado remoto, GPS, mensagens, pagamentos, push ou deploy. **M07 e PMC mantidos: 47/100; sem nova homologação ou MC.**

- **Revisão local 0.15 / 23/10/2026 — duas prévias sincronizadas em memória:** adicionados `core/local-demo-router.js` e `public/local-sync.js`, usados somente pelo servidor loopback de prévia via `?shared=1`. Passageiro inicia/cancela/reinicia pedido; motorista altera disponibilidade e aceita/recusa/avança a jornada. Uma sala fictícia, sem autenticação; rótulos de papel não são contas independentes. Servidor mantém estado autoritativo apenas na memória, valida sequência, papel de demonstração, versão e instância; recusa não redistribui a outro piloto. Rejeita origem/host não locais e estado fornecido pelo cliente. Navegador verificou oferta aparecendo na outra aba, etapas e conclusão refletidas no passageiro, recuperação ao recarregar e reset após reiniciar servidor. A suíte HTTP cobre jornada, versão concorrente, cancelamento, recusa, isolamento de origem e instância antiga. **155/155 testes**, zero falhas. Sem Supabase, GPS, Meta, dinheiro, push ou deploy. Esta sincronização local não altera homologação de P09 nem comprova contas/aparelhos independentes. **PMC permanece 47/100; sem nova homologação ou MC.**

- **Revisão local 0.16 / 23/10/2026 — Central de demonstração somente de leitura:** criados `public/central-local.html`, `.css` e `.js`, com disponibilidade, fase, categoria, valores ilustrativos e histórico da mesma sala fictícia. Servidor registra somente ações aceitas, com sequência/horário/papel de demonstração/fase, limitado a 100 registros na memória. Consultas, comandos rejeitados e aceites duplicados não criam eventos extras. Central usa papel observador sem permissão de mutação; não equivale à autorização administrativa da Central Master real. Testes verificam sequência, ausência de duplicatas, limite de retenção e bloqueio de mutação por observador. Navegador comprovou disponibilidade → solicitação → aceite → chegada → embarque → conclusão na Central. **157/157 testes**, zero falhas; sintaxe e diff limpos. Sem publicação, banco remoto, dados pessoais ou operação real. **M18/PMC mantidos: 47/100; sem homologação nova nem MC.**

- **Revisão local 0.17 / 23/10/2026 — preparação de Auth efêmero no CI:** máquina inspecionada tem cerca de 4 GB de RAM, Docker ausente, sem Supabase CLI global; não comporta o caminho Docker Desktop documentado com mínimo de 8 GB. Conta Supabase conectada mostra dois projetos ativos (NAVE e WIFLY); o proprietário informou não dispor de outro computador/conta. Confirmado repositório GitHub público e execução gratuita em runner padrão conforme documentação. Preparado workflow restrito à branch de revisão, com Supabase CLI 2.122.0 temporário, fixtures sem dados reais e teste de duas sessões Auth distintas, OTP vinculado ao usuário, negação entre usuários, replay e grants via Data API. SDK/Express fixados e lockfile incluído; Node >=22 acompanha requisito das dependências. **157 testes locais passaram; execução do novo teste Supabase real ainda pendente nesta revisão.** Render continua nas branches `nave-master-v5-dev` (auto-deploy desligado) e `nave-whatsapp-mvp` (ligado), com PR previews desligados; proposta não deve ser mesclada nem implantada. **PMC 47/100, sem nova homologação/MC.**

- **Revisão 0.18 / 23/10/2026 — Auth/OTP real validado em runner efêmero:** criada branch de revisão `codex/nave-wa-account-link-draft`, commit `ed418b6f47ccaa60cc5d63077acede9733287ff3`, e [PR #5 em rascunho](https://github.com/contatoericksams-glitch/zap-entregas-backend/pull/5) para preservar código e evidências sem mesclar. O [workflow 40023839180](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40023839180) terminou **success**: Supabase temporário no runner padrão Ubuntu, duas contas fixture com sessões Auth reais, middleware HTTP validando token, desafio limitado ao usuário proprietário, tentativa de confirmação por outra conta recusada, confirmação legítima aceita, replay negado e acesso direto a tabelas/RPCs negado a anon/authenticated. Entrega OTP permaneceu callback em memória, sem Meta. Uma bateria de integração passou, zero falhas; as 157 verificações locais também passaram. Stack encerrada com sucesso, artefatos vazios. Rechecagem do Render mantém os deploys de 16/10: V5 em `006b7ca7...` e WhatsApp em `e2104d88...`; nenhuma promoção. **Limite:** testa identidade do vínculo OTP; não implementa sessão/autorizações passageiro/motorista nas telas compartilhadas, aprovação de motorista, delivery WhatsApp, ambiente interativo permanente ou P09 entre aparelhos reais. **PMC mantido em 47/100; sem nova homologação ou MC.**

**Regra de update:** a cada `ATUALIZE O PMC`, recontar checkboxes e revisar provas; reportar `n/N`, `(n/N)*100`, itens concluídos, parcialidades, pendências e riscos. Nunca declarar `EXECUTAR O MC` sem comando literal do proprietário e homologação final.

- **Revisão 0.19 / 23/10/2026 — contas e permissões nos aplicativos em laboratório isolado:** adicionada aplicação separada `auth-lab.js`, restrita a Supabase efêmero loopback; páginas passageiro/motorista recebem formulário em `?auth=1`, com token apenas na memória da aba. Servidor verifica `getUser` a cada requisição, exige papel administrativo da fixture e aprovação explícita do motorista, recusa promoção via `user_metadata` e vincula a jornada fictícia ao passageiro/motorista participantes. Central permanece fora desse modo. Testes locais **161/161** passaram; O [CI real ampliado 40026114296](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40026114296), código `516da9e36e2e6dc47e808d85e03f1f5ef0ac5fee`, terminou **success**: 161 testes locais novamente no runner e duas baterias de integração real, zero falhas. Login pelos endpoints dos apps, perfis sem aprovação/metadados forjados recusados, isolamento de outra conta, jornada fictícia completa e retirada de aprovação com token antigo passaram. Stack encerrada; nenhum artefato publicado. Não há login ativo no servidor de prévia comum nem projeto interativo duradouro. Cadastro, aprovação documental, persistência de corridas, P09 entre aparelhos e homologação continuam pendentes. **PMC 47/100; sem publicação, nova homologação ou MC.**

- **Revisão 0.20 / 23/10/2026 — Central autenticada de laboratório:** preparada visão somente de leitura na sala fictícia para conta administrativa de fixture com MFA TOTP real/AAL2. Login limpa senha/código; cada consulta revalida identidade, papel e MFA. Comandos de escrita e papéis forjados são recusados antes de snapshots; remoção do papel bloqueia o token existente. Nenhuma alteração na Central Master operacional, projeto hospedado ou conta pessoal. TOTP habilitado apenas no config temporário do runner; geração do CLI verificada sem Docker local. **164 testes locais passaram**; O [CI Supabase 40028720835](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40028720835), código `b7c0d06207a9fa357a7a54cd42d00b7d6e66b0c2`, concluiu **success**: 164 testes repetidos no runner e duas baterias reais aprovadas. MFA TOTP/AAL2 efetivo, bloqueio sem fator/código incorreto, consulta sem mutação, escrita forjada negada e retirada de papel com JWT antigo confirmados. Stack encerrada; nenhum artefato publicado. Persistência operacional, P09 entre aparelhos e homologação continuam pendentes. **PMC 47/100; sem merge, produção ou MC.**

- **Revisão 0.21 / 23/10/2026 — preparação E2E de navegador para P09:** adicionada bateria Chromium/Playwright fixada, executável apenas no runner com Supabase efêmero. Exercita formulários reais e contextos independentes de passageiro, motorista e Central com MFA; quatro categorias, disputa de aceite, desconexão/retomada, conta externa, cancelamento, recusa, valores e saída. **164 testes locais passaram**; O [CI 40032145912](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40032145912), código `30f32377647f43685fa642abe182b16c4588d271`, concluiu **success**: 164 testes locais repetidos no runner, duas baterias API/Supabase reais e uma bateria Chromium passaram, zero falhas. Foram confirmados login pelos formulários com MFA da Central, quatro categorias, um único aceite concorrente, recuperação após perda de rede, conta externa sem snapshot, cancelamento, recusa, valores e logout. Stack encerrada; nenhum artefato publicado. Preservado o P09 humano histórico da mesma conta administrativa; novo E2E não comprova aparelhos físicos, persistência operacional ou homologação. **PMC 47/100; sem merge, produção ou MC.**

- **Revisão 0.22 / 23/10/2026 — oferta de teste com prazo e repetição segura:** sala autenticada recebe chaves UUID por ação, repetição sem evento duplicado, conflito por corpo diferente, cache limitado e retenção de 15 minutos. Cliente repete uma falha de transporte uma vez com a mesma chave/corpo. Oferta pendente vence em 120 segundos somente no laboratório; próximo acesso autorizado materializa um evento do sistema, aceite tardio é recusado e replay não reabre oferta. Aceite válido remove o prazo. **168 testes locais passaram**; O [CI 40033699042](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40033699042), código `8917a210eb4a81c6e61a7473b6acd7b7cc1928e3`, terminou **success**: 168 testes locais repetidos no runner, três baterias API/Supabase e uma bateria Chromium passaram, zero falhas. Confirmados prazo no limite exato, aceite tardio recusado, replay sem reativação, concorrência, recuperação real de resposta descartada após processamento e evento de expiração nas três telas. Stack encerrada; nenhum artefato publicado. Prazo/cache são regras de laboratório, não contratos operacionais; persistência de reservas/despacho real ainda pendente. **PMC 47/100; sem merge, produção, homologação ou MC.**

- **Revisão 0.23 / 23/10/2026 — recuperação de laboratório após reinício controlado:** preparado checkpoint privado no caminho exato do runner, com escrita atômica, limite de tamanho e escritor exclusivo. Preserva identidade da sala, participantes de fixture, prazo, histórico e chaves; sessões seguem verificadas no Auth, sem tokens/senhas no arquivo. Falha de gravação bloqueia operação; estado inválido não é substituído silenciosamente. Não há recuperação automática de lock após crash nem suporte multiworker. **173 testes locais passaram**; O [CI 40051101620, tentativa 2](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40051101620/attempts/2), código `53e7c9956f6ec56e32f05eb9fdb2ff8ca7ce3de6`, concluiu **success**: 173 testes repetidos no runner, três baterias API/Supabase, uma de reinício entre processos e uma Chromium passaram, zero falhas. Processos distintos retomaram oferta, aceite e conclusão mantendo UUID/versão/prazo/chaves e isolamento. Entrada inválida/registro grande são recusados antes de gravar. A primeira tentativa foi cancelada na instalação Ubuntu e repetida sem alterar código. Stack encerrada, artefatos vazios. Recuperação de fixture não é persistência operacional nem homologação de viagem real. **PMC 47/100; sem merge, produção ou MC.**

- **Revisão 0.24 / 23/10/2026 — retomada e retirada de permissão em navegador:** ampliado E2E para recarregar o passageiro e retomar a viagem após novo login sem eventos; retirar/restaurar aprovação do motorista e papel da Central exclusivamente nas fixtures, verificando 403, limpeza de percurso/histórico e nova autenticação/MFA. Mudança apenas de teste; sintaxe/diff verificados. Resultado em 24/10/2026: o [CI 40056221374](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40056221374), código `70fac024946d63a5a615563013e3c857c7546a01`, concluiu **success**: 173 testes locais, três baterias API/Supabase, uma de reinício entre processos e uma Chromium passaram no runner, zero falhas. Retomada sem novo evento, limpeza após 403 e nova entrada/MFA confirmadas. Stack encerrada, artefatos vazios. As verificações existentes foram repetidas com sucesso. Não equivale a revogação global de tokens, contas operacionais ou homologação em aparelhos físicos. **PMC 47/100; sem produção, merge ou MC.**

- **Revisão 0.25 / 24/10/2026 — comandos bloqueados durante desconexão:** as prévias sincronizadas de passageiro e motorista agora desabilitam comandos quando a consulta falha ou o envio continua incerto após as tentativas permitidas. O cliente recusa novas mutações usando a cópia antiga; só uma consulta válida libera novamente os controles, inclusive quando a versão da sala não mudou. Motorista também aguarda a primeira conexão antes de alterar disponibilidade. Acrescentados testes de perda de leitura/envio, resposta incompatível e retomada na mesma versão para os modos compartilhado e autenticado, além de checagens Chromium de cancelamento/embarque desabilitados offline. O [CI 40057472586](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40057472586), código `594f4d4f1d72f816a4f0c83e9dddb3ebf345d62b`, terminou **success** na primeira tentativa: 175 testes locais, três baterias API/Supabase, uma de reinício e uma Chromium passaram, zero falhas. Navegador confirmou cancelamento e embarque desabilitados offline, liberação após consulta válida e mesma versão sem eventos extras. Stack encerrada, artefatos vazios. Não cria fila offline nem autoriza corrida comercial. **PMC mantido em 47/100; sem produção, merge, nova homologação ou MC.**
