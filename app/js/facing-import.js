"use strict";
const $=id=>document.getElementById(id);
const MASTER="../../docs/master-template/Leaders_Companion_V3_Master_Template_v1.3_Blank.pdf";
const W=612,H=792;
const REGIONS={left:{x:171.36,y:98,w:380.88,h:540},right:{x:59.76,y:98,w:380.88,h:540}};
const state={raw:null,view:null,count:0,crops:{left:{x:4,y:8,w:42,h:84},right:{x:54,y:8,w:42,h:84}},output:null,url:null};
function status(t){$("status").textContent=t}
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
function validCrop(c){return Object.values(c).every(Number.isFinite)&&c.x>=0&&c.y>=0&&c.w>=1&&c.h>=1&&c.x+c.w<=100.001&&c.y+c.h<=100.001}

const RATIO=380.88/540;
function lockCrop(side,c){const canvas=$(side+"-canvas"),ratio=RATIO*canvas.height/canvas.width;let w=Math.max(c.w,c.h*ratio),h=w/ratio;const k=Math.min(1,100/w,100/h);w*=k;h*=k;return {x:clamp(c.x+c.w/2-w/2,0,100-w),y:clamp(c.y+c.h/2-h/2,0,100-h),w,h}}
function sourceZone(side,w,h){
 const shared=$("left-page").value===$("right-page").value;
 return {x0:shared?(side==="left"?0:w/2):0,x1:shared?(side==="left"?w/2:w):w,y0:h*.085,y1:h*.91};
}
function suggestCrop(side){
 const canvas=$(side+"-canvas"),w=canvas.width,h=canvas.height;
 const data=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,w,h).data;
 const z=sourceZone(side,w,h),step=2;
 // Restrict detection to the source body; neutral-ink filtering rejects blue template guides.
 const row=new Uint32Array(h),col=new Uint32Array(w);
 for(let y=Math.ceil(z.y0);y<z.y1;y+=step)for(let x=Math.ceil(z.x0+12);x<z.x1-12;x+=step){
  const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
  // Ignore the blue/gray master-template lines and count only near-neutral ink.
  if(Math.max(r,g,b)-Math.min(r,g,b)<42&&r+g+b<420){row[y]++;col[x]++}
 }
 const rowMin=Math.max(2,Math.floor((z.x1-z.x0)/170)),colMin=Math.max(2,Math.floor((z.y1-z.y0)/210));
 let top=h,bottom=0,left=w,right=0;
 for(let y=Math.ceil(z.y0);y<z.y1;y+=step)if(row[y]>=rowMin){top=Math.min(top,y);bottom=Math.max(bottom,y+step)}
 for(let x=Math.ceil(z.x0+12);x<z.x1-12;x+=step)if(col[x]>=colMin){left=Math.min(left,x);right=Math.max(right,x+step)}
 if(right<=left||bottom<=top)return null;
 const pad=12;
 return lockCrop(side,{x:Math.max(z.x0,left-pad)/w*100,y:Math.max(z.y0,top-pad)/h*100,w:(Math.min(z.x1,right+pad)-Math.max(z.x0,left-pad))/w*100,h:(Math.min(z.y1,bottom+pad)-Math.max(z.y0,top-pad))/h*100});
}
function sync(side){
 const c=state.crops[side],box=$(side+"-crop");
 Object.assign(box.style,{left:c.x+"%",top:c.y+"%",width:c.w+"%",height:c.h+"%",display:$("crop-editor").hidden?"none":"block"});
 for(const input of $(side+"-fields").querySelectorAll("input"))input.value=Number(c[input.dataset.key].toFixed(2));
}
function attachCrop(side){
 const box=$(side+"-crop"),wrap=$(side+"-wrap");
 for(const input of $(side+"-fields").querySelectorAll("input"))input.addEventListener("change",()=>{
   const key=input.dataset.key,v=Number(input.value),c={...state.crops[side],[key]:v};
   if(!validCrop(c)){status("Invalid "+side+" crop. Keep the rectangle entirely within the source page.");sync(side);return}
   state.crops[side]=lockCrop(side,c);sync(side);
 });
 let drag=null;
 box.addEventListener("pointerdown",e=>{
   if(!state.raw)return;
   const resize=e.target.classList.contains("handle");
   drag={resize,startX:e.clientX,startY:e.clientY,orig:{...state.crops[side]}};
   box.setPointerCapture(e.pointerId);e.preventDefault();
 });
 box.addEventListener("pointermove",e=>{
   if(!drag)return;
   const r=wrap.getBoundingClientRect(),dx=(e.clientX-drag.startX)/r.width*100,dy=(e.clientY-drag.startY)/r.height*100;
   const c={...drag.orig};
   if(drag.resize){const ratio=RATIO*$(side+"-canvas").height/$(side+"-canvas").width;c.w=clamp(c.w+Math.max(dx,dy*ratio),ratio,Math.min(100-c.x,(100-c.y)*ratio));c.h=c.w/ratio}
   else{c.x=clamp(c.x+dx,0,100-c.w);c.y=clamp(c.y+dy,0,100-c.h)}
   state.crops[side]=c;sync(side);
 });
 for(const event of ["pointerup","pointercancel","lostpointercapture"])box.addEventListener(event,()=>{drag=null});
}
async function renderSide(side){
 if(!state.view)return;
 const num=Number($(side+"-page").value);
 if(!Number.isInteger(num)||num<1||num>state.count)throw Error(side+" source page must be between 1 and "+state.count);
 const page=await state.view.getPage(num),viewport=page.getViewport({scale:1});
 const canvas=$(side+"-canvas"),maxWidth=650,scale=Math.min(1.5,maxWidth/viewport.width);
 const v=page.getViewport({scale});
 canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
 await page.render({canvasContext:canvas.getContext("2d"),viewport:v}).promise;
 sync(side);
}
async function detectLanguages(){
 const results={};
 for(const side of ["left","right"]){
   const page=await state.view.getPage(Number($(side+"-page").value));
   const viewport=page.getViewport({scale:1});
   const shared=$("left-page").value===$("right-page").value;
   const items=(await page.getTextContent()).items.filter(i=>typeof i.str==="string"&&i.transform);
   let hebrew=0,latin=0;
   for(const item of items){
     const x=item.transform[4];
     if(shared&&(side==="left"?x>=viewport.width/2:x<viewport.width/2))continue;
     hebrew+=(item.str.match(/[\u0590-\u05ff]/g)||[]).length;
     latin+=(item.str.match(/[A-Za-z]/g)||[]).length;
   }
   results[side]=hebrew>=8&&hebrew>latin*1.4?"Hebrew":latin>=20&&latin>hebrew*2?"English":"Uncertain";
 }
 // When a selectable-text spread provides clear evidence, report it automatically.
 for(const side of ["left","right"]){
   const indicator=$(side+"-lang");
   indicator.value=results[side];
   indicator.dataset.detected=results[side];
 }
 if(Object.values(results).includes("Uncertain"))
   status("Language could not be established from selectable PDF text. Scanned images require OCR; please verify both sides before export.");
 else status("Detected languages: left "+results.left+", right "+results.right+".");
}
async function assignLayoutByLanguage(){
 const left=$("left-lang").value,right=$("right-lang").value;
 if(left==="Hebrew"&&right==="English"){
   if($("left-page").value!==$("right-page").value){
     const a=$("left-page").value;
     $("left-page").value=$("right-page").value;$("right-page").value=a;
     await Promise.all(["left","right"].map(renderSide));
     await Promise.all(["left","right"].map(detectTitle));
     await detectLanguages();
     status("Automatically placed English on the left layout and Hebrew on the right layout.");
   }else{
     const a=state.crops.left;
     state.crops.left=state.crops.right;state.crops.right=a;
     const title=$("left-title").value;$("left-title").value=$("right-title").value;$("right-title").value=title;
     sync("left");sync("right");
     // Both source halves remain on the same PDF page; their crop regions are swapped.
     $("left-lang").value="English";$("right-lang").value="Hebrew";
     status("Automatically assigned the English source half to the left layout and Hebrew to the right layout.");
   }
 }else if(left==="Uncertain"||right==="Uncertain"){
   status("Cannot confidently determine English/Hebrew placement from this source. Verify both previews before exporting.");
 }
}
async function recognizeScannedPages(){
 if(!window.Tesseract){status("OCR library unavailable. Check detected titles and languages manually.");return}
 const needs=["left","right"].filter(side=>$(side+"-lang").value==="Uncertain"||!$(side+"-title").value.trim());
 if(!needs.length)return;
 status("Analyzing scanned prayer text for language and headings...");
 for(const side of needs){
  try{
   const source=$(side+"-canvas"),c=state.crops[side],canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.round(source.width*c.w/100));
   canvas.height=Math.max(1,Math.round(source.height*c.h/100));
   canvas.getContext("2d").drawImage(source,source.width*c.x/100,source.height*c.y/100,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
   const result=await Tesseract.recognize(canvas,"heb+eng");
   const recognized=result.data.text||"",hebrew=(recognized.match(/[\u0590-\u05ff]/g)||[]).length,latin=(recognized.match(/[A-Za-z]/g)||[]).length;
   if($(side+"-lang").value==="Uncertain"){
    $(side+"-lang").value=hebrew>=10&&hebrew>latin*1.3?"Hebrew":latin>=15&&latin>hebrew*1.5?"English":"Uncertain";
   }
   if(!$(side+"-title").value.trim()){
    const lines=(result.data.lines||[]).filter(line=>line.text&&line.text.trim().length>=3);
    lines.sort((a,b)=>(a.bbox?.y0||0)-(b.bbox?.y0||0));
    const title=lines.find(line=>(line.bbox?.y0||0)<canvas.height*.23&&!/^\s*\d+\s*$/.test(line.text));
    if(title)$(side+"-title").value=title.text.trim().slice(0,85);
   }
  }catch(e){console.warn("OCR unavailable for "+side,e)}
 }
 await assignLayoutByLanguage();
 await refreshLayout();
 await recognizeScannedPages();
 if(["left","right"].some(side=>$(side+"-lang").value==="Uncertain"))
  status("OCR could not confidently identify both languages. Inspect the finished spread before download.");
 else status("OCR analysis complete. Check the automatically prepared facing spread and titles.");
}
async function detectTitle(side){
 const num=Number($(side+"-page").value),page=await state.view.getPage(num);
 const items=(await page.getTextContent()).items;
 const viewport=page.getViewport({scale:1}),shared=$("left-page").value===$("right-page").value;
 const candidates=items.filter(it=>it.str&&it.str.trim().length>2&&it.transform)
 .map(it=>({text:it.str.trim(),x:it.transform[4],y:viewport.height-it.transform[5],size:Math.abs(it.transform[0])}))
 .filter(it=>it.y>viewport.height*.035&&it.y<viewport.height*.30&&it.text.length<85)
 .filter(it=>!shared||(side==="left"?it.x<viewport.width/2:it.x>=viewport.width/2))
 .filter(it=>!/^\d+$/.test(it.text)).sort((a,b)=>b.size-a.size||a.y-b.y);
 $(side+"-title").value=candidates[0]?.text||"";
 if(!candidates.length)$("title-note").textContent="At least one title was not found in selectable PDF text. Image-only scans need OCR (not implemented); enter the title manually.";
}
async function loadSource(){
 const file=$("source").files[0];if(!file)return;
 state.raw=new Uint8Array(await file.arrayBuffer());
 const pdfjs=window.pdfjsLib;if(!pdfjs)throw Error("PDF.js failed to load. Check network or content blocker.");
 pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
 state.view=await pdfjs.getDocument({data:state.raw.slice()}).promise;
 state.count=state.view.numPages;
 for(const side of ["left","right"]){$(side+"-page").max=state.count;$(side+"-page").value=(side==="right"&&state.count>1?2:1)}
 // For separate PDF pages, begin with near-full-page crops on both.
 if(state.count>1){state.crops.left={x:5,y:6,w:90,h:88};state.crops.right={x:5,y:6,w:90,h:88}}
 else{state.crops.left={x:4,y:8,w:42,h:84};state.crops.right={x:54,y:8,w:42,h:84}}
 await Promise.all(["left","right"].map(renderSide));
 await Promise.all(["left","right"].map(detectTitle));
 await detectLanguages();
 for(const side of ["left","right"]){state.crops[side]=suggestCrop(side)||lockCrop(side,state.crops[side]);sync(side)}
 await assignLayoutByLanguage();
 await refreshLayout();

}
function cropToPdf(page,c){
 if(!validCrop(c))throw Error("Invalid crop dimensions.");
 const width=page.getWidth(),height=page.getHeight();
 // Percentages are top-left-origin in the canvas; pdf-lib uses bottom-left origin.
 return {left:width*c.x/100,right:width*(c.x+c.w)/100,top:height*(1-c.y/100),bottom:height*(1-(c.y+c.h)/100)};
}
function drawCleanTemplate(page,side){
 // Approved v1.3 geometry. This deliberately omits all development labels.
 const text=side==="left"?171.36:59.76,content=side==="left"?20.16:444.96;
 const min=Math.min(text,content),max=Math.max(text+380.88,content+146.88);
 const boxes=[[text,710,380.88,30],[text,642,380.88,64],[text,98,380.88,540],[text,46,380.88,48],[content,46,146.88,694],[min,24,max-min,18]];
 const pageNo=side==="left"?min:max-48,colorX=side==="left"?pageNo+48:pageNo-18;
 const serviceX=side==="left"?colorX+18:min;
 boxes.push([pageNo,746,48,24],[colorX,746,18,24],[serviceX,746,max-min-66,24]);
 const line=PDFLib.rgb(.26,.44,.54);
 for(const [x,y,w,h] of boxes)page.drawRectangle({x,y,width:w,height:h,borderColor:line,borderWidth:.75});
}
async function loadReviewMaster(){
 const local=$("master").files[0];let b;
 if(local)b=new Uint8Array(await local.arrayBuffer());
 else{const r=await fetch(MASTER,{cache:"no-store"});if(!r.ok)throw Error("Approved master not found on GitHub. Select a local master PDF.");b=new Uint8Array(await r.arrayBuffer())}
 if(String.fromCharCode(...b.slice(0,4))!=="%PDF")throw Error("Master file is not a PDF.");
 const doc=await PDFLib.PDFDocument.load(b);
 if(doc.getPageCount()!==2)throw Error("Master must have two pages.");
 return doc;
}
async function generate(){
 if(!state.raw)throw Error("Upload a source PDF.");
 const src=await PDFLib.PDFDocument.load(state.raw.slice());
 const review=$("guides").value==="review",out=await PDFLib.PDFDocument.create();
 const start=Number($("start-number").value);if(!Number.isInteger(start)||start<1||start>998)throw Error("Starting page number must be 1–998.");
 const font=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
 if(review){const master=await loadReviewMaster();const pages=await out.copyPages(master,[0,1]);pages.forEach(p=>out.addPage(p))}
 else{for(const side of ["left","right"]){const p=out.addPage([W,H]);drawCleanTemplate(p,side)}}
 for(let i=0;i<2;i++){
   const side=i===0?"left":"right",target=out.getPage(i),n=Number($(side+"-page").value);
   if(!Number.isInteger(n)||n<1||n>src.getPageCount())throw Error("Invalid "+side+" source page.");
   if(Math.abs(target.getWidth()-W)>1||Math.abs(target.getHeight()-H)>1)throw Error("Template must be US Letter.");
   const original=src.getPage(n-1),clip=cropToPdf(original,state.crops[side]),embedded=await out.embedPage(original,clip);
   const r=REGIONS[side],pad=8,cw=clip.right-clip.left,ch=clip.top-clip.bottom;
   const scale=Math.min((r.w-2*pad)/cw,(r.h-2*pad)/ch),dw=cw*scale,dh=ch*scale;
   const x=side==="left"?r.x+r.w-pad-dw:r.x+pad;
   const y=$("align").value==="center"?r.y+(r.h-dh)/2:r.y+r.h-pad-dh;
   // Clear the development label in review mode without changing bounding box geometry.
   if(review)target.drawRectangle({x:r.x+1,y:r.y+1,width:r.w-2,height:r.h-2,color:PDFLib.rgb(1,1,1)});
   target.drawPage(embedded,{x,y,width:dw,height:dh});
   const number=String(start+i),pageNoX=side==="left"?20.16:544.96;
   if(review)target.drawRectangle({x:pageNoX+1,y:747,width:46,height:22,color:PDFLib.rgb(1,1,1)});
   const numberWidth=font.widthOfTextAtSize(number,18);
   target.drawText(number,{x:pageNoX+24-numberWidth/2,y:751,size:18,font,color:PDFLib.rgb(.75,.12,.16)});
   const title=$(side+"-title").value.trim();
   if(title&&/^[\x20-\x7e\u00a0-\u00ff]+$/.test(title)){
     const tw=font.widthOfTextAtSize(title,16),size=Math.min(16,16*(REGIONS[side].w-12)/Math.max(tw,1));
     if(review)target.drawRectangle({x:REGIONS[side].x+1,y:711,width:REGIONS[side].w-2,height:28,color:PDFLib.rgb(1,1,1)});
     target.drawText(title,{x:REGIONS[side].x+6,y:718,size,font,color:PDFLib.rgb(.14,.23,.28)});
   }

 }
 return new Uint8Array(await out.save());
}
async function refreshLayout(){
 if(!state.raw)return;
 try{
   const bytes=await generate();
   await renderOutputSpread(bytes);
   state.output=bytes;
   $("download").disabled=false;
   status("Facing-page layout updated. Review both pages. Use Adjust source crops only if necessary.");
 }catch(e){status("Layout preview unavailable: "+e.message)}
}
async function renderOutputSpread(bytes){
 const doc=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
 if(doc.numPages!==2)throw Error("Expected exactly two output pages.");
 for(let i=0;i<2;i++){
  const page=await doc.getPage(i+1),canvas=$(i===0?"output-left":"output-right");
  const view=page.getViewport({scale:1});
  canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
  await page.render({canvasContext:canvas.getContext("2d"),viewport:view}).promise;
 }
 $("spread-preview").hidden=false;
}
for(const side of ["left","right"]){
 attachCrop(side);
 $(side+"-page").addEventListener("change",async()=>{try{await renderSide(side);state.crops[side]=suggestCrop(side)||lockCrop(side,state.crops[side]);sync(side);await detectTitle(side);await detectLanguages();await assignLayoutByLanguage();await refreshLayout()}catch(e){status(e.message)}});
}
$("source").addEventListener("change",()=>loadSource().catch(e=>status("Source error: "+e.message)));
$("generate").addEventListener("click",async()=>{
 $("generate").disabled=true;$("download").disabled=true;status("Generating...");
 try{state.output=await generate();if(state.url)URL.revokeObjectURL(state.url);
 state.url=URL.createObjectURL(new Blob([state.output],{type:"application/pdf"}));
 await renderOutputSpread(state.output);$("download").disabled=false;
 status("PDF ready. Inspect both pages. If text or page numbers are clipped incorrectly, adjust each blue crop and regenerate.");
 }catch(e){console.error(e);status("Generation failed: "+e.message)}
 finally{$("generate").disabled=false}
});
$("download").addEventListener("click",()=>{
 if(!state.output)return;
 const url=URL.createObjectURL(new Blob([state.output],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download="leaders-companion-v3-facing-siddur.pdf";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});

$("adjust-crop").addEventListener("click",()=>{const open=$("crop-editor").hidden;$("crop-editor").hidden=!open;$("adjust-crop").setAttribute("aria-expanded",String(open));$("adjust-crop").textContent=open?"Hide source crops":"Adjust source crops";for(const side of ["left","right"])sync(side)});
$("refresh-layout").addEventListener("click",refreshLayout);
for(const id of ["left-title","right-title","start-number","align","guides"])$(id).addEventListener("change",refreshLayout);
for(const side of ["left","right"])for(const input of $(side+"-fields").querySelectorAll("input"))input.addEventListener("change",refreshLayout);
