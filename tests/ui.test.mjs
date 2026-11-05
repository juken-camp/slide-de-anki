import {JSDOM} from 'jsdom';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
process.on('uncaughtException',e=>{console.error(e.message);process.exit(1)});
const require=createRequire(import.meta.url);const handler=require('../api/shared-chat.js');
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
await db.exec(readFileSync(new URL('../shared-chat/001_shared_chat.sql',import.meta.url),'utf8'));
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
await db.query(`insert into auth.users values ($1,'a@example.test',now(),false),($2,'b@example.test',now(),false)`,[A,B]);await db.query('insert into shared_chat_private.creators values($1)',[A]);await db.exec('update shared_chat_private.settings set enabled=true');
process.env.SHARED_CHAT_ENABLED='1';process.env.SHARED_CHAT_SUPABASE_URL='https://pilot.supabase.co';process.env.SHARED_CHAT_SUPABASE_ANON_KEY='sb_publishable_test';process.env.NODE_ENV='test';
let tail=Promise.resolve();
global.fetch=async(url,opts)=>{let release;const previous=tail;tail=new Promise(r=>release=r);await previous;try{const uid=opts.headers.Authorization.slice(7).split('.')[1];await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[uid]);await db.exec('set role authenticated');const b=JSON.parse(opts.body);const d=(await db.query('select public.shared_chat_rpc($1,$2::jsonb) result',[b.p_action,JSON.stringify(b.p_payload)])).rows[0].result;return {ok:true,status:200,json:async()=>d};}finally{release();}};
function page(user,fragment=''){
 const dom=new JSDOM(readFileSync(new URL('../shared-chat.html',import.meta.url),'utf8'),{url:'http://localhost/shared-chat.html'+fragment,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;let poll;
 w.confirm=()=>true;w.setInterval=fn=>{poll=fn;return 1;};
 w.fetch=async(url,opts={})=>{
  if(String(url).includes('/auth/v1/'))return {ok:true,json:async()=>String(url).endsWith('/verify')?{access_token:'aaa.'+user+'.bbbbbbbbbbbbbbbbbbbbbbbb'}:{}};
  let status,data;await handler({method:opts.method||'GET',headers:{origin:'http://localhost',host:'localhost',authorization:opts.headers?.Authorization},body:opts.body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}});return {ok:status<300,status,json:async()=>data};
 };
 w.eval(readFileSync(new URL('../shared-chat/pilot.js',import.meta.url),'utf8'));
 return {w,$:id=>w.document.getElementById(id),tick:()=>poll()};
}
const sleep=()=>new Promise(r=>setTimeout(r,15));async function ready(p){for(let i=0;i<200;i++){await sleep();if(!p.$('otp').disabled)return;}throw Error('UI timeout '+p.$('status').textContent);}
async function click(p,id){p.$(id).click();await ready(p);}
async function login(p,email){await sleep();p.$('email').value=email;await click(p,'otp');p.$('code').value='123456';await click(p,'verify');assert.equal(p.$('lobby').hidden,false,p.$('status').textContent);}
function button(p,text){return [...p.w.document.querySelectorAll('button')].find(b=>b.textContent===text);}
const owner=page(A);await login(owner,'a@example.test');owner.$('room-name').value='家族テスト';owner.$('owner-name').value='管理者';await click(owner,'create');assert.equal(owner.$('chat').hidden,false,owner.$('status').textContent);await click(owner,'invite');const url=owner.$('invite-link').value;assert.ok(url.includes('#invite='));
const member=page(B,new URL(url).hash);await login(member,'b@example.test');member.$('nickname').value='生徒';await click(member,'join');assert.ok(member.$('rooms').textContent.includes('承認待ち'));assert.equal(member.$('rooms').querySelector('button').disabled,true);
owner.tick();await ready(owner);assert.ok(owner.$('members').textContent.includes('生徒'));button(owner,'承認').click();await ready(owner);
await click(member,'refresh');const roomButton=member.$('rooms').querySelector('button');assert.equal(roomButton.disabled,false);roomButton.click();await ready(member);assert.equal(member.$('chat').hidden,false,member.$('status').textContent);
const content='<img src=x onerror="alert(1)"> こんにちは';member.$('text').value=content;await click(member,'send');assert.ok(member.$('messages').textContent.includes(content));assert.equal(member.$('messages').querySelectorAll('img').length,0);
owner.tick();await ready(owner);assert.ok(owner.$('messages').textContent.includes(content));button(owner,'削除').click();await ready(owner);member.tick();await ready(member);assert.ok(member.$('messages').textContent.includes('管理者が削除しました'));
button(owner,'退出処理').click();await ready(owner);member.tick();await ready(member);assert.equal(member.$('chat').hidden,true);assert.equal(member.$('messages').textContent,'');
await click(owner,'back');await click(owner,'logout');assert.equal(owner.$('login').hidden,false);assert.equal(owner.$('messages').textContent,'');
owner.w.close();member.w.close();await db.close();console.log('PASS: 2-account DOM flow, approval, pending buttons, shared post, HTML escaping, deletion propagation, removal, logout. Auth/email/network are mocked; this is not a real-browser test.');
