"use strict";
const $=id=>document.getElementById(id);
const W=612,H=792,REGIONS=[{x:171.36,y:98,w:380.88,h:540},{x:59.76,y:98,w:380.88,h:540}];
let output=null,filename="siddur",pageMetadata=[],roleConfig=null,highlightDraft=null,importedCues=[];
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
 const image=ctx.getImageData(0,0,w,h),p=image.data;
 const gray=new Uint8Array(w*h);
 for(let i=0;i<gray.length;i++){
  const j=i*4;gray[i]=Math.round(.299*p[j]+.587*p[j+1]+.114*p[j+2]);
 }
 // Estimate the paper tone locally using a coarse, high-percentile grid.
 // High percentiles exclude most ink, allowing yellowed and uneven scans to flatten.
 const cell=48,gw=Math.ceil(w/cell),gh=Math.ceil(h/cell),paper=new Float32Array(gw*gh);
 for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
  const histogram=new Uint32Array(256);
  let n=0;
  for(let y=gy*cell;y<Math.min(h,(gy+1)*cell);y+=3)
   for(let x=gx*cell;x<Math.min(w,(gx+1)*cell);x+=3){histogram[gray[y*w+x]]++;n++}
  let seen=0,level=255;
  for(let v=255;v>=0;v--){seen+=histogram[v];if(seen>=n*.18){level=v;break}}
  paper[gy*gw+gx]=Math.max(170,level);
 }
 const normalized=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  const gy=Math.min(gh-1,Math.floor(y/cell)),gy2=Math.min(gh-1,gy+1),fy=(y%cell)/cell;
  for(let x=0;x<w;x++){
   const gx=Math.min(gw-1,Math.floor(x/cell)),gx2=Math.min(gw-1,gx+1),fx=(x%cell)/cell;
   const a=paper[gy*gw+gx],b=paper[gy*gw+gx2],c=paper[gy2*gw+gx],d=paper[gy2*gw+gx2];
   const background=a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;
   const value=gray[y*w+x]*255/Math.max(165,background);
   // Stronger background whitening with a soft transition for thin strokes.
   normalized[y*w+x]=Math.max(0,Math.min(255,Math.round(value)));
  }
 }
 // Contrast curve tuned for aged letterpress scans: stronger blacks, white
 // paper, but continuous gray antialiasing at thin letter and nikkud edges.
 // No binary thresholding, connected-component removal, or morphology.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,g=normalized[i];
  let mean=g;
  if(x>0&&x<w-1&&y>0&&y<h-1)
   mean=(normalized[i-1]+normalized[i+1]+normalized[i-w]+normalized[i+w]+4*g)/8;
  const sharpen=Math.max(0,Math.min(255,g+(g-mean)*1.35));
  let value;
  if(sharpen>=213)value=255;
  else if(sharpen<=100)value=sharpen*.34;
  else{
   const t=(sharpen-100)/113;
   // Continuous transition from deep ink to pure white.
   value=34+221*(t*t*(3-2*t));
  }
  const v=Math.max(0,Math.min(255,Math.round(value)));
  p[j]=p[j+1]=p[j+2]=v;p[j+3]=255;
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
 let heading="",runningHeader="",number="",language="unknown";
 const textAll=textItems.map(t=>String(t.str||"")).join(" ");
 if(/[\u0590-\u05ff]/u.test(textAll))language="Hebrew";
 else if(/[a-z]{3}/i.test(textAll))language="English";
 const textNumber=topText.find(t=>/^\d{1,4}$/.test(t));
 if(textNumber)number=textNumber;
 // The topmost line is a running header, not necessarily a prayer heading.
 runningHeader=topText.find(t=>t!==number&&/[\p{L}]/u.test(t))||"";
 let ocrLines=[];
 // Identify the script from the body, not the bilingual/numbered running header.
 if(window.Tesseract){
  try{
   const body=canvasCrop(canvas,{left:Math.floor(canvas.width*.12),
    right:Math.ceil(canvas.width*.88),top:Math.floor(canvas.height*.22),
    bottom:Math.ceil(canvas.height*.76)});
   const sample=await Tesseract.recognize(body,"heb+eng");
   const raw=sample.data.text||"";
   const heb=(raw.match(/[\u0590-\u05ff]/g)||[]).length;
   const eng=(raw.match(/[A-Za-z]/g)||[]).length;
   if(heb>eng*1.2)language="Hebrew";
   else if(eng>heb*1.2)language="English";
  }catch(e){console.warn("Body language OCR unavailable",e)}
 }
 // The printed running header occupies the top band. Never infer a
 // section heading from the following line: it may be the first prayer line.
 // Retain the OCR running header only; a distinct section heading remains
 // unassigned until layout-aware classification can verify it.
 if(window.Tesseract&&language!=="unknown"){
  const w=canvas.width,h=canvas.height,ocrLang=language==="Hebrew"?"heb":"eng";
  try{
   const region=canvasCrop(canvas,{left:Math.floor(w*.09),right:Math.ceil(w*.91),
    top:0,bottom:Math.ceil(h*.075)});
   const ctx=region.getContext("2d");
   ctx.fillStyle="#fff";
   const maskW=Math.ceil(region.width*.24);
   ctx.fillRect(0,0,maskW,Math.ceil(h*.07));
   ctx.fillRect(region.width-maskW,0,maskW,Math.ceil(h*.07));
   const result=await Tesseract.recognize(region,ocrLang);
   const lines=(result.data.text||"").split(/\n/).map(t=>t.trim())
    .filter(t=>language==="Hebrew"?/[\u0590-\u05ff]/.test(t):/[A-Za-z]/.test(t));
   if(lines.length)runningHeader=lines[0];
  }catch(e){console.warn("Language-specific running header OCR unavailable",e)}
 }
 // Tight folio crops: verified against the scanned 159 Hebrew/English test pair.
 // Use digit-only single-line OCR; the heading must not share the OCR region.
 if(!number&&window.Tesseract){
  const w=canvas.width,h=canvas.height;
  const right=[.73,.94],left=[.06,.27];
  const corners=language==="Hebrew"?[right,left]:[left,right];
  let worker=null;
  try{
   worker=await Tesseract.createWorker("eng");
   await worker.setParameters({
    tessedit_char_whitelist:"0123456789",
    tessedit_pageseg_mode:"7"
   });
   const recognize=async(range,heightFraction)=>{
    const strip=canvasCrop(canvas,{left:Math.floor(w*range[0]),right:Math.ceil(w*range[1]),
     top:0,bottom:Math.ceil(h*heightFraction)});
    const enlarged=document.createElement("canvas");
    enlarged.width=strip.width*4;enlarged.height=strip.height*4;
    const context=enlarged.getContext("2d");
    context.imageSmoothingEnabled=true;
    context.drawImage(strip,0,0,enlarged.width,enlarged.height);
    const result=await worker.recognize(enlarged);
    const digits=(result.data.text||"").replace(/\s/g,"");
    return /^\d{1,4}$/.test(digits)?digits:"";
   };
   for(const corner of corners){
    number=await recognize(corner,.09);
    if(number)break;
   }
   if(!number){
    for(const corner of corners){
     number=await recognize(corner,.15);
     if(number)break;
    }
   }
  }catch(e){console.warn("Digit-specific folio OCR unavailable",e)}
  finally{if(worker)await worker.terminate()}
 }
 return {number,heading,runningHeader,language,ocrLines};
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
function makeIntakeRecord(meta,sourceIndex){
 const code=meta.language==="Hebrew"?"H":meta.language==="English"?"E":meta.language==="Mixed"?"H+E":null;
 const pageNumber=meta.number||null;
 return {
  schema:"leaders-companion-v3-page-intake",schemaVersion:1,
  source:{sourceId:null,sourceFilename:filename+".pdf",sourcePdfPage:sourceIndex+1,
   originalPageNumber:pageNumber,sourcePage:pageNumber&&code?pageNumber+code:null,
   languageCode:code,language:meta.language||"unknown",
   originalHeadingOCR:meta.heading||null,runningHeaderOCR:meta.runningHeader||null},
  identification:{prayerName:null,unitType:null,serviceCode:null,cueId:null,binderOrder:null},
  leadership:{role:null,roleReviewNeeded:true,highlight:null,cues:[],highlights:[]},
  production:{paperClass:null,color:null,melodyId:null,sourceTextRegion:"V3 Siddur Text",
   background:"white",imageCleanup:"local paper whitening, enhanced ink contrast, edge-preserving sharpening",
   headerRemoved:"automatic detection",originalPageNumberDisplayed:Boolean(pageNumber)},
  intake:{status:pageNumber&&code&&meta.heading?"processed-unreviewed":"needs-metadata-review",
   pageNumberDetected:Boolean(pageNumber),languageDetected:Boolean(code),
   headingDetected:Boolean(meta.heading),reviewed:false}
 };
}
function storeMasterRoles(doc){
 const catalog=JSON.stringify({schema:"leaders-companion-v3-role-catalog",schemaVersion:1,roles:roleConfig?[roleConfig]:[]});
 doc.catalog.set(PDFLib.PDFName.of("LCRoleCatalog"),PDFLib.PDFHexString.fromText(catalog));
}
function parseCsv(text){
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
 else if(c===','&&!quoted){row.push(cell);cell=""}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=""}
 else cell+=c}
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 const headers=(rows.shift()||[]).map(v=>v.replace(/^\uFEFF/,"").trim().toLowerCase());
 return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}
