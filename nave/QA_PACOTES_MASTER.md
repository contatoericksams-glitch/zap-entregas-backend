# NAVE V5 — PLANO MACRO DE TESTES (MACRO-QA)

**Edição 1.1 · 16/10/2026 · Staging apenas · MC não executado**

## Objetivo
Reduzir a quantidade de testes manuais repetitivos; executar várias categorias, estados e exceções automaticamente, com provas no GitHub e visualização simplificada no navegador. **Não alterar o numerador do PMC se um critério funcional final continuar pendente.** A matriz mede a qualidade do código e da homologação, não percentuais fictícios de conclusão.

## Macropacotes e critérios de aceite

| Pacote | Abrangência | Executor | Aceite |
|---|---|---|---|
| P01: Categorias e elegibilidade | Eco, Confort, Executive, NAVEGATOR × normal/ocupado/sem rota | GitHub Node + painel | 12 cenários em conformidade |
| P02: Jornada completa | Solicitar → aceitar → chegar → embarcar → finalizar por categoria | GitHub Node + painel | Sequências completas, inclusive status terminal |
| P03: Redistribuição | Recusar, tentar próximo elegível, esgotar candidatos | GitHub Node + painel | Nunca selecionar candidato indevido |
| P04: Cancelamentos e preços | Cancelar nas 3 fases anteriores ao embarque; matriz preço/distância/duração + comissão | GitHub Node + painel | Sem cancelar depois do embarque; centavos reconciliados |
| P05: Erros e isolamento | HTTP 400, estados inválidos, flags de segurança, nenhuma integração comercial | GitHub Node + painel | Rejeição segura, sem Meta, pagamentos nem GPS |
| P06: Estados persistentes | 4 categorias × 3 cenários em SQL; evento, aceite, embarque, encerramento | GitHub PostgreSQL 16 temporário | Nenhuma gravação em tabelas reais de corrida |
| P07: Concorrência e acesso | Chaves idempotentes, versão desatualizada, MFA, anon bloqueado, limite de sessões | GitHub PostgreSQL 16 temporário | Sem evento duplicado ou escalonamento de privilégio |
| P08: Expiração e limpeza | Sessão de 30 min, remoção e cascade, falha segura | GitHub PostgreSQL 16 temporário | Sessão expirada inacessível; eventos associados removidos |

**Pacote humano separado — P09:** uma jornada compartilhada em dois navegadores com a **mesma conta administrativa e MFA**, comprovando que aceite/recusa e conclusão se sincronizam. Este é um teste de integração de laboratório, **não um piloto entre contas reais de passageiro e motorista**.

## Como executar

1. **GitHub Actions:** a cada push da branch isolada `nave-master-v5-dev`, o workflow `.github/workflows/nave-v5-tests.yml` executa `core-tests` (inclui `macro-qa-batches.test.js`), PostgreSQL de GPS, PostgreSQL de RPC, PostgreSQL da jornada (inclui `008_macro_qa_isolated_test.sql`) e o smoke HTTPS da homologação.
2. **Tela de um clique:** `https://nave-v5-homologacao.onrender.com/pacotes-qa.html` → **Executar os 5 pacotes**. O painel executa apenas `POST /api/v5/journey-lab`, que é computacional, fictício e sem persistência. Não chama Supabase, Meta nem OSRM.
3. **P09 humano:** `/jornada-compartilhada.html`, entrar em dois navegadores com MFA, criar sessão DEMO em um e abrir o UUID no segundo. Validar transições, capturas e inexistência de ações externas. **Não enviar credenciais, código MFA ou ID da sessão publicamente**.

## Isolamento obrigatório

- GitHub: somente `nave-master-v5-dev`.
- Render: somente `nave-v5-homologacao`; outros serviços mantidos.
- PostgreSQL do GitHub é descartável; a bateria de banco não consulta nem grava dados no Supabase operacional.
- O painel não cria viagens comerciais, não dispara WhatsApp, não envia GPS, não realiza pagamentos.
- As tabelas `nave_v5_lab_sessions` e `nave_v5_lab_events` existentes no Supabase NAVE só são usadas no P09 com autenticação administrativa e consentimento humano.
- Nenhum teste de carga agressivo em Render Free, OSRM público, Meta, Supabase produtivo ou aplicativos externos sem aprovação e limites separados.

## Entrega e impacto no PMC

**Fase QA automatizada:** aprovada em GitHub Actions [38928889079](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/38928889079): P01–P05 na API staging (885 verificações, 0 falhas, 85 requisições); P06–P08 em PostgreSQL temporário. **P09 homologado em escopo DEMO** por confirmação humana de uso em segunda janela e sequência persistente completa (`start → accept → arrive → board → complete`, versão 5, estado `completed`) verificada no Supabase NAVE em 16/10/2026. A instrumentação não prova identidades distintas; ambos os papéis usam a mesma conta administrativa autenticada com MFA.

**PMC:** permanece `47/100 (47%)`. Os novos testes não dão pontos por si só; ao passar um critério funcional completo listado no PMC, anexar evidência e atualizar o checkbox correspondente. **MC = NÃO EXECUTADO**.

Próxima prioridade funcional: implementar autenticação real separada de passageiros e motoristas e jornada final, com testes E2E em dois aparelhos/contas distintas, mantendo o webhook Meta operacional intocado.

## Adendo de 23/10/2026 — preparação automática com contas distintas

Além do P09 humano histórico descrito acima, a branch de revisão `codex/nave-wa-account-link-draft` prepara `nave-auth-isolated.yml` com Auth/OTP, permissões dos apps e Central com MFA em Supabase descartável. A nova etapa `app-browser.ci.cjs` abre as telas com contextos Chromium independentes e credenciais de fixture pelos formulários. Testa as quatro categorias, aceite concorrente, reconexão, bloqueio de conta externa, cancelamento/recusa e logout. Resultado: [run 40032145912](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40032145912), commit `30f32377647f43685fa642abe182b16c4588d271`, concluiu **success**. Os 164 testes locais passaram no runner, duas baterias API/Supabase passaram e a bateria Chromium passou, incluindo todas as verificações de tela citadas. Stack encerrada, artefatos vazios. Detalhes em `ci/README.md`.

A nova branch de revisão é uma exceção explícita às instruções históricas de branch acima, exclusivamente para esse workflow efêmero. Não alterar nem disparar o P09 no Supabase NAVE hospedado como parte dessa bateria. Não há deploy, gravação em corridas reais, Meta, GPS ou pagamento. Chromium no runner não representa dois aparelhos físicos, aplicativo definitivo nem homologação nova. PMC continua 47/100.
