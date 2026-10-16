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

**Limite da comprovação:** P01–P05 rodaram contra a API fictícia publicada, sem efeitos colaterais; P06–P08 executaram no PostgreSQL descartável do GitHub, **não** no banco operacional da NAVE; P09 foi homologado **posteriormente**, mediante declaração do proprietário e conferência dos registros persistentes. Isso **não** homologa os aplicativos finais do passageiro ou motorista.

**Pontuação do PMC:** `47/100 = 47%` (sem mudança, pois nenhum critério funcional pendente foi plenamente concluído pela bateria). **MC NÃO EXECUTADO**.


## Homologação humana P09 — 16/10/2026

**Homologação do laboratório DEMO: APROVADA.** O proprietário confirmou ter conseguido abrir a jornada na segunda janela e, em seguida, que “deu certo a jornada”. Consulta somente leitura ao Supabase NAVE identificou sessão fictícia com `phase=completed`, `version=5`, sequência íntegra de eventos `start → accept → arrive → board → complete`, sem compartilhar dados pessoais ou identificadores da sessão.

**Limites:** a confirmação humana é a evidência de experiência entre janelas; o banco prova a persistência e a ordem dos eventos, não a origem física de cada clique. O P09 usa a mesma identidade administrativa com MFA nas duas janelas, portanto **não valida identidades independentes de passageiro/motorista, integração comercial, GPS real, pagamentos ou mensagens Meta**. Conclusão: ciclo compartilhado fictício comprovado; integração definitiva pendente.

**Progresso técnico PMC:** permanece `47/100 = 47%` porque os checkboxes M06, M07, M14, M15 e M19 exigem integração de apps/contas/aparelhos e homologação final muito além do laboratório. **MC NÃO EXECUTADO**.
