# WIFLY — PMC | Integração Supabase V0.7.2

Atualizado: 2026-10-20 (horário brasileiro). Não confundir "implementado" com "homologado".

## Projeto exclusivo
- Nome: WIFLY
- Ref Supabase: `ryghlrngennxfuoteofe`
- Região: `sa-east-1` (São Paulo)
- Organização conectada: Supabase. Separado do banco da NAVE.
- Custo informado pelo provedor para criar: US$ 0/mês, sujeito às condições/limites da conta.
- Não houve inclusão de anúncios reais nem criação de usuários nesta etapa.

## Estrutura aplicada
1. `wifly_ads_base_rls_v071`: `public.wifly_ad_advertisers`, `public.wifly_ad_campaigns`, `public.wifly_ad_events`.
2. `wifly_ads_auditoria_v071`: `public.wifly_ad_audit` + função/trigger internos.
3. RLS habilitado nas quatro tabelas.
4. Leitura anônima restrita a campanhas com `status='approved'`, `is_demo=false` e data vigente em São Paulo.
5. Escrita administrativa restrita ao JWT assinado com `app_metadata.wifly_ads_admin === true`; NUNCA usar `user_metadata`.
6. Auditoria e cadastro de anunciantes não são públicos; dados de contato permanecem privados.

## Site
- Branch: `wifly-v05-homologacao` do repositório `zap-entregas-backend`.
- URL: https://wifly-v05-homologacao.onrender.com/
- Arquivo publicado: `wifly/index.html`.
- URL do banco e chave *publishable* inseridas no HTML; nenhuma service_role ou secret key exposta.
- Deploy do Render confirmado `live` após commit `22692a79ec38c84188ddb1d83999421a1835265c`.

## Testes e limitações
- Confirmado via Supabase: 4 tabelas presentes com RLS; 0 anunciantes, 0 campanhas, 0 eventos e 0 auditorias.
- Security Advisor: zero alertas no momento da consulta.
- Grants: visitante pode fazer SELECT de campanhas públicas; visitante não lê anunciantes/auditoria/eventos, não tem permissão de escrita.
- Performance Advisor: avisos de otimização de políticas e índices ainda sem uso, a avaliar depois.
- Render: deploy live. Não foi possível abrir o site nem a API diretamente de fora nesta execução; portanto homologação end-to-end pendente.
- O fluxo de login/admin real não foi testado (nenhum usuário Auth criado ainda).
- Player em segundo plano continua pendente de validação em Android/iPhone com streaming real.

## Avanço M13 — Trava comercial (V0.7.2)
- Tabela `public.wifly_ad_publication_control` com RLS e `commercial_ads.enabled=false`.
- A política pública exige simultaneamente campanha real aprovada, data vigente e liberação geral. Administradores do site não podem alterar essa trava.
- Indicador de status incluído no painel da WIFLY.
- Security Advisor sem alertas após mudança; Chromium/testes locais de interface passaram.
- Contas Auth WIFLY: zero no último exame. Não homologar login real até cadastro.
- Render confirmou o código V0.7.2 como `live`.

## Próxima ação do proprietário
1. Abrir Supabase > projeto WIFLY > Authentication > Users.
2. Criar o primeiro usuário administrativo com e-mail próprio e senha forte; evitar publicar credenciais no chat.
3. Depois que a conta existir, definir `raw_app_meta_data.wifly_ads_admin = true` pelo servidor/Admin API ou via edição segura autorizada. NÃO permitir alteração desse atributo no cliente.
4. Entrar na WIFLY pelo painel. Testar criação e pausa de campanha fictícia, não comercial.
5. Testar em dois dispositivos distintos. Somente após isso homologar a etapa.

## Critérios de homologação ainda pendentes
- Login real e autorização RLS (admin vs usuário comum vs visitante)
- Cadastro/edição/pausa persistente em banco e atualização para visitantes
- Auditoria efetiva de ações realizadas por conta administradora
- Testes reais de navegador móvel, segurança e publicação de anúncios
