'use strict';
// Server-side AI for the shared group, limited to its current participants.
// Protected by CRON_SECRET; Supabase service-role key is never sent to browsers.
const {timingSafeEqual, randomInt} = require('node:crypto');
const chat = require('./himiko-chat');
const validSpeaker = id => Number.isInteger(id) && !!chat.personaName(id);
const sharedGenerator = require('../lib/shared-group-generator');

function authorized(value, secret){
  if(typeof secret!=='string'||secret.length<24||typeof value!=='string'||!value.startsWith('Bearer '))return false;
  const a=Buffer.from(value.slice(7)),b=Buffer.from(secret);
  return a.length===b.length && timingSafeEqual(a,b);
}
function flattenScenes(scenes,{interactive=false}={}){
  if(!Array.isArray(scenes))throw Error('invalid_scenes');
  let offset=5;const items=[];
  for(const [sceneIndex,scene] of scenes.slice(0,5).entries()){
    if(!Array.isArray(scene.replies))continue;
    const replies=scene.replies.filter(x=>x&&!x.event&&validSpeaker(x.id)&&typeof x.text==='string'&&x.text.trim());
    if(replies.length<2)continue;
    // Scenes are spaced out. A long, occasional pause keeps the chat natural.
    if(sceneIndex)offset+=randomInt(2400,6001);
    let previous=null;
    for(const [index,reply] of replies.entries()){
      if(items.length>=90)break;
      const clean=reply.text.trim().slice(0,1500);
      if(!clean)continue;
      if(index){
        offset+=randomInt(5,11);
        if(previous!==reply.id)offset+=randomInt(0,6);
        if(!interactive&&index>=2&&randomInt(100)<22)offset+=randomInt(90,601);
      }
      if(offset>86400)break;
      items.push({speaker_id:reply.id,name:chat.personaName(reply.id),text:clean,delay_seconds:offset});
      previous=reply.id;
    }
  }
  if(items.length<2)throw Error('too_few_replies');
  return items;
}
async function getScenes(job){
  if(!Array.isArray(job?.cast)||!job.cast.length)throw Error('no_participants');
  return sharedGenerator.generate(job);
}
function config(){
  const url=process.env.SHARED_CHAT_SUPABASE_URL;
  const key=process.env.SHARED_CHAT_SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||!key||!(key.startsWith('sb_secret_')||key.split('.').length===3))throw Error('config_missing');
  return {url:url.replace(/\/$/,''),key};
}
async function rpc(action,payload={}){
  const {url,key}=config();
  const response=await fetch(url+'/rest/v1/rpc/shared_chat_ai_rpc',{method:'POST',redirect:'error',
    headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),'Content-Type':'application/json'},
    body:JSON.stringify({p_action:action,p_payload:payload}),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('db_rpc_failed_'+response.status);
  const body=await response.json();
  if(body?.error||body?.code)throw Error('db_rpc_failed');
  return body;
}
async function deliverNotifications(){
 if(!process.env.HIMIKO_VAPID_SUBJECT||!process.env.HIMIKO_VAPID_PUBLIC_KEY||!process.env.HIMIKO_VAPID_PRIVATE_KEY)return 0;
 const response=await rpc('notifications');
 if(!Array.isArray(response.notifications)||!response.notifications.length)return 0;
 const webpush=require('web-push');
 webpush.setVapidDetails(process.env.HIMIKO_VAPID_SUBJECT,process.env.HIMIKO_VAPID_PUBLIC_KEY,process.env.HIMIKO_VAPID_PRIVATE_KEY);
 const outcomes=await Promise.allSettled(response.notifications.slice(0,50).map(message=>
  webpush.sendNotification(message.subscription,JSON.stringify({
    title:String(message.title||'異次元グルチャ').slice(0,80),
    body:String(message.body||'新しい発言があります').slice(0,140),
    room_id:message.room_id
  }),{TTL:3600,timeout:5000})
 ));
 const sent=outcomes.filter(x=>x.status==='fulfilled').length;
 if(sent<outcomes.length)console.warn('[shared-ai] push_delivery_failed',outcomes.length-sent);
 return sent;
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  const secret=process.env.SHARED_CHAT_CRON_SECRET||process.env.CRON_SECRET;
  if(!authorized(req.headers.authorization,secret))return res.status(401).json({error:'Unauthorized'});
  if(process.env.SHARED_CHAT_AI_ENABLED!=='1')return res.status(503).json({error:'AI is disabled'});
  try{
    const claimed=await rpc('claim');
    if(!claimed.job){const notified=await deliverNotifications();return res.status(200).json({published:claimed.published||0,generated:0,notified});}
    const job=claimed.job;
    if(!/^[a-f0-9-]{36}$/.test(job.room_id)||!/^[a-f0-9-]{36}$/.test(job.claim_id))throw Error('invalid_job');
    try{
      const {messages}=await getScenes(job);
      const stored=await rpc('stage',{room_id:job.room_id,claim_id:job.claim_id,messages});
      if(stored.staged){
        await rpc('publish');
      }
      const notified=await deliverNotifications();
      return res.status(200).json({published:claimed.published||0,generated:stored.staged?1:0,notified});
    }catch(error){
      // Release the lease without publishing a partial scene. The attempt stays
      // budgeted: a failed or interrupted upstream call can still have a cost.
      try{await rpc('fail',{room_id:job.room_id,claim_id:job.claim_id});}catch{}
      console.warn('[shared-ai] generation unsuccessful:',error.message.replace(/[^a-z_0-9]/gi,''));
      return res.status(503).json({error:'Generation unavailable; will retry'});
    }
  }catch(error){console.warn('[shared-ai] scheduler unavailable');return res.status(503).json({error:'Scheduler unavailable'});}
}
module.exports=handler;
module.exports.flattenScenes=flattenScenes;
module.exports.authorized=authorized;
module.exports.sharedWorker={rpc,getScenes};
