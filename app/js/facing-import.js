"use strict";
const $=id=>document.getElementById(id);
const W=612,H=792;
const REGIONS=[{x:171.36,y:98,w:380.88,h:540},{x:59.76,y:98,w:380.88,h:540}];
let output=null,filename="siddur";
function status(message){$("status").textContent=message}
function drawTemplate(page,side){
 const text=side===0?171.36:59.76,content=side===0?20.16:444.96;
 const min=Math.min(text,content),max=Math.max(text+380.88,content+146.88);
 const boxes=[[text,710,380.88,30],[text,642,380.88,64],[text,98,380.88,540],[text,46,380.88,48],[content,46,146.88,694],[min,24,max-min,18]];
 const numberX=side===0?min:max-48,colorX=side===0?numberX+48:numberX-18;
 const serviceX=side===0?colorX+18:min;
 boxes.push([numberX,746,48,24],[colorX,746,18,24],[serviceX,746,max-min-66,24]);
 for(const [x,y,w,h] of boxes)page.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.26,.44,.54),borderWidth:.75});
}
async function findTrimBoxes(bytes,count){
 const pdfjs=window.pdfjsLib;
 pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
 const doc=await pdfjs.getDocument({data:bytes.slice()}).promise,boxes=[];
 for(let n=1;n<=count;n++){
  const page=await doc.getPage(n),v=page.getViewport({scale:1.3});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport:v}).promise;
  const w=canvas.width,h=canvas.height,pixels=ctx.getImageData(0,0,w,h).data;
  const rows=new Uint32Array(h),cols=new Uint32Array(w);
  // Count dark ink, ignoring near-white scanning noise.
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
   const j=4*(y*w+x),r=pixels[j],g=pixels[j+1],b=pixels[j+2];
   if(Math.min(r,g,b)<135&&r+g+b<550){rows[y]++;cols[x]++}
  }
  const minRow=Math.max(2,Math.floor(w/380)),minCol=Math.max(2,Math.floor(h/450));
  let top=h,bottom=0,left=w,right=0;
  for(let y=0;y<h;y+=2)if(rows[y]>=minRow){top=Math.min(top,y);bottom=Math.max(bottom,y+2)}
  for(let x=0;x<w;x+=2)if(cols[x]>=minCol){left=Math.min(left,x);right=Math.max(right,x+2)}
  if(right<=left||bottom<=top){boxes.push(null);continue}
  // Identify an isolated printed heading at the top, using the blank gap
  // separating it from the prayer. Never discard a line without that gap.
  const active=[];
  for(let y=top;y<=bottom;y+=2)if(rows[y]>=minRow)active.push(y);
  const bands=[];
  for(const y of active){
   const last=bands[bands.length-1];
   if(!last||y-last.end>Math.max(8,Math.round(h*.008)))bands.push({start:y,end:y});
   else last.end=y;
  }
  if(bands.length>=2){
   const first=bands[0],second=bands[1];
   const gap=second.start-first.end;
   const headingLimit=h*.24;
   const separated=gap>=Math.max(16,Math.round(h*.018));
   const plausibleHeading=first.start<headingLimit&&first.end<headingLimit&&
      first.end-first.start<h*.065;
   if(separated&&plausibleHeading){
    top=Math.max(top,second.start-Math.max(7,Math.round(h*.008)));
   }
   // An isolated folio number at the foot can also be omitted.
   const last=bands[bands.length-1],before=bands[bands.length-2];
   if(last.start>h*.78&&last.start-before.end>Math.max(18,h*.02)&&
      last.end-last.start<h*.045)bottom=before.end+2;
  }
  // Generous safety padding protects accents, vowel points and first/last lines.
  const px=Math.max(15,Math.round(w*.025)),py=Math.max(20,Math.round(h*.03));
  left=Math.max(0,left-px);right=Math.min(w,right+px);
  top=Math.max(0,top-(bands.length>=2&&top>bands[0].start?Math.max(6,Math.round(h*.007)):py));bottom=Math.min(h,bottom+py);
  const originalWidth=page.view[2]-page.view[0],originalHeight=page.view[3]-page.view[1];
  boxes.push({left:originalWidth*left/w,right:originalWidth*right/w,
   bottom:originalHeight*(1-bottom/h),top:originalHeight*(1-top/h)});
 }
 return boxes;
}
async function createPdf(bytes){
 const source=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false});
 if(!source.getPageCount())throw Error("The PDF contains no pages.");
 const out=await PDFLib.PDFDocument.create();
 const count=Math.min(2,source.getPageCount());
 const trims=await findTrimBoxes(bytes,count);
 for(let i=0;i<count;i++){
  const page=out.addPage([W,H]);drawTemplate(page,i);
  const original=source.getPage(i);
  // Trim outer whitespace while embedding the original PDF artwork, not OCR text.
  const trim=trims[i];
  const embedded=trim?await out.embedPage(original,trim):await out.embedPage(original);
  const region=REGIONS[i],pad=6;
  const sourceWidth=trim?trim.right-trim.left:original.getWidth();
  const sourceHeight=trim?trim.top-trim.bottom:original.getHeight();
  const scale=Math.min((region.w-2*pad)/sourceWidth,(region.h-2*pad)/sourceHeight);
  const width=sourceWidth*scale,height=sourceHeight*scale;
  page.drawPage(embedded,{x:region.x+(region.w-width)/2,y:region.y+(region.h-height)/2,width,height});
 }
 return new Uint8Array(await out.save());
}
async function preview(bytes){
 const pdfjs=window.pdfjsLib;
 pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
 const doc=await pdfjs.getDocument({data:bytes.slice()}).promise;
 for(let i=0;i<2;i++){
  const canvas=$(i===0?"output-left":"output-right");
  if(i>=doc.numPages){canvas.hidden=true;continue}
  canvas.hidden=false;
  const page=await doc.getPage(i+1),viewport=page.getViewport({scale:1});
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
 }
 $("spread-preview").hidden=false;$("empty-preview").hidden=true;
}
$("source").addEventListener("change",async()=>{
 const file=$("source").files[0];if(!file)return;
 $("download").disabled=true;output=null;$("spread-preview").hidden=true;
 filename=file.name.replace(/\.pdf$/i,"")||"siddur";
 status("Importing pages...");
 try{
  if(!window.PDFLib||!window.pdfjsLib)throw Error("PDF libraries could not load. Check your connection.");
  output=await createPdf(new Uint8Array(await file.arrayBuffer()));
  await preview(output);
  $("download").disabled=false;
  status("PDF ready. Outer margins trimmed; separated printed headings and footer folios removed when detectable.");
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("download").addEventListener("click",()=>{
 if(!output)return;
 const url=URL.createObjectURL(new Blob([output],{type:"application/pdf"}));
 const link=document.createElement("a");link.href=url;link.download=filename+"-v3.pdf";
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
});
