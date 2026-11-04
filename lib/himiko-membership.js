'use strict';
const {randomInt,randomBytes}=require('node:crypto');
const minute=60000;
function absentIds(s,now){return Object.entries(s.members||{}).filter(([,v])=>v.leftAt<=now&&now<v.until).map(([id])=>Number(id));}
function log(s,id,event,at,name){
 s.membershipEvents||=[];const key='membership:'+randomBytes(10).toString('hex');
 s.membershipEvents.push({id,event,at,key});s.membershipEvents=s.membershipEvents.slice(-1000);
 s.batches.push({id:key,createdAt:at,topic:'membership',membershipOnly:true,suggestions:[],replies:[{id,targetId:id,name:name(id),event,text:name(id)+(event==='leave'?'がグループを退会しました':'がグループに参加しました'),key,at,notified:false}]});
}
function leave(s,id,at,name,until){
 s.members||={};if((s.memberProtected?.[id]||0)>at||Object.keys(s.members).length>=5||s.members[id]&&s.members[id].until>at)return false;
 const roll=randomInt(100),duration=roll<25?randomInt(5,31)*minute:roll<85?randomInt(60,361)*minute:randomInt(12,49)*60*minute;
 s.members[id]={leftAt:at,until:until||at+duration};log(s,id,'leave',at,name);return true;
}
function join(s,id,at,name){
 const v=s.members?.[id];if(!v)return false;
 if(v.leftAt>at){s.membershipEvents=(s.membershipEvents||[]).filter(e=>!(e.id===id&&e.event==='leave'&&e.at===v.leftAt));for(const b of s.batches)b.replies=b.replies.filter(r=>!(r.targetId===id&&r.event==='leave'&&r.at===v.leftAt));delete s.members[id];return true;}
 delete s.members[id];s.memberProtected||={};s.memberProtected[id]=at+10*minute;log(s,id,'join',at,name);return true;
}
function advance(s,now,ids,name){
 s.members||={};
 for(const [id,v] of Object.entries(s.members))if(v.until<=now)join(s,Number(id),v.until,name);
 if(!s.membershipStarted){s.membershipStarted=true;s.nextMembershipAt=now;}
 if(s.enabled&&(absentIds(s,now).length<3||now>=Number(s.nextMembershipAt||0))){
  const scheduled=new Set(s.batches.flatMap(b=>b.replies).filter(r=>r.at>now).map(r=>r.id));
  const eligible=ids.filter(id=>!s.members[id]&&!scheduled.has(id)&&(s.memberProtected?.[id]||0)<=now);
  const target=randomInt(3,6);
  while(absentIds(s,now).length<target&&Object.keys(s.members).length<5&&eligible.length){const index=randomInt(eligible.length),id=eligible.splice(index,1)[0];leave(s,id,now,name);}
  s.nextMembershipAt=now+randomInt(20,61)*minute;
 }
}
function snapshot(s,now){return {absentIds:absentIds(s,now),events:(s.membershipEvents||[]).filter(e=>e.at<=now)};}
module.exports={absentIds,leave,join,advance,snapshot};
