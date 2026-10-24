"use strict";
const NaveLocalSync = (() => {
  const authenticated = new URLSearchParams(location.search).get("auth") === "1";
  const enabled = authenticated || new URLSearchParams(location.search).get("shared") === "1";
  const endpoint = authenticated ? "/api/auth-lab/room" : "/api/local-demo";
  const headers = () => authenticated ? NaveLabSession.headers() : {};
  let current = null, role, receive, pending = false, reading = false, connectionFailed = false, timer;
  function apply(data) {
    if (data.testOnly !== true || !(data.storage === "process-memory" || authenticated && data.storage === "runner-checkpoint") || data.commercialRidesEnabled !== false || data.whatsappSendEnabled !== false || data.paymentsEnabled !== false || !Number.isSafeInteger(data.version)) throw new Error("Resposta incompatível com demonstração local.");
    if (!current || data.roomId !== current.roomId || data.version > current.version) { current = data; receive(data); }
    if (authenticated && data.storage === "runner-checkpoint") document.querySelector(".notice").textContent = "LABORATÓRIO COM RECUPERAÇÃO TEMPORÁRIA · Estado preservado apenas no runner após reinício controlado. Oferta fictícia vence em 2 minutos. Sem viagens comerciais.";
  }
  async function read() {
    if (pending || reading) return;
    reading = true;
    try {
      const res = await fetch(endpoint, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (authenticated && [401, 403].includes(res.status)) { current = null; NaveLabSession.clear(); clearInterval(timer); location.reload(); return; }
      if (!res.ok) throw new Error("Servidor local indisponível. Use o servidor de prévia, sem publicar este modo.");
      const data = await res.json(); if (!pending) { apply(data); if (connectionFailed) { document.getElementById("error").textContent = ""; connectionFailed = false; } }
    } catch (_) { connectionFailed = true; document.getElementById("error").textContent = "Conexão local indisponível. Aguardando reconexão."; }
    finally { reading = false; }
  }
  return { enabled, async connect(label, listener) {
    role = label; receive = listener;
    const note = document.createElement("p"); note.className = "notice";
    note.textContent = authenticated ? "TESTE ISOLADO COM LOGIN · Sessões separadas e permissões conferidas pelo servidor. Ofertas fictícias vencem em 2 minutos. Estado temporário." : "DEMONSTRAÇÃO SINCRONIZADA LOCAL · Uma sala fictícia nesta máquina. Sem contas reais. O estado desaparece ao reiniciar o servidor.";
    document.querySelector("header").after(note);
    if (label !== "observer" && !authenticated) { const link = document.createElement("a"); link.href = "/central-local.html?shared=1"; link.textContent = " Abrir Central local →"; note.append(link); }
    document.querySelectorAll('a[href="/passageiro.html"],a[href="/motorista.html"]').forEach(link => { link.href += authenticated ? "?auth=1" : "?shared=1"; });
    const start = async () => { await read(); if (!authenticated || Object.keys(headers()).length > 0) timer = setInterval(read, 1000); };
    if (authenticated) {
      if (typeof NaveLabSession === "undefined") { document.getElementById("error").textContent = "Login de teste indisponível nesta tela."; return; }
      NaveLabSession.mount(label, start);
      const footer = document.querySelector("footer span");
      if (footer) footer.textContent = "Teste de sessão isolada · Sem viagens comerciais.";
    } else await start();
    window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
  }, async mutate(action, extra = {}) {
    if (role === "observer") throw new Error("A Central local é somente de leitura.");
    if (!current || pending) throw new Error("Aguarde a conexão com a demonstração local.");
    pending = true;
    try {
      const body = JSON.stringify({ role, action, roomId: current.roomId, version: current.version, ...extra, ...(authenticated ? { requestKey: crypto.randomUUID() } : {}) });
      const send = () => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...headers() }, body, signal: AbortSignal.timeout(5000) });
      let res;
      try { res = await send(); } catch (error) { if (!authenticated) throw error; res = await send(); }
      if (authenticated && [401, 403].includes(res.status)) { current = null; NaveLabSession.clear(); clearInterval(timer); location.reload(); throw new Error("Sessão encerrada ou sem permissão."); }
      if (!res.ok) { if (res.status === 409) { const data = await res.json().catch(() => null); if (data?.snapshot) apply(data.snapshot); } throw new Error("Ação não disponível. Aguarde a outra tela ou atualize a demonstração."); }
      apply(await res.json());
      return current;
    } finally { pending = false; }
  } };
})();
