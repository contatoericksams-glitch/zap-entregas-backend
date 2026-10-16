# NAVE — PLANO MESTRE DE CRIAÇÃO (PMC)
**PMC v0.7 · 16/10/2026 · Projeto em criação · MC NÃO EXECUTADO**

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
| Marco Laboratório de Jornada Fictícia | **Validado visualmente** | Passageiro solicita → oferta DEMO-BETA → aceita → chega ao embarque → embarque → finaliza, conforme sequência de capturas enviada pelo proprietário em 16/10/2026; sem dados persistidos |\n| Marco Estado Persistente de Teste | **Estrutura instalada, homologação humana pendente** | Tabelas e RPCs de sessões fictícias no Supabase, testes isolados e limpeza ativa; simulação entre dois navegadores ainda não confirmada em campo |
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

**Próximo sprint — homologação concentrada:** (a) executar o lote P01–P05 na tela `/pacotes-qa.html` com um clique; (b) validar P09 entre dois navegadores com a mesma conta administrativa MFA e evidências de sincronização; (c) registrar critérios de módulo realmente concluídos, sem pontuação por testes repetidos; (d) implementar autenticação real separada de passageiro/motorista e jornada completa; (e) preservar isolamento de WhatsApp, GPS e cobranças.

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

**Regra de update:** a cada `ATUALIZE O PMC`, recontar checkboxes e revisar provas; reportar `n/N`, `(n/N)*100`, itens concluídos, parcialidades, pendências e riscos. Nunca declarar `EXECUTAR O MC` sem comando literal do proprietário e homologação final.
