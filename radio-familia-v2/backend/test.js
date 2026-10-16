'use strict';
// Testes locais isolados: não acessam o servidor real nem usam credenciais reais.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const WebSocket=require('ws');
const port=32117,code='token-do-teste-isolado-123456';
const server=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),FAMILY_CODE:code},stdio:['ignore','pipe','pipe']});
let output='';
server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
async function connect(name,channel) {
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/radio');
 const q=[],waiters=[];
 const add=(o)=>{if(waiters.length)waiters.shift()(o);else q.push(o);};
 ws.on('message',(b,isBinary)=>{if(isBinary)add({type:'pcm'});else add(JSON.parse(b.toString()));});
 await new Promise((yes,no)=>{ws.once('open',yes);ws.once('error',no)});
 ws.send(JSON.stringify({type:'join',code,name,channel}));
 return {ws,async event(type,timeout=2400){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
   let x;
   if(q.length)x=q.shift();
   else x=await Promise.race([new Promise(r=>waiters.push(r)),wait(Math.min(500,deadline-Date.now())).then(()=>({type:'waiting'}))]);
   if(x.type===type)return x;
  }
  throw Error('Evento '+type+' ausente. Fila: '+JSON.stringify(q));
 }};
}
(async()=>{
 await wait(250);
 const a=await connect('Erick','ch02');const aj=await a.event('joined');
 assert.equal(aj.channel,'ch02');assert(aj.channels.every(c=>c.users.includes('Erick')));
 let state=await a.event('room_state');assert.equal(state.participants.length,2);
 assert.equal(state.participants.filter(p=>p.online).length,1);
 const b=await connect('Bruna','ch02');await b.event('joined');await b.event('room_state');
 state=await a.event('room_state');assert.equal(state.participants.filter(p=>p.online).length,2);
 a.ws.send(JSON.stringify({type:'talk'}));await a.event('granted');
 await a.event('speaker');await b.event('speaker');
 a.ws.send(Buffer.from([0,0,1,1]));await b.event('pcm');
 a.ws.send(JSON.stringify({type:'release'}));
 const c=await connect('Pietro','ch01');await c.event('joined');await c.event('room_state');
 c.ws.send(JSON.stringify({type:'switch',channel:'ch02'}));
 const err=await c.event('error');assert.match(err.message,/não tem acesso/);
 a.ws.close();b.ws.close();c.ws.close();
 console.log('TESTE OK: salas, permissões de piloto, presença, transmissões e isolamento.');
})().then(()=>{server.kill();process.exit(0)}).catch(e=>{console.error(e);console.error(output);server.kill();process.exit(1)});
