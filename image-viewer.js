'use strict';
// Image-only zoom. The viewport never changes size; normal vertical page scroll
// and horizontal card navigation remain available when the image is at 100%.
window.createNekoImageView = function ({frame,image,resetButton,isReady,onTap,onNavigate,onPause,onDrag,onSnap,suppressClicks}) {
  const view={scale:1,x:0,y:0}, MAX=5;
  let cardId=null,touch=null,pointer=null,holdTimer=null;
  function clearHold(){if(holdTimer)clearTimeout(holdTimer);holdTimer=null;}
  function startHold(){clearHold();holdTimer=setTimeout(()=>{if(touch&&['pending','pan'].includes(touch.kind)){touch.kind='longpress';onPause();suppressClicks();}},420);}
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function geometry(){
    const r=frame.getBoundingClientRect(), ratio=(image.naturalWidth&&image.naturalHeight)?image.naturalWidth/image.naturalHeight:16/9;
    const width=Math.min(r.width,r.height*ratio);
    return {r,width,height:width/ratio};
  }
  function draw(){
    const {r,width,height}=geometry();
    const maxX=Math.max(0,(width*view.scale-r.width)/2),maxY=Math.max(0,(height*view.scale-r.height)/2);
    view.x=clamp(view.x,-maxX,maxX);view.y=clamp(view.y,-maxY,maxY);
    image.style.transform=`translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    const zoomed=view.scale>1.015;
    frame.classList.toggle('is-zoomed',zoomed);resetButton.hidden=!zoomed;
    resetButton.textContent=`${Math.round(view.scale*100)}% · 戻すにゃ`;
  }
  function reset(){clearHold();view.scale=1;view.x=view.y=0;touch=pointer=null;draw();}
  function setCard(id){if(id!==cardId){cardId=id;reset();}else draw();}
  function localPoint(x,y){const {r}=geometry();return {x:x-r.left-r.width/2,y:y-r.top-r.height/2};}
  function setScale(scale,at){const next=clamp(scale,1,MAX),ratio=next/view.scale;view.x=at.x-(at.x-view.x)*ratio;view.y=at.y-(at.y-view.y)*ratio;view.scale=next;draw();}
  function beginPinch(touches){
    clearHold();
    const [a,b]=touches,point=localPoint((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2);
    touch={kind:'pinch',pinched:true,distance:Math.max(1,Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY)),scale:view.scale,anchorX:(point.x-view.x)/view.scale,anchorY:(point.y-view.y)/view.scale};
    pointer=null;onSnap();onPause();suppressClicks();
  }
  function beginSingle(t,pinched=false){return {kind:view.scale>1.015?'pan':'pending',pinched,id:t.identifier,startX:t.clientX,startY:t.clientY,lastX:t.clientX,lastY:t.clientY,x:view.x,y:view.y,start:performance.now()};}
  function prevent(e){if(e.cancelable)e.preventDefault();}
  frame.addEventListener('touchstart',e=>{
    if(!isReady())return;
    if(e.touches.length>=2){prevent(e);beginPinch(e.touches);return;}
    if(e.touches.length===1){touch=beginSingle(e.touches[0]);onPause();startHold();}
  },{passive:false});
  frame.addEventListener('touchmove',e=>{
    if(!touch||!isReady())return;
    if(e.touches.length>=2){
      prevent(e);if(touch.kind!=='pinch')beginPinch(e.touches);
      const [a,b]=e.touches,point=localPoint((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2);
      view.scale=clamp(touch.scale*Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY)/touch.distance,1,MAX);
      view.x=point.x-touch.anchorX*view.scale;view.y=point.y-touch.anchorY*view.scale;draw();suppressClicks();return;
    }
    if(e.touches.length!==1||touch.kind==='pinch')return;
    const t=e.touches[0];touch.lastX=t.clientX;touch.lastY=t.clientY;
    const dx=t.clientX-touch.startX,dy=t.clientY-touch.startY,ax=Math.abs(dx),ay=Math.abs(dy);
    if(ax>6||ay>6)clearHold();
    if(touch.kind==='longpress')return;
    if(touch.kind==='pan'){prevent(e);view.x=touch.x+dx;view.y=touch.y+dy;draw();return;}
    if(touch.kind==='blocked'){prevent(e);return;}
    if(touch.kind==='pending'&&(ax>6||ay>6)){touch.kind=ax>ay*1.1?'swipe':'scroll';if(touch.kind==='swipe')onPause();}
    if(touch.kind==='swipe'){prevent(e);onDrag(dx);}
  },{passive:false});
  function endTouch(e,cancelled=false){
    clearHold();if(!touch)return;
    if(e.touches.length>=2){prevent(e);beginPinch(e.touches);return;}
    if(e.touches.length===1){
      prevent(e);const pinched=touch.pinched||touch.kind==='pinch';touch=beginSingle(e.touches[0],pinched);
      if(touch.kind==='pending')touch.kind='blocked';suppressClicks();return;
    }
    const g=touch;touch=null;
    if(g.kind==='pinch'||g.kind==='blocked'||g.pinched){prevent(e);suppressClicks();onSnap();return;}
    const ended=[...(e.changedTouches||[])].find(t=>t.identifier===g.id);
    const dx=(ended?.clientX??g.lastX)-g.startX,dy=(ended?.clientY??g.lastY)-g.startY,ax=Math.abs(dx),ay=Math.abs(dy);
    if(g.kind==='longpress'||(['pending','pan'].includes(g.kind)&&ax<8&&ay<8&&performance.now()-g.start>=420)){suppressClicks();onSnap();return;}
    if(cancelled){suppressClicks();onSnap();return;}
    if(g.kind==='pan'){prevent(e);suppressClicks();if(ax<7&&ay<7)onTap();return;}
    const horizontal=g.kind==='swipe'||(g.kind==='pending'&&ax>12&&ax>ay*1.3);
    if(horizontal){
      prevent(e);suppressClicks();const velocity=ax/Math.max(1,performance.now()-g.start);
      if((ax>=28||(ax>=14&&velocity>.25))&&ax>ay*1.1)onNavigate(dx<0?1:-1);else onSnap();return;
    }
    onSnap();
    if(g.kind==='pending'&&ax<9&&ay<9){prevent(e);suppressClicks();onTap();}
    else if(ax>8||ay>8)suppressClicks();
  }
  frame.addEventListener('touchend',e=>endTouch(e),{passive:false});
  frame.addEventListener('touchcancel',e=>endTouch(e,true),{passive:false});
  // Prevent WebKit's page gesture; touch events above apply the zoom to the image.
  for(const name of ['gesturestart','gesturechange','gestureend'])frame.addEventListener(name,prevent,{passive:false});
  frame.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||!isReady()||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,kind:view.scale>1.015?'pan':'pending',start:performance.now(),viewX:view.x,viewY:view.y};
    if(pointer.kind==='pan'){onPause();try{frame.setPointerCapture(e.pointerId);}catch{}}
  });
  window.addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    pointer.dx=e.clientX-pointer.x;pointer.dy=e.clientY-pointer.y;
    if(pointer.kind==='pan'){view.x=pointer.viewX+pointer.dx;view.y=pointer.viewY+pointer.dy;draw();return;}
    if(pointer.kind==='pending'&&(Math.abs(pointer.dx)>6||Math.abs(pointer.dy)>6)){
      pointer.kind=Math.abs(pointer.dx)>Math.abs(pointer.dy)*1.1?'swipe':'scroll';
      if(pointer.kind==='swipe'){onPause();try{frame.setPointerCapture(e.pointerId);}catch{}}
    }
    if(pointer.kind==='swipe')onDrag(pointer.dx);
  });
  function endPointer(e,cancelled=false){
    if(!pointer||pointer.id!==e.pointerId)return;
    const p=pointer;pointer=null;try{frame.releasePointerCapture(e.pointerId);}catch{}
    const dx=cancelled?p.dx:e.clientX-p.x,dy=cancelled?p.dy:e.clientY-p.y,ax=Math.abs(dx),ay=Math.abs(dy);
    if(['pending','pan'].includes(p.kind)&&ax<8&&ay<8&&performance.now()-p.start>=420){suppressClicks();return;}
    if(p.kind==='pan'){if(ax>7||ay>7)suppressClicks();return;}
    if(p.kind==='swipe'||(p.kind==='pending'&&ax>12&&ax>ay*1.3)){
      suppressClicks();const velocity=ax/Math.max(1,performance.now()-p.start);
      if((cancelled?ax>36:ax>=28||(ax>=14&&velocity>.25))&&ax>ay*1.1){onNavigate(dx<0?1:-1);return;}
    }
    if(ax>8||ay>8)suppressClicks();onSnap();
  }
  window.addEventListener('pointerup',e=>endPointer(e));window.addEventListener('pointercancel',e=>endPointer(e,true));
  frame.addEventListener('wheel',e=>{if(!e.ctrlKey||!isReady())return;prevent(e);onPause();setScale(view.scale*Math.exp(-e.deltaY*.01),localPoint(e.clientX,e.clientY));suppressClicks();},{passive:false});
  frame.addEventListener('contextmenu',()=>{clearHold();if(touch)touch.kind='longpress';pointer=null;onPause();suppressClicks();});
  image.addEventListener('dragstart',e=>e.preventDefault());
  resetButton.onclick=()=>{onPause();suppressClicks();reset();};
  window.addEventListener('resize',()=>{clearHold();touch=pointer=null;draw();});
  window.addEventListener('blur',()=>{clearHold();touch=pointer=null;onSnap();onPause();});
  return {setCard,refresh:draw,reset,cancel:()=>{clearHold();touch=pointer=null;onSnap();},get state(){return {...view};}};
};
