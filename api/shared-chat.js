'use strict';
// Isolated pilot API. Uses the end user's JWT; never uses a service-role key.
const ACTIONS=new Set(['list','create','join','sync','send','read','invite','revoke_invites','approve','remove','hide','leave','ai_toggle','subscribe']);
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const url=process.env.SHARED_CHAT_SUPABASE_URL;
 const key=process.env.SHARED_CHAT_SUPABASE_ANON_KEY;
 let publicKey=false;
 try{publicKey=key?.startsWith('sb_publishable_')||JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 if(!publicKey||process.env.SHARED_CHAT_ENABLED!=='1'||!url||!key)return res.status(503).json({error:'共有グルチャは準備中です。'});
 if(req.method==='GET')return res.status(200).json({url,key,stage:'shared-ai',aiAvailable:process.env.SHARED_CHAT_AI_ENABLED==='1',pushAvailable:!!(process.env.HIMIKO_VAPID_PUBLIC_KEY&&process.env.HIMIKO_VAPID_PRIVATE_KEY&&process.env.HIMIKO_VAPID_SUBJECT),vapidPublicKey:process.env.HIMIKO_VAPID_PUBLIC_KEY||''});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'POSTで送信してください。'});}
 if(req.headers.origin!==`https://${req.headers.host}` && !(process.env.NODE_ENV!=='production'&&req.headers.origin===`http://${req.headers.host}`))return res.status(403).json({error:'アプリから操作してください。'});
 const auth=req.headers.authorization;
 if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(auth))return res.status(401).json({error:'ログインしてください。'});
 try{
  const raw=req.body;
  if(Buffer.byteLength(typeof raw==='string'?raw:JSON.stringify(raw||{}))>12000)return res.status(413).json({error:'送信内容が大きすぎます。'});
  const b=typeof raw==='string'?JSON.parse(raw):raw;
  if(!b||!ACTIONS.has(b.action)||!b.payload||typeof b.payload!=='object'||Array.isArray(b.payload))return res.status(400).json({error:'送信内容を確認してください。'});
  // Fixed path and configured server origin: no user-supplied URL or RPC name.
  const upstream=await fetch(new URL('/rest/v1/rpc/shared_chat_rpc',url),{method:'POST',redirect:'error',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_action:b.action,p_payload:b.payload}),signal:AbortSignal.timeout(15000)});
  const data=await upstream.json();
  if(data?.error==='rate_limited'){res.setHeader('Retry-After','60');return res.status(429).json({error:'少し時間をおいてお試しください。'});}
  if(!upstream.ok||data?.error){
   if(data?.error)data.message=data.error;
   const status=upstream.status===401?401:data.code==='42501'?403:upstream.status>=500||String(data.code||'').startsWith('XX')?503:400;
   const errors={creator_permission_required:'グループ作成は管理者のみ利用できます。',invalid_invite:'招待リンクが無効か、有効期限を過ぎています。',owner_cannot_leave:'管理者は退出できません。',verified_login_required:'メール認証を完了してください。',shared_chat_disabled:'共有グルチャは停止中です。',room_limit:'作成できるグループ数の上限です。',member_limit:'参加できる人数の上限です。'};
   return res.status(status).json({error:errors[data.message]||(status===401?'ログインし直してください。':status===403?'このグループを操作する権限がありません。':'操作できませんでした。入力内容と参加状態を確認してください。')});
  }
  return res.status(200).json(data);
 }catch(e){if(e instanceof SyntaxError)return res.status(400).json({error:'送信形式を確認してください。'});return res.status(503).json({error:'接続できませんでした。しばらくしてからお試しください。'});}
};
