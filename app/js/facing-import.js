"use strict";
const $=id=>document.getElementById(id);
const W=612,H=792,REGIONS=[{x:171.36,y:98,w:380.88,h:540},{x:59.76,y:98,w:380.88,h:540}];
let siddurStyleSheet={framework:"boxes"};
// Centralized, siddur-adjustable highlighting parameters. Values are normalized
// fractions of the source page. Defaults reproduce the V3.280 matcher.
const HIGHLIGHT_PARAMETER_DEFINITIONS=Object.freeze([
 {key:"hebrewBodyTop",label:"Hebrew body top",min:0,max:.4,step:.005,default:.19},
 {key:"hebrewContinuationTop",label:"Hebrew continuation top",min:0,max:.4,step:.005,default:.045},
 {key:"hebrewBodyBottom",label:"Hebrew body bottom",min:.65,max:1,step:.005,default:.91},
 {key:"physicalRowTolerance",label:"Printed row minimum tolerance",min:.002,max:.04,step:.001,default:.009},
 {key:"physicalRowHeightFactor",label:"Printed row height factor",min:.2,max:1.5,step:.05,default:.7},
 {key:"inkRowHeightFactor",label:"Ink row height factor",min:.2,max:1.5,step:.05,default:.65},
 {key:"hebrewWordSimilarity",label:"Hebrew word similarity",min:.5,max:1,step:.01,default:.83},
 {key:"hebrewPhraseConfidence",label:"Hebrew phrase confidence",min:.4,max:1,step:.01,default:.65},
 {key:"anchorAmbiguityMargin",label:"Anchor ambiguity margin",min:0,max:.3,step:.01,default:.08},
 {key:"boundaryRowTolerance",label:"Boundary row tolerance",min:.002,max:.04,step:.001,default:.012},
 {key:"boundaryHorizontalSlack",label:"Boundary horizontal slack",min:0,max:.1,step:.005,default:.035}
]);
const highlightParameters=Object.fromEntries(HIGHLIGHT_PARAMETER_DEFINITIONS.map(p=>[p.key,p.default]));
function setupHighlightParameterControls(){
 const container=$("highlight-parameter-controls");if(!container)return;
 for(const p of HIGHLIGHT_PARAMETER_DEFINITIONS){
  const label=document.createElement("label");label.style.display="block";label.style.margin="9px 0";
  const caption=document.createElement("span");caption.textContent=p.label+" ";
  const value=document.createElement("output");value.textContent=String(highlightParameters[p.key]);value.style.fontWeight="bold";
  const slider=document.createElement("input");slider.type="range";slider.min=p.min;slider.max=p.max;slider.step=p.step;
  slider.value=highlightParameters[p.key];slider.style.width="100%";slider.setAttribute("aria-label",p.label);
  slider.addEventListener("input",()=>{highlightParameters[p.key]=Number(slider.value);value.textContent=slider.value;});
  label.append(caption,value,slider);container.append(label);
 }
 $("highlight-parameters-reset")?.addEventListener("click",()=>{
  HIGHLIGHT_PARAMETER_DEFINITIONS.forEach((p,i)=>{highlightParameters[p.key]=p.default;
   const input=container.querySelectorAll('input[type="range"]')[i];if(input){input.value=p.default;input.dispatchEvent(new Event("input"));}});
 });
 $("highlight-parameters-apply")?.addEventListener("click",async()=>{
  if(!pageMetadata.length)return;
  await autoMatchCues();saveCurrentSpreadEdits();drawHighlights();
 });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupHighlightParameterControls);
else setupHighlightParameterControls();

