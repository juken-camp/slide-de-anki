/* JUKEN CAMP / history202 integration. Attach this script ONCE to himiko.html. */
(() => {
'use strict';
if (window.__history202LauncherInstalled) return;
window.__history202LauncherInstalled=true;
const style=document.createElement('style');style.textContent=`
#list-view .h202-entry{margin:10px 0 0;cursor:pointer;animation:none}
#list-view .h202-entry .card-inner{gap:10px}
#list-view .h202-entry .h202-card-avatar{display:grid;place-items:center;flex:none;width:50px;height:50px;border:0;background:none;border-radius:15px;font-size:26px}
/* Artwork in the existing 50px card slots; keep card geometry unchanged. */
#list-view .h202-entry .h202-card-avatar,
#list-view .sengoku-chat-entry .sengoku-entry-placeholder,
#list-view .shared-chat-join-entry .shared-entry-placeholder{overflow:hidden;border:0!important;background:none!important;box-shadow:none!important}
#list-view .h202-entry .h202-card-avatar img,
#list-view .sengoku-chat-entry .sengoku-entry-placeholder img,
#list-view .shared-chat-join-entry .shared-entry-placeholder img{display:block;width:100%;height:100%;object-fit:cover;border-radius:14px}

#list-view .h202-entry .card-info{flex:1;min-width:0}
#list-view .h202-entry .h202-card-name{font-size:16px;font-weight:900;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1e293b}
#list-view .h202-entry .h202-card-caption{font-size:12px;font-weight:700;line-height:1.6;margin-top:4px;color:#a07960}
#list-view .h202-entry:focus-visible{outline:2px solid #bc8d59;outline-offset:3px}
html[data-persona=cyber] #list-view .h202-entry .h202-card-avatar{background:none;border:0}
html[data-persona=cyber] #list-view .h202-entry .h202-card-name{color:#e0eaff}
html[data-persona=cyber] #list-view .h202-entry .h202-card-caption{color:#92c7e5}
#history202-panel{position:fixed;inset:0;z-index:9550;display:flex;flex-direction:column;background:#fffcf7;overflow:hidden}
#history202-panel[hidden]{display:none!important}
html[data-persona=cyber] #history202-panel{background:#080d20}
#history202-frame{border:0;display:block;width:100%;height:100%;flex:1;min-height:0}
@media(max-width:390px){#list-view .h202-entry .h202-card-name{font-size:14px}#list-view .h202-entry .h202-card-caption{font-size:11px}}
`;document.head.append(style);
const list=document.getElementById('list-view');const sengokuEntry=list?.querySelector('.sengoku-chat-entry');
if(!list){console.error('history202: list-view is not available');return;}
const card=document.createElement('div');card.className='h202-entry char-card';card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-label','歴史の重要ワード202を開く');
card.innerHTML='<div class="card-inner"><span class="h202-card-avatar" aria-hidden="true"><img src="/icons/history202.webp?v=20261109-threechat-icons-v3" alt="" width="256" height="256" decoding="async"></span><div class="card-info"><div class="card-name-row sengoku-entry-name-row"><span class="h202-card-name sengoku-entry-title">歴史の重要ワード202</span><span class="sengoku-entry-limited">入試対策</span></div><div class="h202-card-caption">31のチャットで、歴史の重要ワードを攻略！</div></div></div>';
if(sengokuEntry)sengokuEntry.insertAdjacentElement('afterend',card);
else list.querySelector('.shared-chat-join-entry')?.insertAdjacentElement('beforebegin',card) || list.prepend(card);
// Set images for the existing Sengoku and shared-room card slots; never alter their click handlers.
function installCardIcon(selector, source){
  const slot=list.querySelector(selector);
  if(!slot || slot.querySelector('img')) return;
  const img=document.createElement('img');
  img.src=source;img.alt='';img.width=256;img.height=256;
  img.decoding='async';
  slot.appendChild(img);
}
installCardIcon('.sengoku-chat-entry .sengoku-entry-placeholder','/icons/sengoku.webp?v=20261109-threechat-icons-v3');
installCardIcon('.shared-chat-join-entry .shared-entry-placeholder','/icons/shared-chat.webp?v=20261109-threechat-icons-v3');
const panel=document.createElement('section');panel.id='history202-panel';panel.hidden=true;panel.setAttribute('aria-label','歴史の重要ワード202');
const frame=document.createElement('iframe');frame.id='history202-frame';frame.title='歴史の重要ワード202';frame.loading='lazy';panel.append(frame);document.body.append(panel);
let lastScroll=0;
const theme=()=>document.documentElement.dataset.persona==='cyber'?'cyber':'neko';
const notify=open=>{if(window.parent!==window)window.parent.postMessage({type:'himiko-chat-state',open},location.origin)};
const sendTheme=()=>{try{frame.contentWindow?.postMessage({type:'history202-theme',persona:theme()},location.origin)}catch(_){}};
function open(){if(!panel.hidden)return;lastScroll=window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0;document.documentElement.dataset.history202Open='true';document.documentElement.dataset.chatOpen='true';list.classList.add('hidden');panel.hidden=false;if(!frame.getAttribute('src'))frame.setAttribute('src','history202-chat.html?v=20261109-history202-roomicon-v1');sendTheme();notify(true)}
function close(){if(panel.hidden)return;panel.hidden=true;delete document.documentElement.dataset.history202Open;delete document.documentElement.dataset.chatOpen;list.classList.remove('hidden');requestAnimationFrame(()=>{window.scrollTo(0,lastScroll);document.body.scrollTop=lastScroll;document.documentElement.scrollTop=lastScroll});notify(false)}
card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
frame.addEventListener('load',sendTheme);
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data)return;if(e.source===frame.contentWindow&&e.data.type==='history202-close')close();if(e.data.type==='himiko-return-top'&&!panel.hidden)close();if(e.data.type==='nekopon-persona')sendTheme()});
new MutationObserver(()=>{if(!panel.hidden)sendTheme()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-persona']});
})();
