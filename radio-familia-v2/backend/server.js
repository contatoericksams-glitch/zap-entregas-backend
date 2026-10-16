'use strict';
// Rádio Família V2 - piloto multicanal. Organizações empresariais exigirão autenticação individual e armazenamento durável.
const http = require('node:http');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const port = Number(process.env.PORT || 3000);
const accessCode = process.env.FAMILY_CODE || '';
if(accessCode.length<12) { console.error('Configure FAMILY_CODE de pelo menos 12 caracteres'); process.exit(1); }
const MAX_USERS = Math.max(3, Math.min(100, Number(process.env.MAX_PARTICIPANTS || 50)));
const members = new Map(); // websocket => {name, channel}
const names = new Map(); // canonical name => websocket
const pins = new Map(); // 4-digit invitation PIN => channel id (temporary pilot only)
const pinFailures = new Map(); // name => attempt count and window
const MAX_CHANNELS = 24;
const badAttempts = new Map();
const defaults = [
  {id:'ch01',name:'Família',users:['Erick','Bruna','Pietro']},
  {id:'ch02',name:'Erick + Bruna',users:['Erick','Bruna']},
  {id:'ch03',name:'Erick + Pietro',users:['Erick','Pietro']},
  {id:'ch04',name:'Bruna + Pietro',users:['Bruna','Pietro']}
];
let configured;
try {
  configured=process.env.CHANNELS_JSON ? JSON.parse(process.env.CHANNELS_JSON):defaults;
  if(!Array.isArray(configured)||configured.length===0)throw Error('sem canais');
  const ids=new Set();
  for(const c of configured) {
    if(!/^[a-z0-9_-]{2,32}$/.test(c.id)||typeof c.name!=='string'||!Array.isArray(c.users)||!c.users.length||ids.has(c.id))throw Error('canal inválido');
    ids.add(c.id);
  }
}catch(e){console.error('CHANNELS_JSON inválido: '+e.message);process.exit(1);}
const channels = configured.map(c=>({id:c.id,name:c.name.slice(0,48),users:[...new Set(c.users.map(x=>String(x).trim()).filter(Boolean))]}));
const knownNames = new Map();
for(const ch of channels) for(const n of ch.users)knownNames.set(n.toLocaleLowerCase('pt-BR'),n);
const speakers=new Map(); // channel id => ws
const speakTimeouts=new Map();
function sameCode(a,b) {
 const aa=crypto.createHash('sha256').update(String(a)).digest();
 const bb=crypto.createHash('sha256').update(String(b)).digest();
 return crypto.timingSafeEqual(aa,bb);
}
function send(ws,payload) { if(ws && ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(payload)); }
function publish(channelId,payload) {
 for(const [ws,m] of members)if(m.channel===channelId)send(ws,payload);
}
function roster(channelId) {
 const channel=channels.find(c=>c.id===channelId);
 if(!channel)return [];
 return channel.users.map(n=>{
  const peer=names.get(n.toLowerCase());
  const online=!!(peer && members.get(peer)?.channel===channelId);
  return {name:n,online,speaking:online && !!(speakers.get(channelId) && members.get(speakers.get(channelId))?.name===n)};
 });
}
function ownChannels(name) {
 return channels.filter(c=>c.users.includes(name)).map(c=>({id:c.id,name:c.name,users:c.users,private:!!c.private}));
}
function sendChannelList(ws) {
 const m=members.get(ws);
 if(m)send(ws,{type:'channels',channels:ownChannels(m.name),channel:m.channel});
}
function changeChannel(ws, next) {
 const m=members.get(ws);
 if(!m || !next || !next.users.includes(m.name))return false;
 const prev=m.channel;
 if(prev===next.id){send(ws,{type:'switched',channel:next.id});state(next.id);return true;}
 release(ws);
 m.channel=next.id;
 send(ws,{type:'switched',channel:next.id});
 state(prev);state(next.id);
 return true;
}
function uniquePin() {
 for(let i=0;i<200;i++){
  const pin=String(crypto.randomInt(0,10000)).padStart(4,'0');
  if(!pins.has(pin))return pin;
 }
 throw Error('PIN indisponível');
}
function joinAttemptAllowed(name) {
 const v=pinFailures.get(name);
 if(!v || Date.now()-v.start>15*60000){pinFailures.delete(name);return true;}
 return v.count < 5;
}
function noteBadPin(name) {
 const v=pinFailures.get(name);
 if(!v || Date.now()-v.start>15*60000)pinFailures.set(name,{start:Date.now(),count:1});
 else v.count++;
}
function state(channelId) {
 const active=speakers.get(channelId),current=active?members.get(active):null;
 publish(channelId,{type:'room_state',channel:channelId,participants:roster(channelId),speaker:current?.name||null});
}
function release(ws) {
 const member=members.get(ws);
 if(!member || speakers.get(member.channel)!==ws)return;
 clearTimeout(speakTimeouts.get(member.channel));
 speakTimeouts.delete(member.channel);speakers.delete(member.channel);
 publish(member.channel,{type:'speaker',name:null});
 state(member.channel);
}
function remove(ws) {
 const member=members.get(ws);
 if(!member)return;
 release(ws);
 members.delete(ws);
 if(names.get(member.name.toLowerCase())===ws)names.delete(member.name.toLowerCase());
 state(member.channel);
 console.log('disconnect '+member.name+' '+member.channel+' users='+members.size);
}
function ipOf(req) {return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();}
function rateAllowed(ip) {
 const v=badAttempts.get(ip);if(!v)return true;
 if(Date.now()-v.start>15*60000){badAttempts.delete(ip);return true;}
 return v.count<8;
}
function bad(ip) {
 const v=badAttempts.get(ip);
 if(!v||Date.now()-v.start>15*60000)badAttempts.set(ip,{start:Date.now(),count:1});
 else v.count++;
}
const server=http.createServer((req,res)=>{
 const healthy=req.url==='/health';
 res.writeHead(healthy?200:404,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify(healthy?{ok:true,version:'2.1-pin4',users:members.size,channels:channels.length}:{error:'not_found'}));
});
const wss=new WebSocket.Server({server,path:'/radio',maxPayload:8192,perMessageDeflate:false});
wss.on('connection',(ws,req)=>{
 const ip=ipOf(req);
 ws.isAlive=true;
 ws.on('pong',()=>{ws.isAlive=true;});
 let authenticated=false;
 const joinDeadline=setTimeout(()=>ws.close(4001,'Tempo de autenticação excedido'),12000);
 ws.on('message',(data,binary)=>{
  if(binary) {
   const member=members.get(ws);
   if(!authenticated || !member || speakers.get(member.channel)!==ws || data.length>2048)return;
   for(const [peer,m] of members)if(m.channel===member.channel && peer!==ws && peer.readyState===WebSocket.OPEN && peer.bufferedAmount<131072)peer.send(data,{binary:true});
   return;
  }
  let p;
  try{p=JSON.parse(data.toString());}catch{return;}
  if(!authenticated) {
   if(p.type!=='join')return;
   if(!rateAllowed(ip)){ws.close(4003,'Muitas tentativas');return;}
   if(typeof p.code!=='string'||!sameCode(p.code,accessCode)){bad(ip);ws.close(4003,'Código incorreto');return;}
   const canonical=knownNames.get(String(p.name||'').trim().toLocaleLowerCase('pt-BR'));
   if(!canonical){ws.close(4005,'Usuário não autorizado neste piloto');return;}
   // Uma pessoa, uma sessão. Novos logins substituem sessões antigas e travadas.
   const previous=names.get(canonical.toLowerCase());
   if(previous && previous!==ws){remove(previous);previous.close(4006,'Sessão substituída');}
   if(members.size>=MAX_USERS){ws.close(4004,'Limite de usuários atingido');return;}
   const allowed=channels.filter(c=>c.users.includes(canonical));
   const requested=allowed.find(c=>c.id===p.channel);
   const channel=requested||allowed[0];
   if(!channel){ws.close(4005,'Sem canais autorizados');return;}
   authenticated=true;clearTimeout(joinDeadline);
   members.set(ws,{name:canonical,channel:channel.id});
   names.set(canonical.toLowerCase(),ws);
   send(ws,{type:'joined',name:canonical,channel:channel.id,channels:ownChannels(canonical)});
   state(channel.id);
   console.log('connect '+canonical+' '+channel.id+' users='+members.size);
   return;
  }
  const member=members.get(ws);
  if(!member)return;
  if(p.type==='switch'){
   const next=channels.find(c=>c.id===p.channel && c.users.includes(member.name));
   if(!next){send(ws,{type:'error',message:'Você não tem acesso a este canal'});return;}
   changeChannel(ws,next);
  }else if(p.type==='channel_create'){
   // Somente participantes já autenticados no piloto podem criar canais.
   const title=typeof p.name==='string'?p.name.trim().replace(/\s+/g,' '):'';
   if(title.length<3 || title.length>48) {send(ws,{type:'error',message:'Nome do canal: 3 a 48 caracteres'});return;}
   if(channels.length>=MAX_CHANNELS){send(ws,{type:'error',message:'Limite de canais temporários atingido'});return;}
   if(channels.filter(c=>c.private&&c.owner===member.name).length>=8) {
    send(ws,{type:'error',message:'Limite de 8 canais criados por pessoa'});return;
   }
   const pin=uniquePin();
   const id='p'+crypto.randomBytes(7).toString('hex');
   const next={id,name:title,users:[member.name],private:true,owner:member.name};
   channels.push(next);pins.set(pin,id);
   send(ws,{type:'channel_created',channel:{id,name:title},pin});
   sendChannelList(ws);
   changeChannel(ws,next);
   console.log('canal temporário criado id='+id+' owner='+member.name);
  }else if(p.type==='channel_join'){
   const pin=typeof p.pin==='string'?p.pin:'';
   if(!/^[0-9]{4}$/.test(pin)){send(ws,{type:'error',message:'PIN deve conter 4 números'});return;}
   if(!joinAttemptAllowed(member.name)){send(ws,{type:'error',message:'Muitas tentativas. Tente em 15 minutos'});return;}
   const channelId=pins.get(pin);
   const next=channelId?channels.find(c=>c.id===channelId):null;
   if(!next){noteBadPin(member.name);send(ws,{type:'error',message:'PIN não encontrado'});return;}
   if(!next.users.includes(member.name))next.users.push(member.name);
   send(ws,{type:'channel_joined',channel:{id:next.id,name:next.name}});
   sendChannelList(ws);
   changeChannel(ws,next);
   console.log('membro entrou em canal id='+next.id+' name='+member.name);
  }else if(p.type==='talk'){
   if(!speakers.has(member.channel)){
    speakers.set(member.channel,ws);
    speakTimeouts.set(member.channel,setTimeout(()=>release(ws),60000));
    send(ws,{type:'granted'});
    publish(member.channel,{type:'speaker',name:member.name});
    state(member.channel);
   }else if(speakers.get(member.channel)!==ws){
    send(ws,{type:'busy',name:members.get(speakers.get(member.channel))?.name||'Outra pessoa'});
   }
  }else if(p.type==='release')release(ws);
  else if(p.type==='ping')send(ws,{type:'pong'});
 });
 ws.on('close',()=>{clearTimeout(joinDeadline);remove(ws);});
 ws.on('error',()=>{clearTimeout(joinDeadline);remove(ws);});
});
setInterval(()=>{
 for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
 for(const [ip,v] of badAttempts)if(Date.now()-v.start>15*60000)badAttempts.delete(ip);
 for(const [name,v] of pinFailures)if(Date.now()-v.start>15*60000)pinFailures.delete(name);
},30000);
server.listen(port,'0.0.0.0',()=>console.log('Radio Familia V2.1 PIN4 piloto temporario ouvindo na porta '+port));
