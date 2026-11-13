'use strict';
const {createPublicKey,verify}=require('node:crypto');
const tick=require('./shared-chat-tick');
const AUD='nekopon-shared-chat-scheduler';
const WORKFLOW='juken-camp/slide-de-anki/.github/workflows/shared_chat_scheduler.yml@refs/heads/main';
const JWKS='https://token.actions.githubusercontent.com/.well-known/jwks';
async function verifyToken(value,fetcher=fetch,now=Math.floor(Date.now()/1000)){
 if(typeof value!=='string'||value.length>16384||!value.startsWith('Bearer '))return false;
 const parts=value.slice(7).split('.');if(parts.length!==3||parts.some(x=>!x||!/^[A-Za-z0-9_-]+$/.test(x)))return false;
 try{
  const h=JSON.parse(Buffer.from(parts[0],'base64url'));const p=JSON.parse(Buffer.from(parts[1],'base64url'));
  if(h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>200)return false;
  if(p.iss!=='https://token.actions.githubusercontent.com'||p.aud!==AUD||p.repository_id!=='1421787329'||p.repository!=='juken-camp/slide-de-anki'||p.workflow_ref!==WORKFLOW||p.ref!=='refs/heads/main'||!['schedule','workflow_dispatch','push'].includes(p.event_name)||!Number.isInteger(p.exp)||!Number.isInteger(p.iat)||p.exp<=now||p.iat>now+30||p.iat<now-900||p.exp>p.iat+1200||!Number.isInteger(p.nbf)||p.nbf>now+30)return false;
  const response=await fetcher(JWKS,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)return false;
  const data=await response.json();if(!Array.isArray(data.keys))return false;
  const key=data.keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');if(!key)return false;
  return verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'));
 }catch(_){return false;}
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!await verifyToken(req.headers.authorization))return res.status(401).json({error:'Unauthorized'});
 const secret=process.env.SHARED_CHAT_CRON_SECRET||process.env.CRON_SECRET;
 if(typeof secret!=='string'||secret.length<24)return res.status(503).json({error:'Scheduler unavailable'});
 return tick({...req,headers:{...req.headers,authorization:'Bearer '+secret}},res);
}
module.exports=handler;module.exports.verifyToken=verifyToken;
