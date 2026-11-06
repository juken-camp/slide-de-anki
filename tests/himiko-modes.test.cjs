'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const inbox=require('../lib/himiko-inbox');
const id=createHash('sha256').update('some-long-random-device-token').digest('hex');
const original=process.env.HIMIKO_TEST_DEVICE_IDS;
function env(v,fn){try{if(v===undefined)delete process.env.HIMIKO_TEST_DEVICE_IDS;else process.env.HIMIKO_TEST_DEVICE_IDS=v;fn();}finally{if(original===undefined)delete process.env.HIMIKO_TEST_DEVICE_IDS;else process.env.HIMIKO_TEST_DEVICE_IDS=original;}}
function state(){const now=Date.now();return {enabled:true,batches:[{id:'old',replies:[{text:'preserve old published messages'}]}],prepared:[{replies:[]}],generation:{id:'old-generation',until:now+60000},next:now+60000,conversationAt:now+60000,score:0,scoreDay:inbox.day(now)};}
test('only allowlisted device hash/prefix runs trial mode',()=>{
 env(undefined,()=>assert.equal(inbox.modeForDevice(id),'normal'));
 env('invalid,abcdef',()=>assert.equal(inbox.modeForDevice(id),'normal'));
 env(id.slice(0,16),()=>assert.equal(inbox.modeForDevice(id),'test'));
 env('ffffffffffffffff, '+id.slice(0,16),()=>assert.equal(inbox.modeForDevice(id),'test'));
 env(id,()=>assert.equal(inbox.modeForDevice(id),'test'));
 env(id.slice(0,15),()=>assert.equal(inbox.modeForDevice(id),'normal'));
 env('ffffffffffffffff',()=>assert.equal(inbox.modeForDevice(id),'normal'));
});
test('original caps and unread guards apply only to ordinary users',()=>{
 assert.equal(inbox.cap(0,'normal'),1);
 assert.equal(inbox.cap(1,'normal'),3);
 assert.equal(inbox.cap(14,'normal'),3);
 assert.equal(inbox.cap(15,'normal'),5);
 assert.equal(inbox.cap(0,'test'),60);
 assert.equal(inbox.unreadSceneCap('normal'),3);
 assert.equal(inbox.unreadSceneCap('test'),5);
});
test('switching modes discards only unpublished material and reschedules',()=>{
 const now=Date.now();const s=state();
 env(undefined,()=>assert.equal(inbox.applyDeliveryMode(s,id,now),true));
 assert.equal(s.deliveryMode,'normal');
 assert.equal(s.prepared.length,0);
 assert.equal(s.generation,null);
 assert.equal(s.batches.length,1);
 assert.equal(inbox.applyDeliveryMode(s,id,now),false);
 env(id.slice(0,16),()=>{
  assert.equal(inbox.applyDeliveryMode(s,id,now),true);
  assert.equal(s.deliveryMode,'test');
  assert.ok(s.next>=now+10*60000&&s.next<now+61*60000);
 });
 env(undefined,()=>{
  assert.equal(inbox.applyDeliveryMode(s,id,now),true);
  assert.equal(s.deliveryMode,'normal');
  assert.ok(s.next>=now+24*3600000);
  assert.equal(s.batches.length,1);
 });
});
test('test timing preserves 10-20 minutes and quiet-hour x3; normal respects delivery hours',()=>{
 const midday=Date.parse('2026-11-06T12:00:00+09:00');
 const night=Date.parse('2026-11-06T23:00:00+09:00');
 for(let i=0;i<15;i++){
  const t=inbox.nextTime(midday,0,'test');assert.ok(t>=midday+600000&&t<midday+21*60000);
  const q=inbox.nextTime(night,0,'test');assert.ok(q>=night+30*60000&&q<night+63*60000);
  const n=inbox.nextTime(midday,0,'normal');assert.ok(n>=midday+24*3600000);
  const h=inbox.hour(n);assert.ok(h>=8&&h<22);
 }
});
