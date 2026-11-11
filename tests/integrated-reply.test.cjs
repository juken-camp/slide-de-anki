'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {getScenes}=require('../api/shared-chat-tick').sharedWorker;
test('a human question selects the actual reply prompt, not the automatic no-answer prompt',async()=>{
 const env={...process.env},fetch=global.fetch;let captured;
 try{
  process.env.ANTHROPIC_API_KEY='test-only';
  for(const k of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','HIMIKO_REQUIRE_SHARED_RATE_LIMIT'])delete process.env[k];
  global.fetch=async(url,opt)=>{
   assert.equal(url,'https://api.anthropic.com/v1/messages');captured=JSON.parse(opt.body);
   const schema=captured.output_config.format.schema.properties;
   const replies=Object.fromEntries(Object.keys(schema.historicalReplies.properties).map((k,i)=>[k,{name:i%2?'聖徳太子':'卑弥呼',text:i%2?'食べ物が安定すると暮らしも変わりますね。':'米づくりの広がりが大きな変化だったのです。'}]));
   const result={topicContext:{period:'弥生時代',region:'日本'},historicalReplies:replies,teacherSupplement:schema.teacherSupplement.type==='string'?'稲作が広まった時代です。':null,studentQuestion:{asker:'',question:'',answerExamples:[]},suggestions:[]};
   return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify(result)}],stop_reason:'end_turn'})};
  };
  const result=await getScenes({room_id:'11111111-1111-4111-8111-111111111111',recent:[
   {name:'卑弥呼',kind:'ai',text:'暮らしの話をしていました。'},
   {name:'友人',user_id:'participant-b',kind:'human',text:'なぜ米づくりで暮らしが変わったの？'+ '？'.repeat(1600)},
   {name:'お知らせ',kind:'system',text:'参加者が退会しました。'}
  ]},[]);
  assert.equal(result.scenes.length,1);assert(result.messages.length>=8);
  assert(!captured.system.includes('今回は生徒の質問への回答ではない'));
  assert(!captured.system.includes('5回分の自動おしゃべり'));
  assert(captured.messages[0].content.includes('なぜ米づくりで暮らしが変わったの？'));
  assert(captured.messages[0].content.includes('participant-b'));
  assert(captured.messages[0].content.includes('"kind":"system"'));
  assert(captured.system.includes('生徒の希望する呼ばれ方'));
  assert.equal(result.messages[0].delay_seconds,5);
  assert(result.messages.every((m,i)=>!i||m.delay_seconds-result.messages[i-1].delay_seconds<=15));
 }finally{process.env=env;global.fetch=fetch;}
});
test('shared scenes retain the AI teacher when the original generator supplies one',()=>{
 const {flattenScenes}=require('../api/shared-chat-tick');
 const result=flattenScenes([{replies:[{id:1,text:'人物の発言'},{id:2,text:'別の人物の発言'},{id:0,text:'先生の補足'}]}]);
 assert.equal(result.at(-1).speaker_id,0);assert.equal(result.at(-1).name,'AI先生');
});
