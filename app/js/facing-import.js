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
async function createPdf(bytes){
 const source=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false});
 if(!source.getPageCount())throw Error("The PDF contains no pages.");
 const out=await PDFLib.PDFDocument.create();
 const count=Math.min(2,source.getPageCount());
 for(let i=0;i<count;i++){
  const page=out.addPage([W,H]);drawTemplate(page,i);
  const original=source.getPage(i);
  // Keep the entire printed page, including its original page number.
  // Never crop or reconstruct the Hebrew letters or nikkud.
  const embedded=await out.embedPage(original);
  const region=REGIONS[i],pad=6;
  const scale=Math.min((region.w-2*pad)/original.getWidth(),(region.h-2*pad)/original.getHeight());
  const width=original.getWidth()*scale,height=original.getHeight()*scale;
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
  status("PDF ready. The original Siddur pages are preserved without cropping.");
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("download").addEventListener("click",()=>{
 if(!output)return;
 const url=URL.createObjectURL(new Blob([output],{type:"application/pdf"}));
 const link=document.createElement("a");link.href=url;link.download=filename+"-v3.pdf";
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
});
