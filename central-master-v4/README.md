# Central NAVE Master V4 — Staging

Esta pasta é **exclusivamente de demonstração**. Mantém o visual V3 e adiciona checklist de pré-integração. Não possui login real, não consulta banco, não aprova motoristas nem executa pagamentos.

- **Não usar em produção**; o PIN 246810 é fictício e aparece no próprio HTML. Nunca colocar PIN real no código.
- Supabase autorizado para a organização **Nave Mobilidade**, mas a conexão da conversa atual ainda retorna erro `link_id`; tabelas e RLS não foram auditadas nesta etapa.
- Desenvolver primeiro o backend administrativo com sessão segura e MFA, funções por papel, PIN validado e limitado no servidor, trilha de auditoria e rotas com idempotência.
- O painel de métricas deve excluir corridas simuladas, usar timezone `America/Sao_Paulo`, distinguir corridas finalizadas de pagamentos recebidos e comissão NAVE de 15% por corrida.
- A branch `nave-master-v4-staging` não é usada pelos serviços Render atualmente configurados para `nave-whatsapp-mvp`.

O pacote de desenvolvimento completo (incluindo testes e contratos de API) foi gerado na conversa do ChatGPT como `Central_NAVE_Master_V4_Staging.zip`.
