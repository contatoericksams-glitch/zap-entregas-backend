# NAVE — Auth e OTP em Supabase efêmero

O workflow `nave-auth-isolated.yml` executa somente na branch `codex/nave-wa-account-link-draft`, em runner padrão Ubuntu de repositório público. Não faz deploy, não usa secrets do GitHub, não cria projeto/branch Supabase na plataforma, não publica artefatos/cache e não chama Meta. Credenciais de teste são geradas no próprio runner e não são impressas.

O CLI Supabase 2.122.0 cria uma instalação local temporária de PostgreSQL/Auth/Data API dentro do runner. A fixture mínima de contatos e o draft OTP são aplicados apenas nesse banco efêmero. Duas contas são criadas com emails `.invalid`, confirmação administrativa local e senhas aleatórias. O teste usa sessões Auth reais distintas, valida a identidade no endpoint HTTP, tenta confirmar o OTP de outra conta, confirma somente com a conta proprietária, rejeita replay e verifica que clientes anon/authenticated não acessam tabelas/RPCs privilegiados. Entrega do código é um callback em memória, sem mensagens externas.

O teste recusa URLs diferentes de `http://127.0.0.1:54321`. Não substituir essa restrição por URL hospedada. A stack é parada ao final e o runner é descartado. Não há ambiente interativo duradouro para abrir os apps após o job.

Este teste não valida aprovação/perfil de motorista, contas independentes na jornada compartilhada dos apps, delivery Meta, GPS, pagamento ou homologação P09. É uma etapa para validar o limite de identidade do vínculo app↔WhatsApp com Supabase real sem depender do computador local ou de cota extra de projetos.

Dependências fixadas: Supabase JS 2.118.0, Express 5.3.0, Node >=22, lockfile versionado. O computador inspecionado tem aproximadamente 4 GB de RAM, Docker ausente e recursos insuficientes para o caminho Docker Desktop (mínimo documentado: 8 GB).

Fontes: [GitHub Actions em repositórios públicos e runners padrão](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [requisitos Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).

Resultado em 23/10/2026: [run 40023839180](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40023839180) terminou `success` no commit `ed418b6f47ccaa60cc5d63077acede9733287ff3`. A bateria de integração passou (1 teste, 0 falhas); instalação, stack temporária, Auth/Data API, limpeza e encerramento do job concluídos. A consulta de artefatos retornou lista vazia. As 157 verificações locais também passaram antes do envio. Proposta preservada como [PR rascunho #5](https://github.com/contatoericksams-glitch/zap-entregas-backend/pull/5), sem merge ou deploy.
