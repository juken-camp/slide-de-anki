import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM,VirtualConsole} from 'jsdom';
const require=createRequire(import.meta.url);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,20));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await pause()}assert.fail('Timed out waiting for DOM');}
function parentPage(){
 const errors=[],timers=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('himiko.html'),{url:'https://app.test/himiko.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});w.requestAnimationFrame=()=>1;
  w.setInterval=f=>{timers.push(f);return timers.length};w.fetch=async()=>({ok:true,json:async()=>[]});
 }});
 return {dom,w:dom.window,errors,timers};
}
test('Yoshida survives the sharing merge: one registration, correct order, avatar, profile and personal send/receive',async()=>{
 const p=parentPage(),w=p.w;
 try{
  await pause();const people=JSON.parse(w.eval('JSON.stringify(allHistoryChars)'));
  assert.equal(people.filter(x=>x.id===165).length,1);const yoshida=people.find(x=>x.id===165);
  assert.equal(yoshida.catchphrase,'8畳の教室で、明治の主役を育てた');assert.match(yoshida.period,/1830/);
  const records=new Map();w.readSavedChat=async id=>records.get(id)||null;w.writeSavedChat=async(id,value)=>records.set(id,structuredClone(value));
  w.localStorage.setItem('himiko-personal-presence-v1',JSON.stringify({people:{165:{onlineUntil:Date.now()+3600000,queue:[],unread:0}},seed:1}));
  w.eval(read('himiko-presence.js'));
  const card=()=>w.document.querySelector('[onclick="openChat(165)"]');
  assert(card());assert.equal(card().closest('.history-era-section').dataset.era,'edo');
  assert.match(card().querySelector('img').getAttribute('src'),/^history-icons\/165\.webp/);
  assert.equal(card().querySelector('.personal-preview-text').textContent,yoshida.catchphrase);
  assert.equal(w.getComputedStyle(card().querySelector('.personal-preview-text')).whiteSpace,'nowrap');
  w.setHistoryListMode('birth');assert.equal(card().closest('.history-era-section').dataset.era,'birth-19');
  const ordered=[...w.document.querySelectorAll('.char-card[onclick^="openChat("]')].map(el=>Number(el.getAttribute('onclick').match(/\d+/)[0]));
  assert(ordered.indexOf(165)>ordered.indexOf(14),'1830 must follow Tokugawa Ieyasu');
  assert(ordered.indexOf(165)<ordered.indexOf(19),'1830 must precede Ito Hirobumi');
  let clicks=0;w.document.addEventListener('click',()=>clicks++);
  assert.equal(w.himikoOpenHistoricalProfileById(165),true);assert.equal(clicks,0,'opening the profile uses no synthetic click');
  assert(w.document.getElementById('profile-modal').textContent.includes('吉田松陰'));
  assert.equal(w.himikoOpenHistoricalProfileById(9999),false);w.closeProfile();
  await w.openChat(165);assert.equal(w.document.getElementById('chat-name').textContent,'吉田松陰');
  let request,answer;w.startReveal=(_person,text)=>{answer=text};
  w.fetch=async(url,opt)=>{assert.equal(url,'/api/himiko-chat');request=JSON.parse(opt.body);return {ok:true,json:async()=>({reply:'松下村塾では、若者たちと日本の将来を話し合ったのです。',suggestions:[]})}};
  await w.sendMessage('松下村塾では何を教えたの？');
  const now=w.Date.now.bind(w.Date);w.Date.now=()=>now()+6000;p.timers.at(-1)();await until(()=>records.has(165));
  assert.equal(request.characterId,165);assert.equal(request.messages.at(-1).content,'松下村塾では何を教えたの？');
  await until(()=>!!answer);assert.match(answer,/松下村塾/);assert.equal(records.get(165).turns.at(-1).role,'assistant');
  assert.deepEqual(p.errors,[]);
 }finally{w.close()}
});
test('History202 keeps two-tap zoom, pinch/drag, scroll/explanation and the direct parent profile route',async()=>{
 const p=parentPage();await pause();const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('history202-chat.html'),{url:'https://app.test/history202-chat.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 try{
  Object.defineProperty(w,'parent',{value:p.w});w.requestAnimationFrame=()=>1;w.setInterval=()=>1;
  w.fetch=async url=>({ok:true,status:200,json:async()=>JSON.parse(read(String(url)))});
  const chapters=JSON.parse(read('history202/chapters.json'));assert.equal(chapters.chapters.length,31);assert.equal(chapters.chapters.reduce((n,c)=>n+c.entries.length,0),202);
  const local=JSON.parse(read('history202/local-images.json'));assert.equal(Object.keys(local).length,256);
  w.eval(read('history202/room.js'));await until(()=>!!w.document.querySelector('.h202-image-card'));
  const box=w.document.getElementById('group-messages'),button=w.document.querySelector('.h202-image-card'),image=button.querySelector('img');
  Object.defineProperties(image,{complete:{value:true},naturalWidth:{value:1200}});
  box.scrollTop=321;button.click();const explanation=w.document.getElementById('h202-explain-text').textContent;
  assert(explanation);assert.equal(w.document.getElementById('h202-photo-modal'),null);
  button.click();const modal=w.document.getElementById('h202-photo-modal');assert(modal);assert.equal(modal.parentElement,w.document.body);
  assert.equal(modal.querySelectorAll('button').length,1);assert.equal(modal.querySelector('.h202-photo-tools'),null);
  const css=w.document.getElementById('h202-image-zoom-v1').textContent;
  assert.match(css,/left:50%!important;top:50%!important/);assert.match(css,/translate\(-50%,-50%\) rotate\(45deg\)/);
  assert(button.textContent.indexOf('拡大')===-1,'no enlargement mark is added inside the image bubble');
  const stage=modal.querySelector('.h202-photo-stage'),large=modal.querySelector('img');
  Object.defineProperties(stage,{clientWidth:{value:300},clientHeight:{value:500}});Object.defineProperties(large,{offsetWidth:{value:280},offsetHeight:{value:400}});
  function pointer(type,id,x,y){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0});stage.dispatchEvent(e)}
  pointer('pointerdown',1,100,250);pointer('pointerdown',2,200,250);pointer('pointermove',2,280,250);
  assert.match(large.style.transform,/scale\(1\.8\)/);pointer('pointerup',2,280,250);const before=large.style.transform;
  pointer('pointermove',1,120,250);assert.notEqual(large.style.transform,before,'finger movement pans the enlarged image');pointer('pointerup',1,120,250);
  modal.querySelector('button').click();assert.equal(w.document.getElementById('h202-photo-modal'),null);assert.equal(box.scrollTop,321);assert.equal(w.document.getElementById('h202-explain-text').textContent,explanation);assert.equal(button.getAttribute('aria-pressed'),'true');
  const text=w.document.querySelector('.h202-bubble');text.click();assert.equal(text.getAttribute('aria-pressed'),'true');text.click();assert.equal(w.document.getElementById('h202-explain-text').textContent,'');
  const profile=w.document.querySelector('.h202-profile-button');assert(profile);let hostClicks=0;p.w.document.addEventListener('click',()=>hostClicks++);profile.click();assert.equal(hostClicks,0);assert(!p.w.document.getElementById('profile-modal').classList.contains('hidden'));
  assert.deepEqual(errors,[]);assert.deepEqual(p.errors,[]);
 }finally{w.close();p.w.close()}
});
test('Yoshida personal requests reach the existing server persona without changing other identities',async()=>{
 const chat=require('../api/himiko-chat.js'),env={...process.env},fetch=global.fetch;
 try{
  process.env.ANTHROPIC_API_KEY='test-only';for(const k of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','HIMIKO_REQUIRE_SHARED_RATE_LIMIT'])delete process.env[k];
  let captured;global.fetch=async(url,opt)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');captured=JSON.parse(opt.body);return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify({reply:'松下村塾について話しましょう。',suggestions:[]})}],stop_reason:'end_turn'})}};
  let status,body;await chat({method:'POST',headers:{host:'app.test',origin:'https://app.test','content-type':'application/json'},socket:{remoteAddress:'yoshida-regression'},body:{characterId:165,messages:[{role:'user',content:'松下村塾はどんな学校？'}]}},{setHeader(){},status(v){status=v;return this},json(v){body=v}});
  assert.equal(status,200);assert.equal(chat.personaName(165),'吉田松陰');assert.equal(chat.personaName(1),'卑弥呼');assert(captured.system.includes('吉田松陰'));assert(body.content[0].text.includes('松下村塾'));
 }finally{process.env=env;global.fetch=fetch}
});
