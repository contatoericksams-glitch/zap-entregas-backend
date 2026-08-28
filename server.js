const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Página inicial
app.get("/", (req, res) => {
  res.send("ZAP Entregas Inteligentes - servidor online");
});

// Política de Privacidade
app.get("/privacidade", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Política de Privacidade - ZAP Entregas Inteligentes</title>
    </head>
    <body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px;line-height:1.6">
      <h1>Política de Privacidade</h1>

      <p><strong>ZAP Entregas Inteligentes</strong></p>

      <p>
        Esta Política de Privacidade explica como o ZAP Entregas Inteligentes
        coleta, utiliza e protege informações relacionadas ao uso de seus serviços.
      </p>

      <h2>1. Dados que podemos coletar</h2>

      <p>
        Podemos coletar informações fornecidas pelo usuário durante o atendimento,
        incluindo nome, número de telefone, mensagens enviadas, endereço de coleta,
        endereço de entrega, informações relacionadas ao pedido e registros
        necessários para a execução da entrega.
      </p>

      <h2>2. Uso das informações</h2>

      <p>
        Os dados são utilizados para receber solicitações, organizar coletas e
        entregas, disponibilizar informações aos entregadores responsáveis,
        prestar atendimento, melhorar o serviço e cumprir obrigações legais.
      </p>

      <h2>3. Compartilhamento</h2>

      <p>
        Informações necessárias à realização de uma entrega poderão ser
        compartilhadas com entregadores parceiros e fornecedores tecnológicos
        utilizados na operação do serviço.
      </p>

      <p>
        O ZAP Entregas Inteligentes não comercializa dados pessoais dos usuários.
      </p>

      <h2>4. Armazenamento e segurança</h2>

      <p>
        Adotamos medidas técnicas e administrativas razoáveis para proteger
        informações pessoais contra acesso, alteração, divulgação ou destruição
        não autorizada.
      </p>

      <h2>5. Direitos do usuário</h2>

      <p>
        O usuário poderá solicitar informações, correção ou exclusão de seus dados,
        conforme aplicável pela legislação brasileira, incluindo a Lei Geral de
        Proteção de Dados Pessoais (LGPD).
      </p>

      <h2>6. Contato</h2>

      <p>
        Solicitações relacionadas à privacidade poderão ser realizadas pelos
        canais oficiais de atendimento do ZAP Entregas Inteligentes.
      </p>

      <p>Última atualização: 28 de agosto de 2026.</p>
    </body>
    </html>
  `);
});

// Termos de Serviço
app.get("/termos", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Termos de Serviço - ZAP Entregas Inteligentes</title>
    </head>
    <body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px;line-height:1.6">
      <h1>Termos de Serviço</h1>

      <p><strong>ZAP Entregas Inteligentes</strong></p>

      <p>
        Ao utilizar os serviços do ZAP Entregas Inteligentes, o usuário concorda
        com estes Termos de Serviço.
      </p>

      <h2>1. Serviço</h2>

      <p>
        O ZAP Entregas Inteligentes oferece uma plataforma de intermediação e
        organização de serviços de coleta e entrega.
      </p>

      <h2>2. Informações fornecidas</h2>

      <p>
        O usuário é responsável por fornecer informações corretas sobre coleta,
        destino, destinatário e características relevantes do produto.
      </p>

      <h2>3. Valores</h2>

      <p>
        Quando aplicável, o valor da entrega será informado ao usuário antes da
        confirmação do serviço.
      </p>

      <h2>4. Itens proibidos</h2>

      <p>
        Não poderão ser transportados produtos cuja posse ou transporte seja
        proibido pela legislação brasileira.
      </p>

      <h2>5. Alterações</h2>

      <p>
        Estes termos poderão ser atualizados conforme a evolução dos serviços,
        legislação ou necessidades operacionais.
      </p>

      <p>Última atualização: 28 de agosto de 2026.</p>
    </body>
    </html>
  `);
});

// Exclusão de dados
app.get("/exclusao-de-dados", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Exclusão de Dados - ZAP Entregas Inteligentes</title>
    </head>
    <body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px;line-height:1.6">
      <h1>Solicitação de Exclusão de Dados</h1>

      <p>
        Usuários do ZAP Entregas Inteligentes podem solicitar a exclusão de seus
        dados pessoais.
      </p>

      <p>
        Para realizar a solicitação, entre em contato através do canal oficial
        de atendimento do ZAP Entregas Inteligentes e informe que deseja solicitar
        a exclusão de seus dados.
      </p>

      <p>
        Poderemos solicitar informações necessárias para confirmar a identidade
        do solicitante antes de concluir o procedimento.
      </p>

      <p>
        Alguns registros poderão ser mantidos quando a conservação for necessária
        para cumprimento de obrigação legal ou regulatória.
      </p>
    </body>
    </html>
  `);
});

// Verificação do webhook pela Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado pela Meta.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Recebe eventos e mensagens do WhatsApp
app.post("/webhook", (req, res) => {
  console.log("Evento recebido do WhatsApp:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor ZAP rodando na porta ${PORT}`);
});
