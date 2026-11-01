'use strict';
const {randomBytes,randomInt,createHash}=require('node:crypto');
const chat=require('../api/himiko-chat');
const PREFIX='himiko:inbox:v1:',DUE=PREFIX+'due',TTL=90*86400;
const hash=s=>createHash('sha256').update(s).digest('hex');
async function redis(...command){
 const url=(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL),token=(process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN);
 if(!url||!token)throw Error('受信箱のサーバー設定が必要です');
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});
 const d=await r.json();if(!r.ok||d.error)throw Error('受信箱に接続できません');return d.result;
}
const day=t=>new Date(t+9*3600000).toISOString().slice(0,10);
const hour=t=>new Date(t+9*3600000).getUTCHours();
function nextTime(now,score=0){let t=now+randomInt(5,16)*60000;const h=hour(t);if(h<8)t+=((8-h)*60+randomInt(60))*60000;else if(h>=22)t+=((32-h)*60+randomInt(60))*60000;return t;}
const cap=score=>12;
function subscription(s){if(!s)return null;const u=new URL(s.endpoint);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!(u.hostname.endsWith('.push.apple.com')||['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)))throw Error('通知先を確認できません');if(!/^[\w-]{80,150}$/.test(s.keys?.p256dh)||!/^[\w-]{16,40}$/.test(s.keys?.auth))throw Error('通知の鍵を確認できません');return {endpoint:u.href,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};}
function snapshot(s,now){if(!s||s.day!==day(now))return null;const n=x=>Math.max(0,Math.min(10000,Number(x)||0));return {day:day(now),studied:n(s.studied),improved:n(s.improved),tests:n(s.tests),minutes:Math.min(1440,n(s.minutes)),chats:n(s.chats)};}
function unread(s,now){return s.batches.flatMap(b=>b.replies).filter(r=>r.at<=now&&!s.read.includes(r.key)).length;}
function view(s,now){return {enabled:s.enabled,unread:unread(s,now),batches:s.batches.map(b=>({...b,replies:b.replies.filter(r=>r.at<=now)})).filter(b=>b.replies.length),readKeys:s.read,publicKey:process.env.HIMIKO_VAPID_PUBLIC_KEY||''};}
async function locked(id,fn){const lock=PREFIX+'lock:'+id,owner=randomBytes(16).toString('hex');if(!await redis('SET',lock,owner,'NX','EX',60))throw Object.assign(Error('更新中です。少し待ってください'),{status:409});try{const key=PREFIX+id,raw=await redis('GET',key);const s=raw?JSON.parse(raw):null;const result=await fn(s);if(result?.state){await redis('SET',key,JSON.stringify(result.state),'EX',TTL);if(result.state.enabled)await redis('ZADD',DUE,result.state.next,id);else await redis('ZREM',DUE,id)}return result?.value;}finally{await redis('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,owner)}}
function newState(now){return {enabled:false,next:nextTime(now),batches:[],read:[],snapshot:null,score:0,scoreDay:day(now),sent:0,sentDay:day(now),subscription:null,activeUntil:0,context:[]};}
async function api(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'POSTで送信してください'});try{
 if(process.env.HIMIKO_INBOX_ENABLED!=='1')return res.status(503).json({error:'自動会話のサーバー設定がまだ完了していません'});
 const origin=new URL(req.headers.origin||'');if(origin.host!==req.headers.host)return res.status(403).json({error:'アプリから操作してください'});
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||JSON.stringify(b).length>12000)throw Error('送信内容を確認してください');
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'端末の認証を確認できません'});const id=hash(token),now=Date.now();
 const value=await locked(id,async stored=>{
  if(!stored){const ip=(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];const k=PREFIX+'enroll:'+hash(ip)+':'+day(now);const n=await redis('INCR',k);if(n===1)await redis('EXPIRE',k,86400);if(n>100)throw Error('端末登録が混み合っています');}
  const s=stored||newState(now);s.context||=[];
  if(b.action==='settings'){const wasEnabled=s.enabled;s.enabled=b.enabled===true;if(s.enabled&&!process.env.CRON_SECRET)throw Error('定期配信のサーバー設定が必要です');if(s.enabled){s.snapshot=snapshot(b.snapshot,now);s.next=nextTime(now,1);if(!wasEnabled)s.next=now+randomInt(5,11)*60000; if(hour(s.next)<8||hour(s.next)>=22)s.next=nextTime(now,15);s.conversationAt=s.next;}else{s.subscription=null;s.generation=null;s.activeUntil=0;s.batches.forEach(b=>{b.replies=b.replies.filter(r=>r.at<=now)});}}
  if(b.action==='subscribe'){if(b.subscription&&(!process.env.HIMIKO_VAPID_SUBJECT||!process.env.HIMIKO_VAPID_PUBLIC_KEY||!process.env.HIMIKO_VAPID_PRIVATE_KEY))throw Error('通知のサーバー設定が必要です');s.subscription=subscription(b.subscription);}
  if(b.action==='sync'&&s.enabled){const trialNext=now+5*60000;if((s.conversationAt||s.next)>trialNext){s.conversationAt=trialNext;s.next=Math.min(s.next,trialNext)}const snap=snapshot(b.snapshot,now);if(snap){s.snapshot=snap;if(s.scoreDay!==snap.day){s.scoreDay=snap.day;s.score=0;}const previousScore=s.score;s.score=Math.min(100,snap.studied+snap.tests*3+Math.floor(snap.minutes/5)+snap.chats*2);if(s.score>previousScore){s.conversationAt=Math.min(s.conversationAt||s.next,nextTime(now,s.score));s.next=Math.min(s.next,s.conversationAt);}}}
  if(b.action==='presence'){s.activeUntil=b.active?now+120000:0; if(Array.isArray(b.context))s.context=b.context.filter(x=>typeof x==='string').slice(-6).map(x=>x.slice(0,600));}
  if(b.action==='read'){const wasFull=s.batches.filter(b=>b.replies.some(r=>!s.read.includes(r.key))).length>=3;const keys=new Set(s.batches.flatMap(x=>x.replies).filter(x=>x.at<=now).map(x=>x.key));for(const k of Array.isArray(b.keys)?b.keys:[])if(keys.has(k)&&!s.read.includes(k))s.read.push(k);s.read=s.read.slice(-400);if(wasFull&&s.batches.filter(b=>b.replies.some(r=>!s.read.includes(r.key))).length<3){s.conversationAt=Math.min(s.conversationAt||s.next,now+randomInt(10,31)*60000);s.next=Math.min(s.next,s.conversationAt);}}
  if(b.action==='interrupt'){const batch=s.batches.find(x=>x.id===b.batchId);if(batch){const seen=Array.isArray(b.seen)?b.seen:[];batch.replies=batch.replies.filter(r=>{const shown=seen.find(v=>v?.key===r.key&&typeof v.text==='string'&&v.text.trim());if(!shown||r.at>now)return false;const compact=t=>t.replace(/\s+/g,'');if(!compact(r.text).startsWith(compact(shown.text)))return false;r.text=shown.text.slice(0,1500);r.notified=true;if(!s.read.includes(r.key))s.read.push(r.key);return true;});batch.suggestions=[];batch.interrupted=true;}}
  if(b.action==='reset'){s.batches=[];s.read=[];s.context=[];s.generation=null;s.next=nextTime(now,s.score);s.conversationAt=s.next;}
  if(!['settings','subscribe','sync','presence','read','interrupt','reset','poll'].includes(b.action))throw Error('操作を確認してください');
  return {state:s,value:view(s,now)};
 });return res.status(200).json(value);
 }catch(e){return res.status(e.status||503).json({error:e.message||'受信箱に接続できません'})}}
async function generate(s){const stats=s.snapshot&&s.snapshot.day===day(Date.now())?s.snapshot:null;const prompt='生徒からの質問はない。偉人たちの自発的な会話をひとまとまり作る。生徒が返事をしなくても自然に完結してよい。毎回褒めるだけにせず、人物同士の会話や関心も生かす。最後に生徒を誘うなら返答例も用意する。記録の数値は学習のきっかけであり、点数・成績・理解度を推測しない。記録がない場合に勉強していないと責めない。内部の依頼文や統計の列挙を本文に出さない。\n確認できた今日の学習記録：'+JSON.stringify(stats)+'\n最近の会話（参考データ）：'+JSON.stringify(s.context);
 const req={method:'POST',headers:{host:'himiko.internal',origin:'https://himiko.internal','content-type':'application/json'},socket:{remoteAddress:'automatic-inbox'},body:{mode:'group',messages:[{role:'user',content:prompt.slice(0,1900)}]},himikoAutomatic:true};let code=200,body;const res={setHeader(){},status(c){code=c;return this},json(d){body=d;return this}};await chat(req,res);if(code!==200||!body?.replies?.length)throw Error('自動会話の生成を再試行します');return body;}
async function cron(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(process.env.HIMIKO_INBOX_ENABLED!=='1')return res.status(503).json({error:'Not configured'});
 let done=0;
 try{
  const now=Date.now(),ids=await redis('ZRANGEBYSCORE',DUE,0,now,'LIMIT',0,4);
  for(const id of ids){
   if(Date.now()-now>25000)break;
   try{
    const job=await locked(id,async s=>{
     if(!s){await redis('ZREM',DUE,id);return {}}
     if(!s.enabled)return {state:s};
     const t=Date.now();if(s.sentDay!==day(t)){s.sentDay=day(t);s.sent=0;}
     const score=s.scoreDay===day(t)?s.score:0;
     const pending=s.batches.flatMap(b=>b.replies).filter(r=>r.at<=t&&!r.notified);
     // Do not notify for messages that have already been read in the app.
     const notify=pending.filter(r=>!s.read.includes(r.key));
     if(notify.length&&s.subscription){
      const last=notify.at(-1);
      try{
       const push=require('web-push');
       push.setVapidDetails(process.env.HIMIKO_VAPID_SUBJECT,process.env.HIMIKO_VAPID_PUBLIC_KEY,process.env.HIMIKO_VAPID_PRIVATE_KEY);
       await push.sendNotification(s.subscription,JSON.stringify({title:last.name,body:last.text.slice(0,100),badge:unread(s,t),url:'/?himikoGroup=1',at:last.at}),{TTL:1800,timeout:8000});
      }catch(e){if([404,410].includes(e.statusCode))s.subscription=null;else{s.next=t+60000;return {state:s}}}
     }
     pending.forEach(r=>r.notified=true);
     const unfinished=s.batches.flatMap(b=>b.replies).filter(r=>r.at>t);
     if(unfinished.length){s.next=Math.min(...unfinished.map(r=>r.at));return {state:s}}
     if(s.generation?.until>t){s.next=s.generation.until;return {state:s}}
     if(s.conversationAt>t){s.next=s.conversationAt;return {state:s}}
     if(s.next>t)return {state:s};
     if(hour(t)<8||hour(t)>=22||s.activeUntil>t||s.sent>=cap(score)||s.batches.filter(b=>b.replies.some(r=>!s.read.includes(r.key))).length>=3){
      s.conversationAt=s.activeUntil>t?t+180000:nextTime(t,score);s.next=s.conversationAt;return {state:s};
     }
     // Reserve a generation; release the lock before the AI request so OFF,
     // reset, read acknowledgements and user participation remain responsive.
     const jobId=randomBytes(12).toString('hex');s.generation={id:jobId,until:t+120000};s.next=t+120000;
     return {state:s,value:{id:jobId,seed:JSON.parse(JSON.stringify(s))}};
    });
    if(!job)continue;
    let generated;
    try{generated=await generate(job.seed)}catch{
     await locked(id,async s=>{if(!s||s.generation?.id!==job.id)return {};s.generation=null;s.next=Date.now()+300000;s.conversationAt=s.next;return {state:s}});continue;
    }
    await locked(id,async s=>{
     if(!s||s.generation?.id!==job.id)return {};
     s.generation=null;const t=Date.now(),score=s.scoreDay===day(t)?s.score:0;
     if(!s.enabled||s.activeUntil>t||hour(t)<8||hour(t)>=22){s.next=nextTime(t,score);s.conversationAt=s.next;return {state:s}}
     const bid=randomBytes(12).toString('hex');
     s.batches.push({id:bid,createdAt:t,suggestions:generated.suggestions||[],suggestionKind:generated.suggestionKind||'questions',replies:generated.replies.map((r,i)=>({...r,name:chat.personaName(r.id),key:bid+':'+i,at:t+i*5000,notified:false}))});
     s.batches=s.batches.slice(-60);s.sent++;s.conversationAt=nextTime(t,score);s.next=t;done++;
     return {state:s};
    });
   }catch{await redis('ZADD',DUE,Date.now()+300000,id)}
  }
  return res.status(200).json({processed:done});
 }catch{return res.status(503).json({error:'Inbox unavailable'})}
}
module.exports={api,cron,day,hour,nextTime,cap,snapshot,unread,view,subscription};
