/* Shared rooms rendered by the original Himiko bubble and background code. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),SESSION='nekopon-shared-chat-session-v1',ROOM='himiko-shared-room-v1';
 let config,session=null,view=null,room='',refreshing=null,syncing=false,waking=false,generation=0,signature='',pollTimer;
 let pendingSend=null,entryUnread=null,otpEmail='',otpAt=0,invite=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 if(!/^[a-f0-9]{64}$/.test(invite))invite='';
 if(invite){try{sessionStorage.setItem('himiko-pending-invite',invite);}catch{}history.replaceState(null,'',location.pathname+location.search);}
 try{invite||=sessionStorage.getItem('himiko-pending-invite')||'';session=JSON.parse(localStorage.getItem(SESSION)||'null');room=localStorage.getItem(ROOM)||'';}catch{}
 const requestedRoom=new URLSearchParams(location.search).get('shared_room');if(/^[a-f0-9-]{36}$/i.test(requestedRoom||''))room=requestedRoom;
 function store(s){session={accessToken:s.access_token,refreshToken:s.refresh_token,tokenExpiresAt:s.expires_at*1000||Date.now()+(s.expires_in||3600)*1000};if(!session.refreshToken)throw Error('ログインできませんでした。');localStorage.setItem(SESSION,JSON.stringify(session));}
 async function jsonFetch(url,options){const r=await fetch(url,{...options,cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error?.message||d.error||d.msg||'接続できませんでした。');e.status=r.status;throw e;}return d;}
 async function token(force=false){
  if(!session?.refreshToken)throw Error('メール認証でログインしてください。');
  if(!force&&session.accessToken&&Date.now()<session.tokenExpiresAt-90000)return session.accessToken;
  if(refreshing)return refreshing;
  const used=session.refreshToken;
  refreshing=(async()=>{
   try{const d=await jsonFetch(config.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:used})});
    if(session?.refreshToken===used)store(d);return session?.accessToken;
   }catch(e){if([400,401,403].includes(e.status)&&session?.refreshToken===used){session=null;localStorage.removeItem(SESSION);}throw e;}
  })();try{return await refreshing;}finally{refreshing=null;}
 }
 async function rpc(action,payload={}){
  const post=async()=>jsonFetch('/api/shared-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await token()},body:JSON.stringify({action,payload})});
  try{return await post();}catch(e){if(e.status!==401||!session?.refreshToken)throw e;await token(true);return post();}
 }
 const host=()=>window.himikoSharedHost;
 let dialog;
 function status(t){const el=$('shared-status');if(el)el.textContent=t;}
 async function run(fn){try{await fn();}catch(e){status(e.message);}}
 function button(label,fn,parent){const b=document.createElement('button');b.type='button';b.className='char-card shared-action';b.textContent=label;b.onclick=()=>run(fn);parent.append(b);return b;}
 function field(id,label,type='text',max=200,parent=dialog){const l=document.createElement('label');l.className='shared-field';l.textContent=label;const i=document.createElement('input');i.id=id;i.type=type;i.maxLength=max;i.autocomplete=type==='email'?'email':'off';l.append(i);parent.append(l);return i;}
 function section(label){const details=document.createElement('details');details.className='shared-section';const summary=document.createElement('summary');summary.className='char-card';summary.textContent=label;details.append(summary);dialog.append(details);return details;}
 function openDialog(){
  if(!dialog){
   const style=document.createElement('style');style.textContent=`
    .shared-dialog{position:fixed;inset:auto 0 0;box-sizing:border-box;width:100%;max-width:700px;max-height:calc(100dvh - 18px);margin:0 auto;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border:0;border-radius:24px 24px 0 0;padding:20px 20px calc(26px + env(safe-area-inset-bottom,0px));font-family:inherit;background:#fff8f0;color:#60412f;box-shadow:0 -14px 34px rgba(0,0,0,.16)}
    .shared-dialog::backdrop{background:rgba(0,0,0,.45)}
    .shared-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
    .shared-dialog-header h2{font-size:16px;font-weight:900;line-height:1.4;margin:0;outline:none}
    .shared-dialog .modal-handle{width:40px;height:4px;background:#e2e8f0;border-radius:4px;margin:0 auto 18px}
    .shared-dialog .shared-close{display:grid;place-items:center;flex:none;width:42px;height:42px;min-width:42px;min-height:42px;padding:0;border:0;border-radius:12px;background:#f1f5f9;color:#64748b;font-family:inherit;font-size:24px;font-weight:800;line-height:1;cursor:pointer}
    .shared-dialog .shared-action{display:block;min-height:48px;margin:9px 0;padding:12px 15px;color:inherit;font-family:inherit;font-size:14px;font-weight:700;line-height:1.5;white-space:normal;overflow-wrap:anywhere;animation:none}
    .shared-dialog .shared-action:disabled{opacity:.5;cursor:default}
    .shared-dialog .shared-field{display:block;margin:14px 0;font-size:14px;font-weight:700;line-height:1.5}
    .shared-dialog .shared-field input{display:block;box-sizing:border-box;width:100%;min-width:0;margin-top:8px;border:1px solid #d8b894;border-radius:13px;padding:11px 12px;background:#fffdf8;color:#60412f;font-family:inherit;font-size:16px;font-weight:400;line-height:1.5}
    .shared-dialog h3{margin:20px 0 10px;font-size:14px;line-height:1.5}
    .shared-dialog .shared-room-name{margin:0 0 12px;font-size:13px;line-height:1.5;opacity:.75}
    .shared-dialog .shared-section{margin:9px 0}
    .shared-dialog .shared-section summary{display:flex;align-items:center;justify-content:space-between;gap:10px;box-sizing:border-box;min-height:48px;padding:12px 15px;color:inherit;font-size:14px;font-weight:700;line-height:1.5;list-style:none;animation:none}
    .shared-dialog .shared-section summary::-webkit-details-marker{display:none}
    .shared-dialog .shared-section summary::after{content:'＋';flex:none;font-size:18px;line-height:1}
    .shared-dialog .shared-section[open] summary::after{content:'−'}
    .shared-dialog .shared-section>p{margin:16px 0 6px;font-size:13px;font-weight:700}
    .shared-dialog #shared-status{white-space:pre-wrap;font-size:13px;line-height:1.6}
    .shared-dialog #shared-status:empty{display:none}
    html[data-persona="cyber"] .shared-dialog{background:#111b35;color:#dceaff;box-shadow:0 -14px 34px rgba(0,0,0,.30)}
    html[data-persona="cyber"] .shared-dialog .modal-handle{background:#4e7994}
    html[data-persona="cyber"] .shared-dialog .shared-close{background:#162743;color:#c6eaff;border:1px solid #365f7d}
    html[data-persona="cyber"] .shared-dialog .shared-field input{background:#0a1127;border-color:#315576;color:#e0eaff}
    #group-members #group-share{display:block;max-width:700px;min-height:48px;margin:0 auto 12px;color:inherit;font-family:inherit;font-size:14px;font-weight:700;line-height:1.5;animation:none}
   `;document.head.append(style);
   dialog=document.createElement('dialog');dialog.className='shared-dialog';dialog.setAttribute('aria-label','グルチャへの招待・参加');document.body.append(dialog);
  }
  dialog.replaceChildren();const handle=document.createElement('div');handle.className='modal-handle';handle.setAttribute('aria-hidden','true');dialog.append(handle);const header=document.createElement('div');header.className='shared-dialog-header';const title=document.createElement('h2');title.tabIndex=-1;title.textContent='みんなで異次元グルチャ';header.append(title);const close=document.createElement('button');close.type='button';close.className='modal-close shared-close';close.textContent='×';close.setAttribute('aria-label','閉じる');close.setAttribute('title','閉じる');close.onclick=()=>dialog.close();header.append(close);dialog.append(header);const s=document.createElement('p');s.id='shared-status';s.role='status';dialog.append(s);if(!dialog.open){dialog.showModal();title.focus({preventScroll:true});}
 }
 async function manage(){
  if(!config?.integratedAvailable)return;
  openDialog();
  if(!session?.refreshToken){
   const mail=field('shared-email','メールアドレス','email');
   button('認証コードを送る',async()=>{if(!mail.checkValidity()||!mail.value.trim())throw Error('メールアドレスを確認してください。');if(Date.now()-otpAt<60000)throw Error('再送は1分お待ちください。');await jsonFetch(config.url+'/auth/v1/otp',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:mail.value.trim(),create_user:true})});otpEmail=mail.value.trim();otpAt=Date.now();status('メールの認証コードを入力してください。');},dialog);
   const code=field('shared-code','認証コード','text',12);code.inputMode='numeric';code.autocomplete='one-time-code';
   button('ログイン',async()=>{if(!otpEmail)throw Error('先にコードを送ってください。');const d=await jsonFetch(config.url+'/auth/v1/verify',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:otpEmail,token:code.value.trim(),type:'email'})});store(d);await manage();},dialog);return;
  }
  await token();const d=await rpc('list');
  const rooms=d.rooms||[],hasOwner=rooms.some(r=>r.owner),inRoom=!!(view&&room);
  if(inRoom){
   const heading=document.createElement('p');heading.className='shared-room-name';heading.textContent=view.room.name;dialog.append(heading);
   if(view.room.owner){
    const linkResult=document.createElement('div');
    button('招待リンクを作る',async()=>{const d=await rpc('invite',{room_id:room});linkResult.replaceChildren();const i=field('shared-invite-link','招待リンク','text',500,linkResult);i.readOnly=true;i.value=location.origin+location.pathname+'#invite='+d.token;button('リンクをコピー',()=>navigator.clipboard.writeText(i.value).then(()=>status('コピーしました。')),linkResult);},dialog);
    dialog.append(linkResult);
   }
   const pending=(view.members||[]).filter(m=>m.status==='pending').length;
   const settings=section(pending?'参加者と設定（承認待ち '+pending+'人）':'参加者と設定');
   if(view.room.owner){
    button('グルチャの名前を変更',async()=>{const n=prompt('グルチャの名前（30文字まで）',view.room.name);if(n===null)return;await rpc('rename',{room_id:room,name:n.trim()});await sync();await manage();},settings);
    button('招待リンクを無効にする',async()=>{await rpc('revoke_invites',{room_id:room});status('以前の招待リンクを無効にしました。');},settings);
    button(view.room.ai_enabled?'偉人の自動会話を止める':'偉人の自動会話を始める',async()=>{await rpc('ai_toggle',{room_id:room,enabled:!view.room.ai_enabled});await sync();void wake();await manage();},settings);
    for(const m of view.members||[]){if(m.user_id===view.self_id||m.status==='removed')continue;const row=document.createElement('p');row.textContent=m.name+(m.status==='pending'?'（承認待ち）':'');settings.append(row);button(m.status==='pending'?'承認':'退出してもらう',async()=>{await rpc(m.status==='pending'?'approve':'remove',{room_id:room,user_id:m.user_id});await sync();await manage();},settings);}
   }else button('このグルチャから退出',async()=>{if(!confirm('このグルチャから退出しますか？'))return;await rpc('leave',{room_id:room});local();await manage();},settings);
   button('以前の会話を読む',async()=>{const id=room;const older=await rpc('sync',{room_id:id,before_seq:view.messages[0]?.seq||0});if(room!==id)return;view.messages=[...new Map([...older.messages,...view.messages].map(m=>[m.seq,m])).values()].sort((a,b)=>a.seq-b.seq).slice(-500);signature='';paint();dialog.close();$('group-messages').scrollTop=0;},settings);
   if(config.pushAvailable&&'serviceWorker' in navigator&&'PushManager' in window)button(view.notifications_enabled?'通知を止める':'新しい発言を通知する',async()=>{
    if(view.notifications_enabled){await rpc('subscribe',{room_id:room,subscription:null});await sync();await manage();return;}
    if(await Notification.requestPermission()!=='granted')throw Error('通知の許可が必要です。');
    const registration=await navigator.serviceWorker.register('/shared-chat/notify-sw.js',{scope:'/shared-chat/'});await new Promise((resolve,reject)=>{if(registration.active)return resolve();const worker=registration.installing||registration.waiting;if(!worker)return reject(Error('通知を準備できません。'));worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();if(worker.state==='redundant')reject(Error('通知を準備できません。'));});});
    const raw=atob(config.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await rpc('subscribe',{room_id:room,subscription:subscription.toJSON()});await sync();await manage();
   },settings);
  }
  const roomArea=inRoom?section('部屋を切り替える'):dialog;
  let nick=null;
  if(invite||!hasOwner){nick=field('shared-nickname','グルチャで使う名前','text',24,roomArea);nick.value=localStorage.getItem('himiko-shared-name-v1')||'受験生';}
  function name(){const n=nick?.value.trim()||'';if(!n)throw Error('名前を入力してください。');localStorage.setItem('himiko-shared-name-v1',n);return n;}
  if(invite)button('このグルチャへ参加申請',async()=>{await rpc('join',{token:invite,nickname:name()});invite='';sessionStorage.removeItem('himiko-pending-invite');await manage();status('参加申請しました。管理者の承認をお待ちください。');},roomArea);
  if(!hasOwner)button('自分の共有グルチャを作る',async()=>{const r=await rpc('create',{name:'異次元グルチャ',nickname:name()});if(config.aiAvailable)await rpc('ai_toggle',{room_id:r.room_id,enabled:true});await enter(r.room_id);await manage();},roomArea);
  for(const r of rooms){const b=button(r.name+(r.status==='pending'?'（承認待ち）':''),()=>enter(r.id),roomArea);b.disabled=r.status!=='active';}
  if(inRoom)button('自分だけのグルチャに戻る',()=>{local();dialog.close();},roomArea);
  const account=section('アカウント');
  button('一覧を更新',manage,account);
  button('ログアウト',async()=>{const access=await token();await jsonFetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+access}});session=null;localStorage.removeItem(SESSION);local();await manage();},account);
 }
 function local(){generation++;room='';view=null;signature='';pendingSend=null;$('group-input').value='';host().clearQuote();localStorage.removeItem(ROOM);host().deactivate();}
 async function enter(id){
  const current=++generation;const data=await rpc('sync',{room_id:id});if(current!==generation)return;
  if(room!==id){$('group-input').value='';host().clearQuote();}room=id;view=data;signature='';entryUnread=data.messages.find(m=>m.seq>data.last_read_seq&&m.user_id!==data.self_id)?.seq||null;pendingSend=null;localStorage.setItem(ROOM,id);host().activate();window.openGroupChat();paint();const divider=$('group-unread-divider');if(divider?.scrollIntoView)divider.scrollIntoView({block:'center'});else $('group-messages').scrollTop=$('group-messages').scrollHeight;dialog?.close();void wake();
 }
 function paint(){
  if(view){const label=document.querySelector('#list-view .group-caption-text');if(label)label.textContent=view.messages.at(-1)?.text||'家族や友達と一緒のグルチャ';const badge=$('group-unread');if(badge){const n=Number(view.unread_count)||0;badge.textContent=n?String(n):'';badge.hidden=!n;}const dots=$('group-entry-typing');if(dots){const wait=Date.parse(view.typing?.at)-Date.parse(view.server_time);dots.hidden=!(wait>0&&wait<=15000);}}
  if(!view||!window.himikoSharedActive||$('group-view').hidden)return;
  const box=$('group-messages-inner'),scroller=$('group-messages');const follow=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<120,top=scroller.scrollTop;
  const sig=JSON.stringify([view.messages,view.members]);
  if(sig!==signature){
   let previous=null;const rows=[];
   for(const m of view.messages||[]){const at=Date.parse(m.sent_at);rows.push(host().date(at,previous));previous=at;if(m.seq===entryUnread)rows.push('<div id="group-unread-divider" role="separator" aria-label="ここから未読メッセージ">ここから未読メッセージ</div>');
    let html=m.hidden?`<div class="group-system-event"><span>管理者が発言を削除しました</span></div>`:m.kind==='system'?`<div class="group-system-event"><span><time>${esc(host().clock(at))}</time><span class="group-event-label">${esc(m.text)}</span></span></div>`:m.kind==='ai'?host().rowAI(m):host().rowHuman(m,m.user_id===view.self_id);
    const t=document.createElement('template');t.innerHTML=html;const row=t.content.querySelector('.bubble-row');if(row){row.dataset.sharedSeq=m.seq;row.dataset.sharedUser=m.user_id||'';const bubble=row.querySelector('.bubble');if(bubble)bubble.id='shared-message-'+room+'-'+m.seq;const time=row.querySelector('.history-message-time');if(time)time.innerHTML=(m.user_id===view.self_id&&Number(m.read_count)>0?'既読 '+Number(m.read_count)+'<br>':'')+esc(host().clock(at));}
    rows.push(t.innerHTML);
   }
   box.innerHTML=rows.join('');signature=sig;host().refreshSearch?.();if(follow)scroller.scrollTop=scroller.scrollHeight;else scroller.scrollTop=top;
  }
  $('group-title').textContent=view.room.name;
  const count=host().people().length+(view.members||[]).filter(m=>m.status==='active').length;
  $('group-settings-name').textContent=view.room.name;const listTitle=document.querySelector('#list-view .group-chat-title');if(listTitle)listTitle.textContent=view.room.name+' ('+count+')';
  $('group-count').textContent='('+count+')';$('group-member-heading').textContent='('+count+')';
  const next=view.typing,wait=Date.parse(next?.at)-Date.parse(view.server_time);const old=$('group-typing');
  if(next&&wait>0&&wait<=15000){if(!old)box.insertAdjacentHTML('beforeend',host().typing());}else old?.remove();
  $('group-send').disabled=!!pendingSend||!$('group-input').value.trim();$('group-reset').disabled=true;
  if(!$('group-members').hidden)paintMembers();
 }
 function paintMembers(){
  const target=$('group-member-list');const oldSection=target.querySelector('[data-shared-people]');const originalSelf=target.querySelector('[data-self]');const ownAvatar=(originalSelf||oldSection?.querySelector('[data-shared-self]'))?.querySelector('.avatar')?.cloneNode(true);const section=document.createElement('div');section.dataset.sharedPeople='1';section.style.cssText='display:contents';
  for(const m of view?.members||[]){if(m.status!=='active')continue;const row=document.createElement('div');row.className='char-card member-card';row.innerHTML=`<span class="card-inner"><span class="avatar self-avatar">👤</span><span class="card-info"><span class="member-name">${esc(m.name)}${m.user_id===view.self_id?'（あなた）':''}</span></span></span>`;if(m.user_id===view.self_id){row.dataset.sharedSelf='1';if(ownAvatar)row.querySelector('.avatar')?.replaceWith(ownAvatar);}section.append(row);}
  if(originalSelf)originalSelf.replaceWith(section);else if(oldSection)oldSection.replaceWith(section);else target.append(section);
  const headings=target.querySelectorAll('.membership-section-title');if(headings.length)headings[headings.length-1].textContent='👋 '+(host().people().length+(view.members||[]).filter(m=>m.status==='active').length)+'人が参加中です';
 }
 async function sync(){
  if(!room||!session||syncing||document.hidden)return;syncing=true;const id=room,current=generation;
  try{const history=view?.messages||[];const d=await rpc('sync',{room_id:id,...(history.length>100?{from_seq:history[0].seq}:{})});if(id!==room||current!==generation)return;view=d;paint();
   const scroll=$('group-messages');if(!$('group-view').hidden&&scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<80){const seq=d.messages.at(-1)?.seq||0;if(seq>d.last_read_seq)await rpc('read',{room_id:id,seq});}
  }catch(e){if(id===room&&[401,403].includes(e.status)){local();status('参加状態を確認するため、招待・参加を開いてください。');}else if(id===room){$('group-status').textContent=e.message;$('group-status').hidden=false;}}finally{syncing=false;}
 }
 async function wake(){if(waking||!room||!view?.room.ai_enabled||document.hidden)return;waking=true;const id=room;
  try{await jsonFetch('/api/shared-chat-live',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await token()},body:JSON.stringify({room_id:id})});}
  catch(e){if(id===room){$('group-status').textContent=e.message;$('group-status').hidden=false;}}finally{waking=false;}
 }
 async function send(){
  if(pendingSend)return;const input=$('group-input'),text=input.value.trim();if(!text)return;
  const id=room,current=generation;const q=host().quote();const body=q?`「${q.name}：${q.text}」\n${text}`:text;
  const storage='himiko-shared-pending-'+id;
  let saved;try{saved=JSON.parse(sessionStorage.getItem(storage)||'null');}catch{}
  pendingSend=saved?.text===body?saved:{client_id:crypto.randomUUID(),text:body};sessionStorage.setItem(storage,JSON.stringify(pendingSend));paint();
  try{await rpc('send',{room_id:id,...pendingSend});sessionStorage.removeItem(storage);if(id!==room||current!==generation)return;input.value='';host().clearQuote();$('group-status').hidden=true;await sync();void wake();}
  catch(e){if(id===room){$('group-status').textContent=e.message+' 入力は残しています。再送できます。';$('group-status').hidden=false;}}finally{pendingSend=null;paint();}
 }
 window.himikoShared={manage,paint,paintMembers,sync,enter};
 document.addEventListener('submit',e=>{if(e.target.id==='group-form'&&window.himikoSharedActive){e.preventDefault();e.stopImmediatePropagation();void send();}},true);
 document.addEventListener('input',e=>{if(e.target.id==='group-input'&&window.himikoSharedActive)queueMicrotask(paint);});
 const oldMembers=window.showGroupMembers;window.showGroupMembers=()=>{oldMembers();if(window.himikoSharedActive)paintMembers();};
 const oldStrip=window.toggleGroupParticipants;window.toggleGroupParticipants=()=>{oldStrip();if(!window.himikoSharedActive||$('group-participant-strip').hidden)return;for(const m of view?.members||[]){if(m.status!=='active'||m.user_id===view.self_id)continue;const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',m.name);b.innerHTML='<span class="avatar self-avatar">👤</span>';b.onclick=()=>void manage();$('group-participant-icons').append(b);}};
 const oldRename=window.renameGroupChat;window.renameGroupChat=()=>{if(window.himikoSharedActive){void manage();return;}oldRename();};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void sync();void wake();}});
 window.addEventListener('storage',e=>{if(e.key===SESSION){try{session=JSON.parse(e.newValue||'null');}catch{}if(!session&&window.himikoSharedActive)local();}});
 async function init(){
  try{config=await jsonFetch('/api/shared-chat');if(!config.integratedAvailable)return;
   const entry=document.querySelector('[data-shared-entry]')||document.querySelector('.shared-chat-join-entry');if(entry){entry.onclick=e=>{e.preventDefault();void manage();};entry.removeAttribute('target');entry.setAttribute('aria-label','家族・友達を招待');const title=entry.querySelector('.char-name,.shared-entry-title');if(title)title.textContent='家族・友達を招待';}
   const manageButton=$('group-members-direct').cloneNode(true);manageButton.id='group-share';manageButton.className='char-card';manageButton.style.cssText='display:block;max-width:700px;min-height:48px;margin:0 auto 12px;color:inherit;font-family:inherit;font-size:14px;font-weight:700;line-height:1.5;animation:none';manageButton.textContent='家族・友達を招待';manageButton.setAttribute('aria-label','グルチャに招待・参加');manageButton.onclick=()=>void manage();
   // Add the new control inside the existing member panel, never in the chat header.
   $('group-member-list').parentElement.insertBefore(manageButton,$('group-member-list'));
   // Always open the original personal chat first; a shared room is entered explicitly.
   // The room and its messages remain on the server and are accessible from the menu.
   if(room){local();}
   if(invite){await manage();}
   else if(/^[a-f0-9-]{36}$/i.test(requestedRoom||'')&&session?.refreshToken){try{await enter(requestedRoom);}catch(e){status(e.message);}}
   let polls=0;pollTimer=setInterval(()=>{polls++;if(window.himikoSharedActive&&(!$('group-view').hidden||polls%10===0))void sync();},1000);setInterval(()=>{if(window.himikoSharedActive)void wake();},20000);
  }catch(e){/* Local chat continues when sharing is unavailable. */}
 }
 void init();
})();
