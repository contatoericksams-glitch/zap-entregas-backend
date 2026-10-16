# NAVE V5 — Registro de execução MACRO-QA

**Solicitação do proprietário:** `EXECUTE` / “execute”, recebida em 16/10/2026.

**Escopo:** executar a mesma matriz P01–P05 do painel público de homologação, em sequência, por GitHub Actions usando `nave/core/macro-qa-staging-runner.cjs` em conexão HTTPS apenas com `/api/v5/journey-lab`, após preflight das flags de segurança.

**Isolamento:** somente passageiros e motoristas fictícios, sem GPS, pagamentos, WhatsApp, viagens comerciais ou escrita no banco de produção.

**P06–P08:** suíte SQL já executada em PostgreSQL temporário por CI; P09 entre navegadores com MFA é validação humana separada e não foi solicitada neste comando.

**Status deste registro:** **EXECUTADO E APROVADO** pelo GitHub Actions, run [38928889079](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/38928889079), em 16/10/2026. **PMC permanece em 47%** e MC não executado.

## Resultado verificado

**Resultado MACRO-QA HTTP na homologação:** **5/5 pacotes APROVADOS, 885 verificações aprovadas, zero falhas, 85 chamadas ao endpoint fictício.**

| Pacote | Resultado |
|---|---|
| P01 — Categorias/disponibilidade | Aprovado |
| P02 — Jornada completa | Aprovado |
| P03 — Recusa/redistribuição | Aprovado |
| P04 — Cancelamento em três fases | Aprovado |
| P05 — Rejeições/segurança da API | Aprovado |

**Total da execução GitHub Actions:** **6/6 jobs bem-sucedidos**, incluindo `macro-qa-staging`, `staging-smoke`, `core-tests`, `postgres-shared-journey-test`, `postgres-gps-test` e `postgres-rpc-test`.

**Limite da comprovação:** P01–P05 rodaram contra a API fictícia publicada, sem efeitos colaterais; P06–P08 executaram no PostgreSQL descartável do GitHub, **não** no banco operacional da NAVE; P09 (dois navegadores autenticados com MFA) continua **pendente**. Esta execução não homologa os aplicativos finais do passageiro ou motorista.

**Pontuação do PMC:** `47/100 = 47%` (sem mudança, pois nenhum critério funcional pendente foi plenamente concluído pela bateria). **MC NÃO EXECUTADO**.

