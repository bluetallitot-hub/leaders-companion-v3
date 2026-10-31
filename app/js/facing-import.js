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
let highlightView="highlights";
let selectionMode="line";
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
  const emitBand=(fromRow,toRow)=>{
   if(toRow-fromRow<2||toRow-fromRow>30)return;
   let minX=right,maxX=left;
   for(let y=y0+fromRow;y<=y0+toRow;y++)for(let x=left;x<right;x++){
    const j=(y*w+x)*4;if(pixels[j]<145){minX=Math.min(minX,x);maxX=Math.max(maxX,x)}
   }
   if(maxX-minX<=18)return;
   const pad=2;
   const top=Math.max(0,y0+fromRow-1),bottom=Math.min(h,y0+toRow+2);
   result.push({id:"line-"+column+"-"+fromRow,column,
    x:Math.max(0,minX-pad)/w,y:top/h,
    width:(Math.min(w,maxX+pad)-Math.max(0,minX-pad))/w,height:(bottom-top)/h});
  };
  const emit=()=>{
   if(start<0)return;
   const from=start,to=last;start=-1;
   if(to-from<2)return;
   // A tall ink band can contain two touching printed lines. Split only
   // at a pronounced interior horizontal valley, never at arbitrary halves.
   if(to-from>17){
    const values=rows.slice(from,to+1),peak=Math.max(...values);
    const valleys=[];
    for(let j=5;j<values.length-5;j++){
     if(values[j]<=peak*.36&&values[j]<=values[j-1]&&values[j]<=values[j+1])valleys.push(j);
    }
    valleys.sort((a,b)=>values[a]-values[b]);
    const cut=valleys.find(j=>j>=7&&values.length-j>=8);
    if(cut!==undefined){emitBand(from,from+cut-1);emitBand(from+cut+1,to);return}
   }
   emitBand(from,to);
  };
  for(let j=0;j<rows.length;j++){
   if(rows[j]>=threshold){if(start<0)start=j;last=j}
   else if(start>=0&&j-last>1)emit();
  }
  emit();
 }
 return result;
}
// Cue anchors are matched against the source PDF's text layer when present.
// Scanned-only pages need OCR; never claim a match from geometry alone.
let sourceTextLines=[[],[]];
let rawOcrDiagnostics=["",""];
let cueMatchReport="Automatic cue matching has not run.";
function normalizeCueText(s){return String(s||"").normalize("NFKD").replace(/[\u0591-\u05c7]/g,"").replace(/[‘’“”"'.,:;!?—–-]/g," ").replace(/\s+/g," ").trim().toLowerCase()}
function cueSimilarity(a,b){
 const x=normalizeCueText(a),y=normalizeCueText(b);
 if(!x||!y)return 0;
 if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length)*.25+.75;
 const aw=x.split(" ").filter(w=>w.length>1),bw=y.split(" ").filter(w=>w.length>1);
 if(!aw.length||!bw.length)return 0;
 const matched=bw.filter(w=>aw.some(v=>v===w||(w.length>4&&v.length>4&&v.slice(0,4)===w.slice(0,4)))).length;
 return matched/Math.max(aw.length,bw.length);
}
function matchingCueLine(lines,phrase){
 const needle=normalizeCueText(phrase);
 if(needle.length<6)return null;
 const scores=[];
 for(let i=0;i<lines.length;i++){
  // Score contiguous OCR lines. Never allow a loose match to select a passage.
  let best=0;
  for(let n=1;n<=3&&i+n<=lines.length;n++){
   const slice=lines.slice(i,i+n);
   if(slice.some(l=>l.column!==slice[0].column))break;
   best=Math.max(best,cueSimilarity(slice.map(l=>l.text).join(" "),needle));
  }
  if(best>=.78)scores.push({index:i,score:best});
 }
 scores.sort((a,b)=>b.score-a.score);
 if(!scores.length)return null;
 // Neighboring windows of the same phrase are not separate occurrences.
 const runner=scores.find(c=>Math.abs(c.index-scores[0].index)>2);
 if(runner&&scores[0].score-runner.score<.12)return null;
 return scores[0].index;
}
function assignCueHighlights(side){
 const record=pageMetadata[side],ocr=sourceTextLines[side]||[],geometry=detectedLines[side]||[];
 if(!record||!ocr.length){if(record)for(const cue of record.leadership.cues)cue.matchStatus="ocr-lines-unavailable";return 0;}
 let matches=0;
 for(const cue of record.leadership.cues){
  // Never convert ambiguous OCR into a guessed selection.
  const begin=matchingCueLine(ocr,cue.startCue),end=matchingCueLine(ocr,cue.endCue);
  if(begin===null||end===null){cue.matchStatus="anchor-review-required ("+(begin===null?"START ":"")+(end===null?"END":"")+")";continue}
  const first=ocr[begin],last=ocr[end];
  if(!first||!last){cue.matchStatus="anchor-review-required";continue}
  // The OCR endpoints are anchors only. Fill all intervening printed lines
  // from image geometry, including lines OCR could not read.
  // Cross-column Hebrew paths are not yet safe to infer.
  if(first.column!==last.column){cue.matchStatus="column-path-review-required";continue}
  const lo=Math.min(first.y,last.y)-.004,hi=Math.max(first.y,last.y)+.004;
  const selected=geometry.filter(l=>l.column===first.column&&l.y+l.height/2>=lo&&l.y+l.height/2<=hi);
  if(!selected.length){cue.matchStatus="geometry-review-required";continue}
  for(const line of selected){
   if(!record.leadership.highlights.some(h=>h.lineId===line.id)){
    record.leadership.highlights.push({highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,roleId:cue.role,
      x:line.x,y:line.y,width:line.width,height:line.height,coordinateSystem:"normalized-top-left",visibleInPdf:false});
   }
  }
  cue.matchStatus="candidate-review-required";matches++;
 }
 return matches;
}
function roleColor(role){
 const r=String(role||"").toUpperCase();
 return r.includes("RABBI")?"#F5D03C":r.includes("PRESIDENT")?"#5C9CE8":r.includes("READER")?"#66C78B":r.includes("SOLO")?"#F0A2CA":"#F5D03C";
}
// Word candidates are derived from actual ink gaps, never equal-width divisions.
// Ambiguous spacing may merge adjacent words; manual line mode remains available.
function wordCandidates(side,line){
 const canvas=$(side===0?"output-left":"output-right"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 const w=canvas.width,h=canvas.height;
 const x0=Math.max(0,Math.floor(line.x*w)),x1=Math.min(w,Math.ceil((line.x+line.width)*w));
 const y0=Math.max(0,Math.floor(line.y*h)),y1=Math.min(h,Math.ceil((line.y+line.height)*h));
 if(x1-x0<8||y1-y0<3)return [];
 const image=ctx.getImageData(x0,y0,x1-x0,y1-y0),columns=[];
 for(let x=0;x<image.width;x++){
  let ink=0;for(let y=0;y<image.height;y++)if(image.data[(y*image.width+x)*4]<150)ink++;
  columns.push(ink);
 }
 const bands=[];let first=-1,last=-1;
 for(let x=0;x<columns.length;x++){
  if(columns[x]>0){if(first<0)first=x;last=x}
  else if(first>=0){bands.push([first,last]);first=-1}
 }
 if(first>=0)bands.push([first,last]);
 if(!bands.length)return [];
 // Typical inter-letter gaps are narrow; a word gap must exceed the
 // local median positive gap by a conservative margin.
 const gaps=bands.slice(1).map((b,i)=>b[0]-bands[i][1]-1).sort((a,b)=>a-b);
 const median=gaps.length?gaps[Math.floor(gaps.length/2)]:0;
 const splitAt=Math.max(4,Math.ceil(median*2.2));
 const words=[];let start=bands[0][0],end=bands[0][1];
 const emit=()=>{if(end-start<2)return;
  const xx=Math.max(x0,x0+start-2),right=Math.min(x1,x0+end+3);
  words.push({id:line.id+"-word-"+words.length,lineId:line.id,column:line.column,
   x:xx/w,y:line.y,width:(right-xx)/w,height:line.height});
 };
 for(let i=1;i<bands.length;i++){
  const gap=bands[i][0]-end-1;
  if(gap>=splitAt){emit();start=bands[i][0]}
  end=bands[i][1];
 }
 emit();
 return words;
}
function getWordGeometry(side){
 return detectedLines[side].flatMap(l=>wordCandidates(side,l));
}
function drawHighlights(){
 for(let i=0;i<2;i++){
  const overlay=$("highlight-"+i),base=$(i===0?"output-left":"output-right");
  if(!overlay||!base)return;
  overlay.width=base.width;overlay.height=base.height;
  const ctx=overlay.getContext("2d");ctx.clearRect(0,0,overlay.width,overlay.height);
  const selected=pageMetadata[i]?.leadership?.highlights||[];
  for(const line of detectedLines[i]){
   const lineHighlight=selected.find(h=>!h.wordId&&h.lineId===line.id);
   const wordOverrides=selected.filter(h=>h.wordId&&h.lineId===line.id);
   // A line without word edits is rendered once. After the first word edit,
   // individual word selections replace the full-line rectangle.
   if(!wordOverrides.length){
    if(lineHighlight||highlightView==="detection"){
     ctx.fillStyle=lineHighlight?roleColor(lineHighlight.roleId)+"40":"rgba(24,105,160,.19)";
     ctx.fillRect(line.x*overlay.width,line.y*overlay.height,line.width*overlay.width,line.height*overlay.height);
    }
   }else{
    const words=wordCandidates(i,line);
    for(const word of words){
     const h=wordOverrides.find(v=>v.wordId===word.id);
     if(!h&&highlightView!=="detection")continue;
     ctx.fillStyle=h?roleColor(h.roleId)+"40":"rgba(24,105,160,.19)";
     ctx.fillRect(word.x*overlay.width,word.y*overlay.height,word.width*overlay.width,word.height*overlay.height);
    }
   }
  }
 }
}
// Recovery for legitimate lines missed by the projection detector.
// Only creates a candidate when dark source ink is present near the click.
function recoverClickedLine(side,p){
 const canvas=$(side===0?"output-left":"output-right"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 const w=canvas.width,h=canvas.height,region=REGIONS[side];
 const x0=Math.round(region.x),x1=Math.round(region.x+region.w);
 const y0=Math.round(H-region.y-region.h),y1=Math.round(H-region.y);
 const px=Math.round(p.x*w),py=Math.round(p.y*h);
 if(px<x0||px>x1||py<y0||py>y1)return null;
 const slices=pageMetadata[side]?.source?.languageCode==="H"?[[.02,.49],[.51,.98]]:[[.02,.98]];
 const col=slices.findIndex(([a,b])=>px>=x0+region.w*a&&px<=x0+region.w*b);
 if(col<0)return null;
 const [a,b]=slices[col],left=Math.round(x0+region.w*a),right=Math.round(x0+region.w*b);
 const image=ctx.getImageData(left,Math.max(y0,py-20),right-left,Math.min(y1,py+21)-Math.max(y0,py-20));
 const rw=image.width,rh=image.height,top=Math.max(y0,py-20),rows=[];
 for(let yy=0;yy<rh;yy++){
  let n=0;for(let xx=0;xx<rw;xx+=2)if(image.data[(yy*rw+xx)*4]<155)n++;
  rows.push(n);
 }
 const threshold=Math.max(2,Math.floor(rw/145)),centers=[];
 for(let yy=1;yy<rh-1;yy++)if(rows[yy]>=threshold)centers.push(yy);
 if(!centers.length)return null;
 const center=centers.reduce((best,v)=>Math.abs(top+v-py)<Math.abs(top+best-py)?v:best,centers[0]);
 let first=center,last=center;
 while(first>0&&(rows[first-1]>=threshold||first>1&&rows[first-2]>=threshold&&center-first<17))first--;
 while(last<rh-1&&(rows[last+1]>=threshold||last<rh-2&&rows[last+2]>=threshold&&last-center<17))last++;
 if(last-first>32)return null;
 let min=rw,max=0;
 for(let yy=first;yy<=last;yy++)for(let xx=0;xx<rw;xx++)if(image.data[(yy*rw+xx)*4]<155){min=Math.min(min,xx);max=Math.max(max,xx)}
 if(max-min<15)return null;
 const line={id:"manual-"+col+"-"+(top+first),column:col,
  x:Math.max(0,left+min-3)/w,y:Math.max(0,top+first-3)/h,
  width:(Math.min(w,left+max+4)-Math.max(0,left+min-3))/w,
  height:(Math.min(h,top+last+4)-Math.max(0,top+first-3))/h};
 const existing=detectedLines[side].find(l=>l.column===col&&Math.abs(l.y+l.height/2-line.y-line.height/2)<.009);
 if(existing)return existing;
 detectedLines[side].push(line);return line;
}
function installHighlightSelection(){
 for(let i=0;i<2;i++){
  const layer=$("highlight-"+i);let start=null;
  const point=e=>{const b=layer.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height}};
  const nearest=p=>{
   const lines=detectedLines[i]||[];
   const inside=lines.filter(l=>p.x>=l.x-.01&&p.x<=l.x+l.width+.01&&p.y>=l.y-.007&&p.y<=l.y+l.height+.007);
   if(inside.length)return inside[0];
   const recovered=recoverClickedLine(i,p);if(recovered)return recovered;
   return lines.filter(l=>p.x>=l.x-.02&&p.x<=l.x+l.width+.02&&Math.abs(p.y-l.y-l.height/2)<.014)
    .sort((a,b)=>Math.abs(p.y-a.y-a.height/2)-Math.abs(p.y-b.y-b.height/2))[0]||null;
  };
  const target=p=>{
   if(selectionMode==="line")return nearest(p);
   const words=getWordGeometry(i);
   const matches=words.filter(w=>p.x>=w.x-.003&&p.x<=w.x+w.width+.003&&p.y>=w.y-.008&&p.y<=w.y+w.height+.008);
   return matches.sort((a,b)=>Math.abs(p.x-a.x-a.width/2)-Math.abs(p.x-b.x-b.width/2))[0]||null;
  };
  layer.addEventListener("pointerdown",e=>{if(!pageMetadata[i])return;start=target(point(e));if(start)layer.setPointerCapture(e.pointerId)});
  layer.addEventListener("pointerup",e=>{
   if(!start||!pageMetadata[i])return;
   const end=target(point(e))||start,items=selectionMode==="word"?getWordGeometry(i):detectedLines[i];
   const a=items.findIndex(x=>x.id===start.id),b=items.findIndex(x=>x.id===end.id);
   if(a<0||b<0){start=null;return}
   const chosen=a===b?[start]:items.slice(Math.min(a,b),Math.max(a,b)+1).filter(l=>l.column===start.column);
   const highlights=pageMetadata[i].leadership.highlights;
   for(const item of chosen){
    const role=pageMetadata[i].leadership.cues[0]?.role||roleConfig.id;
    if(selectionMode==="word"){
     const lineId=item.lineId;
     const lineIndex=highlights.findIndex(h=>!h.wordId&&h.lineId===lineId);
     const wordHighlights=highlights.filter(h=>h.wordId&&h.lineId===lineId);
     if(lineIndex>=0){
      // Convert the entire line into word selections before toggling one word.
      const original=highlights.splice(lineIndex,1)[0];
      for(const word of wordCandidates(i,detectedLines[i].find(l=>l.id===lineId))){
       if(!highlights.some(h=>h.wordId===word.id)){
        highlights.push({highlightId:"HL-"+word.id,lineId,wordId:word.id,
         roleId:original.roleId||role,x:word.x,y:word.y,width:word.width,height:word.height,
         coordinateSystem:"normalized-top-left",visibleInPdf:false});
       }
      }
     }
     const old=highlights.findIndex(h=>h.wordId===item.id);
     if(old>=0)highlights.splice(old,1);
     else highlights.push({highlightId:"HL-"+item.id,lineId,wordId:item.id,roleId:role,
      x:item.x,y:item.y,width:item.width,height:item.height,
      coordinateSystem:"normalized-top-left",visibleInPdf:false});
    }else{
     // Line click replaces any partial-word edits for this line.
     const old=highlights.findIndex(h=>!h.wordId&&h.lineId===item.id);
     for(let j=highlights.length-1;j>=0;j--)if(highlights[j].wordId&&highlights[j].lineId===item.id)highlights.splice(j,1);
     if(old>=0){const idx=highlights.findIndex(h=>!h.wordId&&h.lineId===item.id);if(idx>=0)highlights.splice(idx,1)}
     else highlights.push({highlightId:"HL-"+item.id,lineId:item.id,roleId:role,
      x:item.x,y:item.y,width:item.width,height:item.height,
      coordinateSystem:"normalized-top-left",visibleInPdf:false});
    }
   }
   start=null;drawHighlights();
   status(highlights.length+" selections on "+(i===0?"left":"right")+" page ("+selectionMode+" mode). Download to save metadata.");
  });
  layer.addEventListener("pointercancel",()=>{start=null});
 }
}
async function recognizeCueLines(side){
 const canvas=$(side===0?"output-left":"output-right"),record=pageMetadata[side];
 if(!canvas||!record||!window.Tesseract)return [];
 const lang=record.source.languageCode==="H"?"heb":"eng";
 const region=REGIONS[side],x=Math.round(region.x),y=Math.round(H-region.y-region.h);
 const crop=canvasCrop(canvas,{left:x,top:y,right:Math.round(region.x+region.w),bottom:Math.round(H-region.y)});
 const result=await Tesseract.recognize(crop,lang);
 const data=result.data||{},raw=Array.isArray(data.lines)?data.lines:[];
 // Tesseract builds differ in whether they expose lines or words.
 const candidates=raw.length?raw:(Array.isArray(data.words)?data.words:[]);
 const geometry=detectedLines[side]||[],mapped=[];
 rawOcrDiagnostics[side]="OCR engine: "+lang+"; raw lines: "+raw.length+"; raw words: "+(Array.isArray(data.words)?data.words.length:0)+"; candidates: "+candidates.length+"\n"+candidates.map(c=>String(c.text||"").trim()).filter(Boolean).join("\n");
 for(const line of candidates){
  const value=String(line.text||"").trim(),box=line.bbox;
  if(!value||!box)continue;
  const cy=(y+(box.y0+box.y1)/2)/canvas.height,cx=(x+(box.x0+box.x1)/2)/canvas.width;
  const closest=geometry.filter(g=>cx>=g.x-.04&&cx<=g.x+g.width+.04)
   .sort((a,b)=>Math.abs(cy-a.y-a.height/2)-Math.abs(cy-b.y-b.height/2))[0];
  if(closest&&Math.abs(cy-closest.y-closest.height/2)<.018){
   mapped.push({id:closest.id,text:value,y:closest.y,column:closest.column});
  }
 }
 // Combine OCR words assigned to the same printed line.
 const groups=new Map();
 for(const item of mapped){
  if(!groups.has(item.id))groups.set(item.id,{...item,text:[]});
  groups.get(item.id).text.push(item.text);
 }
 const lines=[...groups.values()].map(l=>({...l,text:l.text.join(" ")}));
 rawOcrDiagnostics[side]+="\nMapped candidates: "+mapped.length+"; mapped printed lines: "+lines.length;
 lines.sort((a,b)=>a.y-b.y||a.column-b.column);
 return lines;
}
async function autoMatchCues(){
 if(!pageMetadata.length||!importedCues.length)return;
 let total=0;
 for(const record of pageMetadata){record.leadership.highlights=record.leadership.highlights.filter(h=>!h.cueId)}
 for(let side=0;side<pageMetadata.length;side++){
  if(!pageMetadata[side].leadership.cues.length)continue;
  status("Reading "+(side===0?"left":"right")+" page for cue anchors...");
  try{sourceTextLines[side]=await recognizeCueLines(side);total+=assignCueHighlights(side)}
  catch(e){rawOcrDiagnostics[side]="OCR error: "+e.message;console.warn("Cue OCR unavailable",e);for(const cue of pageMetadata[side].leadership.cues)cue.matchStatus="ocr-error: "+e.message}
 }
 $("ocr-diagnostics").textContent=pageMetadata.map((r,i)=>"Page "+(r.source.sourcePage||i+1)+" OCR ("+(sourceTextLines[i]||[]).length+" mapped lines):\\n"+(sourceTextLines[i]||[]).map(l=>l.text).join("\\n")+"\\n\\nRAW OCR DIAGNOSTICS:\\n"+(rawOcrDiagnostics[i]||"Not run")).join("\\n\\n");
 cueMatchReport=total+" of "+pageMetadata.reduce((n,r)=>n+r.leadership.cues.length,0)+" cues automatically matched. "+pageMetadata.flatMap(r=>r.leadership.cues.map(c=>c.cueId+": "+c.matchStatus)).join("; ");
 drawHighlights();displayMetadata();status(cueMatchReport);
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
   ["Automatically matched cues",(record.leadership.cues||[]).filter(c=>c.matchStatus==="candidate-review-required").length+" / "+(record.leadership.cues||[]).length],
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
 displayMetadata();$("spread-preview").hidden=false;$("empty-preview").hidden=true;detectedLines=[0,1].map(i=>i<doc.numPages?detectPrintedLines($(i===0?"output-left":"output-right"),i):[]);drawHighlights();status("Detected "+detectedLines.map(a=>a.length).join(" / ")+" candidate printed lines.");await autoMatchCues();
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
  status(cueMatchReport);
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("cue-file").addEventListener("change",async()=>{
 const file=$("cue-file").files[0];if(!file)return;
 try{
  const rows=parseCsv(await file.text());
  if(!rows.length||!rows.every(c=>c.printed_page&&c.language&&c.begin_cue&&c.end_cue))throw Error("CSV needs printed_page, language, begin_cue, end_cue columns.");
  importedCues=rows;
  applyImportedCues();
  if(pageMetadata.length)await autoMatchCues();
  status(pageMetadata.length?cueMatchReport:"Loaded "+rows.length+" cue rows. Now upload the test PDF.");
 }catch(e){status("Cue import failed: "+e.message)}
});
$("highlight-view").addEventListener("change",()=>{highlightView=$("highlight-view").value;drawHighlights()});
$("selection-mode").addEventListener("change",()=>{selectionMode=$("selection-mode").value;drawHighlights()});
installHighlightSelection();
$("download").addEventListener("click",async()=>{
 if(!output)return;
 try{await syncHighlightMetadata()}catch(e){status("Could not save highlight metadata: "+e.message);return}
 const url=URL.createObjectURL(new Blob([output],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=filename+"-v3.pdf";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
