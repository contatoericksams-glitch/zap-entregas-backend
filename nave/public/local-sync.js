"use strict";
const NaveLocalSync = (() => {
  const enabled = new URLSearchParams(location.search).get("shared") === "1";
  let current = null, role, receive, pending = false, reading = false, connectionFailed = false, timer;
  function apply(data) {
    if (data.testOnly !== true || data.storage !== "process-memory" || data.commercialRidesEnabled !== false || data.whatsappSendEnabled !== false || data.paymentsEnabled !== false || !Number.isSafeInteger(data.version)) throw new Error("Resposta incompatível com demonstração local.");
    if (!current || data.roomId !== current.roomId || data.version > current.version) { current = data; receive(data); }
  }
  async function read() {
    if (pending || reading) return;
    reading = true;
    try {
      const res = await fetch("/api/local-demo", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error("Servidor local indisponível. Use o servidor de prévia, sem publicar este modo.");
      const data = await res.json(); if (!pending) { apply(data); if (connectionFailed) { document.getElementById("error").textContent = ""; connectionFailed = false; } }
    } catch (_) { connectionFailed = true; document.getElementById("error").textContent = "Conexão local indisponível. Aguardando reconexão."; }
    finally { reading = false; }
  }
  return { enabled, async connect(label, listener) {
    role = label; receive = listener;
    const note = document.createElement("p"); note.className = "notice";
    note.textContent = "DEMONSTRAÇÃO SINCRONIZADA LOCAL · Uma sala fictícia nesta máquina. Sem contas reais. O estado desaparece ao reiniciar o servidor.";
    document.querySelector("header").after(note);
    if (label !== "observer") { const link = document.createElement("a"); link.href = "/central-local.html?shared=1"; link.textContent = " Abrir Central local →"; note.append(link); }
    document.querySelectorAll('a[href="/passageiro.html"],a[href="/motorista.html"]').forEach(link => { link.href += "?shared=1"; });
    await read(); timer = setInterval(read, 1000);
    window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
  }, async mutate(action, extra = {}) {
    if (role === "observer") throw new Error("A Central local é somente de leitura.");
    if (!current || pending) throw new Error("Aguarde a conexão com a demonstração local.");
    pending = true;
    try {
      const res = await fetch("/api/local-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, action, roomId: current.roomId, version: current.version, ...extra }), signal: AbortSignal.timeout(5000) });
      if (!res.ok) { if (res.status === 409) { const data = await res.json().catch(() => null); if (data?.snapshot) apply(data.snapshot); } throw new Error("Ação não disponível. Aguarde a outra tela ou atualize a demonstração."); }
      apply(await res.json());
      return current;
    } finally { pending = false; }
  } };
})();
