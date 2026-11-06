'use strict';
const {createHash}=require('node:crypto');
const plan=require('./himiko-conversation-plan');
// Reuse the already configured Redis. No new SQL, credentials, or paid service.
// Supabase remains authoritative for membership, messages and the generation lease.
function configured(){return !!((process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL)&&
 (process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN));}
function key(room){return 'himiko:shared:topics:v1:'+createHash('sha256').update(room).digest('hex');}
async function command(...args){
 const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
 const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
 const d=await r.json();if(!r.ok||d.error)throw Error('topic_history_unavailable');return d.result;
}
async function read(room,recent=[]){
 if(configured())try{
  const raw=await command('GET',key(room));return plan.cleanHistory(raw?JSON.parse(raw):[]);
 }catch{console.warn('[shared-ai] topic_history_read_unavailable');}
 // Older installations without Redis still work, using the recent delivered text.
 // This is explicitly a short-window fallback, not durable cross-batch coverage.
 const text=recent.map(r=>String(r.text||'')).join('\n');
 return plan.topics.filter(t=>text.includes(t.term)).map(t=>({topicId:t.id,angleId:'',at:0}));
}
async function save(room,history,scenes){
 if(!configured())return;
 let next=history;for(const scene of scenes)next=plan.remember(next,scene.curriculum);
 try{await command('SET',key(room),JSON.stringify(next),'EX',90*86400);}
 catch{console.warn('[shared-ai] topic_history_write_unavailable');}
}
module.exports={read,save};
