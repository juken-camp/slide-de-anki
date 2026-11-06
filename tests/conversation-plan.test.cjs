'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const plan=require('../lib/himiko-conversation-plan');
const inbox=require('../lib/himiko-inbox');
const chat=require('../api/himiko-chat');
const shared=require('../api/shared-chat-tick');
function seeded(seed=123){return n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};}
async function invoke(handler,req){let code,body;await handler(req,{setHeader(){},status(c){code=c;return this;},json(d){body=d;return this;}});return {code,body};}
function modelResult(request,missing=-1){
 const scenes={};
 for(let i=0;i<5;i++){
  const line=request.system.split('\n').find(l=>l.startsWith('scene'+(i+1)+'：'));
  const spec=JSON.parse(line.slice(line.indexOf('：')+1));
  scenes['scene'+(i+1)]={topicContext:{period:'異次元',region:'各地'},historicalReplies:[
   {name:'卑弥呼',text:i===missing?'言葉を短くするのも難しいね。':`${spec.必須用語||spec.話題}、この言葉が気になったんだ。`,event:'',target:''},
   {name:'聖徳太子',text:'そこに目が行くんだね。',event:'',target:''}],teacherSupplement:'短い補足です。',
   studentQuestion:{asker:'',question:'',answerExamples:[]},suggestions:[]};
 }
 return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(scenes)}]})};
}
function envForModel(){
 process.env.ANTHROPIC_API_KEY='test-only';
 for(const k of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','HIMIKO_REQUIRE_SHARED_RATE_LIMIT'])delete process.env[k];
}
const base={method:'POST',headers:{host:'test.internal',origin:'https://test.internal','content-type':'application/json'},socket:{remoteAddress:'curriculum-test'},body:{mode:'group',messages:[{role:'user',content:'5場面を作成'}]},himikoAutomatic:true,himikoBatch:true,himikoInboxId:'b'.repeat(64)};
test('every source seed matches the actual local question and answer',()=>{
 const sources=new Map();
 for(const topic of plan.topics){
  if(!sources.has(topic.source))sources.set(topic.source,JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..',topic.source),'utf8')));
  const card=sources.get(topic.source).cards.find(c=>c.id===topic.cardId);
  assert.equal(topic.term,card.answer_text);assert.equal(topic.question,card.question_text);
 }
 assert.equal(new Set(plan.topics.map(t=>t.id)).size,87);
 assert.equal(new Set(plan.topics.map(t=>t.era)).size,7);
});
test('3 history + 2 free; eras, families and angles differ within batch; durable IDs avoid repeats',()=>{
 const rng=seeded();let history=[],seen=new Set(),previous=[];
 for(let batch=0;batch<80;batch++){
  // Simulate a process restart by retaining JSON only.
  const p=plan.makePlan(JSON.parse(JSON.stringify(history)),rng);
  assert(plan.validPlan(p));assert.equal(p.filter(x=>x.kind==='history').length,3);
  const topics=p.filter(x=>x.kind==='history').map(x=>plan.topics.find(t=>t.id===x.topicId));
  assert.equal(new Set(topics.map(t=>t.era)).size,3);assert.equal(new Set(topics.map(t=>t.family)).size,3);
  assert.equal(new Set(p.map(x=>x.angleId)).size,5);
  assert(p.every(x=>!previous.includes(x.topicId)));
  for(const x of p){seen.add(x.topicId);history=plan.remember(history,x,batch+1);}
  previous=p.map(x=>x.topicId);
 }
 assert(history.length<=100);assert(seen.size>85,'selection reaches late-file topics, not only initial items');
});
test('history and free scene positions vary rather than always placing history first',()=>{
 const positions=new Set();const rng=seeded(2);
 for(let i=0;i<100;i++)for(const [j,p] of plan.makePlan([],rng).entries())if(p.kind==='free')positions.add(j);
 assert.equal(positions.size,5);
});
test('released inbox scenes are remembered; discarded prepared scenes are not',()=>{
 const p=plan.makePlan([],seeded()),meta=plan.metadata(p,0);
 const state={batches:[],prepared:[{curriculum:meta,automaticTopic:plan.label(meta),replies:[{id:1,text:'発言'},{id:2,text:'返答'}]}],sent:0};
 inbox.releaseScene(state,Date.now(),0);
 assert.equal(state.conversationHistory.length,1);assert.equal(state.conversationHistory[0].topicId,meta.topicId);
 state.prepared=[{curriculum:plan.metadata(p,1),replies:[]}];state.prepared=[];
 assert.equal(state.conversationHistory.length,1);
 const absent={batches:[],sent:0,members:{1:{leftAt:1,until:Date.now()+60000}},prepared:[{curriculum:meta,replies:[{id:1,text:'不在'}]}]};
 inbox.releaseScene(absent,Date.now(),0);assert(!absent.conversationHistory);
});
test('generation passes the server plan through real Claude boundary; missing term does not shift metadata',async()=>{
 const env={...process.env},fetch=global.fetch,warn=console.warn;
 try{
  envForModel();console.warn=()=>{};
  const p=plan.makePlan([],seeded()),missing=p.findIndex(x=>x.kind==='history');
  let captured;
  global.fetch=async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');captured=JSON.parse(options.body);return modelResult(captured,missing);};
  const r=await invoke(chat,{...base,himikoConversationPlan:p});
  assert.equal(r.code,200);assert.equal(r.body.scenes.length,4);
  assert.deepEqual(r.body.scenes.map(s=>s.sceneIndex),[0,1,2,3,4].filter(i=>i!==missing));
  for(const s of r.body.scenes)assert.deepEqual(s.curriculum,plan.metadata(p,s.sceneIndex));
  assert(captured.system.includes('歴史3場面'));assert(captured.system.includes('犠牲者'));
  assert(!captured.messages[0].content.includes('必須用語')); // trusted system data, not user body
 }finally{process.env=env;global.fetch=fetch;console.warn=warn;}
});
test('inbox generates one batch with no extra model calls and only records on delivery',async()=>{
 const env={...process.env},fetch=global.fetch;
 try{
  envForModel();let calls=0;
  global.fetch=async(url,options)=>{calls++;const request=JSON.parse(options.body);assert(!request.messages[0].content.includes('残りは自由な雑談'));return modelResult(request);};
  const state={batches:[],context:[],prepared:[],sent:0};
  state.prepared=await inbox.generate(state,'c'.repeat(64));
  assert.equal(calls,1);assert.equal(state.prepared.length,5);assert(!state.conversationHistory);
  const historyCount=state.prepared.filter(s=>plan.topics.some(t=>t.id===s.curriculum.topicId)).length;assert.equal(historyCount,3);
  inbox.releaseScene(state,Date.now(),0);assert.equal(state.conversationHistory.length,1);
 }finally{process.env=env;global.fetch=fetch;}
});
test('shared topic history saves only when Supabase accepts the lease, and survives the next invocation',async()=>{
 const env={...process.env},fetch=global.fetch,warn=console.warn;
 try{
  envForModel();console.warn=()=>{};
  process.env.SHARED_CHAT_CRON_SECRET='curriculum-long-secret-for-tests';process.env.SHARED_CHAT_AI_ENABLED='1';
  process.env.SHARED_CHAT_SUPABASE_URL='https://test.supabase.co';process.env.SHARED_CHAT_SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
  process.env.UPSTASH_REDIS_REST_URL='https://redis.test';process.env.UPSTASH_REDIS_REST_TOKEN='test';
  for(const k of ['HIMIKO_VAPID_SUBJECT','HIMIKO_VAPID_PUBLIC_KEY','HIMIKO_VAPID_PRIVATE_KEY'])delete process.env[k];
  let stored=null,accept=false,writes=0,publishes=0;const batches=[];
  global.fetch=async(url,options)=>{
   const b=JSON.parse(options.body);
   if(url==='https://redis.test'){
    if(b[0]==='EVAL')return {ok:true,json:async()=>({result:[1,0,0]})};
    if(b[0]==='SET'){stored=b[2];writes++;return {ok:true,json:async()=>({result:'OK'})};}
    assert.equal(b[0],'GET');return {ok:true,json:async()=>({result:stored})};
   }
   if(String(url).includes('/rest/v1/rpc/')){
    if(b.p_action==='claim')return {ok:true,json:async()=>({job:{room_id:'11111111-1111-4111-8111-111111111111',claim_id:'22222222-2222-4222-8222-222222222222',recent:[]}})};
    if(b.p_action==='stage'){assert(b.p_payload.messages.length>=10);return {ok:true,json:async()=>({staged:accept})};}
    if(b.p_action==='publish')publishes++;
    return {ok:true,json:async()=>({})};
   }
   const request=JSON.parse(options.body);
   batches.push(request.system.split('\n').filter(l=>/^scene[1-5]：/.test(l)).map(l=>JSON.parse(l.slice(l.indexOf('：')+1))));
   return modelResult(request);
  };
  const req={method:'POST',headers:{authorization:'Bearer '+process.env.SHARED_CHAT_CRON_SECRET}};
  assert.equal((await invoke(shared,req)).code,200);assert.equal(writes,0);assert.equal(publishes,0);
  accept=true;assert.equal((await invoke(shared,req)).code,200);assert.equal(writes,1);assert.equal(JSON.parse(stored).length,5);
  assert.equal((await invoke(shared,req)).code,200);assert.equal(writes,2);assert.equal(JSON.parse(stored).length,10);
  const first=new Set(batches[1].map(x=>x.必須用語||x.話題));assert(batches[2].every(x=>!first.has(x.必須用語||x.話題)));
 }finally{process.env=env;global.fetch=fetch;console.warn=warn;}
});
