const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(cors()); app.use(express.json({limit:'10kb'}));
const server = http.createServer(app);
const io = new Server(server,{cors:{origin:'*',methods:['GET','POST']},transports:['websocket','polling']});
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const dataFile = path.join(__dirname,'leaderboard.json');
let leaderboard=[]; try{leaderboard=JSON.parse(fs.readFileSync(dataFile,'utf8'))}catch{}
function saveBoard(){try{fs.writeFileSync(dataFile,JSON.stringify(leaderboard.slice(0,100),null,2))}catch(e){console.error('No se pudo guardar la tabla:',e.message)}}
function cleanName(v){return String(v||'Jugador').replace(/[<>]/g,'').trim().slice(0,18)||'Jugador'}
function roomView(room){return {code:room.code,mode:room.mode,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score||0,x:p.x||0,y:p.y||0}))}}
function broadcastRoom(room){io.to(room.code).emit('room-update',roomView(room))}
function makeCode(){let s;do{s=Math.random().toString(36).slice(2,8).toUpperCase()}while(rooms.has(s));return s}
app.get('/',(req,res)=>res.type('text').send('SOMBRA CERO online server is running.'));
app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((n,r)=>n+r.players.size,0)}));
app.get('/api/leaderboard',(req,res)=>res.json(leaderboard.slice(0,20)));
app.post('/api/score',(req,res)=>{const name=cleanName(req.body?.name);const score=Math.max(0,Math.min(100000000,Math.floor(Number(req.body?.score)||0)));if(!score)return res.status(400).json({error:'score_required'});leaderboard.push({name,score,at:Date.now()});leaderboard.sort((a,b)=>b.score-a.score);leaderboard=leaderboard.slice(0,100);saveBoard();io.emit('leaderboard-update',leaderboard.slice(0,20));res.json({ok:true,top:leaderboard.slice(0,20)})});
io.on('connection',socket=>{
 socket.on('create-room',payload=>{const mode=payload?.mode==='pvp'?'pvp':'coop';const code=makeCode();const room={code,mode,players:new Map(),created:Date.now()};room.players.set(socket.id,{id:socket.id,name:cleanName(payload?.name),score:0,x:0,y:0});rooms.set(code,room);socket.data.room=code;socket.join(code);socket.emit('room-created',roomView(room));broadcastRoom(room)});
 socket.on('join-room',payload=>{const code=String(payload?.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const room=rooms.get(code);if(!room)return socket.emit('room-error',{message:'No existe esa sala. Revisa el código.'});if(room.players.size>=4)return socket.emit('room-error',{message:'La sala está llena (máximo 4 jugadores).'});if(payload?.mode&&payload.mode!==room.mode)return socket.emit('room-error',{message:'Esa sala es de otro modo.'});room.players.set(socket.id,{id:socket.id,name:cleanName(payload?.name),score:0,x:0,y:0});socket.data.room=code;socket.join(code);socket.emit('room-joined',roomView(room));broadcastRoom(room)});
 socket.on('player-state',payload=>{const room=rooms.get(socket.data.room);if(!room||!room.players.has(socket.id))return;const p=room.players.get(socket.id);p.x=Math.max(0,Math.min(2000,Number(payload?.x)||0));p.y=Math.max(0,Math.min(2000,Number(payload?.y)||0));p.score=Math.max(p.score,Math.max(0,Math.floor(Number(payload?.score)||0)));socket.to(room.code).emit('player-state',{id:socket.id,name:p.name,x:p.x,y:p.y,score:p.score})});
 socket.on('player-shot',payload=>{const room=rooms.get(socket.data.room);if(!room||room.mode!=='pvp')return;const angle=Number(payload?.angle);if(!Number.isFinite(angle))return;socket.to(room.code).emit('player-shot',{id:socket.id,x:Number(payload?.x)||0,y:Number(payload?.y)||0,angle,damage:Math.max(1,Math.min(20,Number(payload?.damage)||5))})});
 socket.on('submit-score',payload=>{const name=cleanName(payload?.name);const score=Math.max(0,Math.min(100000000,Math.floor(Number(payload?.score)||0)));if(!score)return;leaderboard.push({name,score,at:Date.now()});leaderboard.sort((a,b)=>b.score-a.score);leaderboard=leaderboard.slice(0,100);saveBoard();io.emit('leaderboard-update',leaderboard.slice(0,20))});
 socket.on('disconnect',()=>{const code=socket.data.room;const room=rooms.get(code);if(!room)return;room.players.delete(socket.id);if(!room.players.size){setTimeout(()=>{const still=rooms.get(code);if(still&&!still.players.size)rooms.delete(code)},10*60*1000)}else broadcastRoom(room)});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`SOMBRA CERO online server listening on ${PORT}`));
