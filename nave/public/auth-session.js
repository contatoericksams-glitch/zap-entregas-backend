"use strict";
// Tokens live only in this page's memory. Each tab signs in independently.
const NaveLabSession = (() => {
  let token = null;
  return {
    headers() { return token ? { Authorization: "Bearer " + token } : {}; },
    clear() { token = null; },
    mount(role, onReady) {
      const panel = document.createElement("section"); panel.className = "panel auth-panel";
      const heading = document.createElement("h2"); heading.textContent = "Entrar no teste isolado";
      const info = document.createElement("p"); info.textContent = "Este login só funciona no laboratório isolado, com conta de teste. Na prévia comum ele permanece indisponível. Motoristas precisam de aprovação no ambiente de teste.";
      const form = document.createElement("form");
      const emailLabel = document.createElement("label"); emailLabel.textContent = "Email de teste";
      const email = document.createElement("input"); email.type = "email"; email.required = true; email.autocomplete = "off"; email.maxLength = 254; emailLabel.append(email);
      const passwordLabel = document.createElement("label"); passwordLabel.textContent = "Senha de teste";
      const password = document.createElement("input"); password.type = "password"; password.required = true; password.autocomplete = "off"; password.maxLength = 256; passwordLabel.append(password);
      const codeLabel = document.createElement("label"); codeLabel.textContent = "Código do autenticador de teste";
      const code = document.createElement("input"); code.type = "text"; code.inputMode = "numeric"; code.pattern = "[0-9]{6}"; code.maxLength = 6; code.autocomplete = "off"; code.required = role === "observer"; codeLabel.append(code); codeLabel.hidden = role !== "observer";
      if (role === "observer") info.textContent = "Central somente de leitura. Exige administrador e segundo fator do laboratório isolado. Na prévia comum o login fica indisponível. Não use credenciais pessoais.";
      const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Entrar";
      const leave = document.createElement("button"); leave.type = "button"; leave.textContent = "Sair desta tela"; leave.hidden = true;
      const message = document.createElement("p"); message.setAttribute("role", "status");
      form.append(emailLabel, passwordLabel, codeLabel, submit); panel.append(heading, info, form, leave, message);
      document.querySelector("header").after(panel);
      leave.addEventListener("click", () => { token = null; location.reload(); });
      form.addEventListener("submit", async event => {
        event.preventDefault(); submit.disabled = true; token = null;
        const credentials = { email: email.value.trim(), password: password.value }; password.value = "";
        if (role === "observer") credentials.code = code.value.trim(); code.value = "";
        try {
          const response = await fetch("/api/auth-lab/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error(response.status === 403 ? "Acesso recusado. Confira o perfil autorizado e, na Central, o segundo fator de teste." : response.status === 429 ? "Muitas tentativas. Aguarde um minuto." : "Login indisponível. Confira a conta de teste e se o ambiente isolado está ativo.");
          const data = await response.json();
          if (data.testOnly !== true || data.role !== role || typeof data.accessToken !== "string") throw new Error("A conta não corresponde a esta tela. Use a área do seu perfil.");
          token = data.accessToken; email.value = ""; form.hidden = true; leave.hidden = false;
          message.textContent = "Sessão de teste conectada. Viagens continuam fictícias.";
          await onReady();
        } catch (error) { token = null; message.textContent = error.message; }
        finally { credentials.password = ""; credentials.code = ""; submit.disabled = false; }
      });
    },
  };
})();
