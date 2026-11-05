'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const handler=require('../api/shared-chat');
const anon=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'signature'].join('.');
const token='aaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbb.ccc';
function env(){process.env.SHARED_CHAT_ENABLED='1';process.env.SHARED_CHAT_SUPABASE_URL='https://pilot.supabase.co';process.env.SHARED_CHAT_SUPABASE_ANON_KEY=anon;process.env.NODE_ENV='production';}
function req(extra={}){return {method:'POST',headers:{origin:'https://app.example',host:'app.example',authorization:'Bearer '+token},body:{action:'list',payload:{}},...extra};}
async function call(r){let status;let data;const headers={};await handler(r,{setHeader(k,v){headers[k]=v;},status(s){status=s;return this;},json(d){data=d;return this;}});return {status,data,headers};}
test('API boundary checks',async t=>{
 const originalFetch=global.fetch;
 try{
  await t.test('disabled by default',async()=>{env();delete process.env.SHARED_CHAT_ENABLED;assert.equal((await call(req())).status,503);});
  await t.test('public config exposes only anon key and capability flags',async()=>{env();const r=await call(req({method:'GET'}));assert.equal(r.data.key,anon);assert.equal(r.data.aiAvailable,false);assert.equal(r.headers['Cache-Control'],'no-store');});
  await t.test('refuses service-role key even in misnamed env variable',async()=>{env();process.env.SHARED_CHAT_SUPABASE_ANON_KEY='x.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.x';assert.equal((await call(req({method:'GET'}))).status,503);});
  await t.test('cross-origin POST denied',async()=>{env();assert.equal((await call(req({headers:{origin:'https://evil.example',host:'app.example',authorization:'Bearer '+token}}))).status,403);});
  await t.test('missing JWT denied',async()=>{env();assert.equal((await call(req({headers:{origin:'https://app.example',host:'app.example'}}))).status,401);});
  await t.test('wrong method denied',async()=>{env();assert.equal((await call(req({method:'DELETE'}))).status,405);});
  await t.test('unknown action denied before network',async()=>{env();global.fetch=()=>{throw Error('should not fetch');};assert.equal((await call(req({body:{action:'generate_ai',payload:{}}}))).status,400);});
  await t.test('oversized request denied',async()=>{env();assert.equal((await call(req({body:{action:'send',payload:{text:'a'.repeat(13000)}}}))).status,413);});
  await t.test('invalid JSON denied',async()=>{env();assert.equal((await call(req({body:'{'}))).status,400);});
  await t.test('RPC uses caller token and fixed URL',async()=>{env();global.fetch=async(url,opts)=>{assert.equal(String(url),'https://pilot.supabase.co/rest/v1/rpc/shared_chat_rpc');assert.equal(opts.headers.Authorization,'Bearer '+token);assert.equal(opts.headers.apikey,anon);assert.deepEqual(JSON.parse(opts.body),{p_action:'list',p_payload:{}});return {ok:true,json:async()=>({rooms:[]})};};assert.deepEqual((await call(req())).data,{rooms:[]});});
  await t.test('permission errors retain 403 even returned as RPC JSON',async()=>{env();global.fetch=async()=>({ok:true,json:async()=>({error:'room_unavailable',code:'42501'})});assert.equal((await call(req())).status,403);});
  await t.test('rate limit returns 429 with retry header',async()=>{env();global.fetch=async()=>({ok:true,json:async()=>({error:'rate_limited'})});const r=await call(req());assert.equal(r.status,429);assert.equal(r.headers['Retry-After'],'60');});
  await t.test('database details never exposed',async()=>{env();global.fetch=async()=>({ok:false,status:500,json:async()=>({code:'XX000',message:'secret database details'})});const r=await call(req());assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('secret'));});
  await t.test('network failure fails closed',async()=>{env();global.fetch=async()=>{throw Error('private connection details');};assert.equal((await call(req())).status,503);});
 }finally{global.fetch=originalFetch;}
});
