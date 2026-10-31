"use strict";
const $=id=>document.getElementById(id);
const W=612,H=792,REGIONS=[{x:171.36,y:98,w:380.88,h:540},{x:59.76,y:98,w:380.88,h:540}];
let output=null,filename="siddur";
function status(s){$("status").textContent=s}
const workerURL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
function drawTemplate(page,side){
 const text=side===0?171.36:59.76,content=side===0?20.16:444.96;
 const min=Math.min(text,content),max=Math.max(text+380.88,content+146.88);
 const boxes=[[text,710,380.88,30],[text,642,380.88,64],[text,98,380.88,540],[text,46,380.88,48],[content,46,146.88,694],[min,24,max-min,18]];
 const numberX=side===0?min:max-48,colorX=side===0?numberX+48:numberX-18;
 boxes.push([numberX,746,48,24],[colorX,746,18,24],[side===0?colorX+18:min,746,max-min-66,24]);
 for(const [x,y,w,h] of boxes)page.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.26,.44,.54),borderWidth:.75});
}
function inkBands(rows,threshold,gap){
 const bands=[];
 for(let y=0;y<rows.length;y++)if(rows[y]>=threshold){
  const last=bands[bands.length-1];
  if(!last||y-last.end>gap)bands.push({start:y,end:y});
  else last.end=y;
 }
 return bands;
}
function cleanPixels(canvas){
 const ctx=canvas.getContext("2d",{willReadFrequently:true}),w=canvas.width,h=canvas.height;
 const image=ctx.getImageData(0,0,w,h),p=image.data,lum=new Uint8Array(w*h);
 // Paper normalization: flatten light scan backgrounds and raise text contrast.
 for(let i=0;i<lum.length;i++){
  const j=i*4,gray=Math.round(.299*p[j]+.587*p[j+1]+.114*p[j+2]);
  lum[i]=gray;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,g=lum[i];
  // Gentle unsharp mask; suppress tiny isolated scanner specks.
  let avg=g;
  if(x>0&&y>0&&x<w-1&&y<h-1){
   avg=(lum[i-1]+lum[i+1]+lum[i-w]+lum[i+w]+4*g)/8;
  }
  let value=g>215?255:g<65?Math.max(0,g*.55):Math.min(255,Math.max(0,(g-65)*1.48+35));
  if(g<=215)value=Math.max(0,Math.min(255,value+(g-avg)*.55));
  if(g<140&&x>0&&y>0&&x<w-1&&y<h-1){
   const neighbors=[lum[i-1],lum[i+1],lum[i-w],lum[i+w]].filter(v=>v<175).length;
   if(neighbors===0&&g>85)value=255;
  }
  p[j]=p[j+1]=p[j+2]=Math.round(value);p[j+3]=255;
 }
 ctx.putImageData(image,0,0);
}
function canvasCrop(source,box){
 const c=document.createElement("canvas");
 c.width=Math.max(1,box.right-box.left);c.height=Math.max(1,box.bottom-box.top);
 c.getContext("2d").drawImage(source,box.left,box.top,c.width,c.height,0,0,c.width,c.height);
 return c;
}
async function readMetadata(source,pageIndex,canvas,bands){
 const page=await source.getPage(pageIndex+1),v=page.getViewport({scale:1.5});
 let textItems=[];
 try{textItems=(await page.getTextContent()).items||[]}catch(e){}
 const topText=textItems.filter(t=>t.transform&&t.transform[5]>v.height/1.5*.73)
  .map(t=>String(t.str||"").trim()).filter(Boolean);
 let heading="",number="",language="unknown";
 const textAll=textItems.map(t=>String(t.str||"")).join(" ");
 if(/[\u0590-\u05ff]/u.test(textAll))language="Hebrew";
 else if(/[a-z]{3}/i.test(textAll))language="English";
 const textNumber=topText.find(t=>/^\d{1,4}$/.test(t));
 if(textNumber)number=textNumber;
 heading=topText.find(t=>t!==number&&/[\p{L}]/u.test(t))||"";
 let ocrLines=[];
 if(window.Tesseract){
  try{
   const strip=canvasCrop(canvas,{left:0,top:0,right:canvas.width,bottom:Math.min(canvas.height,Math.round(canvas.height*.30))});
   const result=await Tesseract.recognize(strip,"heb+eng");
   ocrLines=(result.data.lines||[]).map(l=>({text:(l.text||"").trim(),bbox:l.bbox,confidence:l.confidence||0})).filter(l=>l.text);
   if(!ocrLines.length&&result.data.text)ocrLines=result.data.text.split(/\n/).map(t=>({text:t.trim(),bbox:null,confidence:0})).filter(l=>l.text);
  }catch(e){console.warn("OCR unavailable:",e)}
 }
 const candidateNumbers=ocrLines.filter(l=>/^\d{1,4}$/.test(l.text)&&l.confidence>=40);
 if(!number&&candidateNumbers.length===1)number=candidateNumbers[0].text;
 if(!heading){
  const candidates=ocrLines.filter(l=>/[\p{L}]/u.test(l.text)&&l.text!==number);
  if(candidates.length)heading=candidates[0].text;
 }
 if(language==="unknown"){
  const sample=ocrLines.map(l=>l.text).join(" ");
  language=/[\u0590-\u05ff]/u.test(sample)?"Hebrew":/[a-z]{3}/i.test(sample)?"English":"unknown";
 }
 return {number,heading,language,ocrLines};
}
function detectCrop(canvas,meta){
 const w=canvas.width,h=canvas.height,ctx=canvas.getContext("2d",{willReadFrequently:true});
 const p=ctx.getImageData(0,0,w,h).data,rows=new Uint32Array(h),cols=new Uint32Array(w);
 for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
  const i=(y*w+x)*4;
  if(p[i]<165&&p[i+1]<165&&p[i+2]<165){rows[y]++;cols[x]++}
 }
 const bands=inkBands(rows,Math.max(2,Math.round(w/420)),Math.max(6,Math.round(h*.006)));
 if(!bands.length)return {left:0,top:0,right:w,bottom:h};
 let top=bands[0].start,bottom=bands[bands.length-1].end;
 // Remove a header only if a distinct gap isolates it from the prayer.
 if(bands.length>1){
  const a=bands[0],b=bands[1],gap=b.start-a.end;
  if(a.start<h*.23&&a.end-a.start<h*.065&&gap>Math.max(17,h*.018))top=b.start;
  const last=bands[bands.length-1],prev=bands[bands.length-2];
  if(last.start>h*.8&&last.start-prev.end>Math.max(18,h*.025)&&last.end-last.start<h*.045)bottom=prev.end;
 }
 // OCR coordinates can identify a folio/header that the projection alone misses.
 const lines=meta.ocrLines.filter(l=>l.bbox&&l.bbox.y1<h*.28);
 const folio=lines.find(l=>l.text===meta.number);
 const title=lines.find(l=>l.text===meta.heading);
 const removable=[folio,title].filter(Boolean);
 if(removable.length){
  const end=Math.max(...removable.map(l=>l.bbox.y1));
  const body=bands.find(b=>b.start>end+Math.max(10,h*.009));
  if(body&&body.start<h*.40&&body.start-end>Math.max(12,h*.012))top=Math.max(top,body.start);
 }
 let left=w,right=0;
 for(let x=0;x<w;x+=2)if(cols[x]>=Math.max(2,Math.round(h/480))){left=Math.min(left,x);right=Math.max(right,x+2)}
 if(right<=left){left=0;right=w}
 const padX=Math.max(12,Math.round(w*.02)),padY=Math.max(8,Math.round(h*.009));
 return {left:Math.max(0,left-padX),right:Math.min(w,right+padX),
  top:Math.max(0,top-padY),bottom:Math.min(h,bottom+Math.max(15,Math.round(h*.02)))};
}
function storePageMetadata(page,meta){
 const d=page.node,ctx=page.doc.context;
 const fields={LCOriginalPageNumber:meta.number,LCLanguage:meta.language,LCOriginalHeadingOCR:meta.heading};
 for(const [name,value] of Object.entries(fields))d.set(PDFLib.PDFName.of(name),PDFLib.PDFHexString.fromText(value||""));
}
async function createPdf(bytes){
 const source=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
 const out=await PDFLib.PDFDocument.create(),count=Math.min(2,source.numPages);
 if(!count)throw Error("No PDF pages found.");
 const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
 for(let i=0;i<count;i++){
  status("Processing page "+(i+1)+" of "+count+"...");
  const src=await source.getPage(i+1),v=src.getViewport({scale:2});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  await src.render({canvasContext:ctx,viewport:v}).promise;
  const meta=await readMetadata(source,i,canvas);
  const crop=detectCrop(canvas,meta),cleaned=canvasCrop(canvas,crop);
  cleanPixels(cleaned);
  const png=await out.embedPng(await (await fetch(cleaned.toDataURL("image/png"))).arrayBuffer());
  const page=out.addPage([W,H]);drawTemplate(page,i);storePageMetadata(page,meta);
  const r=REGIONS[i],pad=6,scale=Math.min((r.w-2*pad)/png.width,(r.h-2*pad)/png.height);
  const dw=png.width*scale,dh=png.height*scale;
  page.drawImage(png,{x:r.x+(r.w-dw)/2,y:r.y+(r.h-dh)/2,width:dw,height:dh});
  if(meta.number){
   const x=i===0?20.16:544.96;
   const tw=font.widthOfTextAtSize(meta.number,18);
   page.drawText(meta.number,{x:x+24-tw/2,y:751,font,size:18,color:PDFLib.rgb(.75,.12,.16)});
  }
 }
 return new Uint8Array(await out.save());
}
async function preview(bytes){
 const doc=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
 for(let i=0;i<2;i++){
  const canvas=$(i===0?"output-left":"output-right");
  if(i>=doc.numPages){canvas.hidden=true;continue}
  canvas.hidden=false;
  const page=await doc.getPage(i+1),v=page.getViewport({scale:1});
  canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  await page.render({canvasContext:canvas.getContext("2d"),viewport:v}).promise;
 }
 $("spread-preview").hidden=false;$("empty-preview").hidden=true;
}
pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
$("source").addEventListener("change",async()=>{
 const file=$("source").files[0];if(!file)return;
 $("download").disabled=true;output=null;$("spread-preview").hidden=true;
 filename=file.name.replace(/\.pdf$/i,"")||"siddur";
 try{
  if(!window.PDFLib||!window.pdfjsLib)throw Error("PDF libraries unavailable.");
  output=await createPdf(new Uint8Array(await file.arrayBuffer()));
  await preview(output);$("download").disabled=false;
  status("PDF ready. Trimmed and cleaned, with detected page numbers and embedded page metadata.");
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("download").addEventListener("click",()=>{
 if(!output)return;
 const url=URL.createObjectURL(new Blob([output],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=filename+"-v3.pdf";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
