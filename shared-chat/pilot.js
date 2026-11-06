'use strict';
(()=>{
 try { document.documentElement.dataset.persona = localStorage.getItem('nekopon-character-theme-v1') === 'cyber' ? 'cyber' : 'neko'; } catch (_) { document.documentElement.dataset.persona = 'neko'; }
 const $=id=>document.getElementById(id);
 // The pilot sign-in remains available while the UI is labeled as prelaunch.
 let config,accessToken='',refreshToken='',tokenExpiresAt=0,refreshInFlight=null,roomId='',view=null,before=null,running=false,otpAt=0,loginEmail='',requestId=null;
 // Avoid repainting messages, members and the lobby on every background refresh.
 let lastRoomsSignature='', lastMembersSignature='', lastMessageRoomId='', renderedMessageKeys=[];
 // Keep the login until the user explicitly logs out (Supabase token rotation).
 // This is scoped to this origin / browser profile, not a server-side permanent login.
 const SESSION_KEY='nekopon-shared-chat-session-v1';
 function getSavedSession(){
  try{
   const d=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
   if(d&&typeof d.refreshToken==='string'&&d.refreshToken.length>10)return d;
  }catch(_){}return null;
 }
 function rememberSession(d){
  if(!d||typeof d.access_token!=='string'||typeof d.refresh_token!=='string'||!d.access_token||!d.refresh_token)throw Error('ログイン情報を保存できませんでした。もう一度ログインしてください。');
  accessToken=d.access_token;
  refreshToken=d.refresh_token;
  tokenExpiresAt=Number(d.expires_at)>0?Number(d.expires_at)*1000:Date.now()+Math.max(60,Number(d.expires_in)||3600)*1000;
  try{localStorage.setItem(SESSION_KEY,JSON.stringify({accessToken,refreshToken,tokenExpiresAt}));return true;}catch(_){return false;}
 }
 async function renewToken(force=false){
  if(!refreshToken)return false;
  if(refreshInFlight)return refreshInFlight;
  if(!force&&accessToken&&Date.now()<tokenExpiresAt-90000)return true;
  const usedToken=refreshToken;
  refreshInFlight=(async()=>{
   let r;
   try{
    r=await fetch(config.url+'/auth/v1/token?grant_type=refresh_token',{
     method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},
     body:JSON.stringify({refresh_token:usedToken}),cache:'no-store'
    });
   }catch(_){throw Error('通信できずログインを更新できません。接続を確認してください。');}
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
    // Only authentication failures invalidate the saved session. Temporary
    // server errors must not force the user to sign in again.
    if([400,401,403].includes(r.status)){
     if(refreshToken!==usedToken)return true; // another tab rotated it
     clearSession();
     throw Error('ログインの有効期限が切れました。もう一度認証コードでログインしてください。');
    }
    throw Error('サーバーに接続できずログインを更新できません。あとで再試行してください。');
   }
   if(refreshToken!==usedToken)return true;
   rememberSession(d);
   return true;
  })();
  try{return await refreshInFlight;}finally{refreshInFlight=null;}
 }
 async function restoreSavedSession(){
  const saved=getSavedSession();if(!saved||!config)return;
  refreshToken=saved.refreshToken;
  accessToken=typeof saved.accessToken==='string'?saved.accessToken:'';
  tokenExpiresAt=Number(saved.tokenExpiresAt)||0;
  try{
   await renewToken();
   $('login').hidden=true;$('lobby').hidden=false;
   $('join-panel').hidden=!inviteToken;
   status('');
   await list();
  }catch(e){
   // If the server is temporarily offline, preserve the saved login and show
   // the lobby/retry control instead of forcing an OTP flow.
   if(refreshToken){$('login').hidden=true;$('lobby').hidden=false;$('join-panel').hidden=!inviteToken;}
   status(e.message);
  }
 }
 let inviteToken=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
 history.replaceState(null,'',location.pathname+location.search);
 if(!/^[a-f0-9]{64}$/.test(inviteToken))inviteToken='';
 const setText=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
 const setHidden=(id,hidden)=>{const el=$(id);if(el.hidden!==Boolean(hidden))el.hidden=Boolean(hidden);};
 const status=message=>{setText('status',message);setText('chat-status',message);};
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function rpc(action,payload={}){
  if(!config)throw Error('共有グルチャに接続できません。');
  if(refreshToken)await renewToken();
  const post=()=>fetch('/api/shared-chat',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},
   body:JSON.stringify({action,payload}),cache:'no-store'
  });
  let r=await post();
  if(r.status===401&&refreshToken){await renewToken(true);r=await post();}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
   if(r.status===401){clearSession();throw Error('ログインの更新が必要です。認証コードでログインしてください。');}
   const error=new Error(d.error||'接続できませんでした。');error.httpStatus=r.status;throw error;
  }return d;
 }
 async function auth(path,payload){
  const r=await fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json',...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error('認証できませんでした。メールアドレスとコードをご確認ください。');return d;
 }
 function clearSession(){
  try{localStorage.removeItem(SESSION_KEY);}catch(_){}
  setChatVisible(false);accessToken='';refreshToken='';tokenExpiresAt=0;roomId='';view=null;before=null;
  $('text').value='';$('message-flow').replaceChildren();renderedMessageKeys=[];lastMessageRoomId='';lastMembersSignature='';lastRoomsSignature='';
  $('members').replaceChildren();$('rooms').replaceChildren();$('notification-control').hidden=true;
  $('invite-link').value='';$('lobby').hidden=true;$('chat').hidden=true;$('login').hidden=false;
 }
 async function run(fn){
  // The old implementation disabled EVERY button on each request. Since the
  // room polls frequently, that caused the whole UI to visibly flash.
  if(running)return;running=true;
  try{await fn();}catch(e){status(e.message);}finally{running=false;}
 }
 async function list(){
  const d=await rpc('list');
  const signature=JSON.stringify(d.rooms.map(r=>[r.id,r.name,r.status,r.unread]));
  if(signature===lastRoomsSignature)return; // keep existing DOM and scroll/focus
  lastRoomsSignature=signature;
  $('rooms').replaceChildren();
  for(const r of d.rooms){
   const button=node('button',undefined,'room-entry');button.type='button';
   button.disabled=r.status==='pending';button.dataset.pending=r.status==='pending'?'1':'';
   const icon=node('span','🌀','room-entry-icon');icon.setAttribute('aria-hidden','true');
   const info=node('span',undefined,'room-entry-text');
   info.append(node('span',r.name,'room-entry-name'),node('span',r.status==='pending'?'管理者の承認待ち':'タップして会話を開く','room-entry-desc'));
   const trailing=node('span',undefined,'room-entry-trailing');
   if(r.unread&&r.status!=='pending')trailing.append(node('span',r.unread>99?'99+':String(r.unread),'room-unread'));
   trailing.append(node('span',r.status==='pending'?'…':'›','room-entry-chevron'));
   button.append(icon,info,trailing);
   button.onclick=()=>run(async()=>{roomId=r.id;before=null;$('lobby').hidden=true;setChatVisible(true);status('');await sync(true);});
   $('rooms').append(button);
  }
  if(!d.rooms.length)$('rooms').append(node('p','まだ参加中のグループはありません。招待リンクから参加するか、新しい部屋を作れます。','room-empty'));
 }
 function roomAction(action,extra={}){return rpc(action,{room_id:roomId,...extra});}
 async function sync(first=false){
  const id=roomId;if(!id)return;
  let d;try{d=await roomAction('sync',before?{before_seq:before}:{});}catch(e){
    // A temporary 429/5xx/network failure must NEVER kick everyone out of
    // the room or blink the whole screen during its 5s polling cycle.
    if(id===roomId && [403,404].includes(e.httpStatus)){roomId='';setChatVisible(false);$('lobby').hidden=false;$('message-flow').replaceChildren();renderedMessageKeys=[];lastMessageRoomId='';lastMembersSignature='';$('members').replaceChildren();$('invite-link').value='';}
    throw e;
  }
  if(roomId!==id)return;
  view=d;setText('title',d.room.name);setHidden('admin',!d.room.owner);setHidden('leave',d.room.owner);
  const aiOn=d.room.ai_enabled===true;
  setText('ai-notice',aiOn?'歴史人物がこの部屋でも会話中です。AIの発言は創作です。':'歴史人物の自動会話は停止中です。');
  setHidden('ai-control',!config?.aiAvailable);
  setText('ai-toggle',aiOn?'歴史人物の自動会話を停止':'歴史人物の自動会話を開始');
  setHidden('notification-control',!config?.pushAvailable);
  setText('push-toggle',d.notifications_enabled?'このグループの通知をOFF':'このグループの通知をON');
  const box=$('messages'),flow=$('message-flow');
  const atBottom=first||box.scrollHeight-box.scrollTop-box.clientHeight<80,oldTop=box.scrollTop;
  // Keep stable nodes while other members read/reply. Only new messages should
  // appear; metadata used for server reads must not recreate all bubbles.
  if(lastMessageRoomId!==roomId){
    lastMessageRoomId=roomId;renderedMessageKeys=[];flow.replaceChildren();
  }
  const keys=d.messages.map(m=>JSON.stringify([m.seq,m.user_id,m.name,m.kind,m.speaker_id,m.text,m.sent_at,m.hidden,d.self_id,d.room.owner]));
  const unchanged=keys.length===renderedMessageKeys.length && keys.every((v,i)=>v===renderedMessageKeys[i]);
  const append=keys.length>=renderedMessageKeys.length && renderedMessageKeys.every((v,i)=>keys[i]===v);
  if(!unchanged){
    if(!append)flow.replaceChildren();
    for(const m of d.messages.slice(append?renderedMessageKeys.length:0)){
      const own=m.user_id===d.self_id;
      const wrap=node('article',undefined,'message'+(own?' own':''));
      if(m.kind==='ai')wrap.classList.add('ai');
      if(!own){
       if(m.kind==='ai'&&Number.isInteger(m.speaker_id)){
        const avatar=node('img');avatar.className='message-avatar';avatar.alt='';avatar.loading='lazy';
        avatar.src='history-icons/'+String(m.speaker_id).padStart(3,'0')+'.webp';
        avatar.onerror=()=>{avatar.replaceWith(node('span','🕰️','message-avatar human-avatar'));};wrap.append(avatar);
       }else{
        const avatar=node('span',Array.from(m.name||'？')[0]||'？','message-avatar human-avatar');
        avatar.setAttribute('aria-hidden','true');wrap.append(avatar);
       }
      }
      const main=node('div',undefined,'message-main');
      const time=new Date(m.sent_at).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'});
      const meta=node('div',m.name+' · '+time,'meta');
      if(d.room.owner&&!m.hidden){const b=node('button','削除','message-delete');b.type='button';b.setAttribute('aria-label',m.name+'の投稿を削除');b.onclick=()=>run(async()=>{if(!confirm('この投稿を削除しますか？'))return;await roomAction('hide',{seq:m.seq});await sync();});meta.append(b);}
      main.append(meta,node('div',m.hidden?'管理者が削除しました':m.text,'body'));wrap.append(main);flow.append(wrap);
    }
    renderedMessageKeys=keys;
    if(atBottom)box.scrollTop=box.scrollHeight;
    else if(!append)box.scrollTop=oldTop;
  }
  $('older').disabled=!d.messages.length||d.messages[0].seq<=1;
  const membersSignature=JSON.stringify([d.room.owner,d.self_id,d.members]);
  if(membersSignature!==lastMembersSignature){
   lastMembersSignature=membersSignature;
   $('members').replaceChildren();for(const m of d.members){const line=node('div',m.name+(m.status==='pending'?'（承認待ち）':m.status==='removed'?'（退出済み）':''),'person');if(d.room.owner&&m.user_id!==d.self_id&&m.status!=='removed'){for(const [action,label] of (m.status==='pending'?[['approve','承認'],['remove','却下']]:[['remove','退出処理']])){const b=node('button',label,'subtle');b.onclick=()=>run(async()=>{if(action==='remove'&&!confirm('この参加者を退出扱いにしますか？'))return;await roomAction(action,{user_id:m.user_id});await sync();});line.append(b);}}$('members').append(line);}
  }
  await markRead();
 }
 async function markRead(){if(!view||document.hidden||$('chat').hidden)return;const box=$('messages');if(box.scrollHeight-box.scrollTop-box.clientHeight>80)return;const last=view.messages.at(-1)?.seq||0;if(last>view.last_read_seq){await roomAction('read',{seq:last});view.last_read_seq=last;}}
 $('otp').onclick=()=>run(async()=>{if(!config)throw Error('共有グルチャは準備中です。');const email=$('email').value.trim();if(!$('email').checkValidity()||!email)throw Error('メールアドレスを入力してください。');if(Date.now()-otpAt<60000)throw Error('コードの再送は1分お待ちください。');await auth('otp',{email,create_user:true});otpAt=Date.now();loginEmail=email;status('メールに届いたコードを入力してください。');});
 $('verify').onclick=()=>run(async()=>{if(!config||!loginEmail)throw Error('先に認証コードを送ってください。');const d=await auth('verify',{email:loginEmail,token:$('code').value.trim(),type:'email'});if(!d.access_token)throw Error('ログインできませんでした。');const stored=rememberSession(d);$('code').value='';$('login').hidden=true;$('lobby').hidden=false;$('join-panel').hidden=!inviteToken;status(stored?'ログインしました。次回からは自動でログインします。':'ログインしました。このブラウザではログイン情報を保存できないため、次回は認証が必要です。');await list();});
 $('logout').onclick=()=>run(async()=>{try{if(accessToken)await auth('logout',{});}finally{clearSession();status('ログアウトしました。');}});
 $('refresh').onclick=()=>run(list);
 $('create').onclick=()=>run(async()=>{const d=await rpc('create',{name:$('room-name').value,nickname:$('owner-name').value});roomId=d.room_id;before=null;$('lobby').hidden=true;setChatVisible(true);await sync(true);status('グループを作成しました。参加者・管理から招待できます。');});
 $('join').onclick=()=>run(async()=>{await rpc('join',{token:inviteToken,nickname:$('nickname').value});inviteToken='';$('join-panel').hidden=true;status('参加を申請しました。管理者の承認をお待ちください。');await list();});
 $('back').onclick=()=>run(async()=>{roomId='';view=null;$('message-flow').replaceChildren();renderedMessageKeys=[];lastMessageRoomId='';lastMembersSignature='';$('members').replaceChildren();$('invite-link').value='';setChatVisible(false);$('lobby').hidden=false;await list();});
 $('send').onclick=()=>run(async()=>{const text=$('text').value.trim();if(!text)throw Error('メッセージを入力してください。');requestId||={id:crypto.randomUUID(),text};if(requestId.text!==text)requestId={id:crypto.randomUUID(),text};await roomAction('send',{text,client_id:requestId.id});requestId=null;$('text').value='';$('send').disabled=true;before=null;await sync(true);status('');});
 $('invite').onclick=()=>run(async()=>{const d=await roomAction('invite');$('invite-link').value=location.origin+'/shared-chat.html#invite='+d.token;status('招待リンクを発行しました。');});
 $('copy').onclick=()=>run(async()=>{if(!$('invite-link').value)throw Error('先にリンクを発行してください。');await navigator.clipboard.writeText($('invite-link').value);status('コピーしました。');});
 $('revoke').onclick=()=>run(async()=>{await roomAction('revoke_invites');$('invite-link').value='';status('招待リンクを無効にしました。');});

 $('ai-toggle').onclick=()=>run(async()=>{
  if(!config?.aiAvailable||!view?.room.owner)throw Error('管理者だけが設定できます。');
  const enabled=!view.room.ai_enabled;
  if(enabled&&!confirm('歴史人物の自動会話を開始しますか？ Claude APIの利用料金が発生します。'))return;
  if(!enabled&&!confirm('自動会話を停止し、まだ表示していないAI発言を取り消しますか？'))return;
  await roomAction('ai_toggle',{enabled});await sync();status(enabled?'自動会話を開始しました。':'自動会話を停止しました。');
 });
 function toU8(base64){const raw=atob(base64.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,x=>x.charCodeAt(0));}
 $('push-toggle').onclick=()=>run(async()=>{
  if(!view||!config?.pushAvailable)throw Error('通知を設定できません。');
  if(view.notifications_enabled){await roomAction('subscribe',{subscription:null});await sync();status('この部屋の通知を停止しました。');return;}
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('このブラウザーはプッシュ通知に対応していません。');
  if(Notification.permission==='denied')throw Error('ブラウザーの設定から通知を許可してください。');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw Error('通知が許可されませんでした。');
  const worker=await navigator.serviceWorker.register('/shared-chat/notify-sw.js',{scope:'/shared-chat/'});
  const subscription=await worker.pushManager.getSubscription()||await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toU8(config.vapidPublicKey)});
  await roomAction('subscribe',{subscription:subscription.toJSON()});await sync();status('この部屋の通知をONにしました。');
 });
 $('leave').onclick=()=>run(async()=>{if(!confirm('退出すると会話を読めなくなります。退出しますか？'))return;await roomAction('leave');roomId='';view=null;$('message-flow').replaceChildren();renderedMessageKeys=[];lastMessageRoomId='';lastMembersSignature='';$('members').replaceChildren();setChatVisible(false);$('lobby').hidden=false;await list();status('退出しました。');});
 $('older').onclick=()=>run(async()=>{if(view?.messages.length){before=view.messages[0].seq;await sync(true);}});
 $('latest').onclick=()=>run(async()=>{before=null;await sync(true);});
 $('messages').addEventListener('scroll',()=>{if(!running&&accessToken&&roomId)run(markRead);});
 // Background refresh must not disable controls, replace unchanged nodes,
 // or alter keyboard focus while someone is reading or composing a message.
 let quietPollRunning=false,lastQuietPollError='';
 async function quietPoll(){
  if(quietPollRunning||running||!refreshToken||document.hidden)return;
  quietPollRunning=true;
  try{
   await (roomId?sync():list());
   if(lastQuietPollError&&$('chat-status').textContent===lastQuietPollError)status('');
   lastQuietPollError='';
  }catch(e){lastQuietPollError=e.message||'更新できませんでした。';status(lastQuietPollError);}
  finally{quietPollRunning=false;}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void quietPoll();});
 window.addEventListener('online',()=>{void quietPoll();});
 window.addEventListener('storage',e=>{
  if(e.key!==SESSION_KEY)return;
  if(!e.newValue){if(accessToken||refreshToken){clearSession();status('別のタブでログアウトされました。');}return;}
  const d=getSavedSession();if(!d)return;
  // Supabase refresh tokens rotate. Keep parallel tabs in sync.
  accessToken=typeof d.accessToken==='string'?d.accessToken:'';
  refreshToken=d.refreshToken;tokenExpiresAt=Number(d.tokenExpiresAt)||0;
 });
 setInterval(()=>{if(accessToken)void quietPoll();},5000);
 // Like the existing Himiko group view, the header and composer are fixed
 // siblings of the *only* scrolling area (#messages). Do not allow the lobby
 // document to continue scrolling behind the room: iOS otherwise scrolls the
 // entire page to reveal the keyboard and moves the chat out of the viewport.
 let savedLobbyScroll=0;
 function setChatVisible(open){
  const chat=$('chat');
  const locked=document.documentElement.hasAttribute('data-shared-chat-open');
  if(open){
   if(!locked){
    savedLobbyScroll=window.scrollY||document.documentElement.scrollTop||0;
    document.documentElement.setAttribute('data-shared-chat-open','');
   }
   chat.hidden=false;
   updateChatViewport();
  }else{
   chat.hidden=true;
   chat.classList.remove('keyboard-visible');
   if(locked){
    document.documentElement.removeAttribute('data-shared-chat-open');
    window.scrollTo(0,savedLobbyScroll);
   }
  }
 }
 // During iOS keyboard animation, the visual viewport is shorter than the
 // layout viewport. Measure this once per frame rather than on every event,
 // preventing repeated top/height writes that visibly jiggle the header.
 let pendingViewportFrame=0;
 function updateChatViewport(){
  if($('chat').hidden)return;
  const vv=window.visualViewport;
  const chat=$('chat');
  const height=Math.max(1,Math.round(vv?.height||window.innerHeight));
  const top=Math.max(0,Math.round(vv?.offsetTop||0));
  const heightValue=height+'px',topValue=top+'px';
  if(chat.style.getPropertyValue('--chat-viewport-height')!==heightValue)chat.style.setProperty('--chat-viewport-height',heightValue);
  if(chat.style.getPropertyValue('--chat-viewport-top')!==topValue)chat.style.setProperty('--chat-viewport-top',topValue);
  chat.classList.toggle('keyboard-visible',document.activeElement===$('text')&&window.innerHeight-height>120);
 }
 function scheduleChatViewport(){
  if(pendingViewportFrame)return;
  pendingViewportFrame=requestAnimationFrame(()=>{pendingViewportFrame=0;updateChatViewport();});
 }
 if(window.visualViewport){
  visualViewport.addEventListener('resize',scheduleChatViewport,{passive:true});
  visualViewport.addEventListener('scroll',scheduleChatViewport,{passive:true});
 }
 window.addEventListener('resize',scheduleChatViewport,{passive:true});
 $('text').addEventListener('focus',scheduleChatViewport);
 $('text').addEventListener('blur',scheduleChatViewport);
 // Prevent dragging fixed headers / composer from dragging the whole page.
 // Preserve native kinetic scrolling within messages and the management menu.
 $('chat').addEventListener('touchmove',e=>{
  if(e.touches.length!==1||!document.documentElement.hasAttribute('data-shared-chat-open'))return;
  // Let WebKit own the finger drag, momentum and rubber-band inside the
  // message scroller (as in the existing solo Himiko group chat). In
  // particular, never preventDefault at the top/bottom boundary.
  const scroller=e.target.closest('#messages,.manage-pane,textarea');
  if(!scroller)e.preventDefault(); // still lock header/composer/backdrop
 },{passive:false});
 $('text').addEventListener('input',()=>{const el=$('text');el.style.height='44px';el.style.height=Math.min(el.scrollHeight,118)+'px';$('send').disabled=!el.value.trim();});
 $('text').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('send').click();}});
 $('return-app').addEventListener('click',e=>{if(history.length>1){e.preventDefault();history.back();}});
 fetch('/api/shared-chat',{cache:'no-store'}).then(async r=>{
  const d=await r.json();if(!r.ok)throw Error(d.error);
  config=d;
  status(inviteToken?'招待リンクを受け取りました。ログイン後、参加を申請してください。':'');
  await restoreSavedSession();
 }).catch(e=>status(e.message||'共有グルチャは準備中です。'));
})();
