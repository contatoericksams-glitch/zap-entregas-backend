'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const WebSocket = require('ws');

const port = Number(process.env.PORT || 3000);
const familyCode = process.env.FAMILY_CODE || '';
if (familyCode.length < 10) { console.error('FAMILY_CODE precisa ter 10+ caracteres'); process.exit(1); }
const maxUsers = Math.max(1, Number(process.env.MAX_PARTICIPANTS || 3));
const members = new Map();
const attempts = new Map();
let speaker = null;
let timeout = null;

function equalCode(a, b) {
  const aa = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aa, bb);
}
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function all(obj) { for (const ws of members.keys()) send(ws, obj); }
function emitState() {
  all({type:'state', count:members.size, participants:[...members.values()], speaker:speaker ? members.get(speaker) || null : null});
}
function release(ws) {
  if (ws !== speaker) return;
  clearTimeout(timeout);
  timeout = null;
  speaker = null;
  all({type:'speaker', name:null});
  emitState();
}
function remove(ws) {
  if (!members.has(ws)) return;
  members.delete(ws);
  release(ws);
  emitState();
}
function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function allowed(ip) {
  const s = attempts.get(ip);
  if (!s) return true;
  if (Date.now() - s.start > 900000) { attempts.delete(ip); return true; }
  return s.count < 5;
}
function failed(ip) {
  const s = attempts.get(ip);
  if (!s || Date.now() - s.start > 900000) attempts.set(ip,{start:Date.now(),count:1});
  else s.count += 1;
}
const server = http.createServer((req, res) => {
  const good = req.url === '/health';
  res.writeHead(good ? 200 : 404, {'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(good ? {ok:true,users:members.size} : {error:'not_found'}));
});
const wss = new WebSocket.Server({server,path:'/radio',maxPayload:8192,perMessageDeflate:false});
wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  let authorized = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const deadline = setTimeout(() => ws.close(4001,'Tempo de autenticacao excedido'), 8000);
  ws.on('message', (data, binary) => {
    if (binary) {
      if (!authorized || speaker !== ws || data.length > 2048) return;
      for (const peer of members.keys()) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN && peer.bufferedAmount < 131072) peer.send(data,{binary:true});
      }
      return;
    }
    let p;
    try { p=JSON.parse(data.toString()); } catch { return; }
    if (!authorized) {
      if (p.type !== 'join') return;
      if (!allowed(ip)) { ws.close(4003,'Muitas tentativas'); return; }
      if (typeof p.code !== 'string' || !equalCode(p.code,familyCode)) {
        failed(ip); ws.close(4003,'Codigo incorreto'); return;
      }
      if (members.size >= maxUsers) { ws.close(4004,'Canal cheio'); return; }
      const name = typeof p.name === 'string' ? p.name.trim().slice(0,28) : '';
      if (!name || [...members.values()].includes(name)) { ws.close(4005,'Nome indisponivel'); return; }
      authorized = true;
      clearTimeout(deadline);
      members.set(ws,name);
      send(ws,{type:'joined',name});
      emitState();
      return;
    }
    if (p.type === 'talk') {
      if (!speaker) {
        speaker = ws;
        timeout = setTimeout(() => release(ws), 60000);
        send(ws,{type:'granted'});
        all({type:'speaker',name:members.get(ws)});
      } else if (speaker !== ws) {
        send(ws,{type:'busy',name:members.get(speaker)});
      }
    } else if (p.type === 'release') release(ws);
    else if (p.type === 'ping') send(ws,{type:'pong'});
  });
  ws.on('close', () => { clearTimeout(deadline); remove(ws); });
  ws.on('error', () => { remove(ws); });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive=false; ws.ping();
  }
  for (const [ip,s] of attempts) if (Date.now()-s.start>900000) attempts.delete(ip);
},30000);
server.listen(port,'0.0.0.0',() => console.log('Radio Familia ouvindo na porta '+port));
