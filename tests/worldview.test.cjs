'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const chat=require('../api/himiko-chat');
const tick=require('../api/shared-chat-tick');
const premise=require('../lib/himiko-worldview');
async function invoke(handler,req){let code,body;await handler(req,{setHeader(){},status(c){code=c;return this;},json(d){body=d;return this;}});return {code,body};}
test('worldview reaches the real generation boundary on every chat path',async t=>{
 const env={...process.env},fetch=global.fetch,error=console.error,warn=console.warn;
 process.env.ANTHROPIC_API_KEY='test-not-a-real-key';
 for(const k of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','HIMIKO_REQUIRE_SHARED_RATE_LIMIT'])delete process.env[k];
 console.error=()=>{};console.warn=()=>{};
 try{
  const requests=[];
  global.fetch=async(url,options)=>{
   assert.equal(String(url),'https://api.anthropic.com/v1/messages');
   requests.push(JSON.parse(options.body));
   return {ok:false,status:503};
  };
  const base={method:'POST',headers:{host:'test.internal',origin:'https://test.internal','content-type':'application/json'},socket:{remoteAddress:'worldview-test'}};
  for(const [name,fields,body] of [
   ['personal',{}, {characterId:1,messages:[{role:'user',content:'どこに行けば会える？'}]}],
   ['teacher',{}, {characterId:0,messages:[{role:'user',content:'歴史の質問です'}]}],
   ['group manual',{}, {mode:'group',messages:[{role:'user',content:'さっきの喫茶店は何駅？'}]}],
   ['group auto batch',{himikoAutomatic:true,himikoBatch:true,himikoInboxId:'a'.repeat(64)}, {mode:'group',messages:[{role:'user',content:'5場面の自動会話を作成'}]}]
  ]){
   await t.test(name,async()=>{
    const before=requests.length;await invoke(chat,{...base,...fields,body});assert.equal(requests.length,before+1);
    const r=requests.at(-1);assert(r.system.endsWith(premise));assert.equal(r.system.split(premise).length,2);
    assert.equal(r.model,process.env.ANTHROPIC_MODEL||'claude-haiku-5-5');
    assert.deepEqual(r.messages,body.messages);assert.equal(r.thinking.type,'disabled');
    if(body.mode==='group'){
     assert(!r.system.includes('散歩へ誘う人に'));
     assert(!r.system.includes('偉人が現代でチャット民になったら'));
     assert(r.system.includes('史実上の主従・師弟・親子'));
    }
   });
  }
  await t.test('shared scheduler also uses the same premise through Himiko',async()=>{
   const secret='worldview-test-secret-long-enough';
   process.env.SHARED_CHAT_CRON_SECRET=secret;process.env.SHARED_CHAT_AI_ENABLED='1';
   process.env.SHARED_CHAT_SUPABASE_URL='https://test.supabase.co';process.env.SHARED_CHAT_SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
   const before=requests.length,actions=[];
   global.fetch=async(url,options)=>{
    if(String(url).includes('/rest/v1/rpc/')){
     const b=JSON.parse(options.body);actions.push(b.p_action);
     return {ok:true,json:async()=>b.p_action==='claim'?{job:{room_id:'11111111-1111-4111-8111-111111111111',claim_id:'22222222-2222-4222-8222-222222222222',recent:[]}}:{ok:true}};
    }
    requests.push(JSON.parse(options.body));return {ok:false,status:503};
   };
   await invoke(tick,{method:'POST',headers:{authorization:'Bearer '+secret}});
   assert.equal(requests.length,before+1);assert(requests.at(-1).system.endsWith(premise));
   assert.deepEqual(actions,['claim','fail']); // A failed model call must not stage any scene.
  });
 }finally{process.env=env;global.fetch=fetch;console.error=error;console.warn=warn;}
});
