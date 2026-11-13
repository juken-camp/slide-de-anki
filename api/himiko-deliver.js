'use strict';
// Share the existing authenticated delivery wake-up. Each worker keeps its own
// state, quotas and locks; shared failures never change the personal result.
const personal=require('../lib/himiko-inbox').cron;
const shared=require('./shared-chat-tick');
function capture(){
 let statusCode=200,body;const headers={};
 return {headers,get statusCode(){return statusCode},get body(){return body},
  setHeader(k,v){headers[k]=v;return this},
  status(n){statusCode=n;return this},
  json(value){body=value;return this},
  end(value){body=value;return this}};
}
module.exports=async function(req,res){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.authorization!=='Bearer '+secret)return personal(req,res);
 const personalResponse=capture(),sharedResponse=capture();
 const sharedSecret=process.env.SHARED_CHAT_CRON_SECRET||secret;
 const sharedRequest={...req,method:'POST',headers:{...req.headers,authorization:'Bearer '+sharedSecret}};
 const outcomes=await Promise.allSettled([
  personal(req,personalResponse),
  process.env.SHARED_CHAT_AI_ENABLED==='1'?shared(sharedRequest,sharedResponse):Promise.resolve()
 ]);
 if(outcomes[1].status==='rejected'||sharedResponse.statusCode>=400)
  console.warn('[shared-ai] shared delivery wake failed');
 else if(process.env.SHARED_CHAT_AI_ENABLED==='1')
  console.info('[shared-ai] shared delivery wake completed');
 if(outcomes[0].status==='rejected')return res.status(503).json({error:'Inbox unavailable'});
 for(const [key,value] of Object.entries(personalResponse.headers))res.setHeader(key,value);
 if(personalResponse.body===undefined)return res.status(personalResponse.statusCode).end();
 if(typeof personalResponse.body==='string')return res.status(personalResponse.statusCode).end(personalResponse.body);
 return res.status(personalResponse.statusCode).json(personalResponse.body);
};
