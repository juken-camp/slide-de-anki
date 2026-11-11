'use strict';
// An active room wakes only its own worker. Authorization uses the user's JWT;
// service credentials are used only AFTER the room's DB authorization succeeds.
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POSTのみ利用できます。'});
 if(process.env.HIMIKO_SHARED_ENABLED!=='1'||process.env.SHARED_CHAT_ENABLED!=='1'||process.env.SHARED_CHAT_AI_ENABLED!=='1')return res.status(503).json({error:'共有会話は準備中です。'});
 if(req.headers.origin!==`https://${req.headers.host}`&&!(process.env.NODE_ENV!=='production'&&req.headers.origin===`http://${req.headers.host}`))return res.status(403).json({error:'アプリから操作してください。'});
 const auth=req.headers.authorization;
 if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(auth))return res.status(401).json({error:'ログインしてください。'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const id=body?.room_id;
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||''))return res.status(400).json({error:'部屋を選んでください。'});
  const url=process.env.SHARED_CHAT_SUPABASE_URL,key=process.env.SHARED_CHAT_SUPABASE_ANON_KEY;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url||'')||!key)return res.status(503).json({error:'共有設定を確認してください。'});
  const check=await fetch(new URL('/rest/v1/rpc/shared_chat_rpc',url),{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_action:'sync',p_payload:{room_id:id}}),signal:AbortSignal.timeout(15000)});
  const access=await check.json();
  if(!check.ok||access.error||!access.room)return res.status(check.status===401?401:403).json({error:'この部屋には参加できません。'});
  if(!access.room.ai_enabled)return res.status(200).json({generated:false,stopped:true});
  const {rpc,getScenes}=require('./shared-chat-tick').sharedWorker;
  const claimed=await rpc('claim',{room_id:id});
  if(!claimed.job)return res.status(200).json({generated:false});
  const job=claimed.job;
  if(job.room_id!==id)throw Error('wrong_room');
  try{
   const history=require('../lib/himiko-shared-topic-history');
   const previous=await history.read(id,job.recent||[]);
   const {messages,scenes}=await getScenes(job,previous);
   const result=await rpc('stage',{room_id:id,claim_id:job.claim_id,messages});
   if(result.staged)await history.save(id,previous,scenes);
   return res.status(200).json({generated:!!result.staged});
  }catch(e){await rpc('fail',{room_id:id,claim_id:job.claim_id}).catch(()=>{});throw e;}
 }catch(e){return res.status(503).json({error:'会話を準備できませんでした。しばらくしてから再試行します。'});}
};
