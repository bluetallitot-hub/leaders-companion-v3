"use strict";
const el=id=>document.getElementById(id);
let built=null,previewUrl=null;
const MASTER="../../docs/master-template/Leaders_Companion_V3_Master_Template_v1.3_Blank.pdf";
const regions={
 left:{x:171.36,y:98,w:380.88,h:540},
 right:{x:59.76,y:98,w:380.88,h:540}
};
function status(message){el("status").textContent=message}
function bytes(buffer){return new Uint8Array(buffer)}
async function readMaster(){
 const f=el("master").files[0];
 if(f)return bytes(await f.arrayBuffer());
 const response=await fetch(MASTER,{cache:"no-store"});
 if(!response.ok)throw Error("Approved master PDF not found in GitHub (HTTP "+response.status+"). Upload it to docs/master-template/ or select a local copy.");
 const b=bytes(await response.arrayBuffer());
 if(b[0]!==37||b[1]!==80||b[2]!==68||b[3]!==70)throw Error("Master path did not return a PDF.");
 return b;
}
function splitCrop(page,which,englishSide,split){
 const W=page.getWidth(),H=page.getHeight(),cut=W*split/100;
 const half=which==="english"?englishSide:(englishSide==="left"?"right":"left");
 const x0=half==="left"?0:cut,x1=half==="left"?cut:W;
 return {left:x0,bottom:0,right:x1,top:H};
}
async function build(){
 if(!window.PDFLib)throw Error("PDF library failed to load.");
 const file=el("source").files[0];if(!file)throw Error("Choose a source PDF first.");
 const n=Number(el("source-page").value),split=Number(el("split").value);
 if(!Number.isInteger(n)||n<1)throw Error("Invalid source page.");
 if(!Number.isFinite(split)||split<20||split>80)throw Error("Split must be between 20% and 80%.");
 const source=await PDFLib.PDFDocument.load(bytes(await file.arrayBuffer()));
 if(n>source.getPageCount())throw Error("Source PDF contains only "+source.getPageCount()+" pages.");
 const master=await PDFLib.PDFDocument.load(await readMaster());
 if(master.getPageCount()!==2)throw Error("Approved master must contain exactly two pages.");
 const sourcePage=source.getPage(n-1),W=sourcePage.getWidth(),H=sourcePage.getHeight();
 if(W<=0||H<=0)throw Error("Source page has invalid dimensions.");
 const englishSide=el("english").value;
 const order=el("page-order").value==="english-left"?["english","hebrew"]:["hebrew","english"];
 const out=await PDFLib.PDFDocument.create();
 const [leftMaster,rightMaster]=await out.copyPages(master,[0,1]);
 out.addPage(leftMaster);out.addPage(rightMaster);
 for(let i=0;i<2;i++){
   const target=out.getPage(i),r=i===0?regions.left:regions.right;
   if(Math.abs(target.getWidth()-612)>1||Math.abs(target.getHeight()-792)>1)throw Error("Master pages must be US Letter.");
   const crop=splitCrop(sourcePage,order[i],englishSide,split);
   const embedded=await out.embedPage(sourcePage,crop);
   const cw=crop.right-crop.left,ch=crop.top-crop.bottom;
   const inset=8,availW=r.w-2*inset,availH=r.h-2*inset;
   const scale=Math.min(availW/cw,availH/ch);
   const dw=cw*scale,dh=ch*scale;
   // Opaque white background hides the blank template's box label inside the image region.
   // The approved box boundary is retained; no other master regions are changed.
   target.drawRectangle({x:r.x+1,y:r.y+1,width:r.w-2,height:r.h-2,color:PDFLib.rgb(1,1,1)});
   target.drawPage(embedded,{x:r.x+(r.w-dw)/2,y:r.y+(r.h-dh)/2,width:dw,height:dh});
 }
 return bytes(await out.save());
}
el("source").addEventListener("change",async()=>{const f=el("source").files[0];if(!f)return;try{const d=await PDFLib.PDFDocument.load(bytes(await f.arrayBuffer()));el("source-page").max=d.getPageCount();el("info").textContent=f.name+" — "+d.getPageCount()+" PDF page(s). Choose the physical page containing both facing Siddur pages."}catch(e){status("Cannot read source: "+e.message)}});
el("generate").addEventListener("click",async()=>{
 el("generate").disabled=true;el("download").disabled=true;built=null;status("Generating PDF…");
 try{built=await build();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([built],{type:"application/pdf"}));el("preview").src=previewUrl;el("preview").hidden=false;el("download").disabled=false;status("Two-page PDF ready. Inspect both pages and download when satisfied.");}
 catch(e){console.error(e);status("Unable to generate: "+e.message)}
 finally{el("generate").disabled=false}
});
el("download").addEventListener("click",()=>{
 if(!built)return;const url=URL.createObjectURL(new Blob([built],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download="leaders-companion-v3-facing-siddur.pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});