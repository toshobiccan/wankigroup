import { DEFAULT_HEAD, normalizeHead } from './character-head.js';

function surface(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function polygon(ctx, points) { ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); }
function rgb(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
export function masterPixelRegion(r, g, b, inBrow, inEye) {
  if (inBrow && r < 95) return 'brow';
  // The approved iris is yellow/olive, including its warm gold gradient.
  // Reject neighboring warm skin caught by polygon edges instead of tinting it.
  if (inEye && g > b * 2 && r > b * 2 && g > 35) return 'iris';
  if (r > g * 1.12 && g > b * 1.1 && r > 60) return 'skin';
  return 'ink';
}
function within(x,y,points) {
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) hit=!hit;
  }
  return hit;
}

// Native master pixels and one shared transform are the registration contract.
// No automatic trimming or per-feature scaling is permitted on this path.
export class MasterHeadRenderer {
  constructor({manifest,image,hairImage,cleanImage,hairImages={}}, appearance) {
    if(!cleanImage || image.naturalWidth!==manifest.master.width || image.naturalHeight!==manifest.master.height) throw new Error('Invalid registered head template.');
    this.manifest=manifest; this.image=image; this.cleanImage=cleanImage; this.hairImage=hairImage; this.hairImages=hairImages;
    const {width,height}=manifest.master;
    this.canvas=surface(512,512); this.native=surface(width,height); this.eyeLayer=surface(width,height);
    this.setAppearance(appearance);
  }
  colored(image) {
    const {width,height,regions}=this.manifest.master, a=this.appearance;
    const c=surface(width,height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
    if(a.skinColor===DEFAULT_HEAD.skinColor && a.eyeColor===DEFAULT_HEAD.eyeColor && a.hairColor===DEFAULT_HEAD.hairColor) return c;
    const pixels=ctx.getImageData(0,0,width,height), p=pixels.data;
    const skin=rgb(a.skinColor),base=rgb(DEFAULT_HEAD.skinColor),eyes=rgb(a.eyeColor),brows=rgb(a.hairColor);
    for(let i=0;i<p.length;i+=4) {
      if(!p[i+3]) continue;
      const r=p[i],g=p[i+1],b=p[i+2],x=(i/4)%width,y=Math.floor(i/4/width);
      const inIris=image===this.image && regions.irises.some(poly=>within(x,y,poly));
      const region=masterPixelRegion(r,g,b,r<95 && regions.brows.some(poly=>within(x,y,poly)),inIris);
      if(region==='brow') {
        if(a.hairColor!==DEFAULT_HEAD.hairColor) for(let k=0;k<3;k++) p[i+k]=Math.round(brows[k]*.4);
      } else if(region==='iris') {
        if(a.eyeColor!==DEFAULT_HEAD.eyeColor) {
          const light=Math.max(r,g)/200;
          for(let k=0;k<3;k++) p[i+k]=Math.min(255,Math.round(eyes[k]*light));
        }
      } else if(region==='skin' && a.skinColor!==DEFAULT_HEAD.skinColor) {
        for(let k=0;k<3;k++) p[i+k]=Math.min(255,Math.round(p[i+k]*skin[k]/base[k]));
      }
    }
    ctx.putImageData(pixels,0,0);return c;
  }
  prepareHair() {
    const registered=this.manifest.hairstyles?.[this.appearance.hair];
    if(registered) {
      const image=this.hairImages[this.appearance.hair];
      if(!image) throw new Error('Missing registered hairstyle.');
      // Keep transparent margins: they register the hair to the approved skull.
      const c=surface(512,512),ctx=c.getContext('2d');
      ctx.drawImage(image,0,0,512,512);
      const pixels=ctx.getImageData(0,0,512,512),p=pixels.data,col=rgb(this.appearance.hairColor);
      for(let i=0;i<p.length;i+=4) {
        if(!p[i+3])continue;
        const v=(p[i]+p[i+1]+p[i+2])/3;
        for(let k=0;k<3;k++)p[i+k]=v<45?15:Math.min(255,Math.round(col[k]*v/192));
      }
      ctx.putImageData(pixels,0,0);this.hair=c;this.hairRect=registered.rect;return;
    }
    const part=this.manifest.parts[this.appearance.hair==='swept'?'hairSwept':'hairSpiky'];
      const [sx,sy,w,h]=part.source,c=surface(w,h),hc=c.getContext('2d');hc.drawImage(this.hairImage,sx,sy,w,h,0,0,w,h);
      const data=hc.getImageData(0,0,w,h),col=rgb(this.appearance.hairColor);let x0=w,y0=h,x1=0,y1=0;
      for(let i=0;i<data.data.length;i+=4){if(data.data[i+3]<16)continue;const x=(i/4)%w,y=Math.floor(i/4/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);const v=(data.data[i]+data.data[i+1]+data.data[i+2])/3;for(let k=0;k<3;k++)data.data[i+k]=v<45?15:Math.round(col[k]*Math.min(1,v/225));}
      hc.putImageData(data,0,0);this.hair=surface(x1-x0+1,y1-y0+1);this.hair.getContext('2d').drawImage(c,x0,y0,x1-x0+1,y1-y0+1,0,0,x1-x0+1,y1-y0+1);this.hairRect=part.rect;
  }
  setAppearance(value) {
    this.appearance=normalizeHead(value);
    this.painted=this.colored(this.image);this.blank=this.colored(this.cleanImage);
    if(this.appearance.hair!=='none')this.prepareHair();
    this.frame=null;this.draw('open');
  }
  patch(ctx,points,image) {ctx.save();polygon(ctx,points);ctx.clip();ctx.drawImage(image,0,0);ctx.restore();}
  lashes(ctx,closed=false) {
    ctx.fillStyle='#1d1009';
    for(const triangle of (closed ? this.manifest.master.closedLashes : this.manifest.master.lashes)) {polygon(ctx,triangle);ctx.fill();}
  }
  draw(frame='open') {
    if(this.frame===frame)return false;this.frame=frame;
    const {master}=this.manifest,{regions}=master,ctx=this.native.getContext('2d');
    ctx.clearRect(0,0,this.native.width,this.native.height);ctx.drawImage(this.painted,0,0);
    if(this.appearance.mouth==='neutral') {
      this.patch(ctx,regions.mouth,this.blank);
      ctx.strokeStyle='#211208';ctx.lineWidth=11;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(638,835);ctx.quadraticCurveTo(750,827,866,836);ctx.stroke();
    }
    if(frame==='open') { if(this.appearance.eyeShape==='lashes')this.lashes(ctx); }
    else {
      for(const poly of regions.eyes)this.patch(ctx,poly,this.blank);
      if(frame==='half') {
        const e=this.eyeLayer.getContext('2d');e.clearRect(0,0,this.eyeLayer.width,this.eyeLayer.height);
        for(const poly of regions.eyes)this.patch(e,poly,this.painted);
        if(this.appearance.eyeShape==='lashes')this.lashes(e);
        ctx.save();ctx.translate(0,master.eyeBaseline);ctx.scale(1,.45);ctx.translate(0,-master.eyeBaseline);ctx.drawImage(this.eyeLayer,0,0);ctx.restore();
      } else {
        ctx.strokeStyle='#211208';ctx.lineWidth=12;ctx.lineCap='round';
        for(const [start,control,end] of master.closedEyes) {ctx.beginPath();ctx.moveTo(...start);ctx.quadraticCurveTo(...control,...end);ctx.stroke();}
        if(this.appearance.eyeShape==='lashes')this.lashes(ctx,true);
      }
    }
    const out=this.canvas.getContext('2d');out.clearRect(0,0,512,512);out.drawImage(this.native,...master.rect);
    if(this.appearance.hair!=='none') {
      out.drawImage(this.hair,...this.hairRect);
      // The fixed ear belongs to the head below hair; overlapping locks cover it.
    }
    return true;
  }
}
