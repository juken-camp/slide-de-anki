'use strict';
(()=>{
 try { document.documentElement.dataset.persona = localStorage.getItem('nekopon-character-theme-v1') === 'cyber' ? 'cyber' : 'neko'; } catch (_) { document.documentElement.dataset.persona = 'neko'; }
 const $=id=>document.getElementById(id);
 let config,accessToken='',roomId='',view=null,before=null,running=false,otpAt=0,loginEmail='',requestId=null;
 let inviteToken=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
 history.replaceState(null,'',location.pathname+location.search);
 if(!/^[a-f0-9]{64}$/.test(inviteToken))inviteToken='';
 const status=message=>{ $('status').textContent=message; $('chat-status').textContent=message; };
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function rpc(action,payload={}){
  const r=await
 fetch('/api/shared-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify({action,payload}),cache:'no-store'});
  const d=await r.json();if(!r.ok){if(r.status===401)clearSession();throw Error(d.error||'接続できませんでした。');}return d;
 }
 async function auth(path,payload){
  const r=await fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json',...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error('認証できませんでした。メールアドレスとコードをご確認ください。');return d;
 }
 function clearSession(){accessToken='';roomId='';view=null;before=null;$('text').value='';$('messages').replaceChildren();$('messages').dataset.fingerprint='';$('members').replaceChildren();$('rooms').replaceChildren();$('notification-control').hidden=true;$('invite-link').value='';$('lobby').hidden=true;$('chat').hidden=true;$('login').hidden=false;}
 async function run(fn){if(running)return;running=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message);}finally{running=false;document.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.pending==='1');if(view)$('older').disabled=!view.messages.length||view.messages[0].seq<=1;}}
 async function list(){
  const d=await rpc('list');$('rooms').replaceChildren();
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
   button.onclick=()=>run(async()=>{roomId=r.id;before=null;$('lobby').hidden=true;$('chat').hidden=false;status('');await sync(true);});
   $('rooms').append(button);
  }
  if(!d.rooms.length)$('rooms').append(node('p','まだ参加中のグループはありません。招待リンクから参加するか、新しい部屋を作れます。','room-empty'));
 }
 function roomAction(action,extra={}){return rpc(action,{room_id:roomId,...extra});}
 async function sync(first=false){
  const id=roomId;if(!id)return;
  let d;try{d=await roomAction('sync',before?{before_seq:before}:{});}catch(e){if(id===roomId){roomId='';$('chat').hidden=true;$('lobby').hidden=false;$('messages').replaceChildren();$('members').replaceChildren();$('invite-link').value='';}throw e;}
  if(roomId!==id)return;
  view=d;$('title').textContent=d.room.name;$('admin').hidden=!d.room.owner;$('leave').hidden=d.room.owner;
  const aiOn=d.room.ai_enabled===true;
  $('ai-notice').textContent=aiOn?'歴史人物がこの部屋でも会話中です。AIの発言は創作です。':'歴史人物の自動会話は停止中です。';
  $('ai-control').hidden=!config?.aiAvailable;
  $('ai-toggle').textContent=aiOn?'歴史人物の自動会話を停止':'歴史人物の自動会話を開始';
  $('notification-control').hidden=!config?.pushAvailable;
  $('push-toggle').textContent=d.notifications_enabled?'このグループの通知をOFF':'このグループの通知をON';
  const box=$('messages'),atBottom=first||box.scrollHeight-box.scrollTop-box.clientHeight<80,oldTop=box.scrollTop;
  const fingerprint=JSON.stringify([before,d.messages,d.room.owner]);
  if(box.dataset.fingerprint!==fingerprint){
    box.replaceChildren();
    for(const m of d.messages){
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
      main.append(meta,node('div',m.hidden?'管理者が削除しました':m.text,'body'));wrap.append(main);box.append(wrap);
    }
    box.dataset.fingerprint=fingerprint;
    if(atBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=oldTop;
  }
  $('older').disabled=!d.messages.length||d.messages[0].seq<=1;
  $('members').replaceChildren();for(const m of d.members){const line=node('div',m.name+(m.status==='pending'?'（承認待ち）':m.status==='removed'?'（退出済み）':''),'person');if(d.room.owner&&m.user_id!==d.self_id&&m.status!=='removed'){for(const [action,label] of (m.status==='pending'?[['approve','承認'],['remove','却下']]:[['remove','退出処理']])){const b=node('button',label,'subtle');b.onclick=()=>run(async()=>{if(action==='remove'&&!confirm('この参加者を退出扱いにしますか？'))return;await roomAction(action,{user_id:m.user_id});await sync();});line.append(b);}}$('members').append(line);}
  await markRead();
 }
 async function markRead(){if(!view||document.hidden||$('chat').hidden)return;const box=$('messages');if(box.scrollHeight-box.scrollTop-box.clientHeight>80)return;const last=view.messages.at(-1)?.seq||0;if(last>view.last_read_seq){await roomAction('read',{seq:last});view.last_read_seq=last;}}
 $('otp').onclick=()=>run(async()=>{if(!config)throw Error('共有グルチャは準備中です。');const email=$('email').value.trim();if(!$('email').checkValidity()||!email)throw Error('メールアドレスを入力してください。');if(Date.now()-otpAt<60000)throw Error('コードの再送は1分お待ちください。');await auth('otp',{email,create_user:true});otpAt=Date.now();loginEmail=email;status('メールに届いたコードを入力してください。');});
 $('verify').onclick=()=>run(async()=>{if(!config||!loginEmail)throw Error('先に認証コードを送ってください。');const d=await auth('verify',{email:loginEmail,token:$('code').value.trim(),type:'email'});if(!d.access_token)throw Error('ログインできませんでした。');accessToken=d.access_token;$('code').value='';$('login').hidden=true;$('lobby').hidden=false;$('join-panel').hidden=!inviteToken;status('ログインしました。');await list();});
 $('logout').onclick=()=>run(async()=>{try{await auth('logout',{});}finally{clearSession();status('ログアウトしました。');}});
 $('refresh').onclick=()=>run(list);
 $('create').onclick=()=>run(async()=>{const d=await rpc('create',{name:$('room-name').value,nickname:$('owner-name').value});roomId=d.room_id;before=null;$('lobby').hidden=true;$('chat').hidden=false;await sync(true);status('グループを作成しました。参加者・管理から招待できます。');});
 $('join').onclick=()=>run(async()=>{await rpc('join',{token:inviteToken,nickname:$('nickname').value});inviteToken='';$('join-panel').hidden=true;status('参加を申請しました。管理者の承認をお待ちください。');await list();});
 $('back').onclick=()=>run(async()=>{roomId='';view=null;$('messages').replaceChildren();$('messages').dataset.fingerprint='';$('members').replaceChildren();$('invite-link').value='';$('chat').hidden=true;$('lobby').hidden=false;await list();});
 $('send').onclick=()=>run(async()=>{const text=$('text').value.trim();if(!text)throw Error('メッセージを入力してください。');requestId||={id:crypto.randomUUID(),text};if(requestId.text!==text)requestId={id:crypto.randomUUID(),text};await roomAction('send',{text,client_id:requestId.id});requestId=null;$('text').value='';before=null;await sync(true);status('');});
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
 $('leave').onclick=()=>run(async()=>{if(!confirm('退出すると会話を読めなくなります。退出しますか？'))return;await roomAction('leave');roomId='';view=null;$('messages').replaceChildren();$('members').replaceChildren();$('chat').hidden=true;$('lobby').hidden=false;await list();status('退出しました。');});
 $('older').onclick=()=>run(async()=>{if(view?.messages.length){before=view.messages[0].seq;await sync(true);}});
 $('latest').onclick=()=>run(async()=>{before=null;await sync(true);});
 $('messages').addEventListener('scroll',()=>{if(!running&&accessToken&&roomId)run(markRead);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&accessToken)run(roomId?sync:list);});
 setInterval(()=>{if(accessToken&&!document.hidden&&!running)run(roomId?sync:list);},5000);
 // Keep the composer inside the visual viewport when the iOS keyboard opens.
 function updateChatViewport(){
  const vv=window.visualViewport;if(!vv)return;
  document.documentElement.style.setProperty('--chat-viewport-height',Math.round(vv.height)+'px');
  document.documentElement.style.setProperty('--chat-viewport-top',Math.round(vv.offsetTop)+'px');
 }
 if(window.visualViewport){visualViewport.addEventListener('resize',updateChatViewport);visualViewport.addEventListener('scroll',updateChatViewport);updateChatViewport();}
 $('text').addEventListener('input',()=>{const el=$('text');el.style.height='44px';el.style.height=Math.min(el.scrollHeight,118)+'px';});
 $('text').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('send').click();}});
 $('return-app').addEventListener('click',e=>{if(history.length>1){e.preventDefault();history.back();}});
 fetch('/api/shared-chat',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);config=d;status(inviteToken?'招待リンクを受け取りました。ログイン後、参加を申請してください。':'');}).catch(e=>status(e.message||'共有グルチャは準備中です。'));
})();
