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
 // Criação dinâmica com PIN único de quatro dígitos
 a.ws.send(JSON.stringify({type:'channel_create',name:'Monitoria de Teste'}));
 const created=await a.event('channel_created');
 assert.match(created.pin,/^[0-9]{4}$/);
 assert.equal(created.channel.name,'Monitoria de Teste');
 const list=await a.event('channels');
 assert(list.channels.some(ch=>ch.id===created.channel.id));
 await a.event('switched');await a.event('room_state');
 // PIN inválido não autoriza a entrada
 b.ws.send(JSON.stringify({type:'channel_join',pin:'999999'}));
 const invalid=await b.event('error');assert.match(invalid.message,/4 números/);
 // Um membro autorizado pode entrar com o PIN de convite
 b.ws.send(JSON.stringify({type:'channel_join',pin:created.pin}));
 const joined=await b.event('channel_joined');
 assert.equal(joined.channel.id,created.channel.id);
 const bChannels=await b.event('channels');
 assert(bChannels.channels.some(ch=>ch.id===created.channel.id));
 await b.event('switched');
 const room=await b.event('room_state');
 assert.equal(room.participants.filter(p=>p.online).length,2);
 // Pietro permanece offline no canal privado enquanto não entrar nele
 const roster=await a.event('room_state');
 assert.equal(roster.participants.length,2);
 assert(!roster.participants.some(p=>p.name==='Pietro'));
 // Não é permitido entrar sem PIN (mesmo conhecendo o identificador)
 c.ws.send(JSON.stringify({type:'switch',channel:created.channel.id}));
 assert.match((await c.event('error')).message,/não tem acesso/);
 // Só participantes conectados no MESMO canal recebem voz
 b.ws.send(JSON.stringify({type:'talk'}));
 await b.event('granted');await b.event('speaker');
 b.ws.send(Buffer.from([3,3,4,4]));
 await a.event('pcm');
 b.ws.send(JSON.stringify({type:'release'}));
 // PIN errado é rejeitado mesmo para usuários autenticados
 c.ws.send(JSON.stringify({type:'channel_join',pin:'abc1'}));
 assert.match((await c.event('error')).message,/4 números/);
 a.ws.close();b.ws.close();c.ws.close();
 console.log('TESTE OK: PTT, canais criados, PIN 4 dígitos, entrada privada, participantes e acesso isolado.');
})().then(()=>{server.kill();process.exit(0)}).catch(e=>{console.error(e);console.error(output);server.kill();process.exit(1)});
