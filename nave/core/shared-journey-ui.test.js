"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.join(__dirname,"../public/jornada-compartilhada.html"),"utf8");
const migration=fs.readFileSync(path.join(__dirname,"migrations/006_shared_journey_lab_DRAFT.sql"),"utf8");
test("shared journey page JavaScript syntax and branded views",()=>{
 const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(match);
 const s=match[1].replace(/^\s*import \{createClient\} from [^\n]*\n/,"");
 assert.doesNotThrow(()=>new vm.Script(s,{filename:"jornada-compartilhada.js"}));
 assert.match(html,/Jornada compartilhada/);
 assert.match(html,/Passageiro DEMO/);
 assert.match(html,/Motorista DEMO/);
});
test("mobile admin-only sharing requires MFA and rechecks all safety flags",()=>{
 assert.match(html,/auth\.mfa\.getAuthenticatorAssuranceLevel/);
 assert.match(html,/currentLevel!=="aal2"/);
 assert.match(html,/nave_is_admin/);
 assert.match(html,/persistSession:false/);
 assert.match(html,/nave_v5_lab_snapshot/);
 assert.match(html,/nave_v5_lab_start/);
 assert.match(html,/nave_v5_lab_advance/);
 assert.match(html,/whatsappSendEnabled===false/);
 assert.match(html,/commercialRidesEnabled===false/);
 assert.match(html,/driverAuthenticationReady===false/);
 assert.doesNotMatch(html,/navigator\.geolocation|graph\.facebook|fetch\("https:\/\/router/i);
});
test("client uses UUID request keys and version locking; no offline impersonation claims",()=>{
 assert.match(html,/p_creation_key:pendingCreation/);
 assert.match(html,/p_expected_version:current\.version/);
 assert.match(html,/p_action_key:key/);
 assert.match(html,/data\?\.error==="version_conflict"/);
 assert.match(html,/client\.rpc\("nave_v5_lab_snapshot"/);
 assert.match(html,/a mesma conta administrativa com MFA/i);
 assert.match(html,/ainda não autentica motoristas ou passageiros reais/i);
});
test("migration restricts all exposed tables; only AAL2 admin can use security definer RPC",()=>{
 assert.match(migration,/enable row level security/g);
 assert.match(migration,/revoke all on public\.nave_v5_lab_sessions from public, anon, authenticated/);
 assert.match(migration,/revoke all on public\.nave_v5_lab_events from public, anon, authenticated/);
 assert.match(migration,/coalesce\(auth\.jwt\(\)->>'aal',''\) <> 'aal2'/);
 assert.match(migration,/not public\.nave_is_admin\(\)/);
 assert.match(migration,/for update/);
 assert.match(migration,/version_conflict/);
 assert.match(migration,/on conflict\(owner_id,creation_key\) do nothing/);
 assert.match(migration,/unique\(session_id,request_id\)/);
 assert.match(migration,/whatsappSendEnabled',false/);
 assert.doesNotMatch(migration,/insert into public\.(rides|nave_wa_driver_offers|nave_wa_ride_requests)/);
});
