# PLANO MESTRE DE CRIAÇÃO — RÁDIO FAMÍLIA V2 MATRIX

**Status:** V2.1 PIN4 compilada e aprovada nos testes automatizados; aguardando teste físico. **Não homologada**.  
**Base protegida:** Rádio Família V1.1 — Marco Histórico #001. Branch e serviço Render originais não alterados por este projeto.

## Objetivo
Evoluir o Rádio Família de um único canal para um comunicador digital multicanal, com interface Tático Matrix, presença visual dos participantes, botão LED, medidor de áudio, configurações ocultas e futuro uso por organizações.

## Marcos e módulos

- [x] M00 — Congelamento lógico: V1.1 mantida na branch `radio-familia-ptt-v1` e no Render original.
- [x] M01 — Branch V2 independente `radio-familia-v2-matrix`.
- [x] M02 — Servidor V2 independente `https://radio-familia-v2-matrix.onrender.com` no Render free.
- [x] M03 — Quatro canais familiares de demonstração, trocas autorizadas por lista.
- [x] M04 — Estado online/offline/falando por participante da sala e contagem.
- [x] M05 — Interface Tático Matrix: verde/negro, botão PTT com LEDs, ON/OFF, canais e ajustes recolhidos.
- [x] M06 — Visualizador de intensidade de áudio integrado ao PCM (primeira implementação).
- [x] M07 — APK Android V2 com package ID independente da V1.1.
- [x] M08 — CI no GitHub Actions: compilação Android e testes automáticos WebSocket/canais.
- [ ] M09 — Teste real nos três celulares (som, microfone, presença e troca de canais).
- [ ] M10 — Testes de reconexão, celular bloqueado, suspensão do Render e redes Wi-Fi/4G.
- [x] M11A — Piloto: criar canais temporários no aplicativo, PIN aleatório de exatamente 4 dígitos e entrada por convite, com testes automatizados.
- [ ] M11B — Banco de dados próprio, identidade persistente, PIN com expiração/rotação e canais que sobrevivem a reinícios.
- [ ] M12 — Autenticação individual e permissões reais de organizações/setores (obrigatório antes de escola/empresa).
- [ ] M13 — Testes de carga e dimensionamento de custo para dezenas de usuários.
- [ ] M14 — Refinamento visual a partir de capturas de telas reais.
- [ ] M15 — APK/AAB final assinado e fluxo de atualização.
- [ ] M16 — Homologação formal da V2; Marco Histórico somente sob comando `EXECUTAR O MC`, se aplicável.

## Limitações do piloto
- Apenas três identidades familiares cadastradas: Erick, Bruna e Pietro; os quatro canais são definidos no servidor.
- Usa o código familiar compartilhado. A autorização nesta versão está vinculada ao nome declarado pelo cliente. Não é segurança adequada para equipes corporativas.
- Já existe criação dinâmica de salas com PIN de 4 dígitos **apenas no piloto de memória**. Esses canais e seus PINs **somem em reinicializações/redeploys/suspensão da instância Render**. Ainda não há banco de dados nem contas persistentes.
- PIN de 4 dígitos é convite, não autenticação forte. O código familiar compartilhado e nome declarado não garantem identificação individual: **não utilizar para organizações, dados sensíveis ou segurança real**.
- Criar canal/entrar com PIN requer estar conectado ao servidor, com identidade do piloto. Há limite de tentativas, limites por usuário e de canais temporários.
- Render Free pode suspender por inatividade; não indicado como rádio exclusivo de emergência.
- A aparência é uma primeira implementação nativa **inspirada** no mockup, não uma reprodução pixel a pixel.
- Até teste físico, compilação e testes automatizados não equivalem à homologação.

## Procedimento do piloto
1. Instalar `Radio_Familia_V2_1_PIN4_Teste.apk` sem desinstalar a V1.1 nem a V2.0. O package Android desta versão é independente.
2. Nos ajustes, inserir o mesmo código da V1 e usar nome Erick, Bruna ou Pietro.
3. Ligar rádio no interruptor e escolher um canal.
4. Criar um canal, anotar o PIN de quatro números, entrar com outro aparelho utilizando o mesmo código familiar e PIN.
5. Conferir presença, áudio, equalizador e isolamento da sala.
6. Registrar resultados e ajustes para a próxima entrega.

**SALVE VERBO!**

## Branch e infraestrutura da versão PIN4
- Branch: `radio-familia-v2-pin4` (separada e independente da V1.1 e da V2.0).
- Servidor Render Free: `https://radio-familia-v2-pin4.onrender.com`.
- Interface: botões `+ CRIAR CANAL` e `ENTRAR COM PIN` na seção Canais / Frequências.
- Limitação: PIN/salas criadas dinamicamente não são duráveis até implantação de banco de dados isolado.
