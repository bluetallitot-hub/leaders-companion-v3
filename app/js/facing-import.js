"use strict";
const $=id=>document.getElementById(id);
const W=612,H=792,REGIONS=[{x:171.36,y:98,w:380.88,h:540},{x:59.76,y:98,w:380.88,h:540}];
let output=null,baseOutput=null,filename="siddur",pageMetadata=[],roleConfig=null,highlightDraft=null,importedCues=[];
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
   startCueHebrew:c.begin_cue_hebrew||"",endCueHebrew:c.end_cue_hebrew||"",
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
// Analysis-only enhancement: original PDF and visible preview remain unchanged.
function enhancedAnalysisCanvas(source,scale=2){
 const out=document.createElement("canvas");out.width=source.width*scale;out.height=source.height*scale;
 const ctx=out.getContext("2d",{willReadFrequently:true});
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
 ctx.drawImage(source,0,0,out.width,out.height);
 const img=ctx.getImageData(0,0,out.width,out.height),d=img.data;
 // Grayscale with gentle contrast expansion, avoiding aggressive binary thresholding.
 for(let i=0;i<d.length;i+=4){
  const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
  const adjusted=Math.max(0,Math.min(255,(gray-128)*1.55+143));
  d[i]=d[i+1]=d[i+2]=adjusted;
 }
 ctx.putImageData(img,0,0);
 return out;
}
function detectPrintedLines(canvas,side){
 // Both languages use an enhanced analysis image; original PDF artwork is untouched.
 const enhanced=enhancedAnalysisCanvas(canvas,2);
 const factor=enhanced.width/canvas.width;
 const ctx=enhanced.getContext("2d",{willReadFrequently:true}),w=enhanced.width,h=enhanced.height;
 const pixels=ctx.getImageData(0,0,w,h).data,region=REGIONS[side],result=[];
 const x0=Math.round(region.x*factor),x1=Math.round((region.x+region.w)*factor),y0=Math.round((H-region.y-region.h)*factor),y1=Math.round((H-region.y)*factor);
 // Each half is scanned independently to avoid bridging Hebrew columns.
 const slices=pageMetadata[side]?.source?.languageCode==="H"?[[.02,.49],[.51,.98]]:[[.02,.98]];
 for(let column=0;column<slices.length;column++){
  // Slice coordinates must use the enhanced canvas width, not unscaled PDF points.
  // Previously English analysis scanned only the left half of its 2x image.
  const [from,to]=slices[column],left=Math.round(x0+(x1-x0)*from),right=Math.round(x0+(x1-x0)*to);
  const rows=[];
  for(let y=y0;y<y1;y++){
   let n=0;
   for(let x=left;x<right;x+=2){const j=(y*w+x)*4;if(pixels[j]<145)n++}
   rows.push(n);
  }
  // English prose has narrow, lightly printed lines that the old density threshold missed.
  // Require a little real ink, but do not require a full-width dense line.
  const english=pageMetadata[side]?.source?.languageCode==="E";
  // Use row ink presence for English, rather than requiring multiple dark pixels
  // at the same scan interval. The opening prose has light, thin strokes.
  const threshold=english?1:Math.max(3,Math.floor((right-left)/95));
  let start=-1,last=-1;
  const emitBand=(fromRow,toRow)=>{
   if(toRow-fromRow<factor||toRow-fromRow>30*factor)return;
   let minX=right,maxX=left;
   for(let y=y0+fromRow;y<=y0+toRow;y++)for(let x=left;x<right;x++){
    const j=(y*w+x)*4;if(pixels[j]<145){minX=Math.min(minX,x);maxX=Math.max(maxX,x)}
   }
   if(maxX-minX<=(english?12:18)*factor)return;
   const pad=2*factor;
   const top=Math.max(0,y0+fromRow-factor),bottom=Math.min(h,y0+toRow+2*factor);
   result.push({id:"line-"+column+"-"+fromRow,column,
    x:Math.max(0,minX-pad)/w,y:top/h,
    width:(Math.min(w,maxX+pad)-Math.max(0,minX-pad))/w,height:(bottom-top)/h});
  };
  // A dense English paragraph can form one continuous ink band across
  // multiple lines. The previous code split at most once, then silently
  // rejected each remaining tall band (>30px). Recursively split at row
  // density valleys so every line has a chance to survive.
  const splitBand=(from,to,depth=0)=>{
   const height=to-from+1;
   if(height<=17*factor||depth>=12){emitBand(from,to);return}
   const peak=Math.max(...rows.slice(from,to+1));
   const candidates=[];
   const margin=Math.max(3,Math.round(5*factor));
   for(let j=from+margin;j<=to-margin;j++){
    const value=rows[j];
    if(value<=rows[j-1]&&value<=rows[j+1])
     candidates.push({j,value,score:value/Math.max(1,peak)});
   }
   // Prefer whitespace valleys near the expected text-line pitch,
   // but allow a denser valley when the band would otherwise be discarded.
   candidates.sort((a,b)=>a.score-b.score);
   const cut=candidates.find(c=>c.score<=.36)||
    (height>30*factor?candidates[0]:null);
   if(!cut){emitBand(from,to);return}
   splitBand(from,cut.j-1,depth+1);
   splitBand(cut.j+1,to,depth+1);
  };
  const emit=()=>{
   if(start<0)return;
   const from=start,to=last;start=-1;
   if(to-from<factor)return;
   if(english||pageMetadata[side]?.source?.languageCode==="H"){splitBand(from,to);return}
   // Preserve the existing Hebrew behavior.
   if(to-from>17*factor){
    const values=rows.slice(from,to+1),peak=Math.max(...values);
    const valleys=[];
    for(let j=5*factor;j<values.length-5*factor;j++){
     if(values[j]<=peak*.36&&values[j]<=values[j-1]&&values[j]<=values[j+1])valleys.push(j);
    }
    valleys.sort((a,b)=>values[a]-values[b]);
    const cut=valleys.find(j=>j>=7*factor&&values.length-j>=8*factor);
    if(cut!==undefined){emitBand(from,from+cut-1);emitBand(from+cut+1,to);return}
   }
   emitBand(from,to);
  };
  for(let j=0;j<rows.length;j++){
   if(rows[j]>=threshold){if(start<0)start=j;last=j}
   else if(start>=0&&j-last>(english?Math.max(2,Math.round(factor*1.5)):1))emit();
  }
  emit();
 }
 return result;
}
// Cue anchors are matched against the source PDF's text layer when present.
// Scanned-only pages need OCR; never claim a match from geometry alone.
let sourceTextLines=[[],[]];
let rawOcrDiagnostics=["",""];
let ocrWordGeometry=[new Map(),new Map()];
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
// Transliteration in imported CSV is not comparable to Hebrew-script OCR.
// Explicitly verified Psalm 29:11 aliases for the SHFE-159H-01 test row.
// Do not infer arbitrary Hebrew from Latin transliteration.
function hebrewCueAlias(phrase){
 const key=String(phrase||"").toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z]+/g," ").trim();
 const aliases={
  "adonai oz l amo yiten":"יי עז לעמו יתן",
  "adonai y varech et amo vashalom":"יי יברך את עמו בשלום"
 };
 return aliases[key]||phrase;
}
function hebrewCueSimilarity(a,b){
 const x=normalizeCueText(a).replace(/[^\u05d0-\u05ea]/g,"");
 const y=normalizeCueText(b).replace(/[^\u05d0-\u05ea]/g,"");
 if(!x||!y)return 0;
 if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length)*.25+.75;
 return cueSimilarity(a,b);
}
// Compare Hebrew cue phrases against short windows inside longer printed lines.
// Normalize common divine-name print forms and tolerate minor OCR letter errors.
function hebrewAnchorScore(text,phrase){
 const clean=v=>normalizeCueText(v).replace(/יהוה|יְיָ|יי/g,"יי").replace(/[^\u05d0-\u05ea ]/g," ").replace(/\s+/g," ").trim();
 const a=clean(text),b=clean(phrase);
 if(!a||!b)return 0;
 const target=b.replace(/ /g,""),words=a.split(" ").filter(Boolean);
 if(!target||!words.length)return 0;
 let best=0;
 for(let i=0;i<words.length;i++)for(let n=1;n<=Math.min(words.length-i,b.split(" ").length+2);n++){
  const candidate=words.slice(i,i+n).join("");
  if(Math.abs(candidate.length-target.length)>Math.max(3,Math.floor(target.length*.25)))continue;
  const prev=Array.from({length:target.length+1},(_,k)=>k);
  let row=prev;
  for(let j=1;j<=candidate.length;j++){
   const next=[j];for(let k=1;k<=target.length;k++)next[k]=Math.min(next[k-1]+1,row[k]+1,row[k-1]+(candidate[j-1]===target[k-1]?0:1));row=next;
  }
  best=Math.max(best,1-row[target.length]/Math.max(candidate.length,target.length));
 }
 return best;
}
function matchingCueLine(lines,phrase){
 const alias=hebrewCueAlias(phrase),needle=normalizeCueText(alias);
 if(needle.length<4)return null;
 const scores=[];
 for(let i=0;i<lines.length;i++){
  // Score contiguous OCR lines. Never allow a loose match to select a passage.
  let best=0;
  for(let n=1;n<=3&&i+n<=lines.length;n++){
   const slice=lines.slice(i,i+n);
   if(slice.some(l=>l.column!==slice[0].column))break;
   best=Math.max(best,/[\u0590-\u05ff]/u.test(needle)?Math.max(hebrewCueSimilarity(slice.map(l=>l.text).join(" "),needle),hebrewAnchorScore(slice.map(l=>l.text).join(" "),needle)):cueSimilarity(slice.map(l=>l.text).join(" "),needle));
  }
  if(best>=(/[\u0590-\u05ff]/u.test(needle)?.78:.65))scores.push({index:i,score:best});
 }
 scores.sort((a,b)=>b.score-a.score);
 if(!scores.length)return null;
 // Neighboring windows of the same phrase are not separate occurrences.
 const runner=scores.find(c=>Math.abs(c.index-scores[0].index)>2);
 if(runner&&scores[0].score-runner.score<.10)return null;
 return scores[0].index;
}
function cueCandidateDiagnostics(lines,phrase){
 const needle=normalizeCueText(hebrewCueAlias(phrase));
 if(!needle)return "empty cue";
 const heb=/[\u0590-\u05ff]/u.test(needle),rank=[];
 for(let i=0;i<lines.length;i++){
  let best=0;
  for(let n=1;n<=3&&i+n<=lines.length;n++){
   const slice=lines.slice(i,i+n);
   if(slice.some(l=>l.column!==slice[0].column))break;
   const t=slice.map(l=>l.text).join(" ");
   best=Math.max(best,heb?Math.max(hebrewCueSimilarity(t,needle),hebrewAnchorScore(t,needle)):cueSimilarity(t,needle));
  }
  rank.push({line:i+1,score:best,text:lines[i].text});
 }
 rank.sort((a,b)=>b.score-a.score);
 return rank.slice(0,3).map(r=>"#"+r.line+" "+r.score.toFixed(2)+" "+r.text.slice(0,90)).join(" | ")||"no OCR lines";
}
function assignCueHighlights(side){
 const record=pageMetadata[side],ocr=sourceTextLines[side]||[],geometry=detectedLines[side]||[];
 if(!record||!ocr.length){if(record)for(const cue of record.leadership.cues)cue.matchStatus="ocr-lines-unavailable";return 0;}
 let matches=0;
 const hebrew=record.source.languageCode==="H";
 for(const cue of record.leadership.cues){
  // Never convert ambiguous OCR into a guessed selection.
  const begin=matchingCueLine(ocr,hebrew?(cue.startCueHebrew||cue.startCue):cue.startCue),
        end=matchingCueLine(ocr,hebrew?(cue.endCueHebrew||cue.endCue):cue.endCue);
  if(begin===null||end===null){
   cue.matchStatus="anchor-review-required ("+(begin===null?"START ":"")+(end===null?"END":"")+")";
   rawOcrDiagnostics[side]+="\\nCUE "+cue.cueId+" START ["+cueCandidateDiagnostics(ocr,hebrew?(cue.startCueHebrew||cue.startCue):cue.startCue)+"] END ["+cueCandidateDiagnostics(ocr,hebrew?(cue.endCueHebrew||cue.endCue):cue.endCue)+"]";
   continue;
  }
  const first=ocr[begin],last=ocr[end];
  if(!first||!last){cue.matchStatus="anchor-review-required";continue}
  // The OCR endpoints are anchors only. Fill all intervening printed lines
  // from image geometry, including lines OCR could not read.
  // Follow printed reading order: Hebrew right-to-left columns, English left-to-right.
  // Only traverse a column boundary in the forward reading direction.
  const columns=[...new Set(geometry.map(l=>l.column))].sort((a,b)=>hebrew?((a===2?2:a===1?0:1)-(b===2?2:b===1?0:1)):a-b);
  const columnRank=c=>columns.indexOf(c);
  const rankA=columnRank(first.column),rankB=columnRank(last.column);
  if(rankA<0||rankB<0||rankB<rankA||rankB-rankA>1){
   cue.matchStatus="column-path-review-required";continue;
  }
  const startY=first.y,endY=last.y;
  if(rankA===rankB&&endY+.008<startY){cue.matchStatus="reverse-anchor-review-required";continue}
  const selected=geometry.filter(l=>{
   const rank=columnRank(l.column),center=l.y+l.height/2;
   if(rank<rankA||rank>rankB)return false;
   if(rankA===rankB)return center>=startY-.004&&center<=endY+.004;
   if(rank===rankA)return center>=startY-.004;
   if(rank===rankB)return center<=endY+.004;
   return true;
  });
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
 if(pageMetadata[side]?.source?.languageCode==="H"&&rivokWordsBySide[side])return rivokWordsBySide[side].filter(w=>w.lineId===line.id);
 // OCR can split a Hebrew word at nikkud or between its letters.
 // Use OCR as a recognition aid, not as authoritative selection geometry.
 // Printed ink gaps below provide the selectable word extents.
 const canvas=$(side===0?"output-left":"output-right");
 const hebrew=pageMetadata[side]?.source?.languageCode==="H";
 // For Hebrew, use the same enhanced 2x analysis image as line detection.
 // Geometry is normalized to the analysis canvas, so it maps to the original page.
 const analysis=hebrew?enhancedAnalysisCanvas(canvas,2):canvas;
 const ctx=analysis.getContext("2d",{willReadFrequently:true});
 const w=analysis.width,h=analysis.height;
 const x0=Math.max(0,Math.floor(line.x*w)),x1=Math.min(w,Math.ceil((line.x+line.width)*w));
 const y0=Math.max(0,Math.floor(line.y*h)),y1=Math.min(h,Math.ceil((line.y+line.height)*h));
 if(x1-x0<8||y1-y0<3)return [];
 const image=ctx.getImageData(x0,y0,x1-x0,y1-y0),columns=[];
 for(let x=0;x<image.width;x++){
  let ink=0;for(let y=0;y<image.height;y++)if(image.data[(y*image.width+x)*4]<150)ink++;
  columns.push(ink);
 }
 // Hebrew-only: find inter-word spaces from the letter-body projection.
 // Ignoring the upper/lower nikkud bands avoids treating vowel marks as letters.
 // Determine the split from the observed gap distribution in this line.
 if(hebrew){
  const bodyTop=Math.floor(image.height*.24),bodyBottom=Math.ceil(image.height*.78);
  const core=[];
  for(let x=0;x<image.width;x++){
   let n=0;
   for(let y=bodyTop;y<bodyBottom;y++)if(image.data[(y*image.width+x)*4]<155)n++;
   core.push(n);
  }
  const runs=[];let start=-1;
  for(let x=0;x<=core.length;x++){
   if(x<core.length&&core[x]>0){if(start<0)start=x}
   else if(start>=0){runs.push([start,x-1]);start=-1}
  }
  if(!runs.length)return [];
  const gapValues=runs.slice(1).map((v,i)=>v[0]-runs[i][1]-1);
  const sorted=gapValues.filter(v=>v>0).sort((a,b)=>a-b);
  // Two-population clustering: small letter gaps and larger word spaces.
  // If separation is not clear, keep a conservative threshold.
  let splitAt=Math.max(8,Math.round(image.height*.24));
  if(sorted.length>=3){
   let low=sorted[Math.floor(sorted.length*.25)],high=sorted[Math.floor(sorted.length*.85)];
   for(let iter=0;iter<8;iter++){
    const midpoint=(low+high)/2;
    const a=sorted.filter(g=>g<=midpoint),b=sorted.filter(g=>g>midpoint);
    if(!a.length||!b.length)break;
    low=a.reduce((v,g)=>v+g,0)/a.length;
    high=b.reduce((v,g)=>v+g,0)/b.length;
   }
   if(high>=low*1.65&&high-low>=3)splitAt=Math.max(splitAt,Math.round((low+high)/2));
  }
  const groups=[];let from=runs[0][0],to=runs[0][1];
  for(let k=1;k<runs.length;k++){
   const gap=runs[k][0]-to-1;
   if(gap>=splitAt){groups.push([from,to]);from=runs[k][0]}
   to=runs[k][1];
  }
  groups.push([from,to]);
  // Expand to include vowel marks and punctuation, stopping halfway through
  // whitespace between adjacent word bodies to prevent overlapping selections.
  return groups.map((g,i)=>{
   const leftLimit=i?Math.floor((groups[i-1][1]+g[0])/2):0;
   const rightLimit=i+1<groups.length?Math.ceil((g[1]+groups[i+1][0])/2):image.width-1;
   let left=Math.max(leftLimit,g[0]-5),right=Math.min(rightLimit,g[1]+5);
   for(let x=leftLimit;x<g[0];x++)if(columns[x]>0)left=Math.min(left,x);
   for(let x=g[1]+1;x<=rightLimit;x++)if(columns[x]>0)right=Math.max(right,x);
   const xx=x0+left,rx=x0+right+1;
   return {id:line.id+"-word-"+i,lineId:line.id,column:line.column,
    x:xx/w,y:line.y,width:(rx-xx)/w,height:line.height};
  });
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
 // For Hebrew, punctuation and vowel marks form small isolated ink bands.
 // Merge those fragments with their adjacent word before identifying spaces.
 // A period to the left of an RTL word belongs to that preceding word.
 let units=bands.map(b=>b.slice());
 if(hebrew&&units.length>1){
  const small=Math.max(3*(hebrew?2:1),Math.round(image.height*.20));
  for(let k=units.length-1;k>=0;k--){
   const width=units[k][1]-units[k][0]+1;
   if(width>small||units.length===1)continue;
   const leftGap=k>0?units[k][0]-units[k-1][1]-1:Infinity;
   const rightGap=k+1<units.length?units[k+1][0]-units[k][1]-1:Infinity;
   // Prefer attaching trailing RTL punctuation to the word on its right.
   const neighbor=(k+1<units.length&&rightGap<=Math.max(12*(hebrew?2:1),leftGap*1.5))?k+1:k-1;
   if(neighbor<0)continue;
   units[neighbor][0]=Math.min(units[neighbor][0],units[k][0]);
   units[neighbor][1]=Math.max(units[neighbor][1],units[k][1]);
   units.splice(k,1);
  }
 }
 const unitGaps=units.slice(1).map((b,i)=>b[0]-units[i][1]-1).filter(g=>g>=0).sort((a,b)=>a-b);
 const typical=unitGaps.length?unitGaps[Math.floor(unitGaps.length/2)]:median;
 const splitAt=Math.max(hebrew?16:5,Math.ceil(typical*2.5));
 const words=[];let start=units[0][0],end=units[0][1];
 const emit=()=>{if(end-start<2)return;
  const pad=hebrew?6:3;
  const xx=Math.max(x0,x0+start-pad),right=Math.min(x1,x0+end+pad+1);
  words.push({id:line.id+"-word-"+words.length,lineId:line.id,column:line.column,
   x:xx/w,y:line.y,width:(right-xx)/w,height:line.height});
 };
 for(let i=1;i<units.length;i++){
  const gap=units[i][0]-end-1;
  if(gap>=splitAt){emit();start=units[i][0]}
  end=units[i][1];
 }
 emit();
 return words;
}
function getWordGeometry(side){
 return detectedLines[side].flatMap(l=>wordCandidates(side,l));
}
// Rivok word boxes are authoritative for Hebrew selection after detection.
let rivokWordsBySide=[null,null];
function installRivokSelectionGeometry(side,result){
 const canvas=$(side===0?"output-left":"output-right"),w=canvas.width,h=canvas.height;
 const words=result.words.map((item,i)=>{
  const [x0,y0,x1,y1]=item.bbox;
  return {id:"rivok-word-"+i,x:Math.max(0,x0)/w,y:Math.max(0,y0)/h,
   width:(Math.min(w,x1)-Math.max(0,x0))/w,height:(Math.min(h,y1)-Math.max(0,y0))/h};
 }).filter(v=>v.width>0&&v.height>0);
 // Cluster by vertical center; two-column lines share a baseline but must stay separate.
 const rows=[];
 for(const word of words.slice().sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2))){
  const cy=word.y+word.height/2;
  const row=rows.find(r=>Math.abs(r.cy-cy)<Math.max(.005,Math.min(word.height,r.height)*.45));
  if(row){row.words.push(word);row.cy=(row.cy*(row.words.length-1)+cy)/row.words.length;row.height=Math.max(row.height,word.height)}
  else rows.push({cy,height:word.height,words:[word]});
 }
 const lines=[];
 for(const row of rows){
  const sorted=row.words.slice().sort((a,b)=>a.x-b.x);
  const groups=[];let current=[];
  for(const word of sorted){
   const prev=current[current.length-1];
   // A wide gap separates the two upper columns; ordinary word gaps do not.
   const gap=prev?word.x-(prev.x+prev.width):0;
   if(prev&&gap>Math.max(.055,row.height*2.3)){groups.push(current);current=[]}
   current.push(word);
  }
  if(current.length)groups.push(current);
  for(const group of groups){
   const x=Math.min(...group.map(v=>v.x)),y=Math.min(...group.map(v=>v.y));
   const right=Math.max(...group.map(v=>v.x+v.width)),bottom=Math.max(...group.map(v=>v.y+v.height));
   const center=(x+right)/2,column=center<.49?0:center>.51?1:2;
   const line={id:"rivok-line-"+lines.length,column,x,y,width:right-x,height:bottom-y};
   for(const word of group){word.lineId=line.id;word.column=column}
   lines.push(line);
  }
 }
 rivokWordsBySide[side]=words;
 detectedLines[side]=lines;
}
let rivokOverlay=null;
function drawHighlights(){
 for(let i=0;i<2;i++){
  const overlay=$("highlight-"+i),base=$(i===0?"output-left":"output-right");
  if(!overlay||!base)return;
  overlay.width=base.width;overlay.height=base.height;
  const ctx=overlay.getContext("2d");ctx.clearRect(0,0,overlay.width,overlay.height);
  if(rivokOverlay&&i===rivokOverlay.side&&highlightView==="detection"){
   ctx.save();
   for(const word of rivokOverlay.words){
    const [x0,y0,x1,y1]=word.bbox;
    ctx.strokeStyle="#8a32bf";ctx.lineWidth=1.5;
    ctx.strokeRect(x0/rivokOverlay.width*overlay.width,y0/rivokOverlay.height*overlay.height,
      (x1-x0)/rivokOverlay.width*overlay.width,(y1-y0)/rivokOverlay.height*overlay.height);
   }
   ctx.restore();
  }
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
  // V3.59 reconstructed Hebrew lines: diagnostic overlay only.
  if(highlightView==="detection"&&pageMetadata[i]?.source?.languageCode==="H"&&hebrewReconstructionPreview[i]?.length){
   ctx.save();ctx.lineWidth=2;
   for(const line of hebrewReconstructionPreview[i]){
    ctx.strokeStyle=line.kind==="ocr"?"rgba(0,150,70,.95)":"rgba(240,135,0,.9)";
    ctx.strokeRect(line.x*overlay.width,line.y*overlay.height,line.width*overlay.width,line.height*overlay.height);
   }
   ctx.restore();
  }
  // Diagnostic: in Detection + Word mode, outline the actual word candidates.
  // This is preview-only and does not modify selection metadata or PDF export.
  if(highlightView==="detection"&&selectionMode==="word"&&pageMetadata[i]?.source?.languageCode==="H"){
   const candidates=getWordGeometry(i);
   ctx.save();ctx.strokeStyle="rgba(215,45,35,.95)";ctx.lineWidth=1.5;
   ctx.font="11px sans-serif";ctx.fillStyle="rgba(155,20,20,.95)";
   for(const word of candidates){
    const x=word.x*overlay.width,y=word.y*overlay.height;
    ctx.strokeRect(x,y,word.width*overlay.width,word.height*overlay.height);
    const number=word.id.split("-word-").pop();
    ctx.fillText(number,x+2,Math.max(10,y-2));
   }
   ctx.restore();
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
   if(inside.length)return inside.sort((a,b)=>Math.abs(p.y-a.y-a.height/2)-Math.abs(p.y-b.y-b.height/2))[0];
   const recovered=rivokWordsBySide[i]?null:recoverClickedLine(i,p);if(recovered)return recovered;
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
   const ordered=items.slice().sort((u,v)=>u.column-v.column||u.y-v.y||u.x-v.x);
   const from=ordered.findIndex(x=>x.id===start.id),to=ordered.findIndex(x=>x.id===end.id);
   const chosen=from===to?[start]:ordered.slice(Math.min(from,to),Math.max(from,to)+1).filter(l=>l.column===start.column);
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
 if(!canvas||!record||!window.Tesseract){rawOcrDiagnostics[side]="OCR unavailable: missing canvas, page record or Tesseract.";return [];}
 const lang=record.source.languageCode==="H"?"heb":"eng";
 const region=REGIONS[side],x=Math.round(region.x),y=Math.round(H-region.y-region.h);
 const analysis=enhancedAnalysisCanvas(canvas,2);
 const factor=analysis.width/canvas.width;
 const crop=canvasCrop(analysis,{left:x*factor,top:y*factor,right:Math.round((region.x+region.w)*factor),bottom:Math.round((H-region.y)*factor)});
 const result=await Tesseract.recognize(crop,lang);
 const data=result.data||{},raw=Array.isArray(data.lines)?data.lines:[];
 // Tesseract builds differ in whether they expose lines or words.
 const candidates=raw.length?raw:(Array.isArray(data.words)?data.words:[]);
 const geometry=detectedLines[side]||[],mapped=[];
 ocrWordGeometry[side]=new Map();
 rawOcrDiagnostics[side]="OCR engine: "+lang+"; raw lines: "+raw.length+"; raw words: "+(Array.isArray(data.words)?data.words.length:0)+"; candidates: "+candidates.length+"\n"+candidates.map(c=>String(c.text||"").trim()).filter(Boolean).join("\n");
 for(const line of candidates){
  const value=String(line.text||"").trim(),box=line.bbox;
  if(!value||!box)continue;
  const cy=(y+(box.y0+box.y1)/(2*factor))/canvas.height,cx=(x+(box.x0+box.x1)/(2*factor))/canvas.width;
  const closest=geometry.filter(g=>cx>=g.x-.04&&cx<=g.x+g.width+.04)
   .sort((a,b)=>Math.abs(cy-a.y-a.height/2)-Math.abs(cy-b.y-b.height/2))[0];
  if(closest&&Math.abs(cy-closest.y-closest.height/2)<.025){
   mapped.push({id:closest.id,text:value,y:closest.y,column:closest.column,bbox:{y0:(y+box.y0/factor)/canvas.height,y1:(y+box.y1/factor)/canvas.height}});
  }
 }
 // Preserve actual OCR word bounding boxes for word-level selection.
 // The line's printed-ink geometry controls vertical placement; OCR controls word width.
 if(Array.isArray(data.words)){
  const perLine=new Map();
  for(const word of data.words){
   const b=word.bbox;if(!b||!String(word.text||"").trim())continue;
   const cx=(x+(b.x0+b.x1)/(2*factor))/canvas.width,cy=(y+(b.y0+b.y1)/(2*factor))/canvas.height;
   const closest=geometry.filter(g=>cx>=g.x-.018&&cx<=g.x+g.width+.018)
    .sort((a,b)=>Math.abs(cy-a.y-a.height/2)-Math.abs(cy-b.y-b.height/2))[0];
   if(!closest||Math.abs(cy-closest.y-closest.height/2)>.025)continue;
   const left=Math.max(closest.x,(x+(b.x0-2)/factor)/canvas.width);
   const right=Math.min(closest.x+closest.width,(x+(b.x1+2)/factor)/canvas.width);
   if(right-left<.003)continue;
   if(!perLine.has(closest.id))perLine.set(closest.id,[]);
   perLine.get(closest.id).push({x:left,width:right-left});
  }
  for(const [id,boxes] of perLine){
   boxes.sort((a,b)=>a.x-b.x);
   // Reject unusable OCR segmentation and retain the ink-gap fallback.
   if(boxes.length&&boxes.every(b=>b.width>.003))ocrWordGeometry[side].set(id,boxes);
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
 lines.sort((a,b)=>(lang==="heb"?b.column-a.column:a.column-b.column)||a.y-b.y);
 return lines;
}

// Diagnostic-only reconciliation. OCR lines are anchors; image fragments are
// assigned by vertical overlap and column, without changing selection geometry.
function reconcileHebrewLinesForReport(side,ocrLines){
 const fragments=(detectedLines[side]||[]).slice();
 const anchors=ocrLines.filter(l=>l.bbox&&Number.isFinite(l.bbox.y0));
 const groups=anchors.map(a=>({anchor:a,fragments:[]}));
 const unassigned=[];
 for(const fragment of fragments){
  const mid=fragment.y+fragment.height/2;
  const candidates=groups.filter(g=>g.anchor.column===fragment.column)
   .map(g=>{
    const a=g.anchor,b=a.bbox;
    const overlap=Math.max(0,Math.min(fragment.y+fragment.height,b.y1)-Math.max(fragment.y,b.y0));
    const dist=Math.abs(mid-(b.y0+b.y1)/2);
    return {g,overlap,dist};
   }).sort((a,b)=>b.overlap-a.overlap||a.dist-b.dist);
  const best=candidates[0];
  if(best&&(best.overlap>fragment.height*.18||best.dist<.012))best.g.fragments.push(fragment);
  else unassigned.push(fragment);
 }
 return {groups,unassigned};
}
// V3.59 preview geometry: union fragments assigned to the same OCR line.
// Unassigned fragments remain separate; never guess across vertical gaps.
let hebrewReconstructionPreview=[[],[]];
// V3.61 adaptive page layout: find a substantial vertical break after
// upper two-column content, then join horizontal halves below that break.
// Diagnostic only; the source detector and English selection are unchanged.
let hebrewLayoutTransitions=[null,null];
let currentHebrewPreviewSide=0;
function inferHebrewLayoutTransition(fragments){
 const rows=fragments.filter(f=>f.column===0||f.column===1);
 const ordered=rows.map(f=>({top:f.y,bottom:f.y+f.height}))
  .sort((a,b)=>a.top-b.top);
 if(ordered.length<12)return null;
 const bands=[];
 for(const r of ordered){
  const last=bands[bands.length-1];
  if(last&&r.top<=last.bottom+.004)last.bottom=Math.max(last.bottom,r.bottom);
  else bands.push({...r});
 }
 const gaps=[];
 for(let i=1;i<bands.length;i++){
  const gap=bands[i].top-bands[i-1].bottom;
  const fraction=i/bands.length;
  if(fraction>.25&&fraction<.82&&gap>.009)
   gaps.push({gap,y:(bands[i].top+bands[i-1].bottom)/2});
 }
 gaps.sort((a,b)=>b.gap-a.gap);
 return gaps.length?gaps[0].y:null;
}
// V3.60: group horizontal pieces by image geometry, not OCR membership.
// Keep each detector column independent and avoid merging adjacent baselines.
function reconstructedHebrewPreview(fragments,ocrLines){
 const union=items=>{
  const x=Math.min(...items.map(f=>f.x)),y=Math.min(...items.map(f=>f.y));
  const right=Math.max(...items.map(f=>f.x+f.width));
  const bottom=Math.max(...items.map(f=>f.y+f.height));
  return {x,y,width:right-x,height:bottom-y,column:items[0].column};
 };
 const groups=[];
 const transition=inferHebrewLayoutTransition(fragments);
 hebrewLayoutTransitions[currentHebrewPreviewSide]=transition;
 const ordered=fragments.slice().map(f=>({...f,column:transition!==null&&f.y>=transition?2:f.column}))
  .sort((a,b)=>a.column-b.column||a.y-b.y||a.x-b.x);
 for(const fragment of ordered){
  const mid=fragment.y+fragment.height/2;
  const candidates=groups.filter(g=>{
   if(g.column!==fragment.column)return false;
   const overlap=Math.max(0,Math.min(g.y+g.height,fragment.y+fragment.height)-Math.max(g.y,fragment.y));
   const ratio=overlap/Math.max(.00001,Math.min(g.height,fragment.height));
   const center=Math.abs(mid-(g.y+g.height/2));
   const similar=Math.max(g.height,fragment.height)/Math.max(.00001,Math.min(g.height,fragment.height))<1.9;
   return ratio>=.58&&center<=Math.min(g.height,fragment.height)*.42&&similar;
  }).sort((a,b)=>Math.abs(mid-(a.y+a.height/2))-Math.abs(mid-(b.y+b.height/2)));
  if(candidates.length){
   const group=candidates[0];
   const merged=union([...group.fragments,fragment]);
   Object.assign(group,merged);
   group.fragments.push(fragment);
  }else groups.push({...fragment,fragments:[fragment]});
 }
 // Short isolated words need a little room for edge letters and nikkud.
 // Expand only preview geometry, never the underlying detected/selected lines.
 for(const group of groups){
  if(group.column!==2||group.width>=.16||group.count>1)continue;
  const padX=Math.min(.009,group.width*.18),padY=Math.min(.0035,group.height*.18);
  const oldRight=group.x+group.width,oldBottom=group.y+group.height;
  group.x=Math.max(0,group.x-padX);
  group.y=Math.max(0,group.y-padY);
  group.width=Math.min(1,oldRight+padX)-group.x;
  group.height=Math.min(1,oldBottom+padY)-group.y;
  group.shortLine=true;
 }
 for(const group of groups){
  const mid=group.y+group.height/2;
  const anchor=ocrLines.find(a=>(group.column===2||a.column===group.column)&&a.bbox&&
   Math.abs(mid-(a.bbox.y0+a.bbox.y1)/2)<Math.max(.012,group.height*.55));
  group.kind=anchor?"ocr":"unassigned";
  group.count=group.fragments.length;
 }
 return groups.sort((a,b)=>b.column-a.column||a.y-b.y);
}
// V3.63 validation: rescan original rendered page ink inside each
// reconstructed vertical band. No OCR-based width guesses or padding.
function refineHebrewPreviewFromInk(side,lines){
 const canvas=$(side===0?"output-left":"output-right");
 if(!canvas||!canvas.width)return {lines,refined:0};
 const w=canvas.width,h=canvas.height;
 const region=REGIONS[side],left=Math.max(0,Math.round(region.x/ W*w)+3);
 const right=Math.min(w,Math.round((region.x+region.w)/W*w)-3);
 const data=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,w,h).data;
 let refined=0;
 const result=lines.map(line=>{
  const top=Math.max(0,Math.floor(line.y*h)),bottom=Math.min(h,Math.ceil((line.y+line.height)*h));
  // Restrict each scan to its own physical line and original layout region.
  const l=line.column===2?left:Math.max(left,Math.floor(line.x*w)-Math.round(.025*w));
  const r=line.column===2?right:Math.min(right,Math.ceil((line.x+line.width)*w)+Math.round(.025*w));
  let minX=r,maxX=l,minY=bottom,maxY=top;
  for(let y=top;y<bottom;y++)for(let x=l;x<r;x++){
   const p=(y*w+x)*4;
   if(data[p]<165&&data[p+1]<165&&data[p+2]<165){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   }
  }
  if(maxX<=minX||maxY<=minY)return line;
  const pad=2;
  refined++;
  return {...line,x:Math.max(l,minX-pad)/w,y:Math.max(top,minY-pad)/h,
   width:(Math.min(r,maxX+pad)-Math.max(l,minX-pad))/w,
   height:(Math.min(bottom,maxY+pad)-Math.max(top,minY-pad))/h,inkRefined:true};
 });
 return {lines:result,refined};
}
async function diagnoseHebrewWordCounts(){
 const button=$("hebrew-ocr-diagnostic"),out=$("ocr-diagnostics");
 button.disabled=true;
 try{
  const sides=pageMetadata.map((r,i)=>r?.source?.languageCode==="H"?i:-1).filter(i=>i>=0);
  if(!sides.length){out.textContent="Load a Hebrew page first.";return}
  out.textContent="Reading Hebrew OCR...";
  const reports=[];
  for(const side of sides){
   const ocr=await recognizeCueLines(side);
   const byId=new Map(ocr.map(l=>[l.id,l.text]));
   const geometry=detectedLines[side]||[];
   const reconciliation=reconcileHebrewLinesForReport(side,ocr);
   currentHebrewPreviewSide=side;
   const reconstruction=reconstructedHebrewPreview(geometry,ocr);
   const inkResult=refineHebrewPreviewFromInk(side,reconstruction);
   hebrewReconstructionPreview[side]=inkResult.lines;
   const rows=reconciliation.groups.map((group,i)=>{
    const line=group.anchor;
    const text=line.text||"";
    const count=text.trim()?text.trim().split(/\s+/u).length:0;
    const fragments=group.fragments;
    return (i+1)+". col "+line.column+" | OCR words: "+count+
     " | assigned image fragments: "+fragments.length+
     " | image candidates across fragments: "+fragments.reduce((n,f)=>n+wordCandidates(side,f).length,0)+
     " | "+text;
   });
   rows.push("Unassigned image fragments: "+reconciliation.unassigned.length);
   rows.push("Adaptive layout transition: "+(hebrewLayoutTransitions[side]===null?"not confidently detected":(hebrewLayoutTransitions[side]*100).toFixed(1)+"% of canvas height"));
   rows.push("Original-image ink-refined rectangles: "+inkResult.refined);
   rows.push("Short isolated full-width lines padded: "+hebrewReconstructionPreview[side].filter(g=>g.shortLine).length);
   rows.push("Image-first reconstructed lines: "+hebrewReconstructionPreview[side].length+"; merged groups: "+hebrewReconstructionPreview[side].filter(g=>g.count>1).length+" (green=OCR nearby, orange=no OCR nearby)");
   rows.push("NOTE: image-first horizontal grouping is preview-only; selection rectangles remain unchanged.");
   reports.push("Hebrew page "+(pageMetadata[side].source.sourcePage||side+1)+
    " | OCR mapped "+ocr.length+" of "+geometry.length+" detected lines\n"+
    rows.join("\n")+"\n\nRAW OCR:\n"+rawOcrDiagnostics[side]);
  }
  out.textContent=reports.join("\n\n");
  out.closest("details").open=true;
  drawHighlights();
 }catch(e){out.textContent="Diagnostic error: "+e.message}
 finally{button.disabled=false}
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
 const doc=await PDFLib.PDFDocument.load(baseOutput||output);
 storeMasterRoles(doc);
 doc.getPages().forEach((page,i)=>{
  const record=pageMetadata[i];if(!record)return;
  // Render the same approved line/word selection geometry into the actual PDF.
  // Page metadata remains editable; artwork remains untouched.
  const lines=detectedLines[i]||[],highlights=record.leadership.highlights||[];
  const pageW=page.getWidth(),pageH=page.getHeight();
  for(const line of lines){
   const full=highlights.find(h=>h.lineId===line.id&&!h.wordId);
   const overrides=highlights.filter(h=>h.lineId===line.id&&h.wordId);
   const selections=overrides.length?wordCandidates(i,line).map(w=>({box:w,highlight:overrides.find(h=>h.wordId===w.id)})).filter(x=>x.highlight):full?[{box:line,highlight:full}]:[];
   for(const item of selections){
    const b=item.box,color=roleColor(item.highlight.roleId);
    const rgb=PDFLib.rgb(parseInt(color.slice(1,3),16)/255,parseInt(color.slice(3,5),16)/255,parseInt(color.slice(5,7),16)/255);
    page.drawRectangle({x:b.x*pageW,y:(1-b.y-b.height)*pageH,width:b.width*pageW,height:b.height*pageH,color:rgb,opacity:.34,blendMode:PDFLib.BlendMode.Multiply});
   }
  }
  for(const h of highlights)h.visibleInPdf=true;
  storePageMetadata(page,record);
 });
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
 displayMetadata();$("spread-preview").hidden=false;$("empty-preview").hidden=true;detectedLines=[0,1].map(i=>i<doc.numPages?detectPrintedLines($(i===0?"output-left":"output-right"),i):[]);drawHighlights();status("Detected "+detectedLines.map(a=>a.length).join(" / ")+" candidate printed lines.");await runRivokAutomatically();
 await autoMatchCues();
}
pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
$("source").addEventListener("change",async()=>{
 const file=$("source").files[0];if(!file)return;
 $("download").disabled=true;output=null;baseOutput=null;pageMetadata=[];ocrWordGeometry=[new Map(),new Map()];$("spread-preview").hidden=true;
 rivokOverlay=null;rivokWordsBySide=[null,null];
 filename=file.name.replace(/\.pdf$/i,"")||"siddur";
 roleConfig={id:"role-1",name:$("role-name").value.trim()||"Leader",color:"#F5D03C"};
 try{
  if(!window.PDFLib||!window.pdfjsLib)throw Error("PDF libraries unavailable.");
  output=await createPdf(new Uint8Array(await file.arrayBuffer()));
  baseOutput=output.slice();
  await preview(output);$("download").disabled=false;
  status(cueMatchReport);
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("cue-file").addEventListener("change",async()=>{
 const file=$("cue-file").files[0];if(!file)return;
 try{
  const rows=parseCsv(await file.text());
  if(!rows.length||!rows.every(c=>c.printed_page&&c.language&&
    (c.begin_cue||c.begin_cue_hebrew)&&(c.end_cue||c.end_cue_hebrew)))
    throw Error("CSV needs printed_page, language, and beginning/ending cues (begin_cue/end_cue or Hebrew equivalents).");
  importedCues=rows;
  applyImportedCues();
  if(pageMetadata.length)await autoMatchCues();
  status(pageMetadata.length?cueMatchReport:"Loaded "+rows.length+" cue rows. Now upload the test PDF.");
 }catch(e){status("Cue import failed: "+e.message)}
});
$("highlight-view").addEventListener("change",()=>{highlightView=$("highlight-view").value;drawHighlights()});
$("selection-mode").addEventListener("change",()=>{selectionMode=$("selection-mode").value;drawHighlights()});
installHighlightSelection();
async function runRivokAutomatically(){
 const report=$("rivok-status");
 const side=pageMetadata.findIndex(p=>p?.source?.languageCode==="H");
 if(side<0)return;
 if(!window.RivokBrowser){report.textContent="Rivok module unavailable; Hebrew automatic detection could not start.";return;}
 const canvas=$(side===0?"output-left":"output-right");
 try{
  const result=await RivokBrowser.detect(canvas,msg=>{report.textContent=msg;});
  rivokOverlay={side,width:result.imageWidth,height:result.imageHeight,words:result.words};
  installRivokSelectionGeometry(side,result);
  drawHighlights();
  report.textContent="Automatic Rivok detection: "+result.words.length+" Hebrew word candidates. Purple outlines show results; no extra click required.";
 }catch(error){
  console.error("Automatic Rivok detection",error);
  report.textContent="Automatic Rivok detection failed: "+error.message;
 }
}
$("rivok-run").addEventListener("click",async()=>{
 const button=$("rivok-run"),report=$("rivok-status");
 const side=pageMetadata.findIndex(p=>p?.source?.languageCode==="H");
 if(side<0){report.textContent="Upload a Hebrew page first.";return;}
 if(!window.RivokBrowser){report.textContent="Rivok browser module unavailable.";return;}
 button.disabled=true;
 try{
  const canvas=$(side===0?"output-left":"output-right");
  const result=await RivokBrowser.detect(canvas,msg=>{report.textContent=msg;});
  rivokOverlay={side,width:result.imageWidth,height:result.imageHeight,words:result.words};
  drawHighlights();
  report.textContent="Rivok detected "+result.words.length+" regions. Purple outlines are experimental word candidates; inspect יִתְבָּרַךְ. No PDF selections changed.";
 }catch(error){console.error(error);report.textContent="Rivok browser detection failed: "+error.message;}
 finally{button.disabled=false;}
});
$("rivok-export").addEventListener("click",()=>{
 const side=pageMetadata.findIndex(p=>p?.source?.languageCode==="H");
 if(side<0){$("rivok-status").textContent="Upload a Hebrew page first.";return;}
 const canvas=$(side===0?"output-left":"output-right");
 canvas.toBlob(blob=>{
  if(!blob)return;
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="leaders-companion-hebrew-preview.png";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  $("rivok-status").textContent="PNG exported. Run tools/rivok_ocr.py on this exact image; then import its JSON.";
 },"image/png");
});
$("rivok-json").addEventListener("change",async e=>{
 try{
  const file=e.target.files[0];if(!file)return;
  const result=JSON.parse(await file.text());
  const side=pageMetadata.findIndex(p=>p?.source?.languageCode==="H");
  if(side<0)throw Error("Upload a Hebrew page first.");
  const canvas=$(side===0?"output-left":"output-right");
  if(!Number.isFinite(result.imageWidth)||!Number.isFinite(result.imageHeight)||
     result.imageWidth!==canvas.width||result.imageHeight!==canvas.height)
   throw Error("Image dimensions do not match current Hebrew preview. Export and process this exact PNG.");
  if(!Array.isArray(result.words)||!result.words.every(w=>Array.isArray(w.bbox)&&w.bbox.length===4&&
    w.bbox.every(Number.isFinite)))throw Error("Invalid Rivok word boxes.");
  rivokOverlay={side,width:result.imageWidth,height:result.imageHeight,words:result.words};
  $("rivok-status").textContent="Rivok: "+result.words.length+" word rectangles (purple). Diagnostic only; verify Yitbarach.";
  drawHighlights();
 }catch(error){$("rivok-status").textContent="Rivok import failed: "+error.message;}
});
$("rivok-clear").addEventListener("click",()=>{rivokOverlay=null;drawHighlights();$("rivok-status").textContent="Rivok overlay cleared.";});
$("hebrew-ocr-diagnostic").addEventListener("click",diagnoseHebrewWordCounts);
$("download").addEventListener("click",async()=>{
 if(!output)return;
 try{await syncHighlightMetadata()}catch(e){status("Could not save highlight metadata: "+e.message);return}
 const url=URL.createObjectURL(new Blob([output],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=filename+"-v3.pdf";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
