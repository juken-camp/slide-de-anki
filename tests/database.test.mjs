process.on('uncaughtException',e=>{console.error(e.message,e.code||'',e.detail||'');process.exit(1)});
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
await db.exec(readFileSync(new URL('../shared-chat/001_shared_chat.sql',import.meta.url),'utf8'));
await db.exec('update shared_chat_private.settings set enabled=true');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',D='00000000-0000-4000-8000-000000000004';
await db.query(`insert into auth.users values ($1,'owner@example.test',now(),false),($2,'member@example.test',now(),false),($3,'outsider@example.test',now(),false),($4,'unverified@example.test',null,false)`,[A,B,C,D]);
await db.query('insert into shared_chat_private.creators values ($1)',[A]);
let checks=0;
async function rpc(uid,action,payload={}){
 await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[uid]);await db.exec('set role authenticated');
 const d=(await db.query(`select public.shared_chat_rpc($1,$2::jsonb) result`,[action,JSON.stringify(payload)])).rows[0].result;
 checks++;return d;
}
async function denied(uid,action,payload,expected='42501'){
 const d=await rpc(uid,action,payload);assert.equal(d.code,expected,JSON.stringify(d));
}
await denied(B,'create',{name:'勝手な部屋',nickname:'人'});
const room=(await rpc(A,'create',{name:'家族テスト',nickname:'管理者'})).room_id;assert.ok(room);
await denied(C,'sync',{room_id:room});
await denied(C,'send',{room_id:room,client_id:crypto.randomUUID(),text:'侵入'});
const inv=await rpc(A,'invite',{room_id:room});assert.equal(inv.token.length,64);
assert.equal((await rpc(B,'join',{token:inv.token,nickname:'生徒'})).status,'pending');
assert.equal((await rpc(B,'list')).rooms[0].status,'pending');
await denied(B,'sync',{room_id:room});
await denied(B,'approve',{room_id:room,user_id:B});
assert.equal((await rpc(A,'approve',{room_id:room,user_id:B})).ok,true);
await denied(B,'invite',{room_id:room});
const cid=crypto.randomUUID();const seq=(await rpc(B,'send',{room_id:room,client_id:cid,text:'こんにちは',user_id:A,sent_at:'1990-01-01'})).seq;assert.equal(seq,1);
assert.equal((await rpc(B,'send',{room_id:room,client_id:cid,text:'こんにちは'})).seq,1);
const ownerView=await rpc(A,'sync',{room_id:room});const studentView=await rpc(B,'sync',{room_id:room});
assert.deepEqual(ownerView.messages,studentView.messages);assert.equal(ownerView.messages[0].user_id,B);
assert.equal((await rpc(A,'list')).rooms[0].unread,1);
assert.equal((await rpc(B,'list')).rooms[0].unread,0);
await rpc(A,'read',{room_id:room,seq:1});assert.equal((await rpc(A,'list')).rooms[0].unread,0);
await denied(B,'hide',{room_id:room,seq:1});await rpc(A,'hide',{room_id:room,seq:1});assert.equal((await rpc(B,'sync',{room_id:room})).messages[0].text,'');
await rpc(A,'remove',{room_id:room,user_id:B});await denied(B,'sync',{room_id:room});await denied(B,'send',{room_id:room,client_id:crypto.randomUUID(),text:'退出後'});
await denied(B,'join',{token:inv.token,nickname:'再侵入'});
await rpc(A,'revoke_invites',{room_id:room});assert.equal((await rpc(C,'join',{token:inv.token,nickname:'他人'})).error,'invalid_invite');
await db.exec('reset role');await db.query(`update shared_chat_private.invites set revoked=false,expires_at=now()-interval '1 second' where room_id=$1`,[room]);
assert.equal((await rpc(C,'join',{token:inv.token,nickname:'他人'})).error,'invalid_invite');
for(let i=0;i<10;i++)await rpc(C,'join',{token:'0'.repeat(64),nickname:'他人'});
assert.equal((await rpc(C,'join',{token:'0'.repeat(64),nickname:'他人'})).error,'rate_limited');
// Unverified account and missing login must never enter the RPC.
await assert.rejects(()=>rpc(D,'list'),/verified_login_required/);
await assert.rejects(()=>rpc('','list'),/verified_login_required/);
await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[A]);await db.exec('set role authenticated');
await assert.rejects(()=>db.query('select * from shared_chat_private.messages'),/permission denied/);checks++;
await db.exec('set role anon');await assert.rejects(()=>db.query(`select public.shared_chat_rpc('list','{}')`),/permission denied/);checks++;
await db.exec('reset role');
// Pagination must neither skip nor duplicate messages; same timestamp is allowed, seq is the authority.
await db.query('delete from shared_chat_private.limits');
for(let i=0;i<105;i++){
 await db.exec('reset role');await db.query('delete from shared_chat_private.limits');
 const r=await rpc(A,'send',{room_id:room,client_id:crypto.randomUUID(),text:'発言 '+i});assert.equal(r.seq,i+2);
}
const last=await rpc(A,'sync',{room_id:room});assert.equal(last.messages.length,100);assert.equal(last.messages[0].seq,7);
const old=await rpc(A,'sync',{room_id:room,before_seq:7});assert.equal(old.messages.length,6);assert.equal(old.messages.at(-1).seq,6);
const delta=await rpc(A,'sync',{room_id:room,after_seq:100});assert.deepEqual(delta.messages.map(m=>m.seq),[101,102,103,104,105,106]);
await denied(A,'read',{room_id:room,seq:999},'22023');
await db.exec('reset role');await db.exec('update shared_chat_private.settings set enabled=false');
await assert.rejects(()=>rpc(A,'list'),/shared_chat_disabled/);
console.log(JSON.stringify({databaseChecks:checks,result:'PASS',runtime:'PGlite PostgreSQL; Supabase auth schema stubbed'}));await db.close();
