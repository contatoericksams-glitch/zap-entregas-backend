# NAVE — Auth e OTP em Supabase efêmero

O workflow `nave-auth-isolated.yml` executa somente na branch `codex/nave-wa-account-link-draft`, em runner padrão Ubuntu de repositório público. Não faz deploy, não usa secrets do GitHub, não cria projeto/branch Supabase na plataforma, não publica artefatos/cache e não chama Meta. Credenciais de teste são geradas no próprio runner e não são impressas.

O CLI Supabase 2.122.0 cria uma instalação local temporária de PostgreSQL/Auth/Data API dentro do runner. A fixture mínima de contatos e o draft OTP são aplicados apenas nesse banco efêmero. Duas contas são criadas com emails `.invalid`, confirmação administrativa local e senhas aleatórias. O teste usa sessões Auth reais distintas, valida a identidade no endpoint HTTP, tenta confirmar o OTP de outra conta, confirma somente com a conta proprietária, rejeita replay e verifica que clientes anon/authenticated não acessam tabelas/RPCs privilegiados. Entrega do código é um callback em memória, sem mensagens externas.

O teste recusa URLs diferentes de `http://127.0.0.1:54321`. Não substituir essa restrição por URL hospedada. A stack é parada ao final e o runner é descartado. Não há ambiente interativo duradouro para abrir os apps após o job.

Este teste não valida aprovação/perfil de motorista, contas independentes na jornada compartilhada dos apps, delivery Meta, GPS, pagamento ou homologação P09. É uma etapa para validar o limite de identidade do vínculo app↔WhatsApp com Supabase real sem depender do computador local ou de cota extra de projetos.

Dependências fixadas: Supabase JS 2.118.0, Express 5.3.0, Node >=22, lockfile versionado. O computador inspecionado tem aproximadamente 4 GB de RAM, Docker ausente e recursos insuficientes para o caminho Docker Desktop (mínimo documentado: 8 GB).

Fontes: [GitHub Actions em repositórios públicos e runners padrão](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [requisitos Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).

Resultado em 23/10/2026: [run 40023839180](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40023839180) terminou `success` no commit `ed418b6f47ccaa60cc5d63077acede9733287ff3`. A bateria de integração passou (1 teste, 0 falhas); instalação, stack temporária, Auth/Data API, limpeza e encerramento do job concluídos. A consulta de artefatos retornou lista vazia. As 157 verificações locais também passaram antes do envio. Proposta preservada como [PR rascunho #5](https://github.com/contatoericksams-glitch/zap-entregas-backend/pull/5), sem merge ou deploy.

## Contas nos aplicativos — laboratório autenticado

`core/auth-lab.js` é uma aplicação separada, sem importação por `server.js` ou pelo servidor de prévia comum. Aceita exclusivamente Supabase em `http://127.0.0.1:54321`; não permite projeto hospedado. O CI cria contas `.invalid` e expõe as páginas `passageiro.html?auth=1` e `motorista.html?auth=1` somente durante o job. Na prévia comum, o formulário pode ser inspecionado, mas o login fica indisponível. Nenhuma conta pessoal deve ser usada.

O login retorna apenas access token; a tela o guarda em memória, sem localStorage, cookies ou refresh token. Sair descarta a sessão desta tela; não é revogação global de JWT. Recarregar exige novo login. Cada aba tem sessão própria. O servidor usa `auth.getUser(token)` em cada operação e lê somente `app_metadata.nave_lab_role` e `nave_lab_driver_approved` provisionados pelo administrador da fixture. `user_metadata`, papel ou aprovação enviados pelo cliente não concedem acesso. Campos `nave_lab_*` são exclusivos do teste e não definem o cadastro/aprovação de produção.

A sala fictícia vincula disponibilidade a um motorista aprovado e a solicitação a um passageiro. Outras contas não leem a viagem/histórico nem recebem snapshots de conflito. Trocar o papel no corpo é proibido. A autorização é reavaliada mesmo com o token antigo após remover a aprovação do motorista. Ao resetar uma jornada encerrada, o histórico é limpo antes de liberar a sala para outro passageiro. A Central não tem acesso ao modo autenticado. O fluxo segue em memória e não cria corrida comercial, GPS, pagamento ou mensagem WhatsApp.

Validação local: 161 testes passaram (incluindo fronteiras HTTP de autorização e formulário com senha apagada, sessão em memória, saída e perfil incompatível). A bateria CI agora inclui login real pelos endpoints dos aplicativos, motorista aprovado/pendente, metadados forjados, isolamento entre passageiros, jornada fictícia completa e remoção de aprovação. O [run 40026114296](https://github.com/contatoericksams-glitch/zap-entregas-backend/actions/runs/40026114296), commit `516da9e36e2e6dc47e808d85e03f1f5ef0ac5fee`, concluiu com sucesso: 161 testes locais no runner e duas baterias Supabase reais passaram, zero falhas. A segunda bateria confirmou também a remoção da aprovação com o JWT antigo. Encerramento da stack passou e não há artefatos publicados. Não equivale ao P09 entre aparelhos nem a aprovação documental de um motorista real.

Referências de implementação: [getUser verifica a identidade no servidor Auth](https://supabase.com/docs/reference/javascript/auth-getuser), [login por senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword). Changelog consultado em 23/10/2026; a mudança TLS de 10/11 diz respeito a conexões hospedadas, não ao HTTP loopback usado neste teste.

## Central autenticada e somente leitura — revisão seguinte

O laboratório agora permite a Central em `central-local.html?auth=1`. Exige `app_metadata.nave_lab_role = admin` da fixture e MFA TOTP real com nível `aal2`, conferido em cada leitura. O formulário recebe o código do autenticador e o limpa após enviar; nenhuma inscrição MFA é oferecida pela interface. O CI inscreve apenas um fator aleatório de uma conta `.invalid` no Auth descartável, nunca no projeto hospedado nem numa conta pessoal. O papel `observer` é retornado após a verificação; não é aceito como promoção enviada pelo cliente.

O observador não pode escrever nem forjando papel de passageiro/motorista ou versão antiga. POST/PUT/PATCH/DELETE são recusados antes de devolver snapshot ou alterar estado/histórico. Leituras repetidas permanecem sem efeito; remover o papel administrativo bloqueia o token AAL2 já emitido. Isso não habilita a Central Master operacional nem substitui `nave_is_admin`/MFA da aplicação principal: os campos de autorização deste laboratório são exclusivos das fixtures.

A configuração TOTP é ativada somente no config.toml recém-gerado em RUNNER_TEMP/nave-auth-lab, com verificação do caminho e do trecho padrão do CLI fixado. Conferida localmente com CLI 2.122.0, sem iniciar Docker. O gerador TOTP da fixture foi verificado com vetores RFC 6238; segredo, códigos e tokens não são impressos. A bateria CI aguardará um período diferente após a inscrição para não reutilizar o OTP do cadastro no login do app. **164 testes locais passaram**; resultado da nova execução Supabase real ainda pendente.

Corrigida também a reconexão após a primeira leitura falhar temporariamente: enquanto existe token em memória, o polling é mantido; 401/403 continuam apagando o token e recarregando a tela. Nenhum endpoint de autenticação é montado no servidor comum 4317.

Referências: [MFA assurance](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [enroll](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [challengeAndVerify](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify). O campo TOTP foi conferido no template oficial do CLI 2.122.0.