function applyImportedCues(){
 if(!pageMetadata.length)return;
 for(const record of pageMetadata){
  const code=record.source.languageCode,number=record.source.originalPageNumber;
  const matches=importedCues.filter(c=>String(c.printed_page)===String(number)&&c.language?.toUpperCase()===code);
  record.leadership.cues=matches.map((c,i)=>({
   cueId:c.cue_id||c.test_id||"import-"+i,service:c.service||null,role:c.role||null,
   style:c.style||null,styleSlot:null,startCue:c.begin_cue||"",endCue:c.end_cue||"",
   prayer:c.prayer||null,sourceRow:c.leader_map_source_row||null,
   highlights:[],matchStatus:"unmatched-review-required"
  }));
  if(matches.length){record.identification.serviceCode=matches[0].service||null;
   record.identification.prayerName=matches[0].prayer||null;
   record.identification.cueId=matches[0].cue_id||matches[0].test_id||null;}
 }
 displayMetadata();
 const count=pageMetadata.reduce((n,p)=>n+(p.leadership.cues||[]).length,0);
 status(count+" cues attached to pages; start/end positions require manual review. No automatic text matching has occurred.");
}
// Lightweight in-memory line geometry: no SIP/SGM/CIP sidecars.
let detectedLines=[[],[]];
function detectPrintedLines(canvas,side){
 const ctx=canvas.getContext("2d",{willReadFrequently:true}),w=canvas.width,h=canvas.height;
 const pixels=ctx.getImageData(0,0,w,h).data,region=REGIONS[side],result=[];
 const x0=Math.round(region.x),x1=Math.round(region.x+region.w),y0=Math.round(H-region.y-region.h),y1=Math.round(H-region.y);
 // Each half is scanned independently to avoid bridging Hebrew columns.
 const slices=pageMetadata[side]?.source?.languageCode==="H"?[[.02,.49],[.51,.98]]:[[.02,.98]];
 for(let column=0;column<slices.length;column++){
  const [from,to]=slices[column],left=Math.round(x0+region.w*from),right=Math.round(x0+region.w*to);
  const rows=[];
  for(let y=y0;y<y1;y++){
   let n=0;
   for(let x=left;x<right;x+=2){const j=(y*w+x)*4;if(pixels[j]<145)n++}
   rows.push(n);
  }
  const threshold=Math.max(3,Math.floor((right-left)/95));
  let start=-1,last=-1;
  const emit=()=>{
   if(start<0)return;
   if(last-start<2||last-start>37){start=-1;return}
   let minX=right,maxX=left;
   for(let y=y0+start;y<=y0+last;y++)for(let x=left;x<right;x++){
    const j=(y*w+x)*4;if(pixels[j]<145){minX=Math.min(minX,x);maxX=Math.max(maxX,x)}
   }
   if(maxX-minX>18){
    const pad=3;
    result.push({id:"line-"+column+"-"+start,column,
      x:Math.max(0,minX-pad)/w,y:Math.max(0,y0+start-2)/h,
      width:Math.min(w,maxX+pad)-Math.max(0,minX-pad),height:Math.min(h,y0+last+3)-Math.max(0,y0+start-2)});
    const item=result[result.length-1];item.width/=w;item.height/=h;
   }
   start=-1;
  };
  for(let j=0;j<rows.length;j++){
   if(rows[j]>=threshold){if(start<0)start=j;last=j}
   else if(start>=0&&j-last>3)emit();
  }
  emit();
 }
 return result;
}
function roleColor(role){
 const r=String(role||"").toUpperCase();
 return r.includes("RABBI")?"#F5D03C":r.includes("PRESIDENT")?"#5C9CE8":r.includes("READER")?"#66C78B":r.includes("SOLO")?"#F0A2CA":"#F5D03C";
}
function drawHighlights(){
 for(let i=0;i<2;i++){
  const overlay=$("highlight-"+i),base=$(i===0?"output-left":"output-right");
  if(!overlay||!base)return;
  overlay.width=base.width;overlay.height=base.height;
  const ctx=overlay.getContext("2d");ctx.clearRect(0,0,overlay.width,overlay.height);
  const selected=new Set((pageMetadata[i]?.leadership?.highlights||[]).map(h=>h.lineId));
  for(const line of detectedLines[i]){
   const active=selected.has(line.id);
   ctx.fillStyle=active?roleColor(pageMetadata[i]?.leadership?.cues?.[0]?.role||pageMetadata[i]?.leadership?.role)+"65":"rgba(24,105,160,.07)";
   ctx.strokeStyle=active?"rgba(25,80,45,.65)":"rgba(25,105,160,.16)";
   ctx.lineWidth=active?1.1:.55;
   const x=line.x*overlay.width,y=line.y*overlay.height,ww=line.width*overlay.width,hh=line.height*overlay.height;
   ctx.fillRect(x,y,ww,hh);ctx.strokeRect(x,y,ww,hh);
  }
 }
}
function installHighlightSelection(){
 for(let i=0;i<2;i++){
  const layer=$("highlight-"+i);let start=null;
  const point=e=>{const b=layer.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height}};
  const nearest=p=>{
   const lines=detectedLines[i]||[];
   const inside=lines.filter(l=>p.x>=l.x-.01&&p.x<=l.x+l.width+.01&&p.y>=l.y-.007&&p.y<=l.y+l.height+.007);
   if(inside.length)return inside[0];
   return lines.filter(l=>p.x>=l.x-.02&&p.x<=l.x+l.width+.02)
    .sort((a,b)=>Math.abs(p.y-a.y-a.height/2)-Math.abs(p.y-b.y-b.height/2))[0]||null;
  };
  layer.addEventListener("pointerdown",e=>{if(!pageMetadata[i])return;start=nearest(point(e));if(start)layer.setPointerCapture(e.pointerId)});
  layer.addEventListener("pointerup",e=>{
   if(!start||!pageMetadata[i])return;
   const end=nearest(point(e))||start,lines=detectedLines[i];
   const a=lines.indexOf(start),b=lines.indexOf(end),chosen=a===b?[start]:lines.slice(Math.min(a,b),Math.max(a,b)+1).filter(l=>l.column===start.column);
   const highlights=pageMetadata[i].leadership.highlights;
   for(const line of chosen){
    const old=highlights.findIndex(h=>h.lineId===line.id);
    if(old>=0)highlights.splice(old,1);
    else highlights.push({highlightId:"HL-"+line.id,lineId:line.id,roleId:pageMetadata[i].leadership.cues[0]?.role||roleConfig.id,
     x:line.x,y:line.y,width:line.width,height:line.height,coordinateSystem:"normalized-top-left",visibleInPdf:false});
   }
   start=null;drawHighlights();
   status(highlights.length+" snapped lines selected on "+(i===0?"English/left":"Hebrew/right")+" page. Download to embed selections in PDF metadata.");
  });
  layer.addEventListener("pointercancel",()=>{start=null});
 }
}
async function syncHighlightMetadata(){
 if(!output)return;
 const doc=await PDFLib.PDFDocument.load(output);
 storeMasterRoles(doc);
 doc.getPages().forEach((page,i)=>storePageMetadata(page,pageMetadata[i]));
 output=new Uint8Array(await doc.save());
}
function storePageMetadata(page,record){
 // Single self-contained page-associated record. No external JSON or sidecar.
 const d=page.node,fields={
  LCIntakeRecord:JSON.stringify(record),
  LCOriginalPageNumber:record.source.originalPageNumber||"",
  LCSourcePage:record.source.sourcePage||"",
  LCLanguage:record.source.language,
  LCLanguageCode:record.source.languageCode||"",
  LCOriginalHeadingOCR:record.source.originalHeadingOCR||"",
  LCRunningHeaderOCR:record.source.runningHeaderOCR||"",
  LCSourceFilename:record.source.sourceFilename,
  LCSourcePdfPage:String(record.source.sourcePdfPage),
  LCIntakeStatus:record.intake.status
 };
 for(const [name,value] of Object.entries(fields))
  d.set(PDFLib.PDFName.of(name),PDFLib.PDFHexString.fromText(value));
}
async function createPdf(bytes){
 const source=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
 const out=await PDFLib.PDFDocument.create(),count=Math.min(2,source.numPages);
 if(!count)throw Error("No PDF pages found.");
 const font=await out.embedFont(PDFLib.StandardFonts.Helvetica),records=[];
 for(let i=0;i<count;i++){
  status("Processing source page "+(i+1)+" of "+count+"...");
  const src=await source.getPage(i+1),v=src.getViewport({scale:2});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  await src.render({canvasContext:ctx,viewport:v}).promise;
  const meta=await readMetadata(source,i,canvas);
  const crop=detectCrop(canvas,meta),cleaned=canvasCrop(canvas,crop);
  cleanPixels(cleaned);
  const png=await out.embedPng(await (await fetch(cleaned.toDataURL("image/png"))).arrayBuffer());
  records.push({meta,png,sourceIndex:i});
 }
 // English is the left facing page; Hebrew is the right facing page.
 if(records.length===2&&records[0].meta.language==="Hebrew"&&records[1].meta.language==="English")records.reverse();
 pageMetadata=records.map(r=>makeIntakeRecord(r.meta,r.sourceIndex));
 pageMetadata.forEach(r=>{r.leadership.highlights=[];r.leadership.role=roleConfig.id});
 applyImportedCues();
 storeMasterRoles(out);
 for(let i=0;i<records.length;i++){
  const {meta,png}=records[i],page=out.addPage([W,H]);
  drawTemplate(page,i);storePageMetadata(page,pageMetadata[i]);
  const r=REGIONS[i],pad=6,scale=Math.min((r.w-2*pad)/png.width,(r.h-2*pad)/png.height);
  const dw=png.width*scale,dh=png.height*scale;
  page.drawImage(png,{x:r.x+(r.w-dw)/2,y:r.y+(r.h-dh)/2,width:dw,height:dh});
  if(meta.number){
   const x=i===0?20.16:544.96,tw=font.widthOfTextAtSize(meta.number,18);
   page.drawText(meta.number,{x:x+24-tw/2,y:751,font,size:18,color:PDFLib.rgb(.75,.12,.16)});
  }
 }
 return new Uint8Array(await out.save());
}
function displayMetadata(){
 for(let i=0;i<2;i++){
  const panel=$(i===0?"metadata-left":"metadata-right"),record=pageMetadata[i];
  panel.hidden=!record;if(!record)continue;
  const source=record.source,ident=record.identification,intake=record.intake;
  const fields=[
   ["Original page number",source.originalPageNumber||"Not detected"],
   ["Language",source.language],["Page convention",source.sourcePage||"Not detected"],
   ["Original heading (OCR)",source.originalHeadingOCR||"Not reliably detected"],
   ["Running header (OCR)",source.runningHeaderOCR||"Not detected"],
   ["Source PDF",source.sourceFilename],["Source PDF page",String(source.sourcePdfPage)],
   ["Source ID",source.sourceId||"Unassigned"],
   ["Prayer / unit",ident.prayerName||"Unassigned"],
   ["Service code",ident.serviceCode||"Unassigned"],
   ["Cue ID",ident.cueId||"Unassigned"],
   ["Binder order",ident.binderOrder||"Unassigned"],
   ["Role",record.leadership.role||"Unassigned"],
   ["Imported cues",(record.leadership.cues||[]).map(c=>[c.cueId,c.role,"Style: "+c.style,"Start: "+c.startCue,"End: "+c.endCue,c.matchStatus].join(" | ")).join(" ; ")||"None"],
   ["Melody ID",record.production.melodyId||"Unassigned"],
   ["Paper class",record.production.paperClass||"Unassigned"],
   ["Intake status",intake.status]
  ];
  const dl=panel.querySelector("dl");dl.replaceChildren();
  for(const [label,value] of fields){
   const dt=document.createElement("dt"),dd=document.createElement("dd");
   dt.textContent=label;dd.textContent=String(value);dl.append(dt,dd);
  }
 }
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
 displayMetadata();$("spread-preview").hidden=false;$("empty-preview").hidden=true;detectedLines=[0,1].map(i=>i<doc.numPages?detectPrintedLines($(i===0?"output-left":"output-right"),i):[]);drawHighlights();status("Detected "+detectedLines.map(a=>a.length).join(" / ")+" candidate printed lines. Click a line to toggle its highlight, or drag within one column to select a range.");
}
pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
$("source").addEventListener("change",async()=>{
 const file=$("source").files[0];if(!file)return;
 $("download").disabled=true;output=null;pageMetadata=[];$("spread-preview").hidden=true;
 filename=file.name.replace(/\.pdf$/i,"")||"siddur";
 roleConfig={id:"role-1",name:$("role-name").value.trim()||"Leader",color:"#F5D03C"};
 try{
  if(!window.PDFLib||!window.pdfjsLib)throw Error("PDF libraries unavailable.");
  output=await createPdf(new Uint8Array(await file.arrayBuffer()));
  await preview(output);$("download").disabled=false;
  status("PDF ready. Trimmed and cleaned, with detected page numbers and embedded page metadata.");
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("cue-file").addEventListener("change",async()=>{
 const file=$("cue-file").files[0];if(!file)return;
 try{
  const rows=parseCsv(await file.text());
  if(!rows.length||!rows.every(c=>c.printed_page&&c.language&&c.begin_cue&&c.end_cue))throw Error("CSV needs printed_page, language, begin_cue, end_cue columns.");
  importedCues=rows;
  applyImportedCues();
  status("Loaded "+rows.length+" cue rows. "+(pageMetadata.length?"Matched to preview page metadata.":"Now upload the test PDF."));
 }catch(e){status("Cue import failed: "+e.message)}
});
installHighlightSelection();
$("download").addEventListener("click",async()=>{
 if(!output)return;
 try{await syncHighlightMetadata()}catch(e){status("Could not save highlight metadata: "+e.message);return}
 const url=URL.createObjectURL(new Blob([output],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=filename+"-v3.pdf";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