let filename="siddur",pageMetadata=[],roleConfig=null,highlightDraft=null,importedCues=[];
function status(s){if($("status"))$("status").textContent=s;if($("editor-status")&&(!sourcePdfPages||/failed|error|cannot/i.test(s)))$("editor-status").textContent=s}
function updateSpanStatus(){const el=$("editor-status");if(!el)return;const total=Math.ceil(sourcePdfPages/2);el.hidden=!total;if(total)el.textContent="Displaying span "+Math.ceil(selectedSpreadFirst/2)+" of "+total;}
const workerURL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
async function drawKnownFrameworkFields(page,record,side,font,boldFont=font,embedded=null,out){
 const source=record?.source||{},ident=record?.identification||{};
 const cues=embedded?.cues||record?.leadership?.cues||[];
 const number=String(embedded?.printedPage||source.originalPageNumber||downloadPageNumber(source.sourcePdfPage)||"").split("-")[0].trim();
 const service=embedded?.serviceName||embedded?.service_name||record?.identification?.serviceName||ident.serviceName||"";
 const title=record?.leadership?.instructionPrayer||record?.prayerTitle||record?.identification?.prayerName||embedded?.prayerTitle||embedded?.prayerName||ident.prayerName||"";
 const instruction=embedded?.instructionText||record?.instructionText||"";
 const colorCode=String(embedded?.pageColor||record?.pageColor||"W").toUpperCase().slice(0,1);
 const palette={W:[.975,.975,.975],N:[.7,1,.15],B:[.14,.36,.83],R:[.86,.16,.18],O:[.98,.54,.1],G:[.18,.65,.29]};
 const rgb=palette[colorCode]||palette.W;
 const textX=side===0?171.36:59.76,numberX=side===0?20.16:544.96;
 const colorX=side===0?numberX+48:numberX-18;
 const serviceX=side===0?colorX+18:59.76;
 const safe=v=>String(v??"").replace(/[^\x20-\x7e]/g,"").trim();
 const fit=(value,x,y,width,size,f=font,color=PDFLib.rgb(.12,.23,.27))=>{
  let t=safe(value);if(!t)return;
  while(t&&f.widthOfTextAtSize(t,size)>width)t=t.slice(0,-1);
  if(t)page.drawText(t,{x,y,size,font:f,color});
 };
 if(number){const n=safe(number),w=boldFont.widthOfTextAtSize(n,18);if(w<=42)page.drawText(n,{x:numberX+24-w/2,y:750,size:18,font:boldFont,color:PDFLib.rgb(.82,.12,.16)});}
 page.drawRectangle({x:colorX+1,y:749,width:16,height:18,color:PDFLib.rgb(...rgb)});
 fit(service,serviceX+4,751,458,18,boldFont);
 // The approved title field is 372.8pt wide; Hebrew must be rasterized,
 // since PDF standard fonts cannot encode Hebrew. Align RTL text to the right.
 if(String(title).trim()){
  const rtl=/[\u0590-\u05ff]/u.test(title),w=372.8,h=29,scale=3;
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);
  const ctx=canvas.getContext("2d");ctx.font="bold "+(20*scale)+"px Arial, sans-serif";
  ctx.textBaseline="middle";ctx.direction=rtl?"rtl":"ltr";ctx.textAlign=rtl?"right":"left";
  ctx.fillStyle="#203b45";
  if(ctx.measureText(String(title)).width>canvas.width-18)throw Error("Prayer title exceeds approved field: "+title);
  ctx.fillText(String(title),rtl?canvas.width-9:9,canvas.height/2);
  const png=await out.embedPng(canvas.toDataURL("image/png"));
  page.drawImage(png,{x:textX+4,y:707,width:w,height:h});
 }
 // Instruction text is explicitly sourced; an ID alone is not the instruction text.
 if(instruction){
  const words=safe(instruction).split(/\\s+/),lines=[];let line="";
  for(const word of words){const test=line?line+" "+word:word;
   if(font.widthOfTextAtSize(test,12)>372.8&&line){lines.push(line);line=word;}else line=test;}
  if(line)lines.push(line);
  lines.slice(0,3).forEach((l,i)=>fit(l,textX+4,688-i*14,372.8,12));
 }
 // The bottom strip is a compact overview; full four-field cue layout awaits
 // approved placement. Never discard extra cues from embedded metadata.
 const labels=cues.slice(0,3).map(c=>[
  c.beginCue??c.begin_cue??c.cue_left??c.startCue,
  c.endCue??c.end_cue??c.cue_right??c.endCue,
  c.leaderRole??c.role_name??c.role_code??c.role,
  c.performanceStyle??c.style
 ].map(safe).filter(Boolean).join(" | "));
 labels.forEach((line,i)=>fit(line,textX+4,80-i*11,372.8,8));
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
function cueHasHebrewScript(cue){
 // Match the script of the actual logical start/end cues, not translations
 // carried in auxiliary Hebrew fields or the OCR language of the page.
 const text=[cue.startCue,cue.endCue,cue.beginCue,cue.begin_cue,cue.end_cue]
  .filter(Boolean).join(" ");
 const observed=text||[cue.startCueHebrew,cue.endCueHebrew,cue.begin_cue_hebrew,cue.end_cue_hebrew].filter(Boolean).join(" ");
 const hebrew=(observed.match(/[\u0590-\u05ff]/g)||[]).length;
 const latin=(observed.match(/[A-Za-z]/g)||[]).length;
 return hebrew>latin;
}
function pageHasHebrewCue(record){return (record?.leadership?.cues||[]).some(cueHasHebrewScript);}
function applyImportedCues(){
 if(!pageMetadata.length)return;
 for(const record of pageMetadata){
  const code=record.source.languageCode,number=record.source.originalPageNumber;
  const matches=importedCues.filter(c=>{
   const ref=String(c.source_page||c.printed_page||"").trim();
   const manifestRef=String(record.source.serviceReference||"").trim();
   const range=value=>{const m=value.match(/^(\d+)(?:-(\d+))?$/);return m?[Number(m[1]),Number(m[2]||m[1])]:null};
   const cueRange=range(ref),pageRange=range(manifestRef);
   const sameReference=!!manifestRef&&(ref===manifestRef||(cueRange&&pageRange&&cueRange[0]<=pageRange[1]&&pageRange[0]<=cueRange[1]));
   const page=Number(number);
   const inRange=cueRange&&Number.isFinite(page)&&page>=cueRange[0]&&page<=cueRange[1];
   const language=String(c.language||"").toUpperCase();
   const supplement=ref.toUpperCase().startsWith("SUP-")||manifestRef.toUpperCase().startsWith("SUP-");
   // Source-page OCR language is not a cue eligibility filter: supplements may mix scripts.
   const languageMatches=true;
   return (supplement?ref.toUpperCase()===manifestRef.toUpperCase():(sameReference||(!manifestRef&&inRange)))&&languageMatches;
  });
  // Canonical CSV begin_cue/end_cue are logical reading boundaries.
  // Physical cue_left/cue_right are used only when explicitly supplied.
  record.leadership.cues=matches.map((c,i)=>{
   const isHebrew=/[\u05d0-\u05ea]/.test([c.begin_cue,c.end_cue,c.begin_cue_hebrew,c.end_cue_hebrew].join(" "));
   const beginning=String(c.begin_cue||c.begin_cue_hebrew||(isHebrew?c.cue_right:c.cue_left)||"");
   const ending=String(c.end_cue||c.end_cue_hebrew||(isHebrew?c.cue_left:c.cue_right)||"");
   return {
    cueId:c.cue_id||c.test_id||"import-"+i,service:c.service_name||c.service||null,role:c.leader_role||c.role_name||c.role_code||c.role||null,
    style:c.performance_style||c.style||null,styleSlot:null,cueLanguage:/[\u0590-\u05ff]/.test(beginning+" "+ending)?"hebrew":/[A-Za-z]/.test(beginning+" "+ending)?"english":"unknown",startCue:beginning,endCue:ending,
    startCueHebrew:isHebrew?(beginning||c.begin_cue_hebrew||""):(c.begin_cue_hebrew||""),
    endCueHebrew:isHebrew?(ending||c.end_cue_hebrew||""):(c.end_cue_hebrew||""),
    prayer:c.prayer_name||c.prayer_action||c.prayer||null,sourceRow:c.leader_map_source_row||null,
    highlights:[],matchStatus:"unmatched-review-required"
   };
  });
  if(matches.length){record.identification.serviceCode=matches[0].service||null;
   record.identification.prayerName=matches[0].prayer_name||matches[0].prayer||null;record.identification.serviceName=matches[0].service_name||null;
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
let visibleCueId="";
let selectedCueBySide=["",""];
const cueRoleEdits=new Map();
function cueRoleOptions(){const roles=new Map([["R","Rabbi"],["P","President"],["C","Congregation"],["L","Leader"],["S1","Soloist 1"],["S2","Soloist 2"]]);for(const [code,name] of serviceRoleDisplayNames)roles.set(String(code),String(name));for(const code of serviceRoleAssignments.values())if(!roles.has(String(code)))roles.set(String(code),String(code));return roles}
function applyCueRoleEdits(){for(const record of pageMetadata)for(const cue of record?.leadership?.cues||[]){if(!cueRoleEdits.has(cue.cueId))continue;cue.role=cueRoleEdits.get(cue.cueId);for(const h of record.leadership.highlights||[])if(h.cueId===cue.cueId)h.roleId=cue.role}}

function installCueVisibilityPicker(){
 const anchor=$("highlight-view");if(!anchor||$("visible-cue"))return;
 const select=document.createElement("select");select.id="visible-cue";select.setAttribute("aria-label","Visible leader cue");
 anchor.insertAdjacentElement("afterend",select);
 select.addEventListener("change",()=>{visibleCueId=select.value;if(visibleCueId&&visibleCueId!=="__all__"){for(let side=0;side<pageMetadata.length;side++)if(pageMetadata[side]?.leadership?.cues?.some(c=>c.cueId===visibleCueId))selectedCueBySide[side]=visibleCueId;renderPageCueEditor();}drawHighlights()});
}

let cueCsvRows=[],cueCsvHeaders=[];
function cueCsvSerialize(){
 const headers=[...new Set([...cueCsvHeaders,...cueCsvRows.flatMap(row=>Object.keys(row))])];
 const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 return [headers.map(quote).join(","),...cueCsvRows.map(row=>headers.map(h=>quote(row[h])).join(","))].join("\r\n")+"\r\n";
}
function cueCsvUpdate(cueId,start,end,role){
 const row=cueCsvRows.find(c=>(c.cue_id||c.test_id)===cueId);
 if(!row)return false;
 row.begin_cue=start;row.end_cue=end;
 const lang=String(row.language||"").toUpperCase();
 if("cue_left" in row)row.cue_left=lang==="H"?end:start;
 if("cue_right" in row)row.cue_right=lang==="H"?start:end;
 if("begin_cue_hebrew" in row)row.begin_cue_hebrew=/[\u0590-\u05ff]/u.test(start)?start:"";
 if("end_cue_hebrew" in row)row.end_cue_hebrew=/[\u0590-\u05ff]/u.test(end)?end:"";
 if(role)row.leader_role=role;
 return true;
}
function downloadUpdatedCueCsv(){
 const blob=new Blob([cueCsvSerialize()],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download=(($("assembly-siddur")?.value||filename)+" - "+($("assembly-service")?.value||"service")+" - updated cues.csv").replace(/[\\/:*?"<>|]/g,"_");
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function saveCueCsvHandoff(){
 if(!window.indexedDB)return;
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open("leaders-companion-siddur-v3",1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction("projects","readwrite"),store=tx.objectStore("projects"),req=store.get("handoff");req.onsuccess=()=>{const data=req.result;if(data){data.csv=cueCsvSerialize();store.put(data,"handoff")}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 db.close();
}
const cueTextEdits=new Map();
function applyCueTextEdits(){
 for(const record of pageMetadata)for(const cue of record?.leadership?.cues||[]){
  const edit=cueTextEdits.get(cue.cueId);if(!edit)continue;
  cue.startCue=edit.start;cue.endCue=edit.end;
  cue.startCueHebrew=/[\u0590-\u05ff]/u.test(edit.start)?edit.start:"";
  cue.endCueHebrew=/[\u0590-\u05ff]/u.test(edit.end)?edit.end:"";
  cue.matchStatus="edited-awaiting-rematch";
 }
}
let facingInstructionLibrary=null;
let instructionCatalog=[];
const INSTRUCTION_CATALOG_STORAGE="leaders-companion-v3-custom-instructions-v1";
function customInstructionCatalog(){
 try{return JSON.parse(localStorage.getItem(INSTRUCTION_CATALOG_STORAGE)||"[]").filter(e=>e&&e.id&&e.text);}catch{return [];}
}
function allInstructionCatalog(){return [...instructionCatalog,...customInstructionCatalog()];}
const INSTRUCTION_USAGE_STORAGE="leaders-companion-v3-instruction-usage-v1";
function instructionUsageCounts(){
 try{const counts=JSON.parse(localStorage.getItem(INSTRUCTION_USAGE_STORAGE)||"{}");return counts&&typeof counts==="object"&&!Array.isArray(counts)?counts:{};}catch{return {};}
}
function instructionFrequency(entry,counts){
 return Math.max(0,Number(entry.linkedCueCount)||0)+Math.max(0,Number(counts[entry.id])||0);
}
function instructionsByFrequency(){
 const counts=instructionUsageCounts();
 return allInstructionCatalog().slice().sort((a,b)=>
  instructionFrequency(b,counts)-instructionFrequency(a,counts)||
  String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base"})||
  String(a.id).localeCompare(String(b.id))
 );
}
function recordInstructionUse(id){
 try{const counts=instructionUsageCounts();counts[id]=(Math.max(0,Number(counts[id])||0)+1);localStorage.setItem(INSTRUCTION_USAGE_STORAGE,JSON.stringify(counts));}
 catch(error){console.warn("Instruction usage count not saved",error);}
}
function catalogInstruction(id){return allInstructionCatalog().find(e=>e.id===id);}
fetch("../../data/instruction-library-v2-seed.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("V2 instruction catalog HTTP "+r.status);return r.json()}).then(data=>{
 instructionCatalog=data.entries||[];renderFacingInstructions();
}).catch(e=>{const label=$("facing-instruction-status");if(label)label.textContent="V2 instruction catalog unavailable: "+e.message;});

fetch("../../data/prayer-instructions.v1.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("Instruction library HTTP "+r.status);return r.json()}).then(data=>{facingInstructionLibrary=data;renderFacingInstructions()}).catch(e=>{const status=$("facing-instruction-status");if(status)status.textContent="Instruction library unavailable: "+e.message});
function facingPageWarnings(record){
 const state=record.leadership;
 const warnings=[];
 for(const cue of state.cues||[])if(!String(cue.matchStatus||"").includes("candidate")&&!String(cue.matchStatus||"").includes("matched"))warnings.push("Cue "+cue.cueId+" requires review: "+(cue.matchStatus||"unmatched"));
 for(const id of state.instructionIds||[]){
  if(catalogInstruction(String(id)))continue;
  const legacy=(facingInstructionLibrary?.prayers||[]).flatMap(p=>p.instructions||[]).find(e=>String(e.instruction_id)===String(id));
  if(!legacy)warnings.push("Instruction ID "+id+" not found in database");
 }
 return warnings;
}
function instructionTextForPage(state){
 return (state.instructionIds||[]).map(id=>{
  const item=catalogInstruction(String(id));
  if(item)return item.text;
  const legacy=(facingInstructionLibrary?.prayers||[]).flatMap(p=>p.instructions||[]).find(e=>String(e.instruction_id)===String(id));
  return legacy?String(legacy.text).replace(/\\{PrayerName\\}/g,state.instructionPrayer||"prayer").replace(/\\{PageNumber\\}/g,state.instructionPageNumber||"").replace(/\\{[^}]+\\}/g,""):"";
 }).filter(Boolean);
}
function storeCustomInstruction(name,value,existingId=null){
 const items=customInstructionCatalog(),old=items.find(e=>e.id===existingId);
 const id=old?.id||"V3-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
 const item={id,name:name||old?.name||"Custom instruction",text:value,category:old?.category||"Custom",status:"Draft",notes:old?.notes||"Created in V3",linkedCueCount:0};
 localStorage.setItem(INSTRUCTION_CATALOG_STORAGE,JSON.stringify([...items.filter(e=>e.id!==id),item]));
 return id;
}
function ensurePageInstructionEntries(state){
 if(Array.isArray(state.instructionEntries)){
  // One-time migration: preserve old page-specific text in custom catalog entries.
  const old=state.instructionEntries;
  const ids=old.map(e=>{
   const current=catalogInstruction(String(e.catalogId||e.templateId||""));
   if(current&&current.text===e.text)return current.id;
   if(e.text)return storeCustomInstruction("Migrated page instruction",e.text);
   return current?.id||null;
  }).filter(Boolean);
  state.instructionIds=ids;delete state.instructionEntries;
 }
 return (state.instructionIds||[]).map((id,index)=>({id:String(id),key:index+"-"+id,text:instructionTextForPage({instructionIds:[id],instructionPrayer:state.instructionPrayer,instructionPageNumber:state.instructionPageNumber})[0]||""}));
}
// Shared geometry for the editable cue overlay and final PDF export.
// Coordinates are in 612 x 792 PDF points; cue rows are divided equally.
function v3CuePlan(record,side){
 if(!window.LCV3CueLayout)throw Error("Cue layout engine unavailable; cannot render or export.");
 const state=record?.leadership||{},cues=(state.cues||[]).slice(0,3);
 const ctx=document.createElement("canvas").getContext("2d");
 const measure=(text,font)=>{ctx.font=font+"px Arial, sans-serif";return ctx.measureText(text).width;};
 return window.LCV3CueLayout.layout({cues,side,measure,roleColor:role=>roleColor(role||state.role)});
}
function renderInstructionPreviews(){
 // The canonical PDF already contains the instruction and cue artwork.
 // Legacy HTML overlays used white backgrounds that obscured the original
 // master PDF's horizontal and vertical section borders. Remove them.
 for(const canvasId of ["output-left","output-right"]){
  const parent=$(canvasId)?.parentElement;if(!parent)continue;
  parent.querySelectorAll(".instruction-page-preview,.cue-page-preview").forEach(node=>node.remove());
 }
}
function pageApprovalFingerprint(record){
 const state=record.leadership||{};
 return JSON.stringify({highlights:state.highlights||[],cues:state.cues||[],instructionIds:state.instructionIds||[],instructionPrayer:state.instructionPrayer||"",instructionPosition:state.instructionPosition||"top",instructionOverrides:state.instructionOverrides||{},approvedCrop:record.production?.approvedCrop||null});
}
function pageApprovalCurrent(record){
 const state=record?.leadership;
 return !!(state?.highlightConfirmed&&state.confirmedFingerprint===pageApprovalFingerprint(record));
}
function renderFacingInstructions(){
 const root=$("facing-instruction-pages");if(!root)return;root.replaceChildren();
 for(let side=0;side<pageMetadata.length;side++){
  const record=pageMetadata[side];if(!record)continue;
  const state=record.leadership;state.instructionIds??=[];state.instructionOverrides??={};
  const panel=document.createElement("section");panel.className="instruction-page-panel";
  const title=document.createElement("strong");title.textContent=(side===0?"Left":"Right")+" page instructions";panel.append(title);
  const prayerTitle=state.instructionPrayer||record.prayerTitle||record.identification?.prayerName||record.leadership?.cues?.[0]?.prayer||"Untitled prayer";
  const prayerRow=document.createElement("div");prayerRow.className="instruction-prayer-row";
  const prayerLabel=document.createElement("label");prayerLabel.textContent="Page prayer title ";
  const prayer=document.createElement("input");prayer.type="text";prayer.value=prayerTitle;
  prayer.dir=/[\u0590-\u05ff]/u.test(prayerTitle)?"rtl":"auto";
  prayer.setAttribute("aria-label",(side===0?"Left":"Right")+" page prayer title");
  prayer.oninput=()=>{prayer.dir=/[\u0590-\u05ff]/u.test(prayer.value)?"rtl":"auto";};
  prayerLabel.append(prayer);prayerRow.append(prayerLabel);
  const feedback=document.createElement("span");feedback.setAttribute("role","status");
  const save=document.createElement("button");save.type="button";save.textContent="Save title";
  const revert=document.createElement("button");revert.type="button";revert.textContent="Revert";
  revert.onclick=()=>{prayer.value=state.instructionPrayer||record.prayerTitle||record.identification?.prayerName||prayerTitle;prayer.dir=/[\u0590-\u05ff]/u.test(prayer.value)?"rtl":"auto";feedback.textContent="Unsaved changes reverted.";};
  save.onclick=async()=>{
   const value=prayer.value.trim();if(!value){feedback.textContent="Title cannot be empty.";return;}
   const prior={prayerTitle:record.prayerTitle,identification:structuredClone(record.identification||{}),instructionPrayer:state.instructionPrayer,highlightConfirmed:state.highlightConfirmed};
   record.prayerTitle=value;record.identification??={};record.identification.prayerName=value;state.instructionPrayer=value;state.highlightConfirmed=false;
   save.disabled=true;feedback.textContent="Saving…";
   try{await saveCheckpointNow();scheduleCanonicalPreview();feedback.textContent="Saved and PDF rebuilt.";renderPageCueEditor();}
   catch(error){record.prayerTitle=prior.prayerTitle;record.identification=prior.identification;state.instructionPrayer=prior.instructionPrayer;state.highlightConfirmed=prior.highlightConfirmed;feedback.textContent="Save failed: "+error.message;}
   finally{save.disabled=false;}
  };
  prayerRow.append(save,revert,feedback);panel.append(prayerRow);
  state.instructionPageNumber=String(record.source?.originalPageNumber||record.source?.sourcePdfPage||"");
  const entries=ensurePageInstructionEntries(state);
  const saveInstructions=async(next)=>{
   const previous=[...state.instructionIds],previousApproval=state.highlightConfirmed;
   state.instructionIds=next.map(e=>String(e.id));state.highlightConfirmed=false;
   try{await saveCheckpointNow();scheduleCanonicalPreview();renderFacingInstructions();}
   catch(error){state.instructionIds=previous;state.highlightConfirmed=previousApproval;renderFacingInstructions();status("Instruction save failed: "+error.message);}
  };
  const select=document.createElement("select");select.setAttribute("aria-label","Instruction database for "+(side===0?"left":"right")+" page");
  select.add(new Option("Choose an instruction from database",""));
  for(const entry of instructionsByFrequency())select.add(new Option(entry.id+" — "+entry.name+" ["+entry.status+"]",entry.id));
  panel.append(select);
  const count=document.createElement("div");count.className="instruction-count";
  count.textContent=entries.length+" instruction"+(entries.length===1?"":"s")+" on this page";panel.append(count);
  const add=document.createElement("button");add.type="button";add.textContent="+ Add instruction";
  const addStatus=document.createElement("span");addStatus.setAttribute("role","status");
  add.onclick=async()=>{
   const template=catalogInstruction(select.value);
   if(!template){addStatus.textContent="Choose an instruction from the dropdown first.";return;}
   if(entries.some(e=>e.id===template.id)){addStatus.textContent="This instruction is already assigned to this page.";return;}
   add.disabled=true;addStatus.textContent="Adding instruction…";
   const next=[...entries,{id:template.id,text:template.text}];
   const previous=[...state.instructionIds],previousApproval=state.highlightConfirmed;
   state.instructionIds=next.map(e=>String(e.id));state.highlightConfirmed=false;
   try{
    await saveCheckpointNow();scheduleCanonicalPreview();recordInstructionUse(template.id);
    renderFacingInstructions();
   }catch(error){
    state.instructionIds=previous;state.highlightConfirmed=previousApproval;
    addStatus.textContent="Could not add instruction: "+error.message;
   }finally{add.disabled=false;}
  };panel.append(add,addStatus);
  const customLabel=document.createElement("label");customLabel.textContent="New database instruction name ";
  const customName=document.createElement("input");customName.type="text";customLabel.append(customName);panel.append(customLabel);
  const customText=document.createElement("textarea");customText.rows=2;customText.placeholder="Instruction wording";customText.setAttribute("aria-label","New database instruction text");panel.append(customText);
  const customSave=document.createElement("button");customSave.type="button";customSave.textContent="Save new instruction to database";
  const customStatus=document.createElement("span");customStatus.setAttribute("role","status");
  customSave.onclick=()=>{
   const name=customName.value.trim(),text=customText.value.trim();
   if(!name||!text){customStatus.textContent="Name and instruction text required.";return;}
   const existing=customInstructionCatalog();
   const id="V3-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);
   const item={id,name,text,category:"Custom",status:"Draft",notes:"Created in V3 editor",linkedCueCount:0};
   try{localStorage.setItem(INSTRUCTION_CATALOG_STORAGE,JSON.stringify([...existing,item]));renderFacingInstructions();}
   catch(error){customStatus.textContent="Database save failed: "+error.message;}
  };
  panel.append(customSave,customStatus);
  for(const entry of entries){
   const line=document.createElement("div");line.className="instruction-selected";
   const textarea=document.createElement("textarea");textarea.value=entry.text||"";textarea.rows=2;
   textarea.setAttribute("aria-label","Instruction text");line.append(textarea);
   const message=document.createElement("span");message.setAttribute("role","status");
   const save=document.createElement("button");save.type="button";save.textContent="Save instruction";
   save.onclick=async()=>{const value=textarea.value.trim();if(!value){message.textContent="Enter instruction text.";return;}
    save.disabled=true;const current=catalogInstruction(entry.id);const newId=storeCustomInstruction(current?.name||"Edited instruction",value,entry.id.startsWith("V3-")?entry.id:null);await saveInstructions(entries.map(e=>e.key===entry.key?{id:newId,text:value}:e));};
   const revert=document.createElement("button");revert.type="button";revert.textContent="Revert";
   revert.onclick=()=>{textarea.value=entry.text||"";message.textContent="Unsaved changes reverted.";};
   const remove=document.createElement("button");remove.type="button";remove.textContent="Remove";
   remove.onclick=()=>saveInstructions(entries.filter(e=>e.key!==entry.key));
   line.append(save,revert,remove,message);panel.append(line);
  }
  state.instructionPageNumber=String(record.source.originalPageNumber||record.source.sourcePdfPage||"");
  const warnings=facingPageWarnings(record);
  if(warnings.length){const notice=document.createElement("p");notice.textContent="Needs review: "+warnings.join("; ");panel.append(notice);}
  const unresolved=warnings;
  // Approval is recorded by the explicit Save page and move to next action.
  const note=document.createElement("p");note.textContent=unresolved.length?unresolved.length+" item(s) need review. Printing remains available without overrides.":pageApprovalCurrent(record)?"Page confirmed for download.":"Review the page, then use Save page and move to next.";panel.append(note);
  root.append(panel);
 }
 root.classList.add("instruction-two-pages");
 renderInstructionPreviews();
}
function renderPageCueEditor(){
 const root=$("page-cue-editor");if(!root)return;root.replaceChildren();
 root.classList.add("cue-two-pages");
 for(let side=0;side<2;side++){
  const record=pageMetadata[side],cues=record?.leadership?.cues||[];
  const panel=document.createElement("section");panel.className="cue-page-panel";
  const title=document.createElement("div");title.className="cue-page-title";
  title.textContent=(side===0?"Left":"Right")+" page"+(record?.source?.originalPageNumber?" · "+record.source.originalPageNumber:"");
  panel.append(title);
  if(record){
   const addCue=document.createElement("button");addCue.type="button";addCue.textContent="Add cue to this page";
   addCue.onclick=()=>{
    const id="MANUAL-"+Date.now()+"-"+side;
    const role=cueRoleOptions().keys().next().value||"R";
    const cue={cueId:id,role,style:"SOLO",prayer:record.leadership?.instructionPrayer||record.prayerTitle||"New cue",startCue:"",endCue:"",highlights:[],matchStatus:"unmatched-review-required",manualCreated:true};
    record.leadership.cues??=[];record.leadership.cues.push(cue);record.leadership.highlightConfirmed=false;
    const reference=String(record.source?.originalPageNumber||record.source?.sourcePdfPage||"");
    const exemplar=cueCsvRows.find(row=>String(row.page_reference||row.page_ref||row.printed_page||"")===reference)||{};
    const csvRow={...exemplar,cue_id:id,test_id:id,prayer_name:cue.prayer,leader_role:role,role,style:cue.style,
      page_reference:reference,begin_cue:"",end_cue:"",language:record.source?.languageCode||exemplar.language||""};
    cueCsvRows.push(csvRow);importedCues.push({...csvRow});
    for(const field of Object.keys(csvRow))if(!cueCsvHeaders.includes(field))cueCsvHeaders.push(field);
    selectedCueBySide[side]=id;visibleCueId=id;
    saveCurrentSpreadEdits();renderPageCueEditor();refreshCueVisibilityPicker();drawHighlights();
    $("page-cue-editor-status").textContent="New cue created on "+(side===0?"left":"right")+" page. Enter beginning/end text, then Save cue and rematch.";
   };
   panel.append(addCue);
  }
  applyCueRoleEdits();
  const active=cues.find(c=>c.cueId===selectedCueBySide[side])||cues[0];
  const selector=document.createElement("label");selector.className="cue-number-selector";selector.textContent="Cue number ";
  const choice=document.createElement("select");choice.setAttribute("aria-label",(side===0?"Left":"Right")+" page cue number");
  cues.forEach((cue,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent="Cue "+(index+1)+(cue.prayer?" — "+cue.prayer:"");choice.append(option)});
  choice.value=String(Math.max(0,cues.indexOf(active)));
  choice.disabled=!cues.length;
  choice.onchange=()=>{selectedCueBySide[side]=cues[Number(choice.value)].cueId;visibleCueId=selectedCueBySide[side];const picker=$("visible-cue");if(picker)picker.value=visibleCueId;renderPageCueEditor();drawHighlights()};
  selector.append(choice);panel.append(selector);
  if(active){
   const roleRow=document.createElement("label");roleRow.className="cue-role-selector";roleRow.textContent="Role ";
   const roleSelect=document.createElement("select");roleSelect.setAttribute("aria-label",(side===0?"Left":"Right")+" page selected cue role");
   const roles=cueRoleOptions();if(!roles.has(String(active.role)))roles.set(String(active.role),String(active.role));
   for(const [code,name] of roles){const option=document.createElement("option");option.value=code;option.textContent=name;roleSelect.append(option)}
   roleSelect.value=String(active.role);
   roleSelect.onchange=()=>{active.role=roleSelect.value;cueRoleEdits.set(active.cueId,active.role);
    for(const record of pageMetadata){for(const cue of record.leadership.cues)if(cue.cueId===active.cueId)cue.role=active.role;
     for(const h of record.leadership.highlights)if(h.cueId===active.cueId)h.roleId=active.role;
     if(record.leadership.cues.some(c=>c.cueId===active.cueId))record.leadership.highlightConfirmed=false}
    for(const row of importedCues)if((row.cue_id||row.test_id)===active.cueId)row.role=active.role;
    renderPageCueEditor();drawHighlights();displayMetadata();
    $("page-cue-editor-status").textContent="Cue "+(cues.indexOf(active)+1)+" role updated on "+(side===0?"left":"right")+" page. Review highlights before approval.";
   };
   roleRow.append(roleSelect);panel.append(roleRow);
  }
  if(!active){const note=document.createElement("p");note.textContent="No cues on this page.";panel.append(note);root.append(panel);continue}
  const wrap=document.createElement("div");wrap.className="cue-edit-compact";
  const nameLabel=document.createElement("label");nameLabel.textContent="Prayer name ";
  const name=document.createElement("input");name.type="text";name.value=active.prayer||"";name.setAttribute("aria-label","Prayer name for selected cue");nameLabel.append(name);wrap.append(nameLabel);
  const metadata=document.createElement("div");metadata.className="cue-role-style";metadata.style.cssText="display:flex;flex-wrap:wrap;gap:12px;margin:8px 0;font-size:.95em";
  const roleLabel=document.createElement("label");roleLabel.textContent="Role code ";
  const roleInput=document.createElement("select");roleInput.setAttribute("aria-label","Selected cue role code");
  const roleChoices=cueRoleOptions();for(const cue of importedCues||[])if(cue.role&&!roleChoices.has(String(cue.role)))roleChoices.set(String(cue.role),String(cue.role));
  if(active.role&&!roleChoices.has(String(active.role)))roleChoices.set(String(active.role),String(active.role));
  for(const [code,display] of roleChoices)roleInput.add(new Option(code+(display!==code?" — "+display:""),code));
  roleInput.value=String(active.role||"");roleLabel.append(roleInput);
  const styleLabel=document.createElement("label");styleLabel.textContent="Style ";
  const styleInput=document.createElement("select");styleInput.setAttribute("aria-label","Selected cue style");
  const styleChoices=new Set(["SOLO","RESP","UNISON"]);
  for(const cue of importedCues||[])if(cue.style)styleChoices.add(String(cue.style));
  for(const page of pageMetadata)for(const cue of page?.leadership?.cues||[])if(cue.style)styleChoices.add(String(cue.style));
  if(active.style)styleChoices.add(String(active.style));
  for(const style of styleChoices)styleInput.add(new Option(style,style));
  styleInput.value=String(active.style||"");styleLabel.append(styleInput);
  metadata.append(roleLabel,styleLabel);wrap.append(metadata);
  const saveMetadata=document.createElement("button");saveMetadata.type="button";saveMetadata.textContent="Save cue metadata";
  saveMetadata.onclick=()=>{
   const prayer=name.value.trim(),role=roleInput.value.trim(),style=styleInput.value.trim();
   if(!prayer||!role||!style){$("page-cue-editor-status").textContent="Prayer name, role code, and style are required.";return;}
   active.prayer=prayer;active.role=role;active.style=style;
   for(const page of pageMetadata)if(page?.leadership?.cues?.some(c=>c.cueId===active.cueId)){
    for(const cue of page.leadership.cues)if(cue.cueId===active.cueId){cue.prayer=prayer;cue.role=role;cue.style=style;}
    for(const highlight of page.leadership.highlights||[])if(highlight.cueId===active.cueId)highlight.roleId=role;
    page.leadership.highlightConfirmed=false;
   }
   cueRoleEdits.set(active.cueId,role);
   for(const row of importedCues)if((row.cue_id||row.test_id)===active.cueId){row.prayer_name=prayer;row.role=role;row.style=style;}
   saveCurrentSpreadEdits();renderPageCueEditor();drawHighlights();displayMetadata();
   $("page-cue-editor-status").textContent="Cue metadata updated in the current spread. Save Project Checkpoint to persist it.";
  };
  wrap.append(saveMetadata);
  const inputs={};
  const hebrewCue=record?.source?.languageCode==="H"||(/[\u0590-\u05ff]/u.test((active.startCue||"")+(active.endCue||"")));
  const directionRow=document.createElement("div");directionRow.className="cue-direction-row";
  directionRow.style.cssText="display:grid;grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr);gap:8px;align-items:center;margin:12px 0";
  const fields=hebrewCue?[["end","Ending",active.endCue],["start","Beginning",active.startCue]]:[["start","Beginning",active.startCue],["end","Ending",active.endCue]];
  const cueColor=roleColor(active.role);
  const cueFields=[];
  for(const [key,label,value] of fields){
   const lab=document.createElement("label");lab.className="cue-field";lab.style.cssText="display:flex;flex-direction:column;min-width:0;gap:4px";
   const heading=document.createElement("span");heading.textContent=label;lab.append(heading);
   const input=document.createElement("textarea");input.rows=2;input.value=value||"";input.dir=hebrewCue?"rtl":"ltr";
   input.style.textAlign=key==="start"?(hebrewCue?"right":"left"):(hebrewCue?"left":"right");
   input.style.width="100%";input.style.boxSizing="border-box";
   input.style.backgroundColor=cueColor;input.style.color="#17231d";input.style.border="1px solid #52635b";
   lab.append(input);inputs[key]=input;cueFields.push(lab);
  }
  const arrow=document.createElement("span");arrow.textContent=hebrewCue?"←":"→";
  arrow.setAttribute("aria-label",hebrewCue?"Reading direction right to left":"Reading direction left to right");
  arrow.style.cssText="font-size:30px;text-align:center;font-weight:bold;align-self:center";
  directionRow.append(cueFields[0],arrow,cueFields[1]);
  wrap.append(directionRow);
  const cue=active;
     const button=document.createElement("button");button.type="button";button.textContent="Save cue and rematch";button.onclick=async()=>{
    const start=inputs.start.value.trim(),end=inputs.end.value.trim();
    if(!start||!end){$("page-cue-editor-status").textContent="Both beginning and ending cues are required.";return}
    cueTextEdits.set(cue.cueId,{start,end});
    for(const record of pageMetadata)if(record.leadership.cues.some(c=>c.cueId===cue.cueId))record.leadership.highlightConfirmed=false;
    for(const c of importedCues)if((c.cue_id||c.test_id)===cue.cueId){c.begin_cue=start;c.end_cue=end;
      if(String(c.language||"").toUpperCase()==="H"){c.cue_left=end;c.cue_right=start;}
      else{c.cue_left=start;c.cue_right=end;}c.begin_cue_hebrew=/[\u0590-\u05ff]/u.test(start)?start:"";c.end_cue_hebrew=/[\u0590-\u05ff]/u.test(end)?end:"";}
    if(!cueCsvUpdate(cue.cueId,start,end,cue.role)){$("page-cue-editor-status").textContent="Cue not found in source CSV; changes were not saved.";return}
    applyCueTextEdits();button.disabled=true;$("page-cue-editor-status").textContent="Saving cue CSV and rematching…";
    try{await saveCueCsvHandoff();downloadUpdatedCueCsv()}catch(e){$("page-cue-editor-status").textContent="CSV save failed: "+e.message;button.disabled=false;return}
    try{await autoMatchCuesForSide(side);$("page-cue-editor-status").textContent=(side===0?"Left":"Right")+" page rematched. The other page was not changed."}
    catch(e){$("page-cue-editor-status").textContent="Rematch failed: "+e.message}
    finally{button.disabled=false;renderPageCueEditor()}
   };
  button.textContent="Save cue and rematch";
  const actions=document.createElement("div");actions.className="cue-actions";
  const line=document.createElement("button");line.type="button";line.textContent="Line";line.setAttribute("aria-pressed",String(selectionMode==="line"));
  const word=document.createElement("button");word.type="button";word.textContent="Word";word.setAttribute("aria-pressed",String(selectionMode==="word"));
  for(const [control,mode] of [[line,"line"],[word,"word"]])control.onclick=()=>{selectionMode=mode;$("selection-mode").value=mode;renderPageCueEditor();drawHighlights()};
  const manual=document.createElement("button");manual.type="button";manual.textContent="Save manual highlight";manual.onclick=()=>{
   if(!record){return}
   const selected=record.leadership.highlights.filter(h=>h.cueId===active.cueId);
   if(!selected.length){$("page-cue-editor-status").textContent="No highlights for this cue to save. Select the prayer text first.";return;}
   for(const h of selected){h.manualApproved=true;h.tentative=false;}
   active.matchStatus="manual-selection-preserved";
   saveCurrentSpreadEdits();record.leadership.highlightConfirmed=false;
   $("page-cue-editor-status").textContent="Saved "+selected.length+" manual rectangles for "+(active.prayer||active.cueId)+". Automatic rematching will preserve this cue.";
  };
  actions.append(button,line,word,manual);wrap.append(actions);panel.append(wrap);root.append(panel);
 }
}
function refreshCueVisibilityPicker(){
 installCueVisibilityPicker();const select=$("visible-cue");if(!select)return;
 const cues=pageMetadata.flatMap(p=>p?.leadership?.cues||[]);
 const ids=[...new Set(cues.map(c=>c.cueId).filter(Boolean))];
 const previous=visibleCueId;select.replaceChildren();
 const blank=document.createElement("option");blank.value="";blank.textContent="No cue selected — clean pages";select.append(blank);
 const all=document.createElement("option");all.value="__all__";all.textContent="All proposed highlights (English + Hebrew)";select.append(all);
 for(const id of ids){const cue=cues.find(c=>c.cueId===id);const option=document.createElement("option");option.value=id;option.textContent=(cue?.prayer||"Cue "+(ids.indexOf(id)+1))+" · "+(cue?.role||"Leader");select.append(option)}
 visibleCueId=ids.includes(previous)||previous==="__all__"?previous:"__all__";select.value=visibleCueId;
}

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
// Canonical comparison only: preserve original CSV spelling and OCR text.
function normalizeHebrewMatchText(s){
 return normalizeCueText(String(s||"").normalize("NFKD").replace(/[\u0591-\u05c7]/g,"").replace(/י[\u05f3\u05f4׳״\u0027" ]+י/g,"יי"))
  .replace(/(^|[^\u05d0-\u05ea])(?:יהוה|יי)(?=$|[^\u05d0-\u05ea])/g,(_,prefix)=>prefix+"יי");
}
function hebrewMatchTokens(s){
 return normalizeHebrewMatchText(hebrewCueAlias(s)).replace(/[^\u05d0-\u05ea ]/g," ").split(/\s+/).filter(Boolean);
}
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
 const clean=v=>hebrewMatchTokens(v).join(" ");
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
// English cues may occupy only part of a longer OCR line. Compare contiguous
// word windows instead of penalizing the surrounding printed text.
function englishAnchorScore(text,phrase){
 const words=v=>normalizeCueText(v).split(" ").filter(Boolean);
 const source=words(text),target=words(phrase);
 if(!source.length||!target.length)return 0;
 let best=0;
 for(let i=0;i<source.length;i++)for(let n=Math.max(1,target.length-1);n<=Math.min(source.length-i,target.length+1);n++){
  const sample=source.slice(i,i+n);
  const hits=target.filter(w=>sample.some(v=>v===w||(w.length>=5&&v.length>=5&&v.slice(0,4)===w.slice(0,4)))).length;
  const score=hits/Math.max(target.length,n);
  best=Math.max(best,score);
 }
 return best;
}
function matchingCueLine(lines,phrase){
 const alias=hebrewCueAlias(phrase),needle=normalizeCueText(alias);
 if(needle.length<4)return null;
 // English: require every cue word in order and adjacent, not a bag-of-words score.
 // Reject ambiguous repeated occurrences rather than selecting a plausible location.
 if(!/[\u0590-\u05ff]/u.test(needle)){
  const tokens=t=>normalizeCueText(t).split(/\s+/).filter(Boolean);
  const target=tokens(needle),stream=[];
  for(let i=0;i<lines.length;i++)for(const word of tokens(lines[i].text))stream.push({word,line:i,column:lines[i].column});
  if(!target.length)return null;
  const found=[];
  for(let i=0;i+target.length<=stream.length;i++){
   if(stream[i].word!==target[0])continue;
   let valid=true;
   for(let j=1;j<target.length;j++){
    if(stream[i+j].word!==target[j]){valid=false;break}
   }
   if(valid)found.push(stream[i].line);
  }
  return found.length===1?found[0]:null;
 }
 // Hebrew: position-aware 3-of-4 recognition. The unreadable word may be at
 // either edge; the adjacent image word box supplies its position, not its text.
 const tokens=t=>normalizeCueText(t)
  .replace(/יהוה|י[\u05be\u05f3\u05f4"'׳״.\- ]*י/g,"יי")
  .replace(/[^\u05d0-\u05ea ]/g," ").split(/\s+/).filter(Boolean);
 const target=tokens(needle);
 if(target.length<3)return null;
 const distance=(a,b)=>{
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
   let previous=row[0];row[0]=i;
   for(let j=1;j<=b.length;j++){
    const old=row[j];
    row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));
    previous=old;
   }
  }
  return row[b.length];
 };
 const similarity=(a,b)=>1-distance(a,b)/Math.max(a.length,b.length,1);
 const minStrong=Math.ceil(target.length*.75),candidates=[];
 for(const reversed of [false,true]){
  const stream=[];
  for(let i=0;i<lines.length;i++){
   const words=tokens(lines[i].text);
   for(const word of (reversed?words.reverse():words))
    stream.push({word,line:i,column:lines[i].column});
  }
  for(let i=0;i+target.length<=stream.length;i++){
   const window=stream.slice(i,i+target.length);
   if(window.some(w=>w.column!==window[0].column))continue;
   const scores=target.map((t,k)=>similarity(t,window[k].word));
   const strong=scores.filter(v=>v>=.72).length;
   if(strong<minStrong)continue;
   // A missing edge word is acceptable only if its neighboring words are
   // present in order. For 4-word cues, three strong positions suffice.
   const average=scores.reduce((sum,v)=>sum+v,0)/scores.length;
   const strongAverage=scores.filter(v=>v>=.72).reduce((sum,v)=>sum+v,0)/strong;
   if(strongAverage<.80)continue;
   candidates.push({line:window[0].line,score:strongAverage*.8+average*.2,strong,
    position:i,orientation:reversed});
  }
 }
 // Multiple windows on one printed line are the same line-level candidate.
 const byLine=new Map();
 for(const c of candidates){
  const prior=byLine.get(c.line);
  if(!prior||c.score>prior.score)byLine.set(c.line,c);
 }
 const ranked=[...byLine.values()].sort((a,b)=>b.score-a.score);
 if(!ranked.length)return null;
 // Do not infer a location if another printed line is nearly as plausible.
 if(ranked[1]&&ranked[0].score-ranked[1].score<.10)return null;
 return ranked[0].line;
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
   best=Math.max(best,heb?Math.max(hebrewCueSimilarity(t,needle),hebrewAnchorScore(t,needle)):Math.max(cueSimilarity(t,needle),englishAnchorScore(t,needle)));
  }
  rank.push({line:i+1,score:best,text:lines[i].text});
 }
 rank.sort((a,b)=>b.score-a.score);
 return rank.slice(0,3).map(r=>"#"+r.line+" "+r.score.toFixed(2)+" "+r.text.slice(0,90)).join(" | ")||"no OCR lines";
}
// V3.89: map a fuzzy cue to an actual word-box boundary, never to OCR text.
// V3.90: recognize reliable INTERNAL cue words, then project outward to
// the unrecognized first/last words using physical scanned word positions.
// V3.91: match any two cue positions (including 2+4), even when intervening
// OCR words are wrong. Project their known offsets onto physical ink boxes.
// Rank candidate anchors by distinctive cue words and the complete cue context.
// A common divine-name token alone must never outrank a distinctive phrase.
// Match ordered cue phrases as a unit. Never score isolated generic words
// as complete boundaries; OCR errors may substitute or omit individual words.
function hebrewRangeHighlights(side,cue,ocr,geometry){
 const tokenize=t=>normalizeCueText(hebrewCueAlias(t)).replace(/יהוה/g,"יי")
  .replace(/[^\u05d0-\u05ea ]/g," ").split(/\s+/).filter(Boolean);
 const startWords=tokenize(cue.startCueHebrew);
 const endWords=tokenize(cue.endCueHebrew);
 const columns=[...new Set(geometry.map(l=>l.column))].sort((a,b)=>b-a);
 const ordered=geometry.slice().sort((a,b)=>columns.indexOf(a.column)-columns.indexOf(b.column)||a.y-b.y);
 const edit=(a,b)=>{
  const dp=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let prior=dp[0];dp[0]=i;
   for(let j=1;j<=b.length;j++){const old=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prior+(a[i-1]===b[j-1]?0:1));prior=old;}}
  return 1-dp[b.length]/Math.max(a.length,b.length,1);
 };
 // Canonicalize OCR substitutions and attached Hebrew prefixes for anchor matching.
 const key=w=>String(w||"").replace(/[ךםןףץ]/g,c=>({"ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ"}[c]));
 const approximate=(a,b)=>Math.max(edit(key(a),key(b)),edit(key(a).replace(/^ו/,""),key(b).replace(/^ו/,"")));
 const phraseAnchors=(phrase,which)=>{
  const wanted=which==="start"?[1,2]:[phrase.length-2,phrase.length-1];
  const found=[];
  for(const observed of ocr){
   const line=geometry.find(g=>g.id===observed.id);if(!line)continue;
   const source=tokenize(observed.text);
   for(let j=0;j<source.length-1;j++){
    for(const [first,second] of [wanted]){
     if(first<0||second>=phrase.length)continue;
     const a=approximate(phrase[first],source[j]),b=approximate(phrase[second],source[j+1]);
     if(a<.55||b<.55)continue;
     found.push({line,order:ordered.findIndex(l=>l.id===line.id),
      score:a+b+1.5,ocrStart:j-first,ocrEnd:j+1+(phrase.length-1-second),
      sourceCount:source.length,anchorPair:true});
    }
   }
  }
  return found;
 };
 const candidates=phrase=>{
  const results=[];
  for(const observed of ocr){
   const line=geometry.find(g=>g.id===observed.id);if(!line)continue;
   const source=tokenize(observed.text),physical=wordCandidates(side,line).slice().sort((a,b)=>b.x-a.x);
   if(!source.length||!physical.length)continue;
   // Slide the complete cue along the OCR line, tolerating a missing first
   // or last word, but insisting on multiple supporting words in order.
   for(let offset=-phrase.length+1;offset<source.length;offset++){
    let evidence=0,distinct=0,weighted=0;
    for(let k=0;k<phrase.length;k++){
     const j=offset+k;if(j<0||j>=source.length)continue;
     const similarity=edit(phrase[k],source[j]);
     if(similarity<.58)continue;
     const weight=phrase[k].length<=2?.12:1;
     weighted+=similarity*weight;evidence+=weight;
     if(weight===1)distinct++;
    }
    if(distinct<1||evidence<.95)continue;
    const coverage=evidence/Math.max(1,phrase.filter(w=>w.length>2).length);
    const score=weighted+coverage*.7;
    const projected=index=>Math.max(0,Math.min(physical.length-1,
     Math.round((index+.5)*physical.length/source.length-.5)));
    const from=projected(Math.max(0,offset)),to=projected(Math.min(source.length-1,offset+phrase.length-1));
    results.push({line,order:ordered.findIndex(l=>l.id===line.id),from,to,score,distinct});
   }
  }
  return results.sort((a,b)=>b.score-a.score).slice(0,30);
 };

 // Evaluate OCR in both directions: Tesseract may emit RTL words reversed.
 const anchorCandidates=(phrase,which)=>{
  const indices=which==="start"?[1,2]:[phrase.length-2,phrase.length-1];
  const results=[];
  for(const observed of ocr){
   const line=geometry.find(g=>g.id===observed.id);if(!line)continue;
   const raw=tokenize(observed.text);
   for(const source of [raw,raw.slice().reverse()]){
    for(let j=0;j<source.length-1;j++){
     const x=approximate(phrase[indices[0]],source[j]);
     const y=approximate(phrase[indices[1]],source[j+1]);
     if(x<.58||y<.58)continue;
     results.push({line,score:x+y,which});
    }
   }
  }
  return results.sort((a,b)=>b.score-a.score);
 };
 const starts=anchorCandidates(startWords,"start"),ends=anchorCandidates(endWords,"end");
 const pairs=[];
 for(const a of starts)for(const b of ends){
  // Two halves of the same printed Hebrew row may be separate line detections.
  // Begin must be physically to the RIGHT of end, at approximately same height.
  const ay=a.line.y+a.line.height/2,by=b.line.y+b.line.height/2;
  const vertical=Math.abs(ay-by);
  const right=a.line.x+a.line.width/2,left=b.line.x+b.line.width/2;
  if(vertical>Math.max(a.line.height,b.line.height)*1.4)continue;
  if(right<=left+.015)continue;
  pairs.push({a,b,score:a.score+b.score-vertical*8});
 }
 if(!pairs.length)return null;
 pairs.sort((a,b)=>b.score-a.score);
 const {a,b}=pairs[0];
 const top=Math.min(a.line.y,b.line.y),bottom=Math.max(a.line.y+a.line.height,b.line.y+b.line.height);
 const left=Math.min(a.line.x,b.line.x),right=Math.max(a.line.x+a.line.width,b.line.x+b.line.width);
 // Only the selected row: never include earlier unrelated lines or columns.
 return [{highlightId:"HL-"+cue.cueId+"-rtl-passage",cueId:cue.cueId,
  roleId:cue.role,x:left,y:top,width:right-left,height:bottom-top,
  coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true}];
}

// Best-effort Hebrew proposal: score ANY matching cue words against OCR lines.
// A proposal is deliberately editable and never treated as verified.
function tentativeHebrewHighlights(side,cue,ocr,geometry){
 if(!geometry.length)return null;
 const norm=t=>normalizeCueText(String(t||"")).replace(/[^\u05d0-\u05ea ]/g," ").split(/\s+/).filter(Boolean);
 const score=(phrase,line)=>{
  const a=norm(phrase),b=norm(line.text);if(!a.length||!b.length)return 0;
  let hits=0;
  for(const word of a)if(b.some(w=>w===word||(word.length>=3&&w.length>=3&&(w.includes(word)||word.includes(w)))))hits++;
  return hits/a.length;
 };
 const ranked=phrase=>ocr.map(l=>({line:geometry.find(g=>g.id===l.id),score:score(phrase,l)}))
  .filter(v=>v.line&&v.score>0).sort((a,b)=>b.score-a.score);
 const starts=ranked(cue.startCueHebrew),ends=ranked(cue.endCueHebrew);
 const columns=[...new Set(geometry.map(l=>l.column))].sort((a,b)=>b-a);
 const order=l=>columns.indexOf(l.column)*100000+l.y*10000;
 let start=starts[0]?.line,end=ends[0]?.line;
 if(start&&end&&order(end)<order(start)){
  const alternative=ends.find(v=>order(v.line)>=order(start));
  if(alternative)end=alternative.line;
 }
 if(!start&&!end)return null;
 if(!start)start=end;
 if(!end)end=start;
 const low=Math.min(order(start),order(end)),high=Math.max(order(start),order(end));
 const chosen=geometry.filter(l=>order(l)>=low-.001&&order(l)<=high+.001);
 if(!chosen.length)return null;
 return chosen.map(line=>({highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,
  cueId:cue.cueId,roleId:cue.role,x:line.x,y:line.y,width:line.width,height:line.height,
  coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true}));
}
// English proposal when exact multiword OCR matching fails.
function tentativeEnglishHighlights(side,cue,ocr,geometry){
 if(!geometry.length)return null;
 const words=t=>normalizeCueText(t).replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>1);
 const candidates=phrase=>{
  const target=words(phrase);
  return ocr.map(l=>{
   const observed=words(l.text);
   const overlap=target.filter(w=>observed.some(v=>v===w||(w.length>=5&&v.length>=5&&w.slice(0,4)===v.slice(0,4)))).length;
   return {line:geometry.find(g=>g.id===l.id),score:target.length?overlap/target.length:0};
  }).filter(v=>v.line&&v.score>0).sort((a,b)=>b.score-a.score);
 };
 const starts=candidates(cue.startCue),ends=candidates(cue.endCue);
 const order=l=>(l.column||0)*100000+l.y*10000;
 const a=starts[0]?.line,b=ends.find(v=>!a||order(v.line)>=order(a))?.line||ends[0]?.line;
 if(!a&&!b)return null;
 const first=a||b,last=b||a;
 const low=Math.min(order(first),order(last)),high=Math.max(order(first),order(last));
 return geometry.filter(l=>order(l)>=low-.001&&order(l)<=high+.001).map(line=>({
  highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,
  roleId:cue.role,x:line.x,y:line.y,width:line.width,height:line.height,
  coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true
 }));
}
// Isolated Hebrew engine v1: Rivok geometry + OCR text, no legacy Hebrew matcher.
const hebrewOcrTokens=[[],[]];
function isolatedHebrewCueMatch(side,cue,ocr,spanBoundary=null){
 const words=rivokWordsBySide[side]||[],lines=detectedLines[side]||[];
 if(!words.length||!lines.length)return null;
 const tokenize=hebrewMatchTokens;
 const begin=tokenize(cue.startCueHebrew),finish=tokenize(cue.endCueHebrew);
 if(!begin.length||!finish.length)return null;
 // Read across each physical row, right-to-left, THEN advance downward.
 // Printed half-lines may have slightly different baselines; group by proximity.
 // Ending pages can contain only a few lines before the next prayer.
 // Use detected ink's first row rather than a fixed top cutoff, and cap
 // the candidate region at the first substantial gap after the ending.
 const top=spanBoundary==="end"?Math.min(highlightParameters.hebrewContinuationTop,
  ...lines.filter(l=>l.column===0||l.column===1).map(l=>l.y)):highlightParameters.hebrewBodyTop;
 const bodyLines=lines.filter(l=>(l.column===0||l.column===1)&&l.y>=top&&l.y+l.height<=highlightParameters.hebrewBodyBottom);
 const physicalRows=[];
 for(const line of bodyLines.slice().sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2))){
  const cy=line.y+line.height/2;
  const row=physicalRows.find(r=>Math.abs(r.cy-cy)<=Math.max(highlightParameters.physicalRowTolerance,Math.min(r.height,line.height)*highlightParameters.physicalRowHeightFactor));
  if(row){row.lines.push(line);row.cy=(row.cy*(row.lines.length-1)+cy)/row.lines.length;row.height=Math.max(row.height,line.height);}
  else physicalRows.push({cy,height:line.height,lines:[line]});
 }
 const body=physicalRows.sort((a,b)=>a.cy-b.cy)
  .flatMap(r=>r.lines.sort((a,b)=>(b.x+b.width/2)-(a.x+a.width/2)));
 const ocrByLine=new Map(ocr.map(item=>[item.id,item.text]));
 const rows=body.map(line=>{
  const boxes=words.filter(w=>w.lineId===line.id).sort((a,b)=>b.x-a.x);
  const ocrWords=(hebrewOcrTokens[side]||[]).filter(t=>t.lineId===line.id)
   .sort((a,b)=>b.x-a.x).flatMap(t=>tokenize(t.text).map(word=>({word,x:t.x})));
  const wordOcr=ocrWords.map(t=>t.word);
  const lineOcr=tokenize(ocrByLine.get(line.id)||"");
  // Use one reading of each line, never a concatenation of OCR passes.
  const tokens=wordOcr.length>=Math.max(2,Math.ceil(lineOcr.length*.7))?wordOcr:lineOcr;
  return {line,boxes,tokens,ocrWords:tokens===wordOcr?ocrWords:[]};
 });
 const similarity=(a,b)=>{
  if(a===b)return 1;
  if(!a||!b)return 0;
  const d=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;
   for(let j=1;j<=b.length;j++){const old=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}
  return 1-d[b.length]/Math.max(a.length,b.length);
 };
 const score=(a,b)=>similarity(a,b)>=highlightParameters.hebrewWordSimilarity?similarity(a,b):0;
 // Find an ordered phrase in one printed line. A three-word cue may
 // tolerate one unreadable word, but never an arbitrary one-word match.
 const candidates=phrase=>{
  const results=[];
  for(let ri=0;ri<rows.length;ri++){
   const row=rows[ri],tokens=row.tokens;
   if(!tokens.length)continue;
   for(let offset=0;offset<tokens.length;offset++){
    const matched=[];
    for(let j=0;j<phrase.length;j++){
     const value=tokens[offset+j];
     matched.push(value?score(phrase[j],value):0);
    }
    const hits=matched.filter(v=>v>=highlightParameters.hebrewWordSimilarity).length;
    const required=phrase.length<=2?phrase.length:phrase.length-1;
    if(hits<required)continue;
    const confidence=matched.reduce((x,y)=>x+y,0)/phrase.length;
    if(confidence<highlightParameters.hebrewPhraseConfidence)continue;
    results.push({ri,offset,confidence});
   }
  }
  return results.sort((a,b)=>b.confidence-a.confidence);
 };
 const starts=candidates(begin);
 if(!starts.length&&spanBoundary!=="end")return null;
 if(starts.length>1&&starts[0].confidence-starts[1].confidence<highlightParameters.anchorAmbiguityMargin&&spanBoundary!=="end")return null;
 const first=spanBoundary==="end"?{ri:0,offset:0,confidence:1}:starts[0];
 // A Hebrew maqaf may be OCR'd as a space, punctuation, or no separator.
 // Match the complete ending first, then its distinctive final word. Only
 // accept a unique fallback after the beginning cue in printed reading order.
 const afterStart=c=>c.ri>first.ri||(c.ri===first.ri&&c.offset>=first.offset);
 let fullEnds=candidates(finish).filter(afterStart);
 if(!fullEnds.length&&spanBoundary==="end"&&finish.length>=4){
  fullEnds=candidates(finish.slice(-4)).filter(afterStart);
  if(!fullEnds.length)fullEnds=candidates(finish.slice(-3)).filter(afterStart);
 }
 let last=fullEnds[0],endWordCount=finish.length;
 if(!last&&spanBoundary==="start"){
  last={ri:rows.length-1,offset:Math.max(0,rows[rows.length-1].tokens.length-1),confidence:1};endWordCount=1;
 }
 if(!last){
  const finalWord=finish[finish.length-1];
  if(finalWord.length<4)return null;
  const alternatives=[];
  for(let ri=first.ri;ri<rows.length;ri++){
   const tokens=rows[ri].tokens;
   for(let offset=0;offset<tokens.length;offset++){
    if(!afterStart({ri,offset}))continue;
    const word=tokens[offset],confidence=score(finalWord,word);
    if(confidence>=highlightParameters.hebrewWordSimilarity)alternatives.push({ri,offset,confidence});
    // Fused maqaf form: אלמנוחתי matches final word מנוחתי.
    else if(word.endsWith(finalWord)&&word.length-finalWord.length<=3)
     alternatives.push({ri,offset,confidence:.88});
   }
  }
  alternatives.sort((a,b)=>b.confidence-a.confidence);
  // Continuation pages often have the last verse split across two
  // physical half-lines. Resolve the final word by corroborating nearby
  // preceding ending words, rather than requiring one OCR line to contain all.
  if(alternatives.length!==1){
   const corroborated=alternatives.filter(candidate=>{
    const context=rows.slice(Math.max(first.ri,candidate.ri-3),candidate.ri+1)
     .flatMap(row=>row.tokens);
    const preceding=finish.slice(0,-1);
    return preceding.filter(term=>context.some(token=>score(term,token)>=highlightParameters.hebrewWordSimilarity)).length>=Math.min(2,preceding.length);
   });
   if(corroborated.length===1){last=corroborated[0];endWordCount=1;}
  }
  if(!last&&alternatives.length!==1)return null;
  if(!last){last=alternatives[0];endWordCount=1;}
 }
 if(fullEnds.length>1&&fullEnds[0].confidence-fullEnds[1].confidence<highlightParameters.anchorAmbiguityMargin&&spanBoundary!=="start")return null;
 if(first.ri>last.ri||(first.ri===last.ri&&first.offset>last.offset))return null;
 // Anchors are found with OCR, but the passage is filled from printed ink,
 // not from whichever intermediate lines OCR happened to recognize.
 const firstRow=rows[first.ri],lastRow=rows[last.ri];
 const startY=spanBoundary==="end"?top:firstRow.line.y+firstRow.line.height/2;
 const endY=spanBoundary==="start"?highlightParameters.hebrewBodyBottom:lastRow.line.y+lastRow.line.height/2;
 const startX=spanBoundary==="end"?1:firstRow.line.x+firstRow.line.width/2;
 const endX=spanBoundary==="start"?0:lastRow.line.x+lastRow.line.width/2;
 // Reject reverse anchors, but permit right-to-left travel on the same row.
 if(startY>endY+.015)return null;
 if(Math.abs(startY-endY)<=.015&&startX<endX)return null;
 // Geometry is grouped independently from OCR. One physical row may contain
 // two printed halves; preserve them as separate segments to avoid painting
 // the whitespace between them.
 const geometryRows=[];
 for(const column of [1,0]){
  const inColumn=words.filter(w=>{
   const c=w.column===0||w.column===1?w.column:(w.x+w.width/2>=.5?1:0);
   return c===column&&w.y>=top&&w.y+w.height<=highlightParameters.hebrewBodyBottom;
  }).sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2));
  const grouped=[];
  for(const word of inColumn){
   const cy=word.y+word.height/2;
   const row=grouped.find(g=>Math.abs(g.cy-cy)<=Math.max(highlightParameters.physicalRowTolerance,Math.min(g.height,word.height)*highlightParameters.inkRowHeightFactor));
   if(row){row.words.push(word);row.cy=(row.cy*(row.words.length-1)+cy)/row.words.length;row.height=Math.max(row.height,word.height)}
   else grouped.push({cy,height:word.height,words:[word]});
  }
  for(const row of grouped)geometryRows.push({...row,column,x:row.words.reduce((a,w)=>a+w.x+w.width/2,0)/row.words.length});
 }
 // Compare row first, then horizontal position. The end may be in the left
 // half of the SAME printed row as the beginning.
 const geometryAfterStart=row=>spanBoundary==="end"||row.cy>startY+highlightParameters.boundaryRowTolerance||
  (Math.abs(row.cy-startY)<=.012&&row.x<=startX+highlightParameters.boundaryHorizontalSlack);
 const beforeEnd=row=>spanBoundary==="start"||row.cy<endY-highlightParameters.boundaryRowTolerance||
  (Math.abs(row.cy-endY)<=.012&&row.x>=endX-highlightParameters.boundaryHorizontalSlack);
 const selectedRows=geometryRows.filter(row=>geometryAfterStart(row)&&beforeEnd(row))
  .sort((a,b)=>a.cy-b.cy||b.x-a.x);
 const chosen=[];
 for(let i=0;i<selectedRows.length;i++){
  const row=selectedRows[i];
  let selected=row.words.slice().sort((a,b)=>b.x-a.x);
  // Trim only the anchor lines, using actual OCR x coordinates if available.
  const boundary=spanBoundary!=="end"&&Math.abs(row.cy-startY)<.013&&Math.abs(row.x-startX)<.18?"start":
   spanBoundary!=="start"&&Math.abs(row.cy-endY)<.013&&Math.abs(row.x-endX)<.18?"end":null;
  if(boundary){
   const source=boundary==="start"?firstRow:lastRow;
   const index=boundary==="start"?first.offset:last.offset+endWordCount-1;
   const word=source.ocrWords[index];
   if(word){
    const near=selected.reduce((best,w)=>!best||Math.abs(w.x-word.x)<Math.abs(best.x-word.x)?w:best,null);
    if(near)selected=selected.filter(w=>boundary==="start"?w.x<=near.x+.002:w.x>=near.x-.002);
   }
  }
  if(!selected.length)continue;
  const x=Math.min(...selected.map(w=>w.x)),y=Math.min(...selected.map(w=>w.y));
  const right=Math.max(...selected.map(w=>w.x+w.width));
  const bottom=Math.max(...selected.map(w=>w.y+w.height));
  chosen.push({highlightId:"HL-"+cue.cueId+"-ink-"+i,lineId:"ink-row-"+row.column+"-"+i,
   cueId:cue.cueId,roleId:cue.role,x,y,width:right-x,height:bottom-y,
   coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true});
 }
 return chosen.length?chosen:null;
}
// Page furniture is never part of a cue, even when geometry falls inside
// the start/end vertical span. Identify isolated printed page numbers from OCR.
function isPageNumberLine(line,ocr,record){
 const candidates=(ocr||[]).filter(t=>t.id===line.id);
 const printed=String(record?.source?.originalPageNumber||"").trim();
 return candidates.some(t=>{
  const value=String(t.text||"").trim().replace(/[.\s]/g,"");
  return /^\d{1,4}$/.test(value)&&(value===printed||value.length<=4);
 });
}
// One acceptance boundary for automatic matches, manual selections and PDF output.
// Geometry is measured in normalized top-left coordinates of the canonical
// approved-master page, never in the original source-PDF coordinates.
function insideSiddurPrayerRegion(side,box){
 const region=REGIONS[side];
 if(!region||![box?.x,box?.y,box?.width,box?.height].every(Number.isFinite))return false;
 const x0=region.x/W,y0=(H-region.y-region.h)/H;
 const x1=(region.x+region.w)/W,y1=(H-region.y)/H;
 const epsilon=.002;
 return box.width>0&&box.height>0&&box.x>=x0-epsilon&&box.y>=y0-epsilon&&
  box.x+box.width<=x1+epsilon&&box.y+box.height<=y1+epsilon;
}
function isPrintedPrayerTitle(side,box){
 const record=pageMetadata[side];
 const title=String(record?.prayerTitle||record?.identification?.prayerName||"").trim();
 if(!title)return false;
 const normalize=t=>String(t||"").toLocaleLowerCase().normalize("NFKD").replace(/[\\u0591-\\u05c7]/g,"").replace(/[^\\p{L}\\p{N}]+/gu," ").trim();
 const needle=normalize(title);if(needle.length<3)return false;
 const matching=(sourceTextLines[side]||[]).filter(l=>{
  const observed=normalize(l.text);
  return observed.length>=3&&(observed===needle||observed.includes(needle)||needle.includes(observed)&&observed.length>=Math.max(4,needle.length*.65));
 });
 return matching.some(l=>{
  const overlapX=Math.max(0,Math.min(l.x+l.width,box.x+box.width)-Math.max(l.x,box.x));
  const overlapY=Math.max(0,Math.min(l.y+l.height,box.y+box.height)-Math.max(l.y,box.y));
  return overlapX>0&&overlapY>0;
 });
}
function eligibleSiddurHighlight(side,box){
 return isSiddurSourceRecord(pageMetadata[side])&&insideSiddurPrayerRegion(side,box)&&!isPrintedPrayerTitle(side,box);
}
// Shared cue lifecycle for both scripts: one span classifier, one acceptance
// gate, one metadata format. Script-specific OCR and reading order remain separate.
function cueSpanPosition(record,cue){
 const source=importedCues.find(c=>(c.cue_id||c.test_id)===cue.cueId);
 const range=String(source?.source_page||"").trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
 const page=Number(record?.source?.originalPageNumber||record?.source?.serviceReference);
 if(!range||!Number.isFinite(page)||Number(range[1])>=Number(range[2])||
    page<Number(range[1])||page>Number(range[2]))return null;
 return page===Number(range[1])?"start":page===Number(range[2])?"end":"middle";
}
function recordCueMatch(record,cue,method,boundary,boxes){
 const side=pageMetadata.indexOf(record);
 const valid=side>=0&&boxes.length>0&&boxes.every(h=>eligibleSiddurHighlight(side,h)&&[h.x,h.y,h.width,h.height].every(Number.isFinite)&&
  h.width>0&&h.height>0&&h.x>=0&&h.y>=0&&h.x+h.width<=1.01&&h.y+h.height<=1.01);
 cue.highlightMethod=valid?method:"unmatched";
 cue.highlightVerification={geometryValid:valid,geometry:"printed-ink",boundary,
  rectangles:boxes.length,reviewRequired:true};
 if(!valid){cue.matchStatus="geometry-validation-review-required";return false;}
 record.leadership.highlights.push(...boxes);
 cue.matchStatus=method+"-candidate-review-required";
 return true;
}
// OCR and cue selection belong exclusively to source Siddur pages. Generated
// cover, section title, TOC, and blank pages never qualify, even if a saved
// record is accidentally passed into the editor.
function isSiddurSourceRecord(record){
 const kind=String(record?.pageType||record?.type||record?.production?.pageType||record?.source?.pageType||"").toUpperCase().replace(/[ -]/g,"_");
 if(["FRONT_COVER","COVER","SECTION_TITLE","SECTION_TOC","MAIN_TOC","CONTENTS","BLANK","GENERATED"].includes(kind))return false;
 return Number.isInteger(Number(record?.source?.sourcePdfPage))&&Number(record.source.sourcePdfPage)>0&&
  !!String(record?.source?.sourceFilename||"").trim();
}
function assignCueHighlights(side){
 const record=pageMetadata[side],ocr=sourceTextLines[side]||[],geometry=detectedLines[side]||[];
 if(!isSiddurSourceRecord(record))return 0;
 let matches=0;
 for(const cue of record.leadership.cues){
  if(record.leadership.highlights.some(h=>h.cueId===cue.cueId&&h.manualApproved)){cue.matchStatus="manual-selection-preserved";matches++;continue;}
  const hebrew=cueHasHebrewScript(cue);
  const spanBoundary=cueSpanPosition(record,cue);
  if(spanBoundary==="middle"){
   const lines=geometry.filter(l=>eligibleSiddurHighlight(side,l)&&!isPageNumberLine(l,ocr,record));
   const boxes=lines.map(line=>({
    highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,
    roleId:cue.role,x:line.x,y:line.y,width:line.width,height:line.height,
    coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true
   }));
   if(boxes.length&&recordCueMatch(record,cue,hebrew?"hebrew-spanning-middle":"english-spanning-middle","interior-page",boxes))matches++;
   else cue.matchStatus="spanning-middle-geometry-review-required";
   continue;
  }
  if(hebrew){
   if(!String(cue.startCueHebrew||"").trim()||!String(cue.endCueHebrew||"").trim()){
    cue.matchStatus="missing-Hebrew-cue-review-required";
    continue;
   }

   // A range cue has a beginning on its first page and an ending on its last.
   // Never demand both anchors from either page.
   const highlights=isolatedHebrewCueMatch(side,cue,ocr,spanBoundary);
   if(highlights?.length){
    const suppressed=record.leadership.suppressedAutoHighlights||[];
    const allowed=highlights.filter(h=>eligibleSiddurHighlight(side,h)&&!suppressed.some(v=>v.cueId===h.cueId&&
     Math.abs((v.y+v.height/2)-(h.y+h.height/2))<.012&&
     Math.max(0,Math.min(v.x+v.width,h.x+h.width)-Math.max(v.x,h.x))>Math.min(v.width,h.width)*.25));
    record.leadership.highlights.push(...allowed);
    cue.matchStatus=spanBoundary?"spanning-Hebrew-"+spanBoundary+"-candidate-review-required":"isolated-rivok-candidate-review-required";
    cue.highlightMethod=spanBoundary?"hebrew-rivok-spanning-"+spanBoundary:"hebrew-rivok-paired-anchors";
    cue.highlightVerification={geometry:"ink-word-boxes",boundary:spanBoundary==="start"?"start-anchor":spanBoundary==="end"?"end-anchor":"both-anchors",rectangles:allowed.length,reviewRequired:true};
    matches++;
   }
   else {cue.matchStatus=rivokWordsBySide[side]?.length?"rivok-anchor-pair-not-found":"rivok-unavailable";cue.highlightMethod="unmatched";cue.highlightVerification={reviewRequired:true,reason:cue.matchStatus};}
   continue;
  }
  // A cue whose source_page is a printed-page range has only one anchor
  // on each boundary page. Match each page independently, including across spreads.

  if(spanBoundary){
   const firstPage=spanBoundary==="start",lastPage=spanBoundary==="end";
   const begin=firstPage?matchingCueLine(ocr,cue.startCue):null;
   const end=lastPage?matchingCueLine(ocr,cue.endCue):null;
   const anchor=firstPage?ocr[begin]:ocr[end];
   if(!anchor||(!firstPage&&!lastPage)){
    cue.matchStatus="spanning-page-anchor-review-required";
    continue;
   }
   const col=anchor.column;
   const lines=geometry.filter(l=>l.column===col).sort((a,b)=>a.y-b.y);
   if(!lines.length){cue.matchStatus="spanning-page-geometry-review-required";continue}
   // On continuation pages start at the first recognized body-text line in
   // the ending anchor's column, not at the running header or a blank margin.
   const body=ocr.filter(l=>l.column===col&&!/^(sabbath eve service|psalm \d+|\d+)$/i.test(String(l.text||"").trim())).sort((a,b)=>a.y-b.y);
   const startY=firstPage?anchor.y:(body.length?body[0].y:NaN);
   const endY=lastPage?anchor.y:lines[lines.length-1].y+lines[lines.length-1].height;
   if(!Number.isFinite(startY)||!Number.isFinite(endY)||endY<startY){
    cue.matchStatus="spanning-page-body-review-required";continue;
   }
   const selected=lines.filter(l=>!isPageNumberLine(l,ocr,record)&&l.y+l.height/2>=startY-.012&&l.y+l.height/2<=endY+.012
    // Printed page numbers and template headings are outside the prayer body.
    &&l.y>.18&&l.y<.88);
   if(!selected.length){cue.matchStatus="spanning-page-empty-review-required";continue}
   const boxes=selected.map(line=>({
    highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,roleId:cue.role,
    x:line.x,y:line.y,width:line.width,height:line.height,
    coordinateSystem:"normalized-top-left",visibleInPdf:false
   }));
   if(recordCueMatch(record,cue,"english-ocr-spanning-"+spanBoundary,
      firstPage?"start-anchor":"end-anchor",boxes))matches++;
   continue;
  }
  // Never convert ambiguous OCR into a guessed selection.
  const begin=matchingCueLine(ocr,hebrew?(cue.startCueHebrew):cue.startCue),
        end=matchingCueLine(ocr,hebrew?(cue.endCueHebrew):cue.endCue);
  if(begin===null||end===null){
   cue.matchStatus="anchor-review-required ("+(begin===null?"START ":"")+(end===null?"END":"")+")";
   rawOcrDiagnostics[side]+="\\nCUE "+cue.cueId+" START ["+cueCandidateDiagnostics(ocr,hebrew?(cue.startCueHebrew):cue.startCue)+"] END ["+cueCandidateDiagnostics(ocr,hebrew?(cue.endCueHebrew):cue.endCue)+"]";
   // Never paint a guessed partial passage when either boundary is unresolved.
   // The old tentative matcher could skip the opening line and extend into blank space.
   cue.matchStatus="English-boundary-review-required";
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
  const startY=first.y+((geometry.find(l=>l.id===first.id)?.height||0)/2),endY=last.y+((geometry.find(l=>l.id===last.id)?.height||0)/2);
  if(rankA===rankB&&endY+.008<startY){cue.matchStatus="reverse-anchor-review-required";continue}
  const selected=geometry.filter(l=>{
   if(isPageNumberLine(l,ocr,record))return false;
   const rank=columnRank(l.column),center=l.y+l.height/2;
   if(rank<rankA||rank>rankB)return false;
   if(rankA===rankB)return center>=startY-.012&&center<=endY+.012;
   if(rank===rankA)return center>=startY-.012;
   if(rank===rankB)return center<=endY+.012;
   return true;
  });
  if(!selected.length){
   // OCR endpoints may be on the same printed line even when OCR line bounds
   // and Rivok word-center bounds differ slightly. Only accept identical IDs.
   const exact=first.id===last.id?geometry.find(l=>l.id===first.id):null;
   if(exact)selected.push(exact);
   else {cue.matchStatus="geometry-review-required";rawOcrDiagnostics[side]+="\\nGEOMETRY "+cue.cueId+" start="+first.id+" col="+first.column+" y="+first.y+" end="+last.id+" col="+last.column+" y="+last.y+" rank="+rankA+".."+rankB;continue;}
  }
  const boxes=selected.filter(line=>!record.leadership.highlights.some(h=>h.cueId===cue.cueId&&h.lineId===line.id))
   .map(line=>({highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,roleId:cue.role,
      x:line.x,y:line.y,width:line.width,height:line.height,coordinateSystem:"normalized-top-left",visibleInPdf:false}));
  if(recordCueMatch(record,cue,"english-ocr-boundary-and-geometry","both-anchors",boxes))matches++;
 }
 return matches;
}
function rolePaletteKey(role){
 const code=String(role||"").trim().toUpperCase();
 for(const [color,assignedRole] of serviceRoleAssignments)if(String(assignedRole).trim().toUpperCase()===code)return String(color).toLowerCase();
 return "";
}
function roleColor(role){
 const key=rolePaletteKey(role);
 if(/^#[0-9a-f]{6}$/i.test(key))return key;
 const code=String(role||"").trim().toUpperCase();
 const defaults={R:"#F5D03C",P:"#75C56A",S1:"#74B9E7",S2:"#F3A65B"};
 return defaults[code]||"#F5D03C";
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
function highlightAlpha(h){
 const role=String(h.roleId||"").trim(),palette=rolePaletteKey(role);
 const raw=serviceRoleOpacity.get(palette)??serviceRoleOpacity.get(role)??serviceRoleOpacity.get(role.toLowerCase());
 const opacity=raw==null?40:Number(raw);
 return Math.max(0,Math.min(1,(Number.isFinite(opacity)?opacity:40)/100));
}
function highlightFill(h){const hex=roleColor(h.roleId);const v=hex.replace("#","");const n=parseInt(v,16);return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+highlightAlpha(h)+")";}
// Physical ink is painted once per role even when several cue IDs own it.
// Retain cue records separately for review and editing.
function uniquePhysicalHighlights(marks){
 const groups=new Map();
 for(const h of marks){
  if(![h.x,h.y,h.width,h.height].every(Number.isFinite)||h.width<=0||h.height<=0)continue;
  const key=roleColor(h.roleId)+"|"+highlightAlpha(h);
  if(!groups.has(key))groups.set(key,[]);
  const existing=groups.get(key);
  const duplicate=existing.some(v=>{
   const overlapX=Math.max(0,Math.min(h.x+h.width,v.x+v.width)-Math.max(h.x,v.x));
   const overlapY=Math.max(0,Math.min(h.y+h.height,v.y+v.height)-Math.max(h.y,v.y));
   const intersection=overlapX*overlapY;
   const smaller=Math.min(h.width*h.height,v.width*v.height);
   return smaller>0&&intersection/smaller>=.92;
  });
  if(!duplicate)existing.push(h);
 }
 return groups;
}
function drawHighlights(){
 for(let i=0;i<2;i++){
  const overlay=$("highlight-"+i),base=$(i===0?"output-left":"output-right");
  if(!overlay||!base)continue;
  // Keep instructions and cue rows synchronized with the facing-page preview.
  if(i===0&&!canonicalPreviewEnabled)renderInstructionPreviews();
  overlay.width=base.width;overlay.height=base.height;
  const ctx=overlay.getContext("2d");
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(canonicalPreviewEnabled&&highlightView!=="detection"){if(i===1&&!canonicalPreviewRendering)scheduleCanonicalPreview();continue;}
  if(highlightView==="detection"){
   if(!isSiddurSourceRecord(pageMetadata[i]))continue;
   // Detection is a geometry diagnostic ONLY: never color text or cues.
   // In particular, titles and page numbers may be detected but are not prayers.
   ctx.save();ctx.strokeStyle="rgba(138,50,191,.8)";ctx.lineWidth=1;
   for(const line of detectedLines[i]||[]){
    const candidates=selectionMode==="word"?wordCandidates(i,line):[line];
    for(const box of candidates)ctx.strokeRect(box.x*overlay.width,box.y*overlay.height,
     box.width*overlay.width,box.height*overlay.height);
   }
   ctx.restore();
   continue;
  }
  const record=pageMetadata[i];
  const activeId=selectedCueBySide[i]||record?.leadership?.cues?.[0]?.cueId||"";
  const selected=(record?.leadership?.highlights||[]).filter(h=>eligibleSiddurHighlight(i,h)&&(visibleCueId==="__all__"||h.cueId===(visibleCueId||activeId)));
  // Merge all rectangles of the same role into a single opaque mask,
  // then tint that union once. Overlapping cues and repeated OCR boxes
  // must never darken the page by painting the same ink twice.
  const byRole=uniquePhysicalHighlights(selected);
  for(const [key,marks] of byRole){
   const mask=document.createElement("canvas");mask.width=overlay.width;mask.height=overlay.height;
   const m=mask.getContext("2d");m.fillStyle="#fff";
   for(const h of marks)m.fillRect(h.x*mask.width,h.y*mask.height,h.width*mask.width,h.height*mask.height);
   m.globalCompositeOperation="source-in";
   const [hex,opacity]=key.split("|"),v=parseInt(hex.slice(1),16);
   m.fillStyle="rgba("+((v>>16)&255)+","+((v>>8)&255)+","+(v&255)+","+Number(opacity)+")";
   m.fillRect(0,0,mask.width,mask.height);
   ctx.drawImage(mask,0,0);
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
   if(!isSiddurSourceRecord(pageMetadata[i]))return null;
   const lines=(detectedLines[i]||[]).filter(l=>eligibleSiddurHighlight(i,l));
   const inside=lines.filter(l=>p.x>=l.x-.01&&p.x<=l.x+l.width+.01&&p.y>=l.y-.007&&p.y<=l.y+l.height+.007);
   if(inside.length)return inside.sort((a,b)=>Math.abs(p.y-a.y-a.height/2)-Math.abs(p.y-b.y-b.height/2))[0];
   const recovered=rivokWordsBySide[i]?null:recoverClickedLine(i,p);if(recovered)return recovered;
   return lines.filter(l=>p.x>=l.x-.02&&p.x<=l.x+l.width+.02&&Math.abs(p.y-l.y-l.height/2)<.014)
    .sort((a,b)=>Math.abs(p.y-a.y-a.height/2)-Math.abs(p.y-b.y-b.height/2))[0]||null;
  };
  const target=p=>{
   if(!isSiddurSourceRecord(pageMetadata[i]))return null;
   if(selectionMode==="line")return nearest(p);
   const words=getWordGeometry(i);
   const matches=words.filter(w=>eligibleSiddurHighlight(i,w)&&p.x>=w.x-.003&&p.x<=w.x+w.width+.003&&p.y>=w.y-.008&&p.y<=w.y+w.height+.008);
   return matches.sort((a,b)=>Math.abs(p.x-a.x-a.width/2)-Math.abs(p.x-b.x-b.width/2))[0]||null;
  };
  layer.addEventListener("pointerdown",e=>{if(!isSiddurSourceRecord(pageMetadata[i]))return;start=target(point(e));if(start)layer.setPointerCapture(e.pointerId)});
  layer.addEventListener("pointerup",e=>{
   if(!start||!isSiddurSourceRecord(pageMetadata[i]))return;
   const end=target(point(e))||start,items=selectionMode==="word"?getWordGeometry(i):detectedLines[i];
   const a=items.findIndex(x=>x.id===start.id),b=items.findIndex(x=>x.id===end.id);
   if(a<0||b<0){start=null;return}
   const ordered=items.slice().sort((u,v)=>u.column-v.column||u.y-v.y||u.x-v.x);
   const from=ordered.findIndex(x=>x.id===start.id),to=ordered.findIndex(x=>x.id===end.id);
   const chosen=(from===to?[start]:ordered.slice(Math.min(from,to),Math.max(from,to)+1).filter(l=>l.column===start.column)).filter(l=>eligibleSiddurHighlight(i,l));
   const highlights=pageMetadata[i].leadership.highlights;
   const activeCueId=selectedCueBySide[i]||((visibleCueId!=="__all__")?visibleCueId:"")||pageMetadata[i].leadership.cues[0]?.cueId||null;
   // Automatic cue highlights have generated ink-row IDs, not detection-line IDs.
   // Clicking their painted geometry must still be able to remove them.
   const suppressed=pageMetadata[i].leadership.suppressedAutoHighlights||=[];
   pageMetadata[i].leadership.suppressedAutoHighlights=suppressed;
   for(const item of chosen){
    const overlap=h=>{
     const x=Math.max(0,Math.min(h.x+h.width,item.x+item.width)-Math.max(h.x,item.x));
     const y=Math.max(0,Math.min(h.y+h.height,item.y+item.height)-Math.max(h.y,item.y));
     return x*y>0&&y/Math.max(.001,Math.min(h.height,item.height))>.35;
    };
    const automatic=highlights.filter(h=>h.cueId===activeCueId&&!h.manualApproved&&overlap(h));
    if(automatic.length){
     for(const h of automatic){
      suppressed.push({cueId:h.cueId,x:h.x,y:h.y,width:h.width,height:h.height});
      const idx=highlights.indexOf(h);if(idx>=0)highlights.splice(idx,1);
     }
     continue;
    }
    const role=pageMetadata[i].leadership.cues.find(c=>c.cueId===activeCueId)?.role||pageMetadata[i].leadership.cues[0]?.role||roleConfig.id;
    if(selectionMode==="word"){
     const lineId=item.lineId;
     const lineIndex=highlights.findIndex(h=>h.cueId===activeCueId&&!h.wordId&&h.lineId===lineId);
     const wordHighlights=highlights.filter(h=>h.cueId===activeCueId&&h.wordId&&h.lineId===lineId);
     if(lineIndex>=0){
      // Convert the entire line into word selections before toggling one word.
      const original=highlights.splice(lineIndex,1)[0];
      for(const word of wordCandidates(i,detectedLines[i].find(l=>l.id===lineId))){
       if(!highlights.some(h=>h.cueId===activeCueId&&h.wordId===word.id)){
        highlights.push({highlightId:"HL-"+(activeCueId||"unassigned")+"-"+word.id,cueId:activeCueId,lineId,wordId:word.id,
         roleId:original.roleId||role,x:word.x,y:word.y,width:word.width,height:word.height,
         coordinateSystem:"normalized-top-left",visibleInPdf:false});
       }
      }
     }
     const old=highlights.findIndex(h=>h.cueId===activeCueId&&h.wordId===item.id);
     if(old>=0)highlights.splice(old,1);
     else highlights.push({highlightId:"HL-"+(activeCueId||"unassigned")+"-"+item.id,cueId:activeCueId,lineId,wordId:item.id,roleId:role,
      x:item.x,y:item.y,width:item.width,height:item.height,
      coordinateSystem:"normalized-top-left",visibleInPdf:false});
    }else{
     // Line click replaces any partial-word edits for this line.
     const old=highlights.findIndex(h=>h.cueId===activeCueId&&!h.wordId&&h.lineId===item.id);
     for(let j=highlights.length-1;j>=0;j--)if(highlights[j].cueId===activeCueId&&highlights[j].wordId&&highlights[j].lineId===item.id)highlights.splice(j,1);
     if(old>=0){const idx=highlights.findIndex(h=>h.cueId===activeCueId&&!h.wordId&&h.lineId===item.id);if(idx>=0)highlights.splice(idx,1)}
     else highlights.push({highlightId:"HL-"+(activeCueId||"unassigned")+"-"+item.id,cueId:activeCueId,lineId:item.id,roleId:role,
      x:item.x,y:item.y,width:item.width,height:item.height,
      coordinateSystem:"normalized-top-left",visibleInPdf:false});
    }
   }
   pageMetadata[i].leadership.highlightConfirmed=false;
   pageMetadata[i].leadership.confirmedFingerprint=null;
   start=null;drawHighlights();
   status(highlights.length+" selections on "+(i===0?"left":"right")+" page ("+selectionMode+" mode). Download to save metadata.");
  });
  layer.addEventListener("pointercancel",()=>{start=null});
 }
}
// V3.87: Tesseract.js 5 may omit legacy data.lines/data.words.
// Explicit TSV output supplies word bounding boxes regardless of legacy object shape.
function parseOcrTsv(tsv){
 const rows=String(tsv||"").trim().split(/\r?\n/),words=[],lines=new Map();
 if(rows.length<2)return {words,lines:[]};
 const keys=rows.shift().split("\t");
 for(const row of rows){
  const cells=row.split("\t"),get=k=>cells[keys.indexOf(k)]||"";
  if(Number(get("level"))!==5)continue;
  const text=get("text").trim(),left=Number(get("left")),top=Number(get("top")),
   width=Number(get("width")),height=Number(get("height"));
  if(!text||![left,top,width,height].every(Number.isFinite)||width<=0||height<=0)continue;
  const word={text,confidence:Number(get("conf"))||0,bbox:{x0:left,y0:top,x1:left+width,y1:top+height}};
  words.push(word);
  const id=[get("page_num"),get("block_num"),get("par_num"),get("line_num")].join("-");
  if(!lines.has(id))lines.set(id,[]);
  lines.get(id).push(word);
 }
 return {words,lines:[...lines.values()].map(group=>({
  text:group.map(w=>w.text).join(" "),
  bbox:{x0:Math.min(...group.map(w=>w.bbox.x0)),y0:Math.min(...group.map(w=>w.bbox.y0)),
   x1:Math.max(...group.map(w=>w.bbox.x1)),y1:Math.max(...group.map(w=>w.bbox.y1))}
 }))};
}
async function recognizeCueLines(side){
 const canvas=$(side===0?"output-left":"output-right"),record=pageMetadata[side];
 if(!canvas||!record||!window.Tesseract){rawOcrDiagnostics[side]="OCR unavailable: missing canvas, page record or Tesseract.";return [];}
 const lang=pageHasHebrewCue(record)?"heb":"eng";
 const region=REGIONS[side],x=Math.round(region.x),y=Math.round(H-region.y-region.h);
 const analysis=enhancedAnalysisCanvas(canvas,2);
 const factor=analysis.width/canvas.width;
 const crop=canvasCrop(analysis,{left:x*factor,top:y*factor,right:Math.round((region.x+region.w)*factor),bottom:Math.round((H-region.y)*factor)});
 const result=await Tesseract.recognize(crop,lang,{},{tsv:true,blocks:true});
 const data=result.data||{},parsed=parseOcrTsv(data.tsv);
 if(!Array.isArray(data.words)||!data.words.length)data.words=parsed.words;
 const raw=Array.isArray(data.lines)&&data.lines.length?data.lines:parsed.lines;
 // Tesseract builds differ in whether they expose lines or words.
 const candidates=raw.length?raw:(Array.isArray(data.words)?data.words:[]);
 const geometry=detectedLines[side]||[],mapped=[];
 ocrWordGeometry[side]=new Map();
 hebrewOcrTokens[side]=[];
 rawOcrDiagnostics[side]="OCR engine: "+lang+"; raw lines: "+raw.length+"; raw words: "+(Array.isArray(data.words)?data.words.length:0)+"; candidates: "+candidates.length+"\n"+candidates.map(c=>String(c.text||"").trim()).filter(Boolean).join("\n");
 for(const line of candidates){
  const value=String(line.text||"").trim(),box=line.bbox;
  if(!value||!box)continue;
  const cy=(y+(box.y0+box.y1)/(2*factor))/canvas.height,cx=(x+(box.x0+box.x1)/(2*factor))/canvas.width;
  // Prefer the actual vertical overlap and horizontal intersection of OCR and ink.
  // Center-only matching incorrectly assigns short centered text to adjacent lines.
  const bx0=(x+box.x0/factor)/canvas.width,bx1=(x+box.x1/factor)/canvas.width;
  const by0=(y+box.y0/factor)/canvas.height,by1=(y+box.y1/factor)/canvas.height;
  const ranked=geometry.map(g=>{
   const ox=Math.max(0,Math.min(bx1,g.x+g.width)-Math.max(bx0,g.x));
   const oy=Math.max(0,Math.min(by1,g.y+g.height)-Math.max(by0,g.y));
   const vertical=oy/Math.max(.001,Math.min(by1-by0,g.height));
   const horizontal=ox/Math.max(.001,Math.min(bx1-bx0,g.width));
   return {g,score:vertical*2+horizontal-.2*Math.abs(cy-g.y-g.height/2)};
  }).filter(v=>v.score>1.05).sort((a,b)=>b.score-a.score);
  const closest=ranked[0]?.g;
  if(closest){
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
   hebrewOcrTokens[side].push({text:String(word.text||""),x:left,y:cy,lineId:closest.id});
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
 lines.sort((a,b)=>(lang==="heb"?((a.column===1?0:a.column===0?1:2)-(b.column===1?0:b.column===0?1:2)):a.column-b.column)||a.y-b.y);
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
// Recognition-only preprocessing: suppress isolated small marks (typically nikkud).
// Never alter the original canvas, printed geometry, or exported siddur image.
function consonantOnlyOcrCanvas(source){
 const out=document.createElement("canvas");out.width=source.width;out.height=source.height;
 const ctx=out.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0);
 const img=ctx.getImageData(0,0,out.width,out.height),d=img.data,w=out.width,h=out.height;
 const seen=new Uint8Array(w*h),stack=[];
 const dark=p=>d[p*4]<125;
 const maxTiny=Math.max(4,Math.round(w*h*.000018));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const root=y*w+x;if(seen[root]||!dark(root))continue;
  let minY=y,maxY=y,minX=x,maxX=x;const pixels=[];
  seen[root]=1;stack.push(root);
  while(stack.length){
   const p=stack.pop(),px=p%w,py=(p/w)|0;pixels.push(p);
   minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const xx=px+dx,yy=py+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const q=yy*w+xx;if(!seen[q]&&dark(q)){seen[q]=1;stack.push(q)}
   }
  }
  // Conservative: small, detached dots only; attached marks cannot safely be erased.
  if(pixels.length<=maxTiny&&maxX-minX<=Math.max(3,h*.12)&&maxY-minY<=Math.max(3,h*.12)){
   for(const p of pixels){const i=p*4;d[i]=d[i+1]=d[i+2]=255;}
  }
 }
 ctx.putImageData(img,0,0);return out;
}
const LITURGICAL_WORDS=new Set(("יתגדל ויתקדש שמה רבא בעלמא די ברא כרעותה וימליך מלכותה ויצמח פורקנה ויקרב משיחה בחייכון וביומיכון ובחיי דכל בית ישראל בעגלא ובזמן קריב ואמרו אמן יהא מברך לעלם ולעלמי עלמיא יתברך וישתבח ויתפאר ויתרומם ויתנשא ויתהדר ויתעלה ויתהלל בריך הוא שלום על ישראל יהי בחילך שלוה בארמנותיך למען אחי ורעי אדברה נא בך למען בית אלהינו אבקשה טוב לך וראה בנים לבניך רב לאהבי תורתך ואין למו מכשול עז לעמו יתן יברך את עמו בשלום אמר רבי אלעזר חנינא תלמידי חכמים מרבים בעולם שנאמר וכל בניך למודי ורב אל תקרי אלא בוניך קדיש דרבנן").split(/\s+/));
function hebrewWordQuality(text){
 const words=normalizeCueText(text).replace(/[^\u05d0-\u05ea ]/g," ").split(/\s+/).filter(Boolean);
 if(!words.length)return 0;
 const valid=words.filter(w=>LITURGICAL_WORDS.has(w)).length;
 return valid/words.length;
}
// Hebrew second recognition pass: read every detected printed line independently.
// This is deliberately cue-agnostic: recognition completes before any anchor matching.
// Rivok/ink geometry remains authoritative; this pass supplies text, not coordinates.
// V2-derived recovery: full-page PSM 6 first, then line-band PSM alternatives.
// Evaluate Hebrew letter coverage, recognized horizontal span and confidence.
// Never use cue anchors to choose OCR text; preserve source artwork and Rivok geometry.
function hebrewOcrCandidate(data,mode,variant){
 const text=String(data?.text||"").replace(/\s+/g," ").trim();
 const letters=(normalizeCueText(text).match(/[\u05d0-\u05ea]/g)||[]).length;
 const words=(data?.words||[]).filter(w=>/[\u05d0-\u05ea]/u.test(normalizeCueText(w.text||"")));
 const confidence=words.length?words.reduce((sum,w)=>sum+(Number(w.confidence)||0),0)/words.length:Number(data?.confidence)||0;
 let span=0;
 if(words.length){
  const left=Math.min(...words.map(w=>w.bbox?.x0??Infinity));
  const right=Math.max(...words.map(w=>w.bbox?.x1??-Infinity));
  const width=Number(data?.imageWidth)||0;
  if(Number.isFinite(left)&&Number.isFinite(right)&&width>0)span=Math.max(0,Math.min(1,(right-left)/width));
 }
 // A large quantity of Hebrew characters is useful only when OCR covers the printed band.
 const score=Math.min(1,letters/22)*.40+Math.max(0,Math.min(1,confidence/100))*.25+
  span*.25+hebrewWordQuality(text)*.10+(mode===7&&letters>=5?.025:0);
 return {text,letters,confidence,span,score,mode,variant};
}
function hebrewBinaryCanvas(source,threshold=200){
 const out=document.createElement("canvas");out.width=source.width;out.height=source.height;
 const ctx=out.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0);
 const image=ctx.getImageData(0,0,out.width,out.height);
 for(let i=0;i<image.data.length;i+=4){const v=image.data[i]<threshold?0:255;image.data[i]=image.data[i+1]=image.data[i+2]=v;}
 ctx.putImageData(image,0,0);return out;
}
async function secondPassHebrewLines(side,firstPass){
 const canvas=$(side===0?"output-left":"output-right");
 const geometry=detectedLines[side]||[];
 if(!window.Tesseract||!geometry.length)return firstPass;
 const worker=await Tesseract.createWorker("heb");
 const recovered=new Map(firstPass.map(l=>[l.id,{...l,recognitionPass:1}]));
 let read=0,replaced=0,failed=0,attempts=0;
 try{
  const analysis=enhancedAnalysisCanvas(canvas,2),scale=analysis.width/canvas.width;
  const ordered=geometry.slice().sort((a,b)=>a.column-b.column||a.y-b.y);
  for(const line of ordered){
   const padX=Math.max(5,Math.round(line.height*canvas.height*.20));
   const padY=Math.max(3,Math.round(line.height*canvas.height*.12));
   const left=Math.max(0,Math.floor((line.x*canvas.width-padX)*scale));
   const top=Math.max(0,Math.floor((line.y*canvas.height-padY)*scale));
   const right=Math.min(analysis.width,Math.ceil(((line.x+line.width)*canvas.width+padX)*scale));
   const bottom=Math.min(analysis.height,Math.ceil(((line.y+line.height)*canvas.height+padY)*scale));
   if(right-left<12||bottom-top<8)continue;
   const crop=canvasCrop(analysis,{left,top,right,bottom});
   const variants=[{name:"original",canvas:crop},{name:"consonants",canvas:consonantOnlyOcrCanvas(crop)}];
   let best=null;
   try{
    // PSM 7 is the natural single-line baseline. Escalate weak or partial results
    // to the modes used by V2: 6, 11, 13, and binary PSM 7.
    for(const trial of [{mode:7,v:0},{mode:7,v:1},{mode:6,v:0},{mode:11,v:0},{mode:13,v:0},{mode:7,v:2}]){
     if(trial.v===2&&variants.length===2)variants.push({name:"binary200",canvas:hebrewBinaryCanvas(crop,200)});
     await worker.setParameters({tessedit_pageseg_mode:String(trial.mode),preserve_interword_spaces:"1"});
     const result=await worker.recognize(variants[trial.v].canvas);
     attempts++;
     const candidate=hebrewOcrCandidate({...result.data,imageWidth:variants[trial.v].canvas.width},trial.mode,variants[trial.v].name);
     if(candidate.letters>0&&(!best||candidate.score>best.score))best=candidate;
     if(best&&best.letters>=15&&best.span>=.62&&best.confidence>=75)break;
    }
    read++;
    if(!best)continue;
    const previous=recovered.get(line.id);
    // Keep existing full-page OCR when the localized reading has poor letter coverage.
    const prevLetters=(normalizeCueText(previous?.text||"").match(/[\u05d0-\u05ea]/g)||[]).length;
    if(previous&&prevLetters>best.letters*1.35&&best.span<.45)continue;
    if(previous&&hebrewWordQuality(previous.text)>hebrewWordQuality(best.text)+.30&&best.confidence<65)continue;
    recovered.set(line.id,{id:line.id,text:best.text,y:line.y,column:line.column,
     bbox:{y0:line.y,y1:line.y+line.height},recognitionPass:2,ocrMode:best.mode,ocrVariant:best.variant});
    if(!previous||previous.text!==best.text)replaced++;
   }catch(e){failed++;console.warn("Hebrew band recovery",line.id,e)}
  }
 }finally{await worker.terminate()}
 rawOcrDiagnostics[side]+="\nV2-derived Hebrew band OCR (PSM 7/6/11/13, grayscale/consonant/binary): "+
  read+" bands, "+attempts+" recognition trials, "+replaced+" new/replaced lines, "+failed+
  " errors. Source-image span, confidence and Hebrew letter coverage ranked independently of cues.";
 return [...recovered.values()].sort((a,b)=>((a.column===1?0:a.column===0?1:2)-(b.column===1?0:b.column===0?1:2))||a.y-b.y);
}
// V3.84 independent word OCR diagnostic. Does not alter cue matches or highlights.
async function diagnoseHebrewWordRecognition(){
 const button=$("hebrew-word-ocr-diagnostic"),output=$("hebrew-word-ocr-results");
 const side=pageMetadata.findIndex((r,i)=>r?.source?.languageCode==="H"&&rivokWordsBySide[i]?.length);
 if(side<0){output.textContent="Load a Hebrew page and wait for Rivok word detection first.";return}
 if(!window.Tesseract){output.textContent="Tesseract unavailable.";return}
 button.disabled=true;output.replaceChildren();
 const heading=document.createElement("p");
 heading.textContent="Comparing original and mark-suppressed word crops. This is diagnostic only; no cue matching.";
 output.append(heading);
 const canvas=$(side===0?"output-left":"output-right"),scale=3,analysis=enhancedAnalysisCanvas(canvas,scale);
 const words=rivokWordsBySide[side].slice().sort((a,b)=>a.column-b.column||a.y-b.y||b.x-a.x).slice(0,45);
 let worker;
 try{
  worker=await Tesseract.createWorker("heb");
  await worker.setParameters({tessedit_pageseg_mode:"8"});
  for(let i=0;i<words.length;i++){
   const word=words[i],pad=Math.max(4,Math.round(word.height*canvas.height*.2));
   const left=Math.max(0,Math.floor((word.x*canvas.width-pad)*scale));
   const top=Math.max(0,Math.floor((word.y*canvas.height-pad)*scale));
   const right=Math.min(analysis.width,Math.ceil(((word.x+word.width)*canvas.width+pad)*scale));
   const bottom=Math.min(analysis.height,Math.ceil(((word.y+word.height)*canvas.height+pad)*scale));
   if(right-left<8||bottom-top<8)continue;
   const original=canvasCrop(analysis,{left,top,right,bottom});
   const cleaned=consonantOnlyOcrCanvas(original);
   const first=await worker.recognize(original),second=await worker.recognize(cleaned);
   const text1=normalizeCueText(first.data?.text||"").replace(/[^\u05d0-\u05ea ]/g,"").trim();
   const text2=normalizeCueText(second.data?.text||"").replace(/[^\u05d0-\u05ea ]/g,"").trim();
   const row=document.createElement("div");
   row.style.cssText="display:flex;gap:12px;align-items:center;border-bottom:1px solid #ddd;padding:7px;flex-wrap:wrap";
   const picture=document.createElement("img");picture.src=original.toDataURL("image/png");picture.alt="Original printed Hebrew word crop";picture.style.cssText="max-width:220px;max-height:75px;object-fit:contain;background:white";
   const detail=document.createElement("span");
   detail.textContent="#"+(i+1)+"  Original OCR: "+(text1||"∅")+" ("+Math.round(first.data?.confidence||0)+"%) | Mark-suppressed OCR: "+(text2||"∅")+" ("+Math.round(second.data?.confidence||0)+"%) | Vocabulary: "+(LITURGICAL_WORDS.has(text1)?"first ":"")+(LITURGICAL_WORDS.has(text2)?"second":"") ;
   row.append(picture,detail);output.append(row);
   heading.textContent="Compared "+(i+1)+" of "+words.length+" word boxes (diagnostic only).";
  }
 }catch(e){const p=document.createElement("p");p.textContent="Word diagnostic error: "+e.message;output.append(p)}
 finally{if(worker)await worker.terminate();button.disabled=false}
}
$("hebrew-word-ocr-diagnostic").addEventListener("click",diagnoseHebrewWordRecognition);
function matchCrossPageEnglishCues(){
 // A physical page boundary can be traversed only when both sides are
 // independently identified as the same language and share the same cue ID.
 // Never join English to Hebrew facing pages.
 if(pageMetadata.length!==2)return 0;
 const [a,b]=pageMetadata;
 if(!a||!b||a.source.languageCode!=="E"||b.source.languageCode!=="E")return 0;
 const firstNumber=Number(a.source.sourcePdfPage),secondNumber=Number(b.source.sourcePdfPage);
 if(!Number.isInteger(firstNumber)||secondNumber!==firstNumber+1)return 0;
 let matched=0;
 for(const cue of a.leadership.cues){
  const other=b.leadership.cues.find(c=>c.cueId&&c.cueId===cue.cueId);
  if(!other||!cue.startCue||!cue.endCue)continue;
  const firstLines=sourceTextLines[0]||[],secondLines=sourceTextLines[1]||[];
  const start=matchingCueLine(firstLines,cue.startCue),end=matchingCueLine(secondLines,cue.endCue);
  if(start===null||end===null)continue;
  // Do not replace a complete, independently matched cue.
  if(!String(cue.matchStatus).includes("review-required")||!String(other.matchStatus).includes("review-required"))continue;
  const firstAnchor=firstLines[start],lastAnchor=secondLines[end];
  if(!firstAnchor||!lastAnchor)continue;
  const selections=[
   (detectedLines[0]||[]).filter(l=>!isPageNumberLine(l,firstLines,a)&&l.column===firstAnchor.column&&l.y+l.height/2>=firstAnchor.y-.012),
   (detectedLines[1]||[]).filter(l=>!isPageNumberLine(l,secondLines,b)&&l.column===lastAnchor.column&&l.y+l.height/2<=lastAnchor.y+.012)
  ];
  if(selections.some(lines=>!lines.length))continue;
  for(let side=0;side<2;side++){
   const record=pageMetadata[side],c=side===0?cue:other;
   record.leadership.highlights=record.leadership.highlights.filter(h=>h.cueId!==cue.cueId);
   for(const line of selections[side])record.leadership.highlights.push({
    highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,roleId:c.role,
    x:line.x,y:line.y,width:line.width,height:line.height,
    coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true
   });
   c.matchStatus="cross-page-English-candidate-review-required";
  }
  matched++;
 }
 return matched;
}
async function autoMatchCuesForSide(side){
 const record=pageMetadata[side];if(!isSiddurSourceRecord(record))return;
 record.leadership.highlights=record.leadership.highlights.filter(h=>!h.cueId||h.manualApproved);
 status("Matching "+(side===0?"left":"right")+" page cues…");
 try{
  sourceTextLines[side]=await recognizeCueLines(side);
  if(pageHasHebrewCue(record))sourceTextLines[side]=await secondPassHebrewLines(side,sourceTextLines[side]);
  assignCueHighlights(side);
 }catch(e){rawOcrDiagnostics[side]="OCR error: "+e.message;assignCueHighlights(side)}
 refreshCueVisibilityPicker();renderPageCueEditor();drawHighlights();displayMetadata();
}
async function autoMatchCues(){
 if(!pageMetadata.length||!importedCues.length)return;
 const progress=document.getElementById("highlight-loading-progress");
 const progressLabel=document.getElementById("highlight-loading-label");
 if(progress){progress.hidden=false;progress.max=Math.max(1,pageMetadata.length*4);progress.value=0}
 if(progressLabel)progressLabel.textContent="Recognizing cue text and preparing highlights…";
 let total=0;
 for(const record of pageMetadata){record.leadership.highlights=record.leadership.highlights.filter(h=>!h.cueId||h.manualApproved)}
 for(let side=0;side<pageMetadata.length;side++){
  if(!pageMetadata[side].leadership.cues.length){if(progress)progress.value=side+1;continue;}
  if(progressLabel)progressLabel.textContent="Page "+(side+1)+": Pass 1 — full-page "+(pageHasHebrewCue(pageMetadata[side])?"Hebrew":"English")+" OCR";
  if(progress)progress.value=side*4;
  status("Reading "+(side===0?"left":"right")+" page for cue anchors...");
  try{
   sourceTextLines[side]=await recognizeCueLines(side);
   if(progress){progress.value=side*4+1;}
   if(progressLabel)progressLabel.textContent="Page "+(side+1)+": Pass 2 — "+(pageHasHebrewCue(pageMetadata[side])?"line-by-line Hebrew OCR recovery":"English token normalization (no second OCR pass)");
   if(pageHasHebrewCue(pageMetadata[side]))sourceTextLines[side]=await secondPassHebrewLines(side,sourceTextLines[side]);
   if(progress)progress.value=side*4+2;
   if(progressLabel)progressLabel.textContent="Page "+(side+1)+": Matching cue boundaries against recognized text";
   total+=assignCueHighlights(side);
   if(progress)progress.value=side*4+3;
   if(progressLabel)progressLabel.textContent="Page "+(side+1)+": Validating physical highlight geometry";
   for(const cue of pageMetadata[side].leadership.cues){
    const boxes=pageMetadata[side].leadership.highlights.filter(h=>h.cueId===cue.cueId);
    const valid=boxes.length>0&&boxes.every(h=>[h.x,h.y,h.width,h.height].every(Number.isFinite)&&h.width>0&&h.height>0);
    cue.highlightVerification={...(cue.highlightVerification||{}),geometryValid:valid,reviewRequired:true};
    if(!valid&&boxes.length)cue.matchStatus="invalid-geometry-review-required";
   }
   if(progress)progress.value=(side+1)*4;
  }
  catch(e){rawOcrDiagnostics[side]="OCR error: "+e.message;console.warn("Cue OCR unavailable",e);total+=assignCueHighlights(side);for(const cue of pageMetadata[side].leadership.cues)if(cue.matchStatus==="unmatched-review-required")cue.matchStatus="ocr-error: "+e.message}
 }
 // Deduplicate OCR/Rivok overlaps within each cue before rendering.
 for(const record of pageMetadata){
  const unique=new Map();
  for(const h of record.leadership.highlights){
   const key=[h.cueId||"",h.wordId||"",h.lineId||"",...["x","y","width","height"].map(k=>Number(h[k]||0).toFixed(4))].join("|");
   if(!unique.has(key))unique.set(key,h);
  }
  record.leadership.highlights=[...unique.values()];
 }
 if(progress)progress.value=pageMetadata.length*4;
 if(progressLabel)progressLabel.textContent="Recognition complete — review candidate highlights.";
 total+=matchCrossPageEnglishCues();
 const hebrewAnchorReport=pageMetadata.flatMap((r,i)=>(r.leadership.cues||[]).filter(cueHasHebrewScript).map(c=>{
  const normalize=t=>normalizeCueText(t).replace(/יהוה/g,"יי").replace(/[^\u05d0-\u05ea ]/g," ").replace(/\s+/g," ").trim();
  const recognized=(sourceTextLines[i]||[]).map(l=>normalize(l.text)).filter(Boolean);
  const tokens=(hebrewOcrTokens[i]||[]).map(t=>normalize(t.text)).filter(Boolean);
  const check=(value)=>{const words=normalize(value).split(" ").filter(Boolean);return words.map(w=>({word:w,found:recognized.some(t=>t.includes(w))||tokens.some(t=>t.includes(w))}));};
  return ["Page "+(i===0?"left":"right")+" — "+c.cueId+" — "+c.matchStatus,
   "Beginning: "+c.startCueHebrew+" | "+JSON.stringify(check(c.startCueHebrew)),
   "Ending: "+c.endCueHebrew+" | "+JSON.stringify(check(c.endCueHebrew)),
   "Hebrew OCR word tokens: "+tokens.length,
   "Detected Hebrew word boxes: "+(rivokWordsBySide[i]?.length||0)].join("\n");
 })).join("\n\n");
 $("ocr-diagnostics").textContent="HEBREW CUE ANCHOR DIAGNOSTICS\n"+(hebrewAnchorReport||"No Hebrew-script cues attached.")+"\n\n"+pageMetadata.map((r,i)=>"Page "+(r.source.sourcePage||i+1)+" OCR ("+(sourceTextLines[i]||[]).length+" mapped lines):\n"+(sourceTextLines[i]||[]).map(l=>l.text).join("\n")+"\n\nRAW OCR DIAGNOSTICS:\n"+(rawOcrDiagnostics[i]||"Not run")).join("\n\n");
 cueMatchReport=total+" of "+pageMetadata.reduce((n,r)=>n+r.leadership.cues.length,0)+" cues automatically matched. "+pageMetadata.flatMap(r=>r.leadership.cues.map(c=>c.cueId+": "+c.matchStatus)).join("; ");
 refreshCueVisibilityPicker();renderPageCueEditor();renderFacingInstructions();drawHighlights();displayMetadata();if($("cue-summary"))$("cue-summary").textContent=cueMatchReport;status(cueMatchReport);
}
async function syncHighlightMetadata(){
 for(const record of pageMetadata)for(const h of record?.leadership?.highlights||[])h.visibleInPdf=false;
}
async function initializeSiddurSpread(bytes){
 const source=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
 const first=Math.max(0,Math.min(source.numPages-1,selectedSpreadFirst-1)),count=Math.min(2,source.numPages-first);
 if(!count)throw Error("No PDF pages found.");
 const records=[];
 for(let i=0;i<count;i++){
  status("Processing source page "+(i+1)+" of "+count+"...");
  const src=await source.getPage(first+i+1),v=src.getViewport({scale:2});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  await src.render({canvasContext:ctx,viewport:v}).promise;
  const meta=await readMetadata(source,first+i,canvas);
  const crop=detectCrop(canvas,meta);
  records.push({meta,crop,sourceIndex:first+i});
 }
 // Facing placement follows the document's reading direction, never prayer identity.
 // The first PDF page of a Hebrew-direction spread appears on the right.
 // Preserve sourceIndex so cues and metadata remain attached to the original PDF page.
 const facingDirection=String(serviceManifest?.facingPageDirection||"hebrew").toLowerCase();
 if(records.length===2&&facingDirection==="hebrew")records.reverse();
 pageMetadata=records.map(r=>{const record=makeIntakeRecord(r.meta,r.sourceIndex);record.production.approvedCrop=r.crop;return record});
 pageMetadata.forEach(r=>{r.leadership.highlights=[];r.leadership.role=roleConfig.id});
 if(serviceManifest?.pages)for(let i=0;i<pageMetadata.length;i++){
  const entry=serviceManifest.pages.find(p=>p.outputPage===records[i].sourceIndex+1);
  if(!entry)continue;
  const record=pageMetadata[i];
  record.source.serviceReference=entry.reference;
  record.source.originalPageNumber=String(entry.printedPage||entry.reference||"");
  record.source.sourceId=entry.reference;
  record.identification.binderOrder=entry.outputPage;
  if(entry.language==="E"||entry.language==="H"){
   record.source.languageCode=entry.language;
   record.source.language=entry.language==="E"?"English":"Hebrew";
  }
 }
 applyImportedCues();
 applyCueTextEdits();
 
 return records.length;
}
function refreshMetadataDialog(){
 const dialog=$("metadata-dialog");if(!dialog)return;
 $("view-metadata").disabled=!pageMetadata.length;
 $("metadata-spread-label").textContent=$("spread-position").textContent;
 const content=$("metadata-dialog-content");content.replaceChildren();
 for(const [index,id] of ["metadata-left","metadata-right"].entries()){
  if(!pageMetadata[index])continue;
  const source=$(id),panel=document.createElement("section"),heading=document.createElement("h3");
  heading.textContent=index===0?"Left page":"Right page";panel.append(heading);
  const dl=source.querySelector("dl");if(dl)panel.append(dl.cloneNode(true));
  content.append(panel);
 }
}
$("view-metadata").addEventListener("click",()=>{refreshMetadataDialog();$("metadata-dialog").showModal()});
$("close-metadata").addEventListener("click",()=>$("metadata-dialog").close());
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
   ["Imported cues",(record.leadership.cues||[]).map(c=>[c.cueId,c.role,"Style: "+c.style,"Start: "+c.startCue,"End: "+c.endCue,c.matchStatus,"Method: "+(c.highlightMethod||"not matched"),"Verification: "+JSON.stringify(c.highlightVerification||{})].join(" | ")).join(" ; ")||"None"],
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
 refreshMetadataDialog();
}
async function analyzeCanonicalPreview({reuseSaved=false}={}){
 // The preview canvases are already rendered from the approved master.
 // No staging PDF, blank carrier, or alternative page artwork is involved.
 displayMetadata();
 detectedLines=[0,1].map(i=>pageMetadata[i]?detectPrintedLines($(i===0?"output-left":"output-right"),i):[]);
 drawHighlights();
 status("Detected "+detectedLines.map(a=>a.length).join(" / ")+" candidate printed lines.");
 await runRivokAutomatically();
 if(!reuseSaved)await autoMatchCues();
 $("spread-preview").hidden=false;$("empty-preview").hidden=true;
}

pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
let selectedSpreadFirst=1,sourcePdfBytes=null,sourcePdfPages=0,serviceManifest=null,servicePageMapping=null,serviceRoleOpacity=new Map(),serviceRoleAssignments=new Map(),serviceRoleDisplayNames=new Map(),serviceHighlightColors=["#F5D03C","#75C56A","#74B9E7","#F3A65B","#DA88B8","#AE93DC"],embeddedPageRecords=[];
const spreadEdits=new Map();
const savedSpreadRecords=new Map(); // Only explicit Save commits pages to the working PDF.
// Persisted rendered two-page spreads and assembled PDF: download never renders pages.
let renderedSpreadPdfs=new Map();
let assembledWorkingPdf=null;
function resetIncrementalPdfState(){
 savedSpreadRecords.clear();renderedSpreadPdfs.clear();assembledWorkingPdf=null;
 explicitlySavedPages.clear();excludedFromProof.clear();
}
async function ensureInitialWorkingPdf(){
 if(assembledWorkingPdf)return;
 assembledWorkingPdf=await assembleCachedWorkingPdf();
 await checkpointWrite();
}

const CHECKPOINT_DB="leaders-companion-editor-checkpoints-v1";
function checkpointKey(){return filename+"|"+sourcePdfPages+"|"+(sourcePdfBytes?.length||0);}
function checkpointDb(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(CHECKPOINT_DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore("checkpoints");
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
async function checkpointWrite(){
 if(!sourcePdfBytes)throw Error("No source PDF loaded.");
 const snapshot={schema:"leaders-companion-checkpoint-v1",savedAt:new Date().toISOString(),
  filename,sourcePages:sourcePdfPages,sourceBytes:sourcePdfBytes.length,
  coverMetadata,sectionCoverMetadata,sections:serviceManifest?.sections||[],spreads:[...savedSpreadRecords.entries()],excludedFromProof:[...excludedFromProof],cueTextEdits:[...cueTextEdits.entries()],
  cueRoleEdits:[...cueRoleEdits.entries()],renderedSpreadPdfs:[...renderedSpreadPdfs.entries()],assembledWorkingPdf};
 const db=await checkpointDb();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction("checkpoints","readwrite");
   tx.objectStore("checkpoints").put(snapshot,checkpointKey());
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
 explicitlySavedPages=new Map(snapshot.spreads.flatMap(([,spread])=>(spread.pages||[]).filter(Boolean).map(record=>[Number(record.sourcePdfPage||record.source?.sourcePdfPage),JSON.parse(JSON.stringify(record))])).filter(([n])=>Number.isInteger(n)&&n>0));
 const label=$("checkpoint-status");if(label)label.textContent="Saved locally: "+snapshot.savedAt+" — "+explicitlySavedPages.size+" pages in checkpoint, "+verifiedWorkingPages().length+" approved.";
 return snapshot;
}
async function checkpointRead(){
 if(!sourcePdfBytes)return false;
 const db=await checkpointDb();
 let snapshot;
 try{snapshot=await new Promise((resolve,reject)=>{
  const request=db.transaction("checkpoints","readonly").objectStore("checkpoints").get(checkpointKey());
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });}finally{db.close();}
 if(!snapshot||snapshot.sourceBytes!==sourcePdfBytes.length||snapshot.sourcePages!==sourcePdfPages)return false;
 coverMetadata=snapshot.coverMetadata||coverMetadata;
 sectionCoverMetadata=snapshot.sectionCoverMetadata||sectionCoverMetadata;
 if(serviceManifest&&snapshot.sections)serviceManifest.sections=snapshot.sections;
 spreadEdits.clear();savedSpreadRecords.clear();
 for(const [key,value] of snapshot.spreads||[]){spreadEdits.set(Number(key),value);savedSpreadRecords.set(Number(key),JSON.parse(JSON.stringify(value)));}
 renderedSpreadPdfs=new Map((snapshot.renderedSpreadPdfs||[]).map(([key,bytes])=>[Number(key),new Uint8Array(bytes)]));
 assembledWorkingPdf=snapshot.assembledWorkingPdf?new Uint8Array(snapshot.assembledWorkingPdf):null;
 excludedFromProof=new Set(snapshot.excludedFromProof||[]);
 explicitlySavedPages=new Map((snapshot.spreads||[]).flatMap(([,spread])=>(spread.pages||[]).filter(Boolean).map(record=>[Number(record.sourcePdfPage||record.source?.sourcePdfPage),JSON.parse(JSON.stringify(record))])).filter(([n])=>Number.isInteger(n)&&n>0));
 cueTextEdits.clear();for(const [key,value] of snapshot.cueTextEdits||[])cueTextEdits.set(key,value);
 cueRoleEdits.clear();for(const [key,value] of snapshot.cueRoleEdits||[])cueRoleEdits.set(key,value);
 const label=$("checkpoint-status");if(label)label.textContent="Restored local checkpoint from "+snapshot.savedAt+".";
 // One-time upgrade of existing checkpoints; rendering occurs on restore,
 // never on Download. Preserve all previously saved facing spreads.
 if(!assembledWorkingPdf){
  if(label)label.textContent="Upgrading saved spreads to incremental PDF cache…";
  try{
   for(const [first,spread] of [...spreadEdits].sort((a,b)=>a[0]-b[0])){
    if(spread?.pages?.some(Boolean)&&!renderedSpreadPdfs.has(first))
     renderedSpreadPdfs.set(first,await renderSavedSpreadPdf(first,spread));
   }
   assembledWorkingPdf=await assembleCachedWorkingPdf();
   await checkpointWrite();
   if(label)label.textContent="Saved spreads upgraded and PDF cached locally.";
  }catch(error){
   assembledWorkingPdf=null;
   if(label)label.textContent="Saved edits restored, but PDF cache upgrade failed: "+error.message;
   console.error("Incremental PDF cache upgrade failed",error);
  }
 }
 workingCopyStatus();return true;
}
async function saveCheckpointNow(){
 saveCurrentSpreadEdits();
 const label=$("checkpoint-status");if(label)label.textContent="Rendering and saving current two-page spread…";
 try{
  const targetSpread=selectedSpreadFirst;
  const previousSpread=renderedSpreadPdfs.get(targetSpread);
  const previousRecords=savedSpreadRecords.get(targetSpread);
  const previousPdf=assembledWorkingPdf;
  try{
   const spread=JSON.parse(JSON.stringify(spreadEdits.get(targetSpread)||{pages:[]}));
   if(spread?.pages?.some(Boolean)){
    const bytes=await renderSavedSpreadPdf(targetSpread,spread);
    renderedSpreadPdfs.set(targetSpread,bytes);
    savedSpreadRecords.set(targetSpread,spread);
   }
   assembledWorkingPdf=await assembleCachedWorkingPdf();
   await checkpointWrite();
  }catch(e){
   if(previousSpread)renderedSpreadPdfs.set(targetSpread,previousSpread);
   else renderedSpreadPdfs.delete(targetSpread);
   if(previousRecords)savedSpreadRecords.set(targetSpread,previousRecords);
   else savedSpreadRecords.delete(targetSpread);
   assembledWorkingPdf=previousPdf;
   throw e;
  }
  const statusLabel=$("export-status");
  if(statusLabel)statusLabel.textContent="PDF updated and saved locally. Download PDF is ready.";
 }catch(e){if(label)label.textContent="SAVE FAILED: "+e.message;throw e;}
}
$("save-checkpoint")?.addEventListener("click",()=>saveCheckpointNow().catch(e=>status("Save failed: "+e.message)));

function saveCurrentSpreadEdits(){
 if(pageMetadata.length)spreadEdits.set(selectedSpreadFirst,{pages:pageMetadata.map(r=>r?{
  sourcePdfPage:r.source?.sourcePdfPage,
  source:JSON.parse(JSON.stringify(r.source)),
  leadership:JSON.parse(JSON.stringify(r.leadership)),
  production:r.production?JSON.parse(JSON.stringify(r.production)):null,
  prayerTitle:r.prayerTitle,
  identification:r.identification?JSON.parse(JSON.stringify(r.identification)):null
 }:null),selectedCues:[...selectedCueBySide]});
 workingCopyStatus();
}
function updateSpreadNavigation(){updateSpanStatus();const total=Math.ceil(sourcePdfPages/2),current=Math.ceil(selectedSpreadFirst/2),percent=Math.round(Math.min(sourcePdfPages,selectedSpreadFirst+1)/Math.max(1,sourcePdfPages)*100);$("spread-position").textContent="Spread "+current+" of "+(total||"—")+" · PDF pages "+selectedSpreadFirst+(selectedSpreadFirst+1<=sourcePdfPages?"–"+(selectedSpreadFirst+1):"")+" · "+percent+"% through service";const progress=$("review-progress");if(progress)progress.value=percent;$("previous-spread").disabled=!sourcePdfBytes||current<=1;$("next-spread").disabled=!sourcePdfBytes||current>=total;}
// Section boundaries are explicit, confirmed intake records; never infer from prayer titles.
const reviewedSectionTransitions=new Set();
function approvedPrayerName(record){return record?.leadership?.instructionPrayer||record?.prayerTitle||record?.identification?.prayerName||record?.identification?.prayerTitle||"";}
function confirmedSections(){return (serviceManifest?.sections||[]).filter(s=>s.status==="confirmed").sort((a,b)=>a.startOutputPage-b.startOutputPage)}
function sectionForPage(page){return confirmedSections().filter(s=>s.startOutputPage<=page).at(-1)||null}
function renamePrayerInSavedRecord(record,newName){
 if(!record)return;
 record.prayerTitle=newName;record.identification??={};record.identification.prayerName=newName;
 record.leadership??={};record.leadership.instructionPrayer=newName;
 for(const cue of record.leadership.cues||[])cue.prayer=newName;
 record.leadership.highlightConfirmed=false;
}
function openSectionReview(previous,next){
 const existing=document.getElementById("section-review-dialog");if(existing)existing.remove();
 const dialog=document.createElement("dialog");dialog.id="section-review-dialog";
 dialog.style.cssText="width:min(700px,94vw);max-height:85vh;overflow:auto;padding:24px";
 const heading=document.createElement("h2");heading.textContent="Review completed section: "+previous.title;dialog.append(heading);
 const note=document.createElement("p");note.textContent="Rename prayers in the completed section. Changes update saved page records and require renewed page approval.";dialog.append(note);
 const edits=[];
 for(const [pageIndex,record] of workingPages()){
  if(pageIndex<previous.startOutputPage||pageIndex>=(next?.startOutputPage||Infinity))continue;
  const label=document.createElement("label");label.textContent="PDF page "+pageIndex+" — prayer name ";
  const input=document.createElement("input");input.value=approvedPrayerName(record);input.style.width="75%";
  label.append(input);dialog.append(label,document.createElement("br"));edits.push([pageIndex,input]);
 }
 if(!edits.length){const p=document.createElement("p");p.textContent="No edited prayer records yet. You can review this section later.";dialog.append(p)}
 const nextHeading=document.createElement("h3");nextHeading.textContent=next?"Next section: "+next.title:"End of service";dialog.append(nextHeading);
 const nextNote=document.createElement("p");nextNote.textContent=next?"Section title and contents remain draft placeholders until reviewed.":"Review the final section before finishing.";dialog.append(nextNote);
 const save=document.createElement("button");save.type="button";save.textContent="Save section review and continue";
 save.onclick=()=>{
  for(const [pageIndex,input] of edits){
   const name=input.value.trim();if(!name)continue;
   for(const saved of spreadEdits.values())for(const record of saved.pages||[])
    if(Number(record?.sourcePdfPage||record?.source?.sourcePdfPage)===pageIndex)renamePrayerInSavedRecord(record,name);
  }
  reviewedSectionTransitions.add(next?.sectionId||"END");
  saveCheckpointNow().catch(e=>status("Section review checkpoint failed: "+e.message));
  dialog.close();dialog.remove();
 };
 dialog.append(save);document.body.append(dialog);dialog.showModal();
}
function checkSectionBoundary(previousPage,currentPage){
 const sections=confirmedSections();
 const crossed=sections.find(s=>s.startOutputPage>previousPage&&s.startOutputPage<=currentPage&&!reviewedSectionTransitions.has(s.sectionId));
 if(crossed){const index=sections.indexOf(crossed);if(index>0)openSectionReview(sections[index-1],crossed)}
}
async function navigateSpread(direction){if(!sourcePdfBytes)return;const previousPage=selectedSpreadFirst;
 if(direction>0){for(const record of pageMetadata){if(!record)continue;record.leadership.highlightConfirmed=true;record.leadership.confirmedFingerprint=pageApprovalFingerprint(record);}}
 saveCurrentSpreadEdits();
 if(direction>0){try{await saveCheckpointNow()}catch(e){status("Page approval save failed: "+e.message);return;}}
 selectedSpreadFirst=Math.max(1,Math.min(2*Math.ceil(sourcePdfPages/2)-1,selectedSpreadFirst+direction*2));updateIntakeInventory();try{await loadSelectedSpread();if(direction>0)checkSectionBoundary(previousPage,selectedSpreadFirst)}catch(e){console.error(e);status("Spread navigation failed: "+e.message)}}
$("framework-boxes")?.addEventListener("change",async()=>{if(!sourcePdfBytes)return;saveCurrentSpreadEdits();try{await loadSelectedSpread()}catch(e){status("Framework style update failed: "+e.message)}});
$("previous-spread").addEventListener("click",()=>navigateSpread(-1));
$("next-spread").addEventListener("click",()=>navigateSpread(1));
function updateIntakeInventory(){
 const inventory=$("intake-inventory"),summary=$("intake-summary");
 inventory.hidden=!sourcePdfPages;
 if(!sourcePdfPages)return;
 const relevant=importedCues||[];
 const printed=[...new Set(relevant.map(c=>String(c.printed_page||"").trim()).filter(Boolean))];
 const languages=[...new Set(relevant.map(c=>String(c.language||"").trim()).filter(Boolean))];
 const spreads=Math.ceil(sourcePdfPages/2);
 summary.textContent="Original PDF: "+sourcePdfPages+" physical pages; "+spreads+" possible facing pairs. CSV: "+relevant.length+" cue rows; "+printed.length+" distinct printed page references; languages: "+(languages.join(", ")||"not supplied")+". Service-page selection and supplemental-page counts require a verified page mapping; they are not inferred from these totals.";
 $("spread-first").max=String(sourcePdfPages);
 $("spread-first").value=String(selectedSpreadFirst);
 updateSpreadNavigation();
}
// The visible editor canvases render the same PDF-lib page builder as export.
// Interaction remains on transparent selection canvases; artwork is never HTML-overlaid.
let canonicalPreviewEnabled=false,canonicalPreviewTimer=null,canonicalPreviewEpoch=0,canonicalPreviewRendering=false;
let canonicalPreviewLastSignature="";
// Changes in text inputs also invalidate the live PDF even when highlight geometry is unchanged.
document.addEventListener("input",event=>{
 if(canonicalPreviewEnabled&&event.target?.closest?.("#facing-instructions, #spread-preview, [aria-label='Edit cues on current spread']"))scheduleCanonicalPreview();
},true);
document.addEventListener("change",event=>{
 if(canonicalPreviewEnabled&&event.target?.closest?.("#facing-instructions, [aria-label='Edit cues on current spread']"))scheduleCanonicalPreview();
},true);
function scheduleCanonicalPreview(){
 if(!canonicalPreviewEnabled||!sourcePdfBytes||!pageMetadata.length)return;
 const epoch=++canonicalPreviewEpoch;
 clearTimeout(canonicalPreviewTimer);
 const label=$("spread-proof-status");if(label)label.textContent="Updating exact PDF preview…";
 canonicalPreviewTimer=setTimeout(()=>renderCanonicalSpread(epoch).catch(e=>{
  if(epoch===canonicalPreviewEpoch){canonicalPreviewEnabled=false;status("Canonical PDF preview failed: "+e.message);if(label)label.textContent="PDF preview failed — do not trust the editing view.";}
 }),350);
}
// Editor-only approved placement guides. Never embedded in the generated PDF.
let showPlacementGuides=false;
// The guide overlay reads the same canonical regions as the PDF compositor.
// It never substitutes a second template and is never included in export.
function canonicalPageBoxes(side){
 const region=REGIONS[side];
 const textX=region.x;
 const contentX=side===0?20.16:444.96;
 const min=Math.min(textX,contentX),max=Math.max(textX+region.w,contentX+146.88);
 return [
  {x:textX,y:710,w:region.w,h:30,label:"Prayer heading"},
  {x:textX,y:642,w:region.w,h:64,label:"Instructions"},
  {x:region.x,y:region.y,w:region.w,h:region.h,label:"Prayer text"},
  {x:textX,y:46,w:region.w,h:52,label:"Cues"},
  {x:contentX,y:46,w:146.88,h:694,label:"Side panel"},
  {x:min,y:24,w:max-min,h:18,label:"Footer"}
 ];
}
function drawPlacementGuides(){
 for(let side=0;side<2;side++){
  const base=$(side===0?"output-left":"output-right");if(!base)continue;
  const parent=base.parentElement;parent.style.position="relative";
  let guide=parent.querySelector(".placement-guide-overlay");
  if(!guide){guide=document.createElement("canvas");guide.className="placement-guide-overlay";guide.setAttribute("aria-hidden","true");parent.append(guide);}
  guide.width=base.width;guide.height=base.height;
  guide.style.cssText="position:absolute;pointer-events:none;z-index:5;left:"+base.offsetLeft+"px;top:"+base.offsetTop+"px;width:"+base.getBoundingClientRect().width+"px;height:"+base.getBoundingClientRect().height+"px;display:"+(showPlacementGuides?"block":"none");
  if(!showPlacementGuides)continue;
  const ctx=guide.getContext("2d"),sx=guide.width/W,sy=guide.height/H;
  ctx.save();ctx.strokeStyle="rgba(16,111,129,.85)";ctx.fillStyle="rgba(16,111,129,.85)";
  ctx.lineWidth=Math.max(1,.8*sx);ctx.setLineDash([5*sx,3*sx]);
  for(const {x,y,w,h,label} of canonicalPageBoxes(side)){
   const px=x*sx,py=(H-y-h)*sy;
   ctx.strokeRect(px,py,w*sx,h*sy);
   ctx.save();ctx.setLineDash([]);ctx.font=Math.max(9,9*sx)+"px Arial, sans-serif";
   const tw=ctx.measureText(label).width+8*sx;
   ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillRect(px+3*sx,py+2*sy,tw,13*sy);
   ctx.fillStyle="rgba(16,111,129,.95)";ctx.fillText(label,px+7*sx,py+12*sy);ctx.restore();
  }
  ctx.restore();
 }
}
const placementGuideToggle=$("toggle-placement-guides");
if(placementGuideToggle)placementGuideToggle.checked=showPlacementGuides;
placementGuideToggle?.addEventListener("change",e=>{showPlacementGuides=e.target.checked;drawPlacementGuides();});
window.addEventListener("resize",()=>{if(canonicalPreviewEnabled)drawPlacementGuides();});
async function renderCanonicalSpread(epoch){
 if(epoch!==canonicalPreviewEpoch||!canonicalPreviewEnabled)return;
 const signature=JSON.stringify({spread:selectedSpreadFirst,pages:pageMetadata.map(r=>r&&({leadership:r.leadership,production:r.production,source:r.source,identification:r.identification,prayerTitle:r.prayerTitle}))});
 if(signature===canonicalPreviewLastSignature){drawPlacementGuides();return;}
 canonicalPreviewRendering=true;
 try{
  const out=await PDFLib.PDFDocument.create();
  const masterBytes=await window.LCV3Templates.load("siddur");
  const master=await PDFLib.PDFDocument.load(masterBytes);
  const source=await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise;
  const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
  const bold=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const available=[];
  for(let side=0;side<2;side++){
   const record=pageMetadata[side];if(!record)continue;
   await renderCanonicalSiddurPage({out,master,source,sourceIndex:Number(record.source?.sourcePdfPage)||selectedSpreadFirst+side,record,side,font,bold});
   available.push(side);
  }
  if(epoch!==canonicalPreviewEpoch)return;
  const bytes=new Uint8Array(await out.save());
  const pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
  for(let i=0;i<available.length;i++){
   if(epoch!==canonicalPreviewEpoch)return;
   const side=available[i],canvas=$(side===0?"output-left":"output-right");
   const page=await pdf.getPage(i+1),viewport=page.getViewport({scale:1});
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
  }
  if(epoch!==canonicalPreviewEpoch)return;
  canonicalPreviewLastSignature=signature;
  for(const node of document.querySelectorAll(".instruction-page-preview,.cue-page-preview"))node.remove();
  for(let side=0;side<2;side++){
   const overlay=$("highlight-"+side);if(!overlay)continue;
   overlay.width=$(side===0?"output-left":"output-right").width;
   overlay.height=$(side===0?"output-left":"output-right").height;
  }
  drawPlacementGuides();
  const label=$("spread-proof-status");if(label)label.textContent="Live PDF-rendered pages: same page builder as export. Changes regenerate the preview.";
 }finally{canonicalPreviewRendering=false;}
}

async function loadSelectedSpread(){
 if(!sourcePdfBytes)return;
 canonicalPreviewEnabled=false;canonicalPreviewEpoch++;canonicalPreviewLastSignature="";clearTimeout(canonicalPreviewTimer);
 $("download").disabled=true;
 if($("metadata-dialog").open){$("metadata-spread-label").textContent=$("spread-position").textContent+" — loading";$("metadata-dialog-content").textContent="Loading metadata for the selected spread…";}pageMetadata=[];
 ocrWordGeometry=[new Map(),new Map()];$("spread-preview").hidden=true;
 rivokOverlay=null;rivokWordsBySide=[null,null];
 visibleCueId="";
 await initializeSiddurSpread(sourcePdfBytes.slice());
 const saved=spreadEdits.get(selectedSpreadFirst);
 const savedComplete=!!saved?.pages?.length;
 // Restore approved metadata BEFORE building the visible PDF. A saved spread
 // must never briefly display default content or run OCR on stale page geometry.
 if(savedComplete){
  pageMetadata.forEach((record,i)=>{
   const prior=saved.pages?.[i];if(!record||!prior)return;
   if(prior.source?.sourcePdfPage&&Number(prior.source.sourcePdfPage)!==Number(record.source?.sourcePdfPage))
    throw Error("Saved spread source-page identity mismatch. Refusing to display incorrect approval.");
   record.leadership=JSON.parse(JSON.stringify(prior.leadership));
   if(prior.production)record.production=JSON.parse(JSON.stringify(prior.production));
   record.leadership.highlights=record.leadership.highlights||[];
   record.prayerTitle=prior.prayerTitle;
   if(prior.identification)record.identification=JSON.parse(JSON.stringify(prior.identification));
  });
  selectedCueBySide=[...(saved.selectedCues||["",""])];
 }else selectedCueBySide=["",""];
 applyCueRoleEdits();
 canonicalPreviewEnabled=true;
 await renderCanonicalSpread(++canonicalPreviewEpoch);
 // OCR operates on the canonical approved-master PDF canvases only.
 await analyzeCanonicalPreview({reuseSaved:savedComplete});
 if(savedComplete){
  renderPageCueEditor();drawHighlights();
  const label=$("highlight-loading-label");
  if(label)label.textContent="Saved match methods and geometry reused — no recognition rerun";
 }
 if($("metadata-dialog").open)refreshMetadataDialog();
 $("download").disabled=false;
 status(cueMatchReport);updateSpanStatus();
 canonicalPreviewEnabled=true;canonicalPreviewLastSignature="";scheduleCanonicalPreview();
}
$("load-spread").addEventListener("click",async()=>{
 if(!sourcePdfBytes)return;
 saveCurrentSpreadEdits();
 selectedSpreadFirst=Math.max(1,Math.min(sourcePdfPages,Number($("spread-first").value)||1));
 updateIntakeInventory();
 try{await loadSelectedSpread()}catch(e){console.error(e);status("Spread load failed: "+e.message)}
});

$("source").addEventListener("change",async()=>{
 const file=$("source").files[0];if(!file)return;
 filename=file.name.replace(/\\.pdf$/i,"")||"siddur";
 roleConfig={id:"role-1",name:$("role-name").value.trim()||"Leader",color:"#F5D03C"};
 try{
  if(!window.PDFLib||!window.pdfjsLib)throw Error("PDF libraries unavailable.");
  sourcePdfBytes=new Uint8Array(await file.arrayBuffer());
  const source=await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise;
  sourcePdfPages=source.numPages;selectedSpreadFirst=1;selectedCueBySide=["",""];spreadEdits.clear();resetIncrementalPdfState();
  updateIntakeInventory();
  await checkpointRead();
  await ensureInitialWorkingPdf();
  await loadSelectedSpread();
 }catch(e){console.error(e);status("Import failed: "+e.message)}
});
$("cue-file").addEventListener("change",async()=>{
 const file=$("cue-file").files[0];if(!file)return;
 try{
  const rows=parseCsv(await file.text());
  if(!rows.length||!rows.every(c=>c.printed_page&&c.language&&
    (c.begin_cue||c.begin_cue_hebrew)&&(c.end_cue||c.end_cue_hebrew)))
    throw Error("CSV needs printed_page, language, and beginning/ending cues (begin_cue/end_cue or Hebrew equivalents).");
  importedCues=rows;cueCsvRows=rows.map(row=>({...row}));cueCsvHeaders=Object.keys(rows[0]||{});
  cueTextEdits.clear();
  updateIntakeInventory();
  applyImportedCues();refreshCueVisibilityPicker();
  if(pageMetadata.length)await autoMatchCues();
  status(pageMetadata.length?cueMatchReport:"Loaded "+rows.length+" cue rows. Now upload the test PDF.");
 }catch(e){status("Cue import failed: "+e.message)}
});
$("highlight-view").addEventListener("change",()=>{highlightView=$("highlight-view").value;drawHighlights()});
$("selection-mode").addEventListener("change",()=>{selectionMode=$("selection-mode").value;drawHighlights()});
for(const mode of ["line","word"]){$("mode-"+mode).addEventListener("click",()=>{selectionMode=mode;$("selection-mode").value=mode;for(const m of ["line","word"])$("mode-"+m).setAttribute("aria-pressed",String(m===mode));drawHighlights()})}

installHighlightSelection();
async function runRivokAutomatically(){
 const report=$("rivok-status");
 const sides=pageMetadata.map((p,i)=>pageHasHebrewCue(p)?i:-1).filter(i=>i>=0);
 if(!sides.length)return;
 if(!window.RivokBrowser){report.textContent="Rivok module unavailable; Hebrew automatic detection could not start.";return;}
 for(const side of sides){
  const canvas=$(side===0?"output-left":"output-right");
  try{
   const result=await RivokBrowser.detect(canvas,msg=>{report.textContent=msg;});
   rivokOverlay={side,width:result.imageWidth,height:result.imageHeight,words:result.words};
   installRivokSelectionGeometry(side,result);
   report.textContent="Hebrew word detection ready for "+(side===0?"left":"right")+" page: "+result.words.length+" candidates.";
  }catch(error){console.error("Automatic Rivok detection",error);report.textContent="Hebrew word detection failed: "+error.message;}
 }
 drawHighlights();
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
function manifestEntry(index){return serviceManifest?.pages?.find(p=>Number(p.outputPage)===index)||null;}
function downloadPageNumber(index){
 const embedded=embeddedPageRecords[index-1];if(embedded)return embedded.printedPage||"SUP";
 const entry=manifestEntry(index);
 if(!entry)return String(index);
 if(entry.kind==="supplement"||String(entry.reference||"").toUpperCase().startsWith("SUP-"))return "SUP";
 if(entry.kind==="printed"){
  const ref=String(entry.reference||"");
  if(/^\\d+-\\d+$/.test(ref)){
   const [a,b]=ref.split("-").map(Number);
   const pair=servicePageMapping?.[String(a)];
   if(pair){if(Number(pair.e)===Number(entry.sourcePage))return String(a);if(Number(pair.h)===Number(entry.sourcePage))return String(a);}
   return ref;
  }
  return ref||String(index);
 }
 return "";
}
function cuesForExportPage(index){

 const entry=manifestEntry(index),ref=String(entry?.reference||"").trim();
 if(!ref)return [];
 return importedCues.filter(c=>{
  const cr=String(c.source_page||c.printed_page||"").trim();
  if(cr===ref)return true;
  const a=cr.match(/^(\\d+)(?:-(\\d+))?$/),b=ref.match(/^(\\d+)(?:-(\\d+))?$/);
  return !!(a&&b&&Number(a[1])<=Number(b[2]||b[1])&&Number(b[1])<=Number(a[2]||a[1]));
 });
}
function printable(value){return String(value||"").replace(/[^\\x20-\\x7e]/g,"").trim();}
function exportProgress(done,total,stage){
 const percent=Math.round(done/Math.max(1,total)*100);
 const bar=$("export-progress"),label=$("export-status");
 if(bar)bar.value=percent;
 if(label)label.textContent=stage+" — "+done+" / "+total+" pages ("+percent+"%)";
}
// Working leader copy: only explicitly verified pages are included.
// Source page identity, not visual left/right position, determines attachment.
function workingPages(){
 const bySource=new Map();
 for(const saved of spreadEdits.values())for(const record of saved.pages||[]){
  if(!record)continue;
  const source=Number(record.sourcePdfPage||record.source?.sourcePdfPage);
  if(Number.isInteger(source)&&source>=1&&source<=sourcePdfPages)bySource.set(source,record);
 }
 return [...bySource].sort((a,b)=>a[0]-b[0]);
}
// A saved checkpoint, not mere navigation or automatic OCR, defines the
// exportable working set. The user can inspect this list before PDF proof.
let explicitlySavedPages=new Map();
let excludedFromProof=new Set();
function checkpointSavedPages(){
 return [...explicitlySavedPages].sort((a,b)=>a[0]-b[0]);
}
function verifiedWorkingPages(){
 return checkpointSavedPages().filter(([n,record])=>!excludedFromProof.has(n)&&pageApprovalCurrent(record));
}
function showSavedPageInventory(){
 const pages=checkpointSavedPages();
 const lines=pages.map(([n,r])=>"Source page "+n+" | "+(pageApprovalCurrent(r)?"Approved":"Draft")+" | "+(approvedPrayerName(r)||"Prayer title missing"));
 const text="SAVED CHECKPOINT — "+pages.length+" pages\n"+(lines.join("\n")||"No pages have been explicitly saved yet.");
 const dialog=document.createElement("dialog");dialog.style.cssText="padding:22px;max-width:min(760px,94vw);max-height:80vh;overflow:auto";
 const heading=document.createElement("h2");heading.textContent="Pages actually saved";dialog.append(heading);
 const explanation=document.createElement("p");explanation.textContent="Check only the saved, approved pages to include in the next PDF proof. Draft pages cannot be included until approved.";dialog.append(explanation);
 for(const [n,record] of pages){
  const label=document.createElement("label");label.style.cssText="display:block;padding:6px 0";
  const check=document.createElement("input");check.type="checkbox";
  check.checked=!excludedFromProof.has(n)&&pageApprovalCurrent(record);check.disabled=!pageApprovalCurrent(record);
  check.onchange=()=>{if(check.checked)excludedFromProof.delete(n);else excludedFromProof.add(n);invalidateFinalPdfProof();};
  label.append(check,document.createTextNode(" Source page "+n+" — "+(approvedPrayerName(record)||"Prayer title missing")+" ("+(pageApprovalCurrent(record)?"approved":"draft")+")"));
  dialog.append(label);
 }
 const pre=document.createElement("pre");pre.style.cssText="white-space:pre-wrap;line-height:1.6";pre.textContent=text;dialog.append(pre);
 const close=document.createElement("button");close.textContent="Close";close.onclick=()=>dialog.close();dialog.append(close);
 dialog.addEventListener("close",()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
function installSavedPageInventory(){
 if(document.getElementById("show-saved-page-inventory"))return;
 const target=document.getElementById("save-checkpoint");if(!target)return;
 const button=document.createElement("button");button.id="show-saved-page-inventory";button.type="button";
 button.textContent="Show pages actually saved";button.addEventListener("click",showSavedPageInventory);
 target.insertAdjacentElement("afterend",button);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installSavedPageInventory);
else installSavedPageInventory();
function cueCompletionReport(){
 const pages=workingPages();
 const missing=pages.flatMap(([index,record])=>(record.leadership?.cues||[])
  .filter(c=>!(record.leadership?.highlights||[]).some(h=>h.cueId===c.cueId))
  .map(c=>"PDF page "+index+": "+c.cueId+" ("+(c.matchStatus||"unmatched")+")"));
 const el=$("cue-completion-status");
 if(el)el.textContent=missing.length?missing.length+" cues missing geometry: "+missing.slice(0,16).join("; ")+(missing.length>16?" …":""):"All cues on processed pages have highlight geometry.";
 return missing;
}
function workingCopyStatus(){
 const verified=verifiedWorkingPages().length,processed=workingPages().length;
 const label=$("working-copy-count");
 if(label)label.textContent=processed+" processed / "+sourcePdfPages+" source pages; "+verified+" verified; "+(processed-verified)+" draft; "+(sourcePdfPages-processed)+" not yet processed.";
 cueCompletionReport();
}
// Metadata records are authoritative. Master text anchors supply positions and font sizes.
let coverMetadata={serviceName:"",subtitle:"",congregation:"",edition:""};
// Metadata owned by the generated section-cover page, not the service cover.
let sectionCoverMetadata=null;
function initializeSectionCoverMetadata(){
 if(sectionCoverMetadata?.title)return;
 const first=(serviceManifest?.sections||[]).find(s=>s.status==="confirmed"&&String(s.title||"").trim());
 const service=String(serviceManifest?.serviceName||coverMetadata.serviceName||"").trim();
 sectionCoverMetadata={pageType:"section-cover",sectionId:first?.sectionId||"SEC-001",
  title:String(first?.title||(/^Friday Evening$/i.test(service)?"Kabbalat Shabbat":"")).trim(),
  parentService:service,titleApproved:!!first||/^Friday Evening$/i.test(service)};
}
function sectionCoverTitle(){
 initializeSectionCoverMetadata();
 const title=String(sectionCoverMetadata?.title||"").trim();
 if(!title||!sectionCoverMetadata.titleApproved)throw Error("Approve the section cover title in Edit section cover metadata.");
 return title;
}
function effectiveCover(){return {...coverMetadata,serviceName:coverMetadata.serviceName||serviceManifest?.serviceName||filename};}
function editableSectionRecords(){return confirmedSections();}
// V3.314: publication masters are rendered from metadata and approved geometry.
// The source PDFs remain the design authority; their placeholder text is never data.
const V314={border:{x:27,y:27,w:558,h:738},section:{titleY:396,tocHeadingY:696,tocRuleY:681,firstEntryY:646,entryStep:26,entryX:70,refX:542}};
function v314Border(page){page.drawRectangle({...V314.border,borderColor:PDFLib.rgb(0,0,0),borderWidth:.65});}
function v314Text(page,value,{x,y,size,font,align="left",maxWidth=Infinity}){
 const text=String(value??"").trim();
 if(!text)throw Error("Missing required publication metadata.");
 const width=font.widthOfTextAtSize(text,size);
 if(width>maxWidth)throw Error("Publication text exceeds its approved field: "+text);
 page.drawText(text,{x:align==="center"?x-width/2:align==="right"?x-width:x,y,size,font,color:PDFLib.rgb(0,0,0)});
}
function v314Blank(out){const p=out.addPage([612,792]);v314Border(p);return p;}
// The approved PDFs are the physical page backgrounds. Placeholder text in the
// masters is masked only within its designated dynamic field, never redrawn as
// a new imitation border or master layout.
async function pageFromApprovedMaster(out,key){
 if(!window.LCV3Templates)throw Error("Approved PDF master configuration unavailable.");
 const bytes=await window.LCV3Templates.load(key);
 const embedded=await out.embedPdf(bytes,[0]);
 if(embedded.length!==1)throw Error("Approved "+key+" master has no first page.");
 const master=embedded[0];
 if(Math.abs(master.width-612)>0.5||Math.abs(master.height-792)>0.5)
  throw Error("Approved "+key+" master must be US Letter (612 × 792).");
 const page=out.addPage([612,792]);
 page.drawPage(master,{x:0,y:0,width:612,height:792});
 return page;
}
function clearMasterPlaceholder(page,x,y,width,height){
 page.drawRectangle({x,y,width,height,color:PDFLib.rgb(1,1,1)});
}
async function createMasterFrontMatter(out,{includeSections=true,totalPages=null}={}){
 const cover=effectiveCover();
 const page=await pageFromApprovedMaster(out,"cover");
 const bold=await out.embedFont(PDFLib.StandardFonts.TimesRomanBold);
 const helv=await out.embedFont(PDFLib.StandardFonts.Helvetica);
 // The master already supplies the book identification, hairline border and
 // divider. Replace ONLY the sample service name and production placeholders.
 clearMasterPlaceholder(page,45,401,522,54);
 v314Text(page,cover.serviceName,{x:306,y:423,size:32,font:bold,align:"center",maxWidth:510});
 clearMasterPlaceholder(page,38,34,525,57);
 const date=new Date().toISOString().slice(0,10);
 const count=totalPages??out.getPageCount();
 const version=document.querySelector('[aria-label="Page version"]')?.textContent?.trim()||"V3";
 ["Produced: "+date,"Software Version: "+version,"Total Pages: "+count]
  .forEach((value,i)=>v314Text(page,value,{x:45,y:80-i*14,size:9,font:helv,maxWidth:520}));
 if(includeSections){
  const first=editableSectionRecords()[0];
  if(first)await addSectionMasterPages(out,first,[]);
 }
}
function v314SectionEntries(approved,section,limit){
 const rows=new Map();
 for(const [idx,rec] of approved){
  if(idx<section.startOutputPage||idx>=limit)continue;
  const title=approvedPrayerName(rec);
  const printed=String(rec.source?.originalPageNumber||"").trim();
  if(!title||!printed)throw Error("Section "+section.title+": missing prayer name or printed page reference on source page "+idx);
  const key=title+"|"+printed;
  if(!rows.has(key))rows.set(key,{title,page:printed});
 }
 return [...rows.values()];
}
async function drawApprovedContentsPage(out,entries){
 const page=await pageFromApprovedMaster(out,"sectionContents");
 const font=await out.embedFont(PDFLib.StandardFonts.TimesRoman);
 // Keep the master border, Contents heading, and underline; remove its sample
 // prayer rows before drawing actual Intake-derived entries.
 clearMasterPlaceholder(page,62,37,488,626);
 entries.forEach((entry,i)=>{
  const y=V314.section.firstEntryY-i*V314.section.entryStep;
  v314Text(page,entry.title,{x:70,y,size:13,font,maxWidth:385});
  v314Text(page,String(entry.page),{x:542,y,size:String(entry.page)==="Supplement"?10:13,font,align:"right",maxWidth:68});
 });
 return page;
}
async function addMainContentsPages(out,entries){
 const pageSize=23;
 for(let start=0;start<Math.max(1,entries.length);start+=pageSize)
  await drawApprovedContentsPage(out,entries.slice(start,start+pageSize));
}
async function addSectionMasterPages(out,section,entries){
 const bold=await out.embedFont(PDFLib.StandardFonts.TimesRomanBold);
 const titlePage=await pageFromApprovedMaster(out,"sectionTitle");
 // The PDF's [SECTION NAME] is a sample placeholder, not final publication text.
 clearMasterPlaceholder(titlePage,62,364,488,65);
 const name=String(section.title||"").trim();
 if(!name)throw Error("Section title is missing.");
 v314Text(titlePage,name,{x:306,y:V314.section.titleY,size:32,font:bold,align:"center",maxWidth:470});
 const pageSize=23;
 for(let start=0;start<Math.max(1,entries.length);start+=pageSize)
  await drawApprovedContentsPage(out,entries.slice(start,start+pageSize));
}
function showCoverEditor(){
 const prior=document.getElementById("cover-editor-dialog");if(prior)prior.remove();
 const dialog=document.createElement("dialog");dialog.id="cover-editor-dialog";dialog.style.cssText="padding:24px;width:min(550px,90vw)";
 const title=document.createElement("h2");title.textContent="Cover metadata";dialog.append(title);
 const inputs={};
 for(const [key,label] of [["serviceName","Service title"],["subtitle","Subtitle"],["congregation","Congregation"],["edition","Edition"]]){
  const row=document.createElement("label");row.textContent=label+" ";const input=document.createElement("input");
  input.value=effectiveCover()[key]||"";row.append(input);dialog.append(row,document.createElement("br"));inputs[key]=input;
 }
 const save=document.createElement("button");save.textContent="Save cover metadata";save.onclick=()=>{
  for(const [key,input] of Object.entries(inputs))coverMetadata[key]=input.value.trim();
  saveCheckpointNow().catch(e=>status(e.message));dialog.close();dialog.remove();
 };dialog.append(save);document.body.append(dialog);dialog.showModal();
}
function showSectionCoverEditor(){
 initializeSectionCoverMetadata();
 document.getElementById("section-cover-metadata-dialog")?.remove();
 const dialog=document.createElement("dialog");dialog.id="section-cover-metadata-dialog";dialog.style.cssText="padding:24px;width:min(550px,90vw)";
 const heading=document.createElement("h2");heading.textContent="Section cover page metadata";dialog.append(heading);
 const info=document.createElement("p");info.textContent="Page type: Section Cover · Parent service: "+(sectionCoverMetadata.parentService||"Not set");dialog.append(info);
 const label=document.createElement("label");label.textContent="Section title ";
 const input=document.createElement("input");input.value=sectionCoverMetadata.title||"";input.required=true;label.append(input);dialog.append(label);
 const save=document.createElement("button");save.type="button";save.textContent="Approve and save section title";
 const message=document.createElement("p");message.setAttribute("role","status");
 save.onclick=async()=>{
  const title=input.value.trim();if(!title){message.textContent="Enter a section title.";return;}
  const previous=sectionCoverMetadata,previousPdf=assembledWorkingPdf;
  sectionCoverMetadata={...previous,pageType:"section-cover",title,titleApproved:true};
  save.disabled=true;
  try{assembledWorkingPdf=await assembleCachedWorkingPdf();await checkpointWrite();dialog.close();dialog.remove();}
  catch(error){sectionCoverMetadata=previous;assembledWorkingPdf=previousPdf;message.textContent="Not saved: "+error.message;save.disabled=false;}
 };
 dialog.append(document.createElement("br"),save,message);document.body.append(dialog);dialog.showModal();
}
const sectionCoverButton=document.createElement("button");sectionCoverButton.type="button";
sectionCoverButton.textContent="Edit section cover metadata";sectionCoverButton.onclick=showSectionCoverEditor;
document.getElementById("download-front-matter")?.parentElement?.append(sectionCoverButton);
const coverButton=document.createElement("button");coverButton.type="button";coverButton.textContent="Edit cover metadata";
coverButton.onclick=showCoverEditor;
document.getElementById("download-front-matter")?.parentElement?.append(coverButton);
// Render exactly the current facing spread on Save. These finished PDF pages
// are persisted in IndexedDB; downloading never revisits source scans.
async function renderSavedSpreadPdf(first,spread){
 if(!sourcePdfBytes)throw Error("Load the source Siddur before saving a spread.");
 const out=await PDFLib.PDFDocument.create();
 const source=await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise;
 const master=await PDFLib.PDFDocument.load(await window.LCV3Templates.load("siddur"));
 const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
 const bold=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
 const records=(spread.pages||[]).filter(Boolean).map(record=>[
  Number(record.sourcePdfPage||record.source?.sourcePdfPage),record
 ]).filter(([index])=>Number.isInteger(index)&&index>=1&&index<=sourcePdfPages).sort((a,b)=>a[0]-b[0]);
 if(records.length>2)throw Error("A saved facing spread may contain at most two pages.");
 for(const [sourceIndex,record] of records){
  const defaultSide=String(serviceManifest?.facingPageDirection||"hebrew").toLowerCase()==="hebrew"?(sourceIndex%2):((sourceIndex-1)%2);
  const side=Number(record?.source?.sideIndex??record?.sideIndex??defaultSide)===1?1:0;
  await renderCanonicalSiddurPage({out,master,source,sourceIndex,record,side,font,bold});
 }
 if(!out.getPageCount())throw Error("No pages in spread "+first+".");
 return new Uint8Array(await out.save());
}
// Assemble from finished, cached spread PDFs. This runs on Save, never Download.
async function assembleCachedWorkingPdf(){
 const out=await PDFLib.PDFDocument.create();
 // The checkpoint map is refreshed only after the write; use the current
 // savedSpreadRecords snapshot, updated only by explicit Save.
 const records=[...new Map([...savedSpreadRecords.values()].flatMap(spread=>
  (spread.pages||[]).filter(Boolean).map(record=>[
   Number(record.sourcePdfPage||record.source?.sourcePdfPage),record
  ])).filter(([index])=>Number.isInteger(index)&&index>0))].sort((a,b)=>a[0]-b[0])
 ;
 const expected=3+records.length;
 await createMasterFrontMatter(out,{includeSections:false,totalPages:expected});
 const firstSection=editableSectionRecords()[0]||null;
 const sectionTitle=sectionCoverTitle();
 // Contents represents the FIRST section only, with one entry per prayer
 // (not one entry per page). Never silently truncate or add another contents page.
 const sections=editableSectionRecords();
 const nextSection=firstSection?sections[sections.indexOf(firstSection)+1]:null;
 const firstRecords=records.filter(([index])=>
  (!firstSection||index>=Number(firstSection.startOutputPage||1))&&
  (!nextSection||index<Number(nextSection.startOutputPage||Infinity)));
 const byPrayer=new Map();
 for(const [index,record] of firstRecords){
  const title=String(approvedPrayerName(record)||record?.identification?.prayerName||"Source page "+index).trim();
  if(!byPrayer.has(title))byPrayer.set(title,{
   title,page:(()=>{const ref=String(record?.source?.originalPageNumber||record?.identification?.printedPageNumber||"").trim();return /^SUP[-_]/i.test(ref)?"Supplement":ref||String(index);})()
  });
 }
 const entries=[...byPrayer.values()];
 if(entries.length>23)throw Error("The first section has "+entries.length+" unique prayers; its single contents page can fit only 23. No saved pages were omitted.");
 await addSectionMasterPages(out,{title:sectionTitle},entries);
 const indexToPdf=new Map();
 for(const [first,bytes] of [...renderedSpreadPdfs].sort((a,b)=>a[0]-b[0])){
  const spread=savedSpreadRecords.get(first);
  const spreadRecords=(spread?.pages||[]).filter(Boolean).map(record=>Number(record.sourcePdfPage||record.source?.sourcePdfPage))
   .filter(index=>Number.isInteger(index)&&index>0).sort((a,b)=>a-b);
  if(!spreadRecords.length)continue;
  const part=await PDFLib.PDFDocument.load(bytes);
  if(part.getPageCount()!==spreadRecords.length)throw Error("Cached spread "+first+" is out of date; save that spread again.");
  spreadRecords.forEach((index,i)=>indexToPdf.set(index,{part,i}));
 }
 for(const [index] of records){
  const item=indexToPdf.get(index);
  if(!item)throw Error("Source page "+index+" has not been rendered. Save its two-page spread first.");
  const [page]=await out.copyPages(item.part,[item.i]);out.addPage(page);
 }
 if(out.getPageCount()!==expected)throw Error("Assembled PDF page count mismatch.");
 await out.attach(new TextEncoder().encode(JSON.stringify({
  schema:"leaders-companion-v3-incremental-web-pdf",sourceFilename:filename,
  savedSourcePages:records.map(([sourceIndex,record])=>({sourceIndex,record}))
 })),"leaders-companion-project.json",{mimeType:"application/json",description:"Saved web-editor page records"});
 return new Uint8Array(await out.save());
}
$("download-front-matter")?.addEventListener("click",()=>{
 const label=$("export-status");
 if(!assembledWorkingPdf){if(label)label.textContent="No saved PDF yet. Save the current two-page spread first.";return;}
 const url=URL.createObjectURL(new Blob([assembledWorkingPdf],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=(filename||"leaders-companion")+"-saved-pages.pdf";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 if(label)label.textContent="Downloaded the saved PDF; no pages were regenerated.";
});
function pdfWrapLines(text,font,size,maxWidth){
 const words=printable(text).split(/\s+/).filter(Boolean),lines=[];let line="";
 for(const word of words){const candidate=line?line+" "+word:word;
  if(line&&font.widthOfTextAtSize(candidate,size)>maxWidth){lines.push(line);line=word;}else line=candidate;}
 if(line)lines.push(line);return lines;
}
function drawLeaderPageFooter(page,record,font,bold){
 const width=page.getWidth(),ink=PDFLib.rgb(.13,.23,.28),state=record.leadership||{};
 const name=printable(state.instructionPrayer||record.prayerTitle||record.identification?.prayerName||"Untitled prayer");
 const left=38,right=316;
 page.drawRectangle({x:26,y:17,width:width-52,height:115,color:PDFLib.rgb(.96,.97,.96),borderColor:PDFLib.rgb(.68,.75,.72),borderWidth:.6});
 page.drawText("PRAYER: "+name.slice(0,76),{x:left,y:115,size:9,font:bold,color:ink});
 page.drawText("CUES",{x:left,y:96,size:8,font:bold,color:ink});
 page.drawText("LEADER INSTRUCTIONS",{x:right,y:96,size:8,font:bold,color:ink});
 const cues=state.cues||[];
 if(!cues.length)page.drawText("No cues assigned.",{x:left,y:82,size:7.5,font,color:ink});
 for(let i=0;i<Math.min(5,cues.length);i++){
  const cue=cues[i],matched=(state.highlights||[]).some(h=>h.cueId===cue.cueId);
  const label=printable(cue.cueId||"Cue")+" - "+(matched?"matched":"MISSING");
  page.drawText(label.slice(0,38),{x:left,y:82-i*12,size:7.5,font,color:ink});
 }
 if(cues.length>5)page.drawText("+"+(cues.length-5)+" more cues",{x:left,y:22,size:7,font,color:ink});
 const lines=instructionTextForPage(state).flatMap(t=>pdfWrapLines(t,font,7.5,258));
 if(!lines.length)page.drawText("No instructions assigned.",{x:right,y:82,size:7.5,font,color:ink});
 for(let i=0;i<Math.min(5,lines.length);i++)page.drawText(lines[i],{x:right,y:82-i*12,size:7.5,font,color:ink});
 if(lines.length>5)page.drawText("Additional instructions in project metadata.",{x:right,y:22,size:7,font,color:ink});
}
// Cover printed template guide words, retaining the approved box geometry.
async function drawApprovedPageFields(page,record,side,out,font,bold){
 const textX=side===0?171.36:59.76;
 const ink=PDFLib.rgb(.1,.17,.2);
 const state=record.leadership||{};
 // The selected Outer Lines Only PDF is the actual page artwork.
 // Do not paint white rectangles over its section borders or reconstruct them.
 // Place editable text only inside its pre-existing blank regions.
 const instructions=instructionTextForPage(state).filter(x=>String(x||"").trim());
 const render=async(text,x,y,w,h,{fontSize=12,color="#182c36",rtl=false}={})=>{
  const factor=3,canvas=document.createElement("canvas");
  canvas.width=Math.round(w*factor);canvas.height=Math.round(h*factor);
  const ctx=canvas.getContext("2d");
  ctx.font=(fontSize*factor)+"px Arial, sans-serif";
  ctx.fillStyle=color;ctx.textBaseline="top";
  ctx.direction=rtl?"rtl":"ltr";ctx.textAlign=rtl?"right":"left";
  const safeText=String(text||"").replace(/י[\u0591-\u05c7]*ה[\u0591-\u05c7]*ו[\u0591-\u05c7]*ה[\u0591-\u05c7]*/g,"ה׳");
  const words=safeText.split(/\s+/).filter(Boolean),lines=[];let line="";
  for(const word of words){
   const trial=line?line+" "+word:word;
   if(ctx.measureText(trial).width>canvas.width-18&&line){lines.push(line);line=word;}
   else line=trial;
  }
  if(line)lines.push(line);
  const lineHeight=fontSize*factor*1.3;
  if(lines.some(t=>ctx.measureText(t).width>canvas.width-18)||lines.length*lineHeight>canvas.height-2)throw Error("Text exceeds approved "+fontSize+"pt bounding box: "+safeText.slice(0,70));
  lines.forEach((part,i)=>ctx.fillText(part,rtl?canvas.width-9:9,1+i*lineHeight));
  if(!lines.length)return;
  const image=await out.embedPng(canvas.toDataURL("image/png"));
  page.drawImage(image,{x,y,width:w,height:h});
 };
 if(instructions.length){
  const joined=instructions.join(" ");
  await render(joined,textX+3,648,374,54,{fontSize:12,rtl:/[\u0590-\u05ff]/.test(joined)});
 }
 const plan=v3CuePlan(record,side);
 for(const row of plan){
  // Use the same measured text, font, anchors and arrow midpoint as the editor.
  const drawCue=async(text,x,w)=>{
   if(!text)return;
   const factor=3,canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.ceil((w+2)*factor));canvas.height=Math.ceil((row.font*1.3)*factor);
   const ctx=canvas.getContext("2d");ctx.font=(row.font*factor)+"px Arial, sans-serif";
   ctx.fillStyle=row.color;ctx.textBaseline="top";ctx.direction=row.hebrew?"rtl":"ltr";
   ctx.textAlign=row.hebrew?"right":"left";
   ctx.fillText(text,row.hebrew?canvas.width-1:1,0);
   const image=await out.embedPng(canvas.toDataURL("image/png"));
   page.drawImage(image,{x,y:row.y,width:canvas.width/factor,height:canvas.height/factor});
  };
  await drawCue(row.begin,row.beginX,row.beginW);
  await drawCue(row.end,row.endX,row.endW);
  const y=row.y+row.font*.48,mid=row.arrowX;
  page.drawLine({start:{x:mid-7,y},end:{x:mid+7,y},thickness:1.3,color:ink});
  const tip=row.hebrew?mid-7:mid+7,back=row.hebrew?tip+4:tip-4;
  page.drawLine({start:{x:tip,y},end:{x:back,y:y+3},thickness:1.3,color:ink});
  page.drawLine({start:{x:tip,y},end:{x:back,y:y-3},thickness:1.3,color:ink});
 }
 // Identity is sourced only from record metadata, never from master labels.
 await drawKnownFrameworkFields(page,{...record,leadership:{...state,cues:[]},instructionText:""},side,font,bold,{cues:[],instructionText:""},out);
}
// One authoritative PDF page renderer for both live facing-page preview and final export.
async function renderCanonicalSiddurPage({out,master,source,sourceIndex,record,side,font,bold}){
  const masterIndex=master.getPageCount()>1?Math.min(side,master.getPageCount()-1):0;
  const [masterPage]=await out.copyPages(master,[masterIndex]);
  const page=out.addPage(masterPage);
  const {width:masterWidth,height:masterHeight}=masterPage.getSize();
  if(Math.abs(masterWidth-W)>.5||Math.abs(masterHeight-H)>.5)
   throw Error("Approved Siddur master page "+(masterIndex+1)+" is "+masterWidth+" × "+masterHeight+"; expected "+W+" × "+H+". Refusing to overlay incorrect geometry.");
  const region=REGIONS[side],pad=6;
  if(region.x<0||region.y<0||region.x+region.w>masterWidth||region.y+region.h>masterHeight)
   throw Error("Siddur source region exceeds the approved master page bounds.");
  // Export the same cleaned, cropped Siddur content used by the Facing Editor,
  // not a scaled copy of the original uncropped PDF page.
  const sourcePage=await source.getPage(sourceIndex);
  const viewport=sourcePage.getViewport({scale:2});
  const scan=document.createElement("canvas");
  scan.width=Math.ceil(viewport.width);scan.height=Math.ceil(viewport.height);
  const scanCtx=scan.getContext("2d");
  scanCtx.fillStyle="#fff";scanCtx.fillRect(0,0,scan.width,scan.height);
  await sourcePage.render({canvasContext:scanCtx,viewport}).promise;
  // Reuse the Intake crop detector; record the crop for reproducibility.
  const crop=record.production?.approvedCrop||detectCrop(scan,{ocrLines:[],number:null,heading:null});
  const cleaned=canvasCrop(scan,crop);cleanPixels(cleaned);
  const image=await out.embedPng(cleaned.toDataURL("image/png"));
  const scale=Math.min((region.w-2*pad)/image.width,(region.h-2*pad)/image.height);
  const width=image.width*scale,height=image.height*scale;
  const pageX=region.x+(region.w-width)/2,pageY=region.y+(region.h-height)/2;
  page.drawImage(image,{x:pageX,y:pageY,width,height});
  // Highlight geometry is measured against the full Facing Editor page,
  // not the original source page. Keep that coordinate system in export.
  for(const [key,rects] of uniquePhysicalHighlights((record.leadership?.highlights||[]).filter(h=>isSiddurSourceRecord(record)&&insideSiddurPrayerRegion(side,h)&&!h.rejectedAsTitle))){
   const [hex,opacity]=key.split("|"),n=parseInt(hex.slice(1),16);
   if(!Number.isFinite(n))continue;
   for(const mark of rects)page.drawRectangle({
    x:mark.x*W,y:(1-mark.y-mark.height)*H,
    width:mark.width*W,height:mark.height*H,
    color:PDFLib.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255),
    opacity:Number(opacity),blendMode:"Multiply"
   });
  }
  await drawApprovedPageFields(page,record,side,out,font,bold);
  return page;
}

async function exportVerifiedWorkingCopy(){
 if(!sourcePdfBytes)throw Error("Load the source siddur first.");
 // Export only pages in the last successfully persisted checkpoint.\n // Merely opening or processing a page must never add it to the proof.
 let approved=verifiedWorkingPages();
 // An approved-but-incomplete checkpoint must not silently block all other
 // explicitly saved, approved pages. Ask before excluding it from this proof.
 const incomplete=approved.map(([index,record])=>({index,missing:[
  ...(!String(record.identification?.serviceName||serviceManifest?.serviceName||"").trim()?["service name"]:[]),
  ...(!String(approvedPrayerName(record)||"").trim()?["prayer title"]:[])
 ]})).filter(item=>item.missing.length);
 if(incomplete.length){
  const details=incomplete.map(item=>"Source page "+item.index+": "+item.missing.join(" and ")).join("\n");
  const validCount=approved.length-incomplete.length;
  if(!validCount)throw Error("No selected, approved Siddur pages have complete metadata. "+details.replace(/\n/g,"; ")+". Use the separate Cover + Title + Contents button for a front-matter-only PDF.");
  const omit=window.confirm("These saved, approved pages are missing metadata:\n"+details+
   "\n\nChoose OK to EXCLUDE ONLY these pages from this PDF proof and continue with the other "+
   validCount+" selected approved page(s). Choose Cancel to keep the selection unchanged and correct the metadata first.");
  if(!omit)throw Error("PDF proof cancelled; no pages were excluded. Complete the missing metadata or explicitly exclude the pages in 'Show pages actually saved'.");
  for(const item of incomplete)excludedFromProof.add(item.index);
  approved=verifiedWorkingPages();
  status("Excluded incomplete source page(s) "+incomplete.map(item=>item.index).join(", ")+" from this proof only. They remain saved and can be reselected after correction.");
 }
 const source=await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise;
 const out=await PDFLib.PDFDocument.create();
 const sections=editableSectionRecords();
 if(!sections.length)throw Error("No confirmed sections. Review and confirm section boundaries in Siddur Intake before exporting.");
 const missingSections=approved.filter(([idx])=>!sectionForPage(idx));
 if(missingSections.length)throw Error("Approved source pages lack confirmed sections: "+missingSections.map(([idx])=>idx).join(", ")+". Confirm section boundaries in Intake.");
 const usedSections=sections.filter(section=>approved.some(([idx])=>sectionForPage(idx)?.sectionId===section.sectionId));
 const mainContentsPages=Math.max(1,Math.ceil(usedSections.length/23));
 const sectionPlan=usedSections.map(section=>{
  const next=sections[sections.indexOf(section)+1];
  const entries=v314SectionEntries(approved,section,next?.startOutputPage||Infinity);
  return {section,entries,frontPages:1+Math.max(1,Math.ceil(entries.length/23)),
   approvedCount:approved.filter(([idx])=>sectionForPage(idx)?.sectionId===section.sectionId).length};
 });
 const expectedTotal=1+mainContentsPages+approved.length+sectionPlan.reduce((n,p)=>n+p.frontPages,0);
 await createMasterFrontMatter(out,{includeSections:false,totalPages:expectedTotal});
 let runningPage=2+mainContentsPages;
 const mainEntries=sectionPlan.map(plan=>{
  const entry={title:plan.section.title,page:runningPage};
  runningPage+=plan.frontPages+plan.approvedCount;
  return entry;
 });
 await addMainContentsPages(out,mainEntries);
 if(!window.LCV3Templates)throw Error("Approved Siddur Page Master is unavailable.");
 const masterBytes=await window.LCV3Templates.load("siddur");
 const master=await PDFLib.PDFDocument.load(masterBytes);
 if(master.getPageCount()<1)throw Error("Approved Siddur Page Master is empty.");
 const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
 const bold=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
 const projectPages=[];
 const sectionsInserted=new Set();
 for(let j=0;j<approved.length;j++){
  const nextSection=sectionForPage(approved[j][0]);
  if(nextSection&&!sectionsInserted.has(nextSection.sectionId)){
   const nextIndex=sections.indexOf(nextSection),limit=sections[nextIndex+1]?.startOutputPage||Infinity;
   const entries=v314SectionEntries(approved,nextSection,limit);
   await addSectionMasterPages(out,nextSection,entries);
   sectionsInserted.add(nextSection.sectionId);
  }
  const [sourceIndex,record]=approved[j];
  if(!String(record.identification?.serviceName||serviceManifest?.serviceName||"").trim()||
     !String(approvedPrayerName(record)||"").trim())
   throw Error("Approved source page "+sourceIndex+" is missing required service or prayer metadata.");

  const defaultSide=String(serviceManifest?.facingPageDirection||"hebrew").toLowerCase()==="hebrew"?(sourceIndex%2):((sourceIndex-1)%2);
  const side=Number(record?.source?.sideIndex ?? record?.sideIndex ?? defaultSide)===1?1:0;
  await renderCanonicalSiddurPage({out,master,source,sourceIndex,record,side,font,bold});
  projectPages.push({sourcePdfPage:sourceIndex,leaderPdfPage:out.getPageCount(),side,
   record:JSON.parse(JSON.stringify(record))});
  exportProgress(j+1,approved.length,"Attaching approved pages to Siddur Page Master");
 }
 // Preserve the complete approved page records inside the PDF, not only a visual footer.
 if(out.getPageCount()!==expectedTotal)throw Error("PDF assembly page count mismatch: expected "+expectedTotal+", generated "+out.getPageCount());
 const metadata=JSON.stringify({schema:"leaders-companion-v3-approved-export",version:"3.298",cover:effectiveCover(),sections:editableSectionRecords(),
  sourceFilename:filename,sourcePageCount:sourcePdfPages,approvedPages:projectPages});
 await out.attach(new TextEncoder().encode(metadata),"leaders-companion-project.json",
  {mimeType:"application/json",description:"Approved page metadata and cue geometry"});
 out.setCreator("Leader's Companion V3.295");
 out.setSubject("Approved master-template Leader's Companion");
 return {bytes:new Uint8Array(await out.save()),processed:workingPages().length,
  verified:approved.length,pending:sourcePdfPages-approved.length,total:out.getPageCount()};
}
async function exportEntireService(){
 if(!sourcePdfBytes)throw Error("No service PDF loaded.");
 saveCurrentSpreadEdits();
 // Every spread must be recognized before full-service export. Do not silently
 // ship unvisited pages without highlighting. Preserve the user's current spread.
 const originalSpread=selectedSpreadFirst;
 try{
  for(let first=1;first<=sourcePdfPages;first+=2){
   if(!spreadEdits.has(first)){
    exportProgress(Math.min(first-1,sourcePdfPages),sourcePdfPages,"Recognizing all service pages");
    selectedSpreadFirst=first;
    await loadSelectedSpread();
    saveCurrentSpreadEdits();
   }
  }
 }finally{
  if(selectedSpreadFirst!==originalSpread){
   selectedSpreadFirst=originalSpread;
   await loadSelectedSpread();
  }
 }
 const missing=[];
 for(let first=1;first<=sourcePdfPages;first+=2){
  const saved=spreadEdits.get(first);
  for(let side=0;side<2&&first+side<=sourcePdfPages;side++){
   const entry=manifestEntry(first+side),cues=cuesForExportPage(first+side);
   if(cues.length&&!saved?.pages?.[side])missing.push(first+side);
  }
 }
 if(missing.length)throw Error("Cannot export: pages not processed: "+missing.join(", "));
 const original=await PDFLib.PDFDocument.load(sourcePdfBytes.slice()),result=await PDFLib.PDFDocument.create();
 const total=original.getPageCount(),quality=$("export-quality")?.value||"original";
 const font=await result.embedFont(PDFLib.StandardFonts.Helvetica);
 const bold=await result.embedFont(PDFLib.StandardFonts.HelveticaBold);
 const sourceDoc=quality==="enhanced"?await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise:null;
 let highlighted=0;
 const metadata={schema:"leaders-companion-v3-export",version:3,source:filename,created:new Date().toISOString(),totalPages:total,quality,pages:[],roles:serviceManifest?.roles||[],opacity:[...serviceRoleOpacity]};
 for(let i=0;i<total;i++){
  exportProgress(i,total,"Building complete service");
  const entry=manifestEntry(i+1),cues=cuesForExportPage(i+1);
  let page;
  if(sourceDoc){
   const src=await sourceDoc.getPage(i+1),viewport=src.getViewport({scale:2});
   const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await src.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
   // Enhancement is applied to the full original page without cropping or repositioning.
   // Thus normalized highlight coordinates stay in the same coordinate system.
   cleanPixels(canvas);
   const image=await result.embedPng(await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer());
   const originalPage=original.getPage(i),w=originalPage.getWidth(),ht=originalPage.getHeight();
   page=result.addPage([w,ht]);page.drawImage(image,{x:0,y:0,width:w,height:ht});
  }else{
   const copied=await result.copyPages(original,[i]);page=result.addPage(copied[0]);
  }
  const width=page.getWidth(),height=page.getHeight(),spread=2*Math.floor(i/2)+1,side=i%2;
  const savedPage=spreadEdits.get(spread)?.pages?.[side];
  const edits=savedPage?.leadership?.highlights||[];
  for(const mark of edits){
   if(![mark.x,mark.y,mark.width,mark.height].every(Number.isFinite)||mark.width<=0||mark.height<=0)continue;
   const hex=roleColor(mark.roleId).replace("#",""),value=parseInt(hex,16);
   page.drawRectangle({x:mark.x*width,y:(1-mark.y-mark.height)*height,width:mark.width*width,height:mark.height*height,color:PDFLib.rgb(((value>>16)&255)/255,((value>>8)&255)/255,(value&255)/255),opacity:highlightAlpha(mark),blendMode:"Multiply"});
   highlighted++;
  }
  const embedded={};
  const number=String(embedded.printedPage||downloadPageNumber(i+1)||"").split("-")[0],title=printable(embedded.prayerTitle||embedded.prayerName||"");
  // Header/footer are drawn over a white strip, outside the main text wherever possible.
  if(number){
   const size=12,tw=bold.widthOfTextAtSize(number,size);
   page.drawRectangle({x:width-105,y:height-35,width:95,height:25,color:PDFLib.rgb(1,1,1),opacity:.95});
   page.drawText(number,{x:width-14-tw,y:height-27,size,font:bold,color:PDFLib.rgb(.7,.1,.13)});
  }
  if(title){
   const text=title.slice(0,75),size=10;
   page.drawRectangle({x:12,y:height-35,width:Math.min(width-130,400),height:24,color:PDFLib.rgb(1,1,1),opacity:.94});
   page.drawText(text,{x:16,y:height-26,size,font:bold,color:PDFLib.rgb(.12,.26,.31)});
  }
  const cueText=cues.map(c=>[c.cue_id,c.role_name||c.role_code,c.cue_left,c.cue_right].map(printable).filter(Boolean).join(" | ")).filter(Boolean);
  if(cueText.length){
   const maxLines=Math.min(3,cueText.length),lineHeight=10;
   page.drawRectangle({x:8,y:4,width:width-16,height:maxLines*lineHeight+8,color:PDFLib.rgb(1,1,1),opacity:.96});
   cueText.slice(0,maxLines).forEach((line,k)=>page.drawText(line.slice(0,105),{x:12,y:8+(maxLines-1-k)*lineHeight,size:8,font,color:PDFLib.rgb(.15,.2,.22)}));
  }
  const pageInfo={...embedded,outputPage:i+1,printedPage:number,manifest:entry,cues,prayerTitle:embedded.prayerTitle||embedded.prayerName||null,pageColor:embedded.pageColor||"W",highlights:edits,leadership:{...(embedded.leadership||{}),cues,highlights:edits}};
  metadata.pages.push(pageInfo);


  // Yield to the UI so the progress bar can repaint during large exports.
  if(i%2===0)await new Promise(resolve=>setTimeout(resolve,0));
 }


 exportProgress(total,total,"Complete");
 return {bytes:new Uint8Array(await result.save()),pages:total,highlighted};
}

async function exportEditedSinglePage(side){
 if(!sourcePdfBytes||!pageMetadata[side])throw Error("No page loaded.");
 const approval=pageMetadata[side].leadership;
 const unresolved=facingPageWarnings(pageMetadata[side]).filter(w=>!approval.instructionOverrides?.[w]);
 if(unresolved.length)throw Error("Resolve or explicitly override all page warnings before downloading: "+unresolved.join("; "));
 if(!pageApprovalCurrent(pageMetadata[side]))throw Error("Page changed since approval. Review and reconfirm highlights and instructions before downloading.");
 saveCurrentSpreadEdits();
 const index=selectedSpreadFirst-1+side;
 const original=await PDFLib.PDFDocument.load(sourcePdfBytes.slice());
 if(index>=original.getPageCount())throw Error("Page out of range.");
 const out=await PDFLib.PDFDocument.create(),[copy]=await out.copyPages(original,[index]);out.addPage(copy);
 const width=copy.getWidth(),height=copy.getHeight(),marks=pageMetadata[side].leadership.highlights||[];
 for(const mark of marks){
  if(![mark.x,mark.y,mark.width,mark.height].every(Number.isFinite)||mark.width<=0||mark.height<=0)continue;
  const hex=roleColor(mark.roleId).replace("#",""),value=parseInt(hex,16);
  copy.drawRectangle({x:mark.x*width,y:(1-mark.y-mark.height)*height,width:mark.width*width,height:mark.height*height,color:PDFLib.rgb(((value>>16)&255)/255,((value>>8)&255)/255,(value&255)/255),opacity:highlightAlpha(mark),blendMode:"Multiply"});
 }
 const instructionState=pageMetadata[side].leadership;
 const instructionLines=instructionTextForPage(instructionState);
 if(instructionLines.length){
  const imageCanvas=document.createElement("canvas");
  const imageContext=imageCanvas.getContext("2d");
  const scale=3, fontSize=12, lineHeight=19, padding=8;
  imageCanvas.width=Math.ceil((width-36)*scale);
  imageCanvas.height=Math.ceil((instructionLines.length*lineHeight+padding*2)*scale);
  imageContext.fillStyle="white";
  imageContext.fillRect(0,0,imageCanvas.width,imageCanvas.height);
  imageContext.fillStyle="#182c36";
  imageContext.font=(fontSize*scale)+"px Arial, sans-serif";
  imageContext.textBaseline="top";
  instructionLines.forEach((line,n)=>{
   const isHebrew=/[\u0590-\u05ff]/.test(line);
   imageContext.direction=isHebrew?"rtl":"ltr";
   imageContext.textAlign=isHebrew?"right":"left";
   imageContext.fillText(line,isHebrew?imageCanvas.width-padding*scale:padding*scale,(padding+n*lineHeight)*scale,imageCanvas.width-padding*scale*2);
  });
  const image=await out.embedPng(imageCanvas.toDataURL("image/png"));
  const imageHeight=imageCanvas.height/scale;
  copy.drawImage(image,{x:18,y:(instructionState.instructionPosition||"top")==="top"?height-18-imageHeight:18,width:imageCanvas.width/scale,height:imageHeight});
 }
 const record=JSON.parse(JSON.stringify(pageMetadata[side]));
 record.leadership.highlights=marks;record.production={...(record.production||{}),pageStatus:"downloaded-page-draft"};

 const sourceRecord={};
 const pageRecord={...sourceRecord,instructionIds:record.leadership.instructionIds||[],instructionPrayer:record.leadership.instructionPrayer||"",instructionPosition:record.leadership.instructionPosition||"top",instructionOverrides:record.leadership.instructionOverrides||{},highlightConfirmed:pageApprovalCurrent(pageMetadata[side]),sourcePdfPage:index+1,printedPage:record.source.originalPageNumber||sourceRecord.printedPage||null,
  cues:record.leadership.cues,highlights:marks,editedAt:new Date().toISOString()};

 return {bytes:new Uint8Array(await out.save()),index:index+1,marks:marks.length};
}
for(let side=0;side<2;side++)$("download-page-"+side)?.addEventListener("click",async()=>{
 const button=$("download-page-"+side);button.disabled=true;
 try{
  const result=await exportEditedSinglePage(side),url=URL.createObjectURL(new Blob([result.bytes],{type:"application/pdf"}));
  const a=document.createElement("a");a.href=url;a.download=filename+"-page-"+String(result.index).padStart(3,"0")+".pdf";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  $("page-cue-editor-status").textContent="Downloaded physical page "+result.index+" with "+result.marks+" highlights and editable cue metadata.";
 }catch(e){$("page-cue-editor-status").textContent="Page download failed: "+e.message}
 finally{button.disabled=!pageMetadata[side]}
});
// The editing canvas is interactive and must never be misrepresented as exported output.
// This proof uses the identical PDF builder and cached bytes as final download.
function showSpreadEditingMode(){
 $("spread-export-proof").hidden=true;
 $("spread-preview").hidden=false;
 $("return-to-edit-preview").hidden=true;
 $("preview-exported-spread").hidden=false;
 $("spread-proof-status").textContent="Editing view (not final PDF). Regenerate exported proof after edits.";
}
$("return-to-edit-preview")?.addEventListener("click",showSpreadEditingMode);
$("preview-exported-spread")?.addEventListener("click",async()=>{
 const button=$("preview-exported-spread");button.disabled=true;
 try{
  const result=await exportVerifiedWorkingCopy();
  invalidateFinalPdfProof();
  finalPdfProof={bytes:result.bytes,signature:finalPdfSignature(),verified:result.verified,total:result.total};
  finalPdfProofUrl=URL.createObjectURL(new Blob([result.bytes],{type:"application/pdf"}));
  $("final-pdf-preview").src=finalPdfProofUrl;
  $("spread-export-pdf").src=finalPdfProofUrl;
  $("spread-preview").hidden=true;
  $("spread-export-proof").hidden=false;
  $("return-to-edit-preview").hidden=false;
  button.hidden=true;
  $("spread-proof-status").textContent="Actual "+result.total+"-page exported PDF. Section pages and contents included. Download uses these exact bytes.";
  $("final-pdf-proof-status").textContent="Actual exported PDF proof ready ("+result.total+" pages). Download uses these exact bytes.";
 }catch(e){
  showSpreadEditingMode();
  if(/No confirmed sections|confirmed sections|section boundaries/i.test(e.message)){
   canonicalPreviewEnabled=true;canonicalPreviewLastSignature="";
   await renderCanonicalSpread(++canonicalPreviewEpoch);
   $("spread-proof-status").textContent="Current pages are previewed with the PDF export page renderer. Complete-book export remains blocked until section boundaries are confirmed in Intake.";
  }else $("spread-proof-status").textContent="Exported PDF preview unavailable: "+e.message;
  console.error(e);
 }finally{button.disabled=false}
});
// Preview and download share one immutable PDF byte buffer.
let finalPdfProof=null,finalPdfProofUrl=null;
function finalPdfSignature(){
 saveCurrentSpreadEdits();
 return JSON.stringify({pages:checkpointSavedPages(),sections:editableSectionRecords(),cover:effectiveCover(),
  service:serviceManifest,filename,sourcePages:sourcePdfPages,excluded:[...excludedFromProof]});
}
function invalidateFinalPdfProof(){
 finalPdfProof=null;
 if($("spread-export-proof")&&!$("spread-export-proof").hidden)showSpreadEditingMode();
 if(finalPdfProofUrl){URL.revokeObjectURL(finalPdfProofUrl);finalPdfProofUrl=null;}
 const frame=$("final-pdf-preview");if(frame)frame.removeAttribute("src");
 const spreadFrame=$("spread-export-pdf");if(spreadFrame)spreadFrame.removeAttribute("src");
 const label=$("final-pdf-proof-status");if(label)label.textContent="Preview is outdated. Generate a new PDF proof before downloading.";
}
$("preview-final-pdf")?.addEventListener("click",async()=>{
 const button=$("preview-final-pdf");button.disabled=true;
 try{
  const result=await exportVerifiedWorkingCopy();
  invalidateFinalPdfProof();
  const signature=finalPdfSignature();
  finalPdfProof={bytes:result.bytes,signature,verified:result.verified,total:result.total};
  finalPdfProofUrl=URL.createObjectURL(new Blob([result.bytes],{type:"application/pdf"}));
  $("final-pdf-preview").src=finalPdfProofUrl;
  $("final-pdf-proof-status").textContent="Showing the exact "+result.total+"-page PDF that will be downloaded. "+result.verified+" approved Siddur pages.";
 }catch(e){invalidateFinalPdfProof();$("final-pdf-proof-status").textContent="PDF proof failed: "+e.message;console.error(e)}
 finally{button.disabled=false}
});
$("download").addEventListener("click",()=>{
 try{
  if(!finalPdfProof)throw Error("Generate and review the final PDF preview before downloading.");
  if(finalPdfProof.signature!==finalPdfSignature()){
   invalidateFinalPdfProof();
   throw Error("Pages or metadata changed since preview. Regenerate the PDF proof before downloading.");
  }
  const url=URL.createObjectURL(new Blob([finalPdfProof.bytes],{type:"application/pdf"}));
  const a=document.createElement("a");a.href=url;a.download=filename+"-leader-approved-copy.pdf";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status("Downloaded the exact previewed PDF: "+finalPdfProof.verified+" approved Siddur pages, "+finalPdfProof.total+" total pages.");
 }catch(e){status("Export blocked: "+e.message);$("export-status").textContent="Export blocked: "+e.message}
});

function populateHighlightRoles(){
 const select=$("active-highlight-role");if(!select)return;
 const current=select.value,roles=new Map();
 for(const [color,role] of serviceRoleAssignments)roles.set(String(role),String(role));
 for(const c of importedCues){const role=c.leader_role||c.role_name||c.role_code||c.role;if(role)roles.set(role,role)}
 if(!roles.size){roles.set("R","Rabbi");roles.set("P","President")}
 select.replaceChildren();
 for(const role of roles.keys()){const option=document.createElement("option");option.value=role;option.textContent=serviceRoleDisplayNames.get(role)||({R:"Rabbi",P:"President"}[role]||role);select.append(option)}
 if(roles.has(current))select.value=current;
}

$("run-auto-cues")?.addEventListener("click",async()=>{
 const button=$("run-auto-cues");button.disabled=true;$("auto-cue-status").textContent="Matching cue text…";
 try{await autoMatchCues();$("auto-cue-status").textContent=cueMatchReport}
 catch(e){$("auto-cue-status").textContent="Automatic matching failed: "+e.message}
 finally{button.disabled=false}
});
async function restoreSiddurIntake(){
 if(!window.indexedDB)return;
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open("leaders-companion-siddur-v3",1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains("projects"))q.result.createObjectStore("projects")};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 const data=await new Promise((resolve,reject)=>{const tx=db.transaction("projects","readonly");const q=tx.objectStore("projects").get("handoff");q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});db.close();
 if(!data?.pdf)throw Error("No saved PDF found. Return to Siddur Intake and save the project again.");
 const rows=data.csv?parseCsv(data.csv):[];
 // The browser handoff may predate the logical begin/end correction.
 // Repair only a provably reversed pair against the canonical repository CSV.
 // Never replace a distinct intentional edit or discard other handoff fields.
 try{
  const response=await fetch("../../data/SH-FE_V3_Intake_v2.0.csv",{cache:"no-store"});
  if(response.ok){
   const canonical=parseCsv(await response.text());
   const byId=new Map(canonical.map(c=>[c.cue_id||c.test_id,c]));
   let repaired=0;
   for(const row of rows){
    const reference=byId.get(row.cue_id||row.test_id);
    if(!reference)continue;
    const a=String(row.begin_cue||"").trim(),b=String(row.end_cue||"").trim();
    const correctA=String(reference.begin_cue||"").trim(),correctB=String(reference.end_cue||"").trim();
    if(a&&b&&a===correctB&&b===correctA&&correctA!==correctB){
     row.begin_cue=correctA;row.end_cue=correctB;
     if("begin_cue_hebrew" in row)row.begin_cue_hebrew=correctA;
     if("end_cue_hebrew" in row)row.end_cue_hebrew=correctB;
     repaired++;
    }
   }
   if(repaired)status("Corrected "+repaired+" reversed legacy cue pairs in the loaded Intake handoff (in memory).");
  }
 }catch(error){console.warn("Canonical cue comparison unavailable; retained saved Intake cues.",error)}
 cueCsvRows=rows.map(row=>({...row}));cueCsvHeaders=(data.csv?.split(/\r?\n/)[0]||"").split(",").map(h=>h.replace(/^"|"$/g,"").trim().toLowerCase());
 importedCues=rows.filter(c=>String(c.record_type||"CUE").trim().toUpperCase()==="CUE"&&(c.source_page||c.printed_page)&&(c.begin_cue||c.begin_cue_hebrew||c.cue_left)&&(c.end_cue||c.end_cue_hebrew||c.cue_right));
 roleConfig={id:"role-1",name:$("role-name").value.trim()||"Leader",color:"#F5D03C"};
 filename=(data.pdfName||"siddur.pdf").replace(/\.pdf$/i,"");
 const details=data.masterDetails||{};siddurStyleSheet=data.styleSheet||{framework:"boxes"};
 if($("assembly-siddur"))$("assembly-siddur").value=details.siddur||"";
 if($("assembly-service"))$("assembly-service").value=details.service||"";// Legacy assembly filename preview retired.
 serviceManifest=data.manifest||null;coverMetadata={...coverMetadata,...(serviceManifest?.cover||{})};servicePageMapping=data.pageMapping||null;serviceRoleOpacity=new Map(data.roleOpacity||serviceManifest?.opacity||[]);serviceRoleAssignments=new Map(data.roleAssignments||[]);serviceRoleDisplayNames=new Map(data.roleDisplayNames||[]);populateHighlightRoles();
 sourcePdfBytes=new Uint8Array(data.pdf);embeddedPageRecords=[];
 const source=await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise;
 sourcePdfPages=source.numPages;selectedSpreadFirst=1;spreadEdits.clear();resetIncrementalPdfState();cueRoleEdits.clear();
 updateIntakeInventory();
 await checkpointRead();
 initializeSectionCoverMetadata();
 await ensureInitialWorkingPdf();
 await loadSelectedSpread();
 status("Restored "+data.pdfName+" and "+importedCues.length+" cue rows. The PDF contains selected service pages.");
}
async function attemptIntakeHandoff(){
 const indicator=$("handoff-diagnostic");
 if(indicator)indicator.textContent="Loading saved Intake handoff from this browser…";
 try{
  await restoreSiddurIntake();
  if(indicator)indicator.textContent="Intake connected: "+sourcePdfPages+" service pages and "+importedCues.length+" cue records loaded.";
 }catch(e){
  const message="Intake handoff failed: "+(e?.message||String(e));
  if(indicator)indicator.textContent=message;
  status(message);
  console.error(message,e);
 }
}
$("retry-handoff")?.addEventListener("click",attemptIntakeHandoff);
attemptIntakeHandoff();

// V3.150 editor visibility controls
const zoomControl=$("page-zoom");if(zoomControl){const applyZoom=()=>{$("spread-preview").querySelector(".pdf-spread").style.width=zoomControl.value+"%";$("spread-preview").querySelector(".pdf-spread").style.minWidth="0";$("zoom-value").textContent=zoomControl.value+"%"};zoomControl.addEventListener("input",applyZoom);applyZoom();}
$("show-detection")?.addEventListener("click",()=>{highlightView=highlightView==="detection"?"highlights":"detection";$("highlight-view").value=highlightView;$("show-detection").textContent=highlightView==="detection"?"Hide recognized words (debug)":"Show all recognized words (debug)";drawHighlights()});


// Legacy individual-page assembly was retired. Working PDF export is handled by the editor above.
