/* Shared-chat push worker. The notification payload contains no private keys. */
self.addEventListener('push',event=>{
 let data={};try{data=event.data?event.data.json():{}}catch{}
 const title=typeof data.title==='string'?data.title.slice(0,80):'異次元グルチャ';
 const body=typeof data.body==='string'?data.body.slice(0,140):'新しい発言があります。';
 event.waitUntil(self.registration.showNotification(title,{body,tag:'shared-room-'+String(data.room_id||'').slice(0,36),
   icon:'/history-icons/group-chat.png',badge:'/icons/nekopon-192-v1.png',data:{room_id:String(data.room_id||'')},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL('/himiko.html',self.location.origin);
  const id=event.notification.data?.room_id;if(/^[a-f0-9-]{36}$/i.test(id||''))url.searchParams.set('shared_room',id);
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const found=clients.find(x=>new URL(x.url).pathname==='/himiko.html'&&new URL(x.url).href===url.href);
  if(found){await found.focus();return;}
  await self.clients.openWindow(url.href);
 })());
});
