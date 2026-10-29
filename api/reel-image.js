// Same-origin export bridge for the app's own public R2 images only.
const IMAGE_HOST='pub-638367cb4e5344daaa606b170b683043.r2.dev';
module.exports=async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
 let url;try{url=new URL(req.query.url);}catch{return res.status(400).end('Invalid image');}
 if(url.protocol!=='https:'||url.hostname!==IMAGE_HOST||url.port||url.username||url.password||!/^\/images_\d+\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$/i.test(url.pathname))return res.status(400).end('Unsupported image');
 try{const response=await fetch(url.href,{redirect:'error',signal:AbortSignal.timeout(15000)});const type=response.headers.get('content-type')||'';if(!response.ok||!/^image\/(png|jpeg|webp)(;|$)/i.test(type))return res.status(502).end('Image unavailable');const limit=12*1024*1024;if(Number(response.headers.get('content-length'))>limit)return res.status(413).end();const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return res.status(413).end();}chunks.push(Buffer.from(value));}res.setHeader('Content-Type',type);res.setHeader('Cache-Control','public, max-age=86400');res.setHeader('X-Content-Type-Options','nosniff');res.status(200).send(Buffer.concat(chunks));}catch{return res.status(502).end('Image unavailable');}
};
