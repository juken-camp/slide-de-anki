'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const ai=require('../api/shared-chat-tick');
const shared=require('../api/shared-chat');
async function invoke(handler,req){let status=0,body,headers={};
 await handler(req,{setHeader(k,v){headers[k]=v;},status(s){status=s;return this;},json(d){body=d;return this;}});
 return {status,body,headers};
}
const key='correct-secret-with-at-least-24-chars';
const req=(method='POST',auth='Bearer '+key)=>({method,headers:{authorization:auth,host:'app.test',origin:'https://app.test'},body:{}});

test('scheduler prevents untrusted calls before accessing DB',async()=>{
 process.env.SHARED_CHAT_CRON_SECRET=key;
 process.env.SHARED_CHAT_AI_ENABLED='1';
 assert.equal((await invoke(ai,req('GET'))).status,405);
 assert.equal((await invoke(ai,req('POST','Bearer wrong'))).status,401);
 assert.equal((await invoke(ai,req('POST',''))).status,401);
 delete process.env.SHARED_CHAT_AI_ENABLED;
 assert.equal((await invoke(ai,req())).status,503);
});
test('scheduler does not accept short token or malformed bearer',()=>{
 assert.equal(ai.authorized('Bearer '+key,key),true);
 assert.equal(ai.authorized('bearer '+key,key),false);
 assert.equal(ai.authorized('Bearer '+key+'x',key),false);
 assert.equal(ai.authorized('Bearer short','short'),false);
});
test('AI replies keep persona IDs and maintain order and gaps',()=>{
 const scenes=[{replies:[{id:1,text:'卑弥呼の発言'},{id:2,text:'聖徳太子の発言'}, {id:1,text:'もう一言'}]},
  {replies:[{id:2,text:'次の場面'},{id:1,text:'返答'}]}];
 const messages=ai.flattenScenes(scenes);
 assert.deepEqual(messages.map(x=>x.speaker_id),[1,2,1,2,1]);
 assert.deepEqual(messages.map(x=>x.name),['卑弥呼','聖徳太子','卑弥呼','聖徳太子','卑弥呼']);
 assert(messages.every((m,i)=>m.delay_seconds>=5&&(i===0||m.delay_seconds>messages[i-1].delay_seconds)));
 assert(messages[3].delay_seconds-messages[2].delay_seconds>=2400);
 assert(messages.every(m=>m.text.length<=1500));
 assert.throws(()=>ai.flattenScenes([{replies:[{id:9999,text:'invalid'}]}]));
});
test('pilot config never exposes service credentials',async()=>{
 const original={...process.env};
 try{
  process.env.SHARED_CHAT_ENABLED='1';process.env.SHARED_CHAT_AI_ENABLED='1';
  process.env.SHARED_CHAT_SUPABASE_URL='https://example.supabase.co';
  process.env.SHARED_CHAT_SUPABASE_ANON_KEY='sb_publishable_dummy';
  process.env.SHARED_CHAT_SUPABASE_SERVICE_ROLE_KEY='super_secret_value';
  const r=await invoke(shared,{method:'GET',headers:{host:'app.test'}});
  assert.equal(r.status,200);
  assert.equal(r.body.aiAvailable,true);
  assert(!JSON.stringify(r.body).includes('super_secret_value'));
 }finally{process.env=original;}
});
test('claim-only tick does not call Claude and publishes due queue safely',async()=>{
 const origFetch=global.fetch;
 try{
  process.env.SHARED_CHAT_CRON_SECRET=key;
  process.env.SHARED_CHAT_AI_ENABLED='1';
  process.env.SHARED_CHAT_SUPABASE_URL='https://example.supabase.co';
  process.env.SHARED_CHAT_SUPABASE_SERVICE_ROLE_KEY='sb_secret_dummy';
  delete process.env.HIMIKO_VAPID_PUBLIC_KEY;
  let actions=[];
  global.fetch=async(url,options)=>{
   assert(String(url).endsWith('/rest/v1/rpc/shared_chat_ai_rpc'));
   assert.equal(options.headers.Authorization,'Bearer sb_secret_dummy');
   const request=JSON.parse(options.body);actions.push(request.p_action);
   return {ok:true,json:async()=>({published:3,job:null})};
  };
  const result=await invoke(ai,req());
  assert.equal(result.status,200);assert.deepEqual(actions,['claim']);
  assert.deepEqual(result.body,{published:3,generated:0,notified:0});
 }finally{global.fetch=origFetch;}
});
