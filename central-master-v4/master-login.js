// Frontend isolado V5. Configuração pública injetada por master-config.js em staging;
// nunca usar service_role, secret key, PIN verdadeiro ou JWT embutido no repositório.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
const $ = id => document.getElementById(id);
const state = { client: null, factor: null };
const hide = () => ["login","mfa","enroll","complete"].forEach(id => $(id).hidden = true);
function screen(id, message = "") { hide(); $(id).hidden = false; $("notice").textContent = message; }
function report() { $("notice").textContent = "Não foi possível validar o acesso. Verifique suas credenciais ou tente novamente."; }
const cfg = window.NAVE_MASTER_CONFIG;
if (!cfg?.supabaseUrl || !cfg?.publishableKey) {
  $("loginButton").disabled = true;
  $("notice").textContent = "Ambiente de staging sem configuração pública de autenticação.";
} else {
  const memory = new Map();
  state.client = createClient(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { storage: { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) },
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
async function authorize() {
  const { data: aal, error } = await state.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (aal.currentLevel !== "aal2") {
    const { data: factors, error: fErr } = await state.client.auth.mfa.listFactors();
    if (fErr) throw fErr;
    const first = factors.totp?.find(f => f.status === "verified");
    if (first) { state.factor = first.id; return screen("mfa"); }
    const { data: enroll, error: eErr } = await state.client.auth.mfa.enroll({ factorType: "totp" });
    if (eErr) throw eErr;
    state.factor = enroll.id;
    // SVG QR received from Supabase, not HTML from an untrusted response.
    const img = document.createElement("img");
    img.alt = "QR Code do autenticador"; img.width = 180; img.height = 180;
    if (!/^data:image\/svg\+xml(?:;charset=utf-8)?;base64,/.test(enroll.totp.qr_code)) throw Error("Invalid QR data");
    img.src = enroll.totp.qr_code;
    $("qr").replaceChildren(img);
    return screen("enroll");
  }
  const { data: isAdmin, error: rErr } = await state.client.rpc("nave_is_admin");
  if (rErr || isAdmin !== true) {
    await state.client.auth.signOut();
    return screen("login", "Conta sem acesso administrativo autorizado.");
  }
  screen("complete");
}
$("loginForm").addEventListener("submit", async ev => {
  ev.preventDefault(); if (!state.client) return;
  const button = $("loginButton"); button.disabled = true;
  try {
    const { error } = await state.client.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("password").value = ""; if (error) throw error;
    await authorize();
  } catch (_) { report(); } finally { button.disabled = false; }
});
async function confirmTotp(code) {
  const { data: challenge, error } = await state.client.auth.mfa.challenge({ factorId: state.factor });
  if (error) throw error;
  const { error: verifyError } = await state.client.auth.mfa.verify({ factorId: state.factor, challengeId: challenge.id, code });
  if (verifyError) throw verifyError;
  await authorize();
}
for (const [form,input] of [["mfaForm","code"],["enrollForm","enrollCode"]]) {
  $(form).addEventListener("submit", async ev => { ev.preventDefault(); try { await confirmTotp($(input).value); } catch (_) { report(); } });
}
$("exit").addEventListener("click", async () => { await state.client?.auth.signOut(); screen("login"); });
