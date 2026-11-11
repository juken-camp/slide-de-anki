import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const html=readFileSync(new URL('../himiko.html',import.meta.url),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const source=readFileSync(new URL('../shared-chat/integrated.js',import.meta.url),'utf8');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',R='00000000-0000-4000-8000-000000000003';
const snapshot={room:{id:R,name:'異次元グルチャ',owner:true,ai_enabled:false},self_id:A,last_read_seq:1,server_time:new Date().toISOString(),members:[{user_id:A,name:'自分',status:'active'},{user_id:B,name:'<img src=x onerror=alert(1)>',status:'active'}],messages:[{seq:1,user_id:B,kind:'human',name:'友人',text:'こんにちは <img src=x>',sent_at:new Date().toISOString(),read_count:1}]};
function page(enabled=true){const dom=new JSDOM(html,{url:'https://app.test/himiko.html',runScripts:'outside-only'}),w=dom.window;
 const ticks=[];w.setInterval=f=>{ticks.push(f);return ticks.length};w.clearInterval=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
 w.showGroupMembers=()=>{w.document.getElementById('group-members').hidden=false;};w.toggleGroupParticipants=()=>{};w.renameGroupChat=()=>{};
 const $=id=>w.document.getElementById(id);w.openGroupChat=()=>{$('group-view').hidden=false};let activations=0,sends=0,oldSubmits=0;
 w.himikoSharedHost={activate(){w.himikoSharedActive=true;activations++},deactivate(){w.himikoSharedActive=false},people(){return [{id:1},{id:2}]},date(){return ''},clock(){return '12:00'},typing(){return '<div id="group-typing"></div>'},quote(){return null},clearQuote(){},
 rowHuman(m,self){const div=w.document.createElement('div');div.className='bubble-row '+(self?'user':'assistant');const b=w.document.createElement('div');b.className='bubble';b.textContent=m.text;div.append(b);const t=w.document.createElement('span');t.className='history-message-time';div.append(t);return div.outerHTML},rowAI(m){return this.rowHuman(m,false)}};
 $('group-form').addEventListener('submit',e=>{oldSubmits++;e.preventDefault()});
 w.localStorage.setItem('nekopon-shared-chat-session-v1',JSON.stringify({accessToken:'a'.repeat(30),refreshToken:'refresh',tokenExpiresAt:Date.now()+3600000}));w.localStorage.setItem('himiko-shared-room-v1',R);
 w.localStorage.setItem('jc-image-quiz-v1','STUDY_SENTINEL');w.localStorage.setItem('himiko-group-v1','LOCAL_CHAT_SENTINEL');
 w.fetch=async(url,opts={})=>{let data;if(url==='/api/shared-chat'&&!opts.method)data={integratedAvailable:enabled,url:'https://test.supabase.co',key:'sb_publishable_test',aiAvailable:true};else if(url==='/api/shared-chat'){
  const request=JSON.parse(opts.body);if(request.action==='sync')data=structuredClone(snapshot);else if(request.action==='list')data={rooms:[{id:R,name:'部屋',status:'active',owner:true}]};else if(request.action==='send'){sends++;data={seq:2};}else data={ok:true};
 }else data={};return {ok:true,status:200,json:async()=>data};};
 w.eval(source);return {w,$,ticks,get activations(){return activations},get sends(){return sends},get oldSubmits(){return oldSubmits}};
}
const settle=()=>new Promise(r=>setTimeout(r,30));
const p=page();await settle();assert.equal(p.activations,1);assert.equal(p.$('group-view').hidden,false);assert.ok(p.$('group-messages-inner').textContent.includes('こんにちは <img src=x>'));assert.equal(p.$('group-messages-inner').querySelectorAll('img').length,0);
assert.match(p.$('group-messages-inner').textContent,/既読 1/);assert.equal(p.$('group-count').textContent,'(4)');
p.w.showGroupMembers();assert.ok(p.$('group-member-list').textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(p.$('group-member-list').querySelectorAll('[data-shared-people] img').length,0);
await p.w.himikoShared.manage();assert.ok(p.w.document.querySelector('dialog').open);assert.ok(p.w.document.querySelector('dialog').textContent.includes('招待リンクを作る'));
p.$('group-input').value='質問';p.$('group-form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(p.sends,1);assert.equal(p.oldSubmits,0);assert.equal(p.$('group-input').value,'');
assert.equal(p.w.localStorage.getItem('jc-image-quiz-v1'),'STUDY_SENTINEL');assert.equal(p.w.localStorage.getItem('himiko-group-v1'),'LOCAL_CHAT_SENTINEL');
const off=page(false);await settle();assert.equal(off.activations,0);assert.equal(off.$('group-share'),null);assert.equal(off.w.document.querySelector('dialog'),null);
p.w.close();off.w.close();console.log('PASS integrated UI: saved login and room restore, same chat surface, human messages, safe names, real read counts, management, capture shared sends, study/local storage preserved, prelaunch gate. DOM tests; no real email or browser layout.');
