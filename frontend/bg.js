// Fundo animado: rede de pontos violeta (contatos conectados) sobre uma aurora.
// Leve: limita a quantidade de pontos, pausa com a aba oculta e respeita "reduzir movimento".
(function(){
  if(document.getElementById('bg-net'))return;
  var aurora=document.createElement('div');aurora.className='bg-aurora';aurora.setAttribute('aria-hidden','true');
  aurora.innerHTML='<span></span><span></span><span></span>';
  var canvas=document.createElement('canvas');canvas.id='bg-net';canvas.setAttribute('aria-hidden','true');
  document.body.prepend(canvas);document.body.prepend(aurora);
  var ctx=canvas.getContext('2d');if(!ctx)return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
  var dpr=1,w=0,h=0,points=[],mouse={x:-9999,y:-9999},raf=0,last=0;
  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,1.5);
    w=window.innerWidth;h=window.innerHeight;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    var target=Math.round(Math.min(90,Math.max(28,w*h/16000)));
    while(points.length<target)points.push(spawn());
    points.length=target;
  }
  function spawn(){
    var speed=0.08+Math.random()*0.18,ang=Math.random()*Math.PI*2;
    return {x:Math.random()*w,y:Math.random()*h,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,r:0.8+Math.random()*1.6,p:Math.random()*Math.PI*2};
  }
  function draw(t){
    var dt=last?Math.min(48,t-last):16;last=t;
    ctx.clearRect(0,0,w,h);
    var link=Math.min(150,Math.max(110,w/10)),link2=link*link;
    for(var i=0;i<points.length;i++){
      var a=points[i];
      a.x+=a.vx*dt*0.06;a.y+=a.vy*dt*0.06;
      if(a.x<-20)a.x=w+20;else if(a.x>w+20)a.x=-20;
      if(a.y<-20)a.y=h+20;else if(a.y>h+20)a.y=-20;
      var mx=a.x-mouse.x,my=a.y-mouse.y,md=mx*mx+my*my;
      if(md<16000){var f=(1-md/16000)*0.6;a.x+=mx/Math.sqrt(md+1)*f;a.y+=my/Math.sqrt(md+1)*f}
      for(var j=i+1;j<points.length;j++){
        var b=points[j],dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy;
        if(d<link2){
          var o=(1-d/link2)*0.35;
          ctx.strokeStyle='rgba(167,139,250,'+o.toFixed(3)+')';ctx.lineWidth=0.7;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        }
      }
    }
    for(var k=0;k<points.length;k++){
      var q=points[k];q.p+=dt*0.002;
      var glow=0.55+Math.sin(q.p)*0.35;
      ctx.fillStyle='rgba(216,196,255,'+glow.toFixed(3)+')';
      ctx.shadowColor='rgba(139,92,246,.9)';ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,Math.PI*2);ctx.fill();
    }
    ctx.shadowBlur=0;
    raf=requestAnimationFrame(draw);
  }
  function start(){if(!raf&&!(reduce&&reduce.matches)&&!document.hidden){last=0;raf=requestAnimationFrame(draw)}}
  function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
  function still(){stop();last=0;draw(0);stop()}
  window.addEventListener('resize',function(){resize();if(!raf)still()});
  window.addEventListener('pointermove',function(e){mouse.x=e.clientX;mouse.y=e.clientY},{passive:true});
  window.addEventListener('pointerleave',function(){mouse.x=mouse.y=-9999});
  document.addEventListener('visibilitychange',function(){document.hidden?stop():start()});
  if(reduce&&reduce.addEventListener)reduce.addEventListener('change',function(){reduce.matches?still():start()});
  resize();
  if(reduce&&reduce.matches)still();else start();
})();
