const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/shared-chat-live');
const worker=require('../api/shared-chat-tick').sharedWorker;
const room='00000000-0000-4000-8000-000000000003';
const invoke=async(overrides={})=>{let status,body;await handler({method:'POST',headers:{origin:'https://app.test',host:'app.test',authorization:'Bearer '+'a'.repeat(30)},body:{room_id:room},...overrides},{setHeader(){},status(n){status=n;return this},json(d){body=d}});return {status,body};};
test('live worker verifies membership before privileged work',async()=>{
 const env={...process.env},fetch=global.fetch,rpc=worker.rpc;let claims=0;
 try{
  process.env.HIMIKO_SHARED_ENABLED='1';process.env.SHARED_CHAT_ENABLED='1';process.env.SHARED_CHAT_AI_ENABLED='1';process.env.SHARED_CHAT_SUPABASE_URL='https://test.supabase.co';process.env.SHARED_CHAT_SUPABASE_ANON_KEY='sb_publishable_test';
  worker.rpc=async(action,payload)=>{claims++;assert.equal(action,'claim');assert.equal(payload.room_id,room);return {job:null};};
  assert.equal((await invoke({method:'GET'})).status,405);
  assert.equal((await invoke({headers:{host:'app.test',origin:'https://attacker.test'}})).status,403);
  assert.equal((await invoke({headers:{host:'app.test',origin:'https://app.test'}})).status,401);
  assert.equal((await invoke({body:{room_id:'http://attacker.test'}})).status,400);assert.equal(claims,0);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({error:'room_unavailable'})});assert.equal((await invoke()).status,403);assert.equal(claims,0);
  global.fetch=async(url,opt)=>{assert.match(url.toString(),/\/rpc\/shared_chat_rpc$/);assert.equal(opt.headers.Authorization,'Bearer '+'a'.repeat(30));return {ok:true,status:200,json:async()=>({room:{ai_enabled:true}})};};
  assert.equal((await invoke()).status,200);assert.equal(claims,1);
  delete process.env.HIMIKO_SHARED_ENABLED;assert.equal((await invoke()).status,503);assert.equal(claims,1);
 }finally{worker.rpc=rpc;global.fetch=fetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
