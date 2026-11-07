"use strict";
const $=id=>document.getElementById(id);
const W=612,H=792,REGIONS=[{x:171.36,y:98,w:380.88,h:540},{x:59.76,y:98,w:380.88,h:540}];
let siddurStyleSheet={framework:"boxes"};
let output=null,baseOutput=null,filename="siddur",pageMetadata=[],roleConfig=null,highlightDraft=null,importedCues=[];
function status(s){if($("status"))$("status").textContent=s;if($("editor-status")&&(!sourcePdfPages||/failed|error|cannot/i.test(s)))$("editor-status").textContent=s}
function updateSpanStatus(){const el=$("editor-status");if(!el)return;const total=Math.ceil(sourcePdfPages/2);el.hidden=!total;if(total)el.textContent="Displaying span "+Math.ceil(selectedSpreadFirst/2)+" of "+total;}
const workerURL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
function drawTemplate(page,side){
 if(siddurStyleSheet.framework==="none")return;
 const text=side===0?171.36:59.76,content=side===0?20.16:444.96;
 const min=Math.min(text,content),max=Math.max(text+380.88,content+146.88);
 const boxes=[[text,710,380.88,30],[text,642,380.88,64],[text,98,380.88,540],[text,46,380.88,48],[content,46,146.88,694],[min,24,max-min,18]];
 const numberX=side===0?min:max-48,colorX=side===0?numberX+48:numberX-18;
 boxes.push([numberX,746,48,24],[colorX,746,18,24],[side===0?colorX+18:min,746,max-min-66,24]);
 for(const [x,y,w,h] of boxes)page.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.26,.44,.54),borderWidth:.75});
}
function drawKnownFrameworkFields(page,record,side,font,boldFont=font,embedded=null){
 const source=record?.source||{},ident=record?.identification||{};
 const cues=embedded?.cues||record?.leadership?.cues||[];
 const number=String(embedded?.printedPage||source.originalPageNumber||downloadPageNumber(source.sourcePdfPage)||"").split("-")[0].trim();
 const service=embedded?.serviceName||embedded?.service_name||record?.identification?.serviceName||ident.serviceName||"";
 const title=embedded?.prayerName||embedded?.prayerTitle||record?.identification?.prayerName||ident.prayerName||"";
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
 fit(title,textX+4,714,372.8,20,boldFont);
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
 return /[\u05d0-\u05ea]/.test([cue.startCueHebrew,cue.endCueHebrew,cue.startCue,cue.endCue,cue.begin_cue,cue.end_cue,cue.begin_cue_hebrew,cue.end_cue_hebrew].filter(Boolean).join(" "));
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
   const languageMatches=!language||!code||language===code||language==="BOTH"||language==="E/H"||language==="H+E"||language==="H/L";
   return (supplement?ref.toUpperCase()===manifestRef.toUpperCase():(sameReference||(!manifestRef&&inRange)))&&languageMatches;
  });
  // V2 stores physical LEFT and RIGHT cue boundaries for human reading.
  // Hebrew begins on the RIGHT and ends on the LEFT; English is the reverse.
  record.leadership.cues=matches.map((c,i)=>{
   const isHebrew=/[\u05d0-\u05ea]/.test([c.begin_cue,c.end_cue,c.begin_cue_hebrew,c.end_cue_hebrew].join(" "));
   const left=c.cue_left||"",right=c.cue_right||"";
   // The canonical CSV's Hebrew begin_cue/end_cue values are stored in visual
   // left-to-right order; the Hebrew reading begins at the rightmost (end_cue).
   const hasVisualColumns=!!(left||right);
   const beginning=isHebrew?(right||c.begin_cue||""):(left||c.begin_cue||"");
   const ending=isHebrew?(left||c.end_cue||""):(right||c.end_cue||"");
   return {
    cueId:c.cue_id||c.test_id||"import-"+i,service:c.service_name||c.service||null,role:c.leader_role||c.role_name||c.role_code||c.role||null,
    style:c.performance_style||c.style||null,styleSlot:null,startCue:beginning,endCue:ending,
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
 select.addEventListener("change",()=>{visibleCueId=select.value;drawHighlights()});
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
fetch("../../data/prayer-instructions.v1.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("Instruction library HTTP "+r.status);return r.json()}).then(data=>{facingInstructionLibrary=data;renderFacingInstructions()}).catch(e=>{const status=$("facing-instruction-status");if(status)status.textContent="Instruction library unavailable: "+e.message});
function facingPageWarnings(record){
 const state=record.leadership;
 const warnings=[];
 for(const cue of state.cues||[])if(!String(cue.matchStatus||"").includes("candidate")&&!String(cue.matchStatus||"").includes("matched"))warnings.push("Cue "+cue.cueId+" requires review: "+(cue.matchStatus||"unmatched"));
 for(const id of state.instructionIds||[]){
  const instruction=(facingInstructionLibrary?.prayers||[]).flatMap(p=>p.instructions||[]).find(x=>Number(x.instruction_id)===Number(id));
  if(!instruction)warnings.push("Instruction #"+id+" not found");
  else if(instruction.approval_status!=="approved")warnings.push("Instruction #"+id+" is not approved in the library");
 }
 return warnings;
}
function instructionTextForPage(state){
 return (state.instructionIds||[]).map(id=>{
  const entry=(facingInstructionLibrary?.prayers||[]).flatMap(p=>p.instructions||[]).find(x=>Number(x.instruction_id)===Number(id));
  return entry?String(entry.text).replace(/\\{PrayerName\\}/g,state.instructionPrayer||"prayer").replace(/\\{PageNumber\\}/g,state.instructionPageNumber||"").replace(/\\{[^}]+\\}/g,""):null;
 }).filter(Boolean);
}
function renderInstructionPreviews(){
 for(let side=0;side<2;side++){
  const canvas=$(side===0?"output-left":"output-right"),record=pageMetadata[side];
  if(!canvas)continue;
  const parent=canvas.parentElement;parent.style.position="relative";
  let preview=parent.querySelector(".instruction-page-preview");
  if(!preview){preview=document.createElement("div");preview.className="instruction-page-preview";preview.style.cssText="position:absolute;pointer-events:none;z-index:5;background:rgba(255,255,255,.94);border:1px dashed #546b7b;padding:3px 5px;font:12px Arial,sans-serif;color:#182c36;max-width:80%;white-space:pre-wrap";parent.append(preview)}
  const state=record?.leadership,text=state?instructionTextForPage(state):[];
  preview.hidden=!text.length;
  if(!text.length)continue;
  preview.textContent=text.join("\\n");
  preview.style.left="10%";preview.style.right="10%";
  preview.style.top="4%";preview.style.bottom="auto";
 }
}
function pageApprovalFingerprint(record){
 const state=record.leadership||{};
 return JSON.stringify({highlights:state.highlights||[],cues:state.cues||[],instructionIds:state.instructionIds||[],instructionPrayer:state.instructionPrayer||"",instructionPosition:state.instructionPosition||"top",instructionOverrides:state.instructionOverrides||{}});
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
  const prayerTitle=state.instructionPrayer||record.identification?.prayerTitle||record.leadership?.cues?.[0]?.prayer||"Untitled prayer";
  const prayerRow=document.createElement("div");prayerRow.className="instruction-prayer-row";
  const prayerName=document.createElement("strong");prayerName.textContent=prayerTitle;prayerRow.append(prayerName);
  const editPrayer=document.createElement("button");editPrayer.type="button";editPrayer.textContent="Edit prayer name";prayerRow.append(editPrayer);
  const prayer=document.createElement("input");prayer.value=prayerTitle;prayer.hidden=true;prayer.setAttribute("aria-label","Prayer name");prayerRow.append(prayer);
  editPrayer.onclick=()=>{prayer.hidden=!prayer.hidden;editPrayer.textContent=prayer.hidden?"Edit prayer name":"Done";if(prayer.hidden){state.instructionPrayer=prayer.value.trim();state.highlightConfirmed=false;renderFacingInstructions()}};
  panel.append(prayerRow);
  const select=document.createElement("select");select.setAttribute("aria-label","Instruction for "+(side===0?"left":"right")+" page");
  select.add(new Option("Select instruction",""));
  for(const p of facingInstructionLibrary?.prayers||[])for(const ins of p.instructions||[])select.add(new Option("#"+ins.instruction_id+" — "+p.canonical_title+" — "+ins.text+" ("+(ins.approval_status||"unreviewed")+")",String(ins.instruction_id)));
  panel.append(select);
  const add=document.createElement("button");add.type="button";add.textContent="Add instruction";add.onclick=()=>{if(!select.value)return;const id=Number(select.value);if(!state.instructionIds.includes(id))state.instructionIds.push(id);state.highlightConfirmed=false;renderFacingInstructions()};panel.append(add);

  const selected=document.createElement("div");
  for(const id of state.instructionIds){
   const line=document.createElement("div");line.className="instruction-selected";const entry=(facingInstructionLibrary?.prayers||[]).flatMap(p=>p.instructions||[]).find(ins=>Number(ins.instruction_id)===id);line.textContent=entry?.text||"Selected instruction";
   const remove=document.createElement("button");remove.type="button";remove.textContent="Remove";remove.onclick=()=>{state.instructionIds=state.instructionIds.filter(x=>x!==id);state.highlightConfirmed=false;renderFacingInstructions()};line.append(remove);selected.append(line);
  }
  panel.append(selected);
  state.instructionPageNumber=String(record.source.originalPageNumber||record.source.sourcePdfPage||"");
  const warnings=facingPageWarnings(record);
  for(const warning of warnings){
   const label=document.createElement("label");label.style.display="block";
   const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=!!state.instructionOverrides[warning];
   checkbox.onchange=()=>{state.instructionOverrides[warning]=checkbox.checked;state.highlightConfirmed=false;renderFacingInstructions()};
   label.append(checkbox,document.createTextNode(" Override review warning: "+warning));panel.append(label);
  }
  const unresolved=warnings.filter(w=>!state.instructionOverrides[w]);
  const confirm=document.createElement("label");confirm.style.display="block";
  const check=document.createElement("input");check.type="checkbox";check.checked=pageApprovalCurrent(record);check.disabled=unresolved.length>0;
  check.onchange=()=>{state.highlightConfirmed=check.checked;state.confirmedFingerprint=check.checked?pageApprovalFingerprint(record):null;renderFacingInstructions()};
  confirm.append(check,document.createTextNode(" Confirm Highlight and page instructions"));panel.append(confirm);
  const note=document.createElement("p");note.textContent=unresolved.length?unresolved.length+" unresolved warning(s); confirmation blocked.":pageApprovalCurrent(record)?"Page confirmed for download.":"Review the highlights, then confirm.";panel.append(note);
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
  applyCueRoleEdits();
  const active=cues.find(c=>c.cueId===selectedCueBySide[side])||cues[0];
  const selector=document.createElement("label");selector.className="cue-number-selector";selector.textContent="Cue number ";
  const choice=document.createElement("select");choice.setAttribute("aria-label",(side===0?"Left":"Right")+" page cue number");
  cues.forEach((cue,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent="Cue "+(index+1)+(cue.prayer?" — "+cue.prayer:"");choice.append(option)});
  choice.value=String(Math.max(0,cues.indexOf(active)));
  choice.disabled=!cues.length;
  choice.onchange=()=>{selectedCueBySide[side]=cues[Number(choice.value)].cueId;renderPageCueEditor();drawHighlights()};
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
  const name=document.createElement("strong");name.textContent=(active.prayer||"Cue "+(cues.indexOf(active)+1))+(active.role?" · "+active.role:"");wrap.append(name);
  const inputs={};
  for(const [key,label,value] of [["start","Beginning",active.startCue],["end","Ending",active.endCue]]){
   const lab=document.createElement("label");lab.className="cue-field";lab.textContent=label;
   const input=document.createElement("textarea");input.rows=2;input.value=value||"";input.dir="auto";lab.append(input);wrap.append(lab);inputs[key]=input;
  }
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
   saveCurrentSpreadEdits();record.leadership.highlightConfirmed=false;
   $("page-cue-editor-status").textContent=(side===0?"Left":"Right")+" page manual highlights saved in this editing session. Review and approve before export.";
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
  const tokens=t=>normalizeCueText(t).replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(Boolean);
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
function isolatedHebrewCueMatch(side,cue,ocr){
 const words=rivokWordsBySide[side],lines=detectedLines[side];
 if(!words?.length||!lines?.length)return null;
 const tokenize=t=>normalizeCueText(hebrewCueAlias(t)).replace(/יהוה/g,"יי")
  .replace(/[^\u05d0-\u05ea ]/g," ").split(/\s+/).filter(Boolean);
 const start=tokenize(cue.startCueHebrew),end=tokenize(cue.endCueHebrew);
 const similarity=(a,b)=>{
  const dp=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let prev=dp[0];dp[0]=i;
   for(let j=1;j<=b.length;j++){const old=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}
  return 1-dp[b.length]/Math.max(a.length,b.length,1);
 };
 // Build a forward reading stream from OCR word positions. Rivok alone
 // supplies all highlight rectangles; OCR boxes only associate text to ink.
 const ordered=lines.slice().sort((a,b)=>{
  const ac=a.x+a.width/2,bc=b.x+b.width/2;
  return (ac>=.5?0:1)-(bc>=.5?0:1)||a.y-b.y||bc-ac;
 });
 const rank=new Map(ordered.map((line,i)=>[line.id,i]));
 const tokens=(hebrewOcrTokens[side]||[]).filter(t=>rank.has(t.lineId))
  .sort((a,b)=>rank.get(a.lineId)-rank.get(b.lineId)||b.x-a.x);
 // Fall back to mapped OCR line text when individual word boxes are absent.
 if(!tokens.length)for(const line of ordered){
  for(const observation of ocr.filter(o=>o.id===line.id)){
   for(const text of tokenize(observation.text))tokens.push({text,lineId:line.id,x:line.x,y:line.y});
  }
 }
 const expanded=[];
 for(const t of tokens)for(const word of tokenize(t.text))expanded.push({...t,word});
 // Match a phrase progressively: every cue word is eligible, including short
 // words; joined OCR tokens can contain the cue word as a substring.
 const wordScore=(needle,hay)=>{
  if(!needle||!hay)return 0;
  if(needle===hay)return 1;
  if(hay.includes(needle)&&needle.length>=2)return .9;
  if(needle.includes(hay)&&hay.length>=2)return .76;
  return similarity(needle,hay);
 };
 const locate=(phrase,from)=>{
  const candidates=[];
  for(let i=from;i<expanded.length;i++){
   for(let k=0;k<phrase.length;k++){
    const first=wordScore(phrase[k],expanded[i].word);
    if(first< (phrase[k].length<=2?.85:.65))continue;
    let score=first,matched=1;
    // Nearby confirming words help disambiguate repeated Hebrew words.
    for(let j=k+1;j<phrase.length;j++){
     const nearby=expanded.slice(i+1,Math.min(expanded.length,i+5+j-k));
     const best=Math.max(0,...nearby.map(t=>wordScore(phrase[j],t.word)));
     if(best>=.65){score+=best;matched++;}
    }
    candidates.push({index:i,token:expanded[i],score:score+matched*.35-k*.12,matched,anchorIndex:k});
   }
  }
  return candidates.sort((a,b)=>b.score-a.score||a.index-b.index)[0]||null;
 };
 const beginning=locate(start,0);
 if(!beginning)return null;
 // End is searched ONLY after the beginning's position in the reading stream.
 const ending=locate(end,beginning.index+1);
 if(!ending)return null; // Both Hebrew anchors are mandatory; never highlight only the start.
 // Map the OCR cue's word span onto Rivok word boxes. OCR identifies
 // positions; only Rivok rectangles are ever used for the overlay.
 const rivokByLine=id=>words.filter(w=>w.lineId===id).sort((a,b)=>b.x-a.x);
 const closestRivok=t=>{
  const candidates=rivokByLine(t.lineId);
  return candidates.sort((a,b)=>Math.abs(a.x+a.width/2-t.x)-Math.abs(b.x+b.width/2-t.x))[0];
 };
 const selection=new Map();
 const include=(w)=>{if(w)selection.set(w.id,w);};
 const endpoint=(match,phrase)=>{
  if(!match)return;
  const lineId=match.token.lineId;
  const row=rivokByLine(lineId);
  if(!row.length)return;
  const anchor=closestRivok(match.token);
  if(!anchor)return;
  const anchorPos=row.findIndex(w=>w.id===anchor.id);
  // In Hebrew visual reading order, subsequent words are to the left.
  // Estimate missing OCR words using adjacent Rivok boxes, never OCR rectangles.
  const first=Math.max(0,anchorPos-match.anchorIndex);
  const last=Math.min(row.length-1,first+phrase.length-1);
  for(let i=first;i<=last;i++)include(row[i]);
  // Include independently recognized cue tokens on this line when available.
  const from=Math.max(0,match.index-match.anchorIndex);
  for(const t of expanded.slice(from,Math.min(expanded.length,from+phrase.length+2))){
   if(t.lineId!==lineId)break;
   const target=closestRivok(t);
   if(target)include(target);
  }
 };
 endpoint(beginning,start);
 endpoint(ending,end);
 // Fill the intervening printed Hebrew words, not only the two anchor phrases.
 // Read in visual RTL order and retain the actual Rivok word rectangles.
 const firstRank=rank.get(beginning.token.lineId),lastRank=rank.get(ending.token.lineId);
 if(firstRank===undefined||lastRank===undefined||lastRank<firstRank)return null;
 const startWord=closestRivok(beginning.token),endWord=closestRivok(ending.token);
 for(let lineIndex=firstRank;lineIndex<=lastRank;lineIndex++){
  const row=rivokByLine(ordered[lineIndex].id);
  if(!row.length)continue;
  let from=0,to=row.length-1;
  if(lineIndex===firstRank&&startWord){const pos=row.findIndex(w=>w.id===startWord.id);if(pos>=0)from=pos}
  if(lineIndex===lastRank&&endWord){const pos=row.findIndex(w=>w.id===endWord.id);if(pos>=0)to=pos}
  if(from>to)return null;
  for(let j=from;j<=to;j++)include(row[j]);
 }
 const chosen=[...selection.values()];
 if(!chosen.length)return null;
 return chosen.map(w=>({highlightId:"HL-"+cue.cueId+"-"+w.id,
  lineId:w.lineId,wordId:w.id,cueId:cue.cueId,roleId:cue.role,
  x:w.x,y:w.y,width:w.width,height:w.height,
  coordinateSystem:"normalized-top-left",visibleInPdf:false,tentative:true}));
}
function assignCueHighlights(side){
 const record=pageMetadata[side],ocr=sourceTextLines[side]||[],geometry=detectedLines[side]||[];
 if(!record)return 0;
 let matches=0;
 for(const cue of record.leadership.cues){
  const hebrew=cueHasHebrewScript(cue);
  if(hebrew){
   if(!String(cue.startCueHebrew||"").trim()||!String(cue.endCueHebrew||"").trim()){
    cue.matchStatus="missing-Hebrew-cue-review-required";
    continue;
   }
   const highlights=isolatedHebrewCueMatch(side,cue,ocr);
   if(highlights?.length){record.leadership.highlights.push(...highlights);cue.matchStatus="isolated-rivok-candidate-review-required";matches++;}
   else cue.matchStatus=rivokWordsBySide[side]?.length?"rivok-anchor-pair-not-found":"rivok-unavailable";
   continue;
  }
  // A cue whose source_page is a printed-page range has only one anchor
  // on each boundary page. Match each page independently, including across spreads.
  const sourceRow=importedCues.find(c=>(c.cue_id||c.test_id)===cue.cueId);
  const span=String(sourceRow?.source_page||"").match(/^(\d+)-(\d+)$/);
  const printed=Number(record.source.originalPageNumber);
  if(span&&!hebrew&&Number.isFinite(printed)&&Number(span[1])<Number(span[2])&&printed>=Number(span[1])&&printed<=Number(span[2])){
   const firstPage=printed===Number(span[1]),lastPage=printed===Number(span[2]);
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
   const selected=lines.filter(l=>l.y+l.height/2>=startY-.012&&l.y+l.height/2<=endY+.012
    // Printed page numbers and template headings are outside the prayer body.
    &&l.y>.18&&l.y<.88);
   if(!selected.length){cue.matchStatus="spanning-page-empty-review-required";continue}
   for(const line of selected)record.leadership.highlights.push({
    highlightId:"HL-"+cue.cueId+"-"+line.id,lineId:line.id,cueId:cue.cueId,roleId:cue.role,
    x:line.x,y:line.y,width:line.width,height:line.height,
    coordinateSystem:"normalized-top-left",visibleInPdf:false
   });
   cue.matchStatus="spanning-page-candidate-review-required";
   matches++;continue;
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
  const pageCue=selectedCueBySide[i];
  const selected=(pageMetadata[i]?.leadership?.highlights||[]).filter(h=>!pageCue||h.cueId===pageCue||!h.cueId);
  for(const line of detectedLines[i]){
   const lineHighlight=selected.find(h=>!h.wordId&&h.lineId===line.id);
   const wordOverrides=selected.filter(h=>h.wordId&&h.lineId===line.id);
   // A line without word edits is rendered once. After the first word edit,
   // individual word selections replace the full-line rectangle.
   if(!wordOverrides.length){
    if((lineHighlight&&!(Number.isFinite(lineHighlight.x)&&Number.isFinite(lineHighlight.y)))||highlightView==="detection"){
     ctx.fillStyle=lineHighlight?highlightFill(lineHighlight):"rgba(24,105,160,.19)";
     ctx.fillRect(line.x*overlay.width,line.y*overlay.height,line.width*overlay.width,line.height*overlay.height);
    }
   }else{
    const words=wordCandidates(i,line);
    for(const word of words){
     const h=wordOverrides.find(v=>v.wordId===word.id);
     if(!h&&highlightView!=="detection")continue;
     ctx.fillStyle=h?highlightFill(h):"rgba(24,105,160,.19)";
     ctx.fillRect(word.x*overlay.width,word.y*overlay.height,word.width*overlay.width,word.height*overlay.height);
    }
   }
  }
  // Draw matched cue coordinates DIRECTLY, independent of detectedLines IDs.
  // Previously the renderer only painted highlights whose line/word IDs
  // still matched the current detector output. That could hide valid matches.
  if(highlightView!=="detection"){
   for(const h of selected){
    if(!Number.isFinite(h.x)||!Number.isFinite(h.y)||!Number.isFinite(h.width)||!Number.isFinite(h.height))continue;
    if(h.width<=0||h.height<=0)continue;
    ctx.fillStyle=highlightFill(h);
    ctx.fillRect(h.x*overlay.width,h.y*overlay.height,h.width*overlay.width,h.height*overlay.height);
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
    const role=pageMetadata[i].leadership.cues.find(c=>c.cueId===visibleCueId)?.role||pageMetadata[i].leadership.cues[0]?.role||roleConfig.id;
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
   (detectedLines[0]||[]).filter(l=>l.column===firstAnchor.column&&l.y+l.height/2>=firstAnchor.y-.012),
   (detectedLines[1]||[]).filter(l=>l.column===lastAnchor.column&&l.y+l.height/2<=lastAnchor.y+.012)
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
 const record=pageMetadata[side];if(!record)return;
 record.leadership.highlights=record.leadership.highlights.filter(h=>!h.cueId);
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
 if(progress){progress.hidden=false;progress.max=pageMetadata.length;progress.value=0}
 if(progressLabel)progressLabel.textContent="Recognizing cue text and preparing highlights…";
 let total=0;
 for(const record of pageMetadata){record.leadership.highlights=record.leadership.highlights.filter(h=>!h.cueId)}
 for(let side=0;side<pageMetadata.length;side++){
  if(!pageMetadata[side].leadership.cues.length){if(progress)progress.value=side+1;continue;}
  if(progressLabel)progressLabel.textContent="Matching highlights: page "+(side+1)+" of "+pageMetadata.length+"…";
  status("Reading "+(side===0?"left":"right")+" page for cue anchors...");
  try{sourceTextLines[side]=await recognizeCueLines(side);if(pageHasHebrewCue(pageMetadata[side])){status("Running independent Hebrew line OCR before cue matching...");sourceTextLines[side]=await secondPassHebrewLines(side,sourceTextLines[side]);}total+=assignCueHighlights(side)}
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
 if(progress)progress.value=pageMetadata.length;
 if(progressLabel)progressLabel.textContent="Highlights ready — review both pages.";
 total+=matchCrossPageEnglishCues();
 $("ocr-diagnostics").textContent=pageMetadata.map((r,i)=>"Page "+(r.source.sourcePage||i+1)+" OCR ("+(sourceTextLines[i]||[]).length+" mapped lines):\\n"+(sourceTextLines[i]||[]).map(l=>l.text).join("\\n")+"\\n\\nRAW OCR DIAGNOSTICS:\\n"+(rawOcrDiagnostics[i]||"Not run")).join("\\n\\n");
 cueMatchReport=total+" of "+pageMetadata.reduce((n,r)=>n+r.leadership.cues.length,0)+" cues automatically matched. "+pageMetadata.flatMap(r=>r.leadership.cues.map(c=>c.cueId+": "+c.matchStatus)).join("; ");
 refreshCueVisibilityPicker();renderPageCueEditor();renderFacingInstructions();drawHighlights();displayMetadata();if($("cue-summary"))$("cue-summary").textContent=cueMatchReport;status(cueMatchReport);
}
async function syncHighlightMetadata(){
 for(const record of pageMetadata)for(const h of record?.leadership?.highlights||[])h.visibleInPdf=false;
}
async function createPdf(bytes){
 const source=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
 const out=await PDFLib.PDFDocument.create(),first=Math.max(0,Math.min(source.numPages-1,selectedSpreadFirst-1)),count=Math.min(2,source.numPages-first);
 if(!count)throw Error("No PDF pages found.");
 const font=await out.embedFont(PDFLib.StandardFonts.Helvetica),boldFont=await out.embedFont(PDFLib.StandardFonts.HelveticaBold),records=[];
 for(let i=0;i<count;i++){
  status("Processing source page "+(i+1)+" of "+count+"...");
  const src=await source.getPage(first+i+1),v=src.getViewport({scale:2});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  await src.render({canvasContext:ctx,viewport:v}).promise;
  const meta=await readMetadata(source,first+i,canvas);
  const crop=detectCrop(canvas,meta),cleaned=canvasCrop(canvas,crop);
  cleanPixels(cleaned);
  const png=await out.embedPng(await (await fetch(cleaned.toDataURL("image/png"))).arrayBuffer());
  records.push({meta,png,sourceIndex:first+i});
 }
 // Facing placement follows the document's reading direction, never prayer identity.
 // The first PDF page of a Hebrew-direction spread appears on the right.
 // Preserve sourceIndex so cues and metadata remain attached to the original PDF page.
 const facingDirection=String(serviceManifest?.facingPageDirection||"hebrew").toLowerCase();
 if(records.length===2&&facingDirection==="hebrew")records.reverse();
 pageMetadata=records.map(r=>makeIntakeRecord(r.meta,r.sourceIndex));
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
 
 for(let i=0;i<records.length;i++){
  const {meta,png}=records[i],page=out.addPage([W,H]);
  drawTemplate(page,i);drawKnownFrameworkFields(page,pageMetadata[i],i,font,boldFont,null);
  const r=REGIONS[i],pad=6,scale=Math.min((r.w-2*pad)/png.width,(r.h-2*pad)/png.height);
  const dw=png.width*scale,dh=png.height*scale;
  page.drawImage(png,{x:r.x+(r.w-dw)/2,y:r.y+(r.h-dh)/2,width:dw,height:dh});

 }
 return new Uint8Array(await out.save());
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
 refreshMetadataDialog();
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
let selectedSpreadFirst=1,sourcePdfBytes=null,sourcePdfPages=0,serviceManifest=null,servicePageMapping=null,serviceRoleOpacity=new Map(),serviceRoleAssignments=new Map(),serviceRoleDisplayNames=new Map(),serviceHighlightColors=["#F5D03C","#75C56A","#74B9E7","#F3A65B","#DA88B8","#AE93DC"],embeddedPageRecords=[];
const spreadEdits=new Map();
function saveCurrentSpreadEdits(){if(pageMetadata.length)spreadEdits.set(selectedSpreadFirst,{pages:pageMetadata.map(r=>r?{leadership:JSON.parse(JSON.stringify(r.leadership)),prayerTitle:r.prayerTitle,identification:r.identification?JSON.parse(JSON.stringify(r.identification)):null}:null),selectedCues:[...selectedCueBySide]});}
function updateSpreadNavigation(){updateSpanStatus();const total=Math.ceil(sourcePdfPages/2),current=Math.ceil(selectedSpreadFirst/2),percent=Math.round(Math.min(sourcePdfPages,selectedSpreadFirst+1)/Math.max(1,sourcePdfPages)*100);$("spread-position").textContent="Spread "+current+" of "+(total||"—")+" · PDF pages "+selectedSpreadFirst+(selectedSpreadFirst+1<=sourcePdfPages?"–"+(selectedSpreadFirst+1):"")+" · "+percent+"% through service";const progress=$("review-progress");if(progress)progress.value=percent;$("previous-spread").disabled=!sourcePdfBytes||current<=1;$("next-spread").disabled=!sourcePdfBytes||current>=total;}
async function navigateSpread(direction){if(!sourcePdfBytes)return;saveCurrentSpreadEdits();selectedSpreadFirst=Math.max(1,Math.min(2*Math.ceil(sourcePdfPages/2)-1,selectedSpreadFirst+direction*2));updateIntakeInventory();try{await loadSelectedSpread()}catch(e){console.error(e);status("Spread navigation failed: "+e.message)}}
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
async function loadSelectedSpread(){
 if(!sourcePdfBytes)return;
 $("download").disabled=true;
 if($("metadata-dialog").open){$("metadata-spread-label").textContent=$("spread-position").textContent+" — loading";$("metadata-dialog-content").textContent="Loading metadata for the selected spread…";}output=null;baseOutput=null;pageMetadata=[];
 ocrWordGeometry=[new Map(),new Map()];$("spread-preview").hidden=true;
 rivokOverlay=null;rivokWordsBySide=[null,null];
 visibleCueId="";
 output=await createPdf(sourcePdfBytes.slice());
 baseOutput=output.slice();
 await preview(output);
 // Individual-page download controls were retired; the working PDF is the only export.
 applyCueRoleEdits();
 const saved=spreadEdits.get(selectedSpreadFirst);
 if(saved){pageMetadata.forEach((record,i)=>{const prior=saved.pages?.[i];if(record&&prior){record.leadership=JSON.parse(JSON.stringify(prior.leadership));record.prayerTitle=prior.prayerTitle;if(prior.identification)record.identification=JSON.parse(JSON.stringify(prior.identification))}});selectedCueBySide=[...(saved.selectedCues||["",""])];renderPageCueEditor();drawHighlights()}else selectedCueBySide=["",""];
 if($("metadata-dialog").open)refreshMetadataDialog();
 $("download").disabled=false;
 status(cueMatchReport);updateSpanStatus();
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
  sourcePdfPages=source.numPages;selectedSpreadFirst=1;selectedCueBySide=["",""];spreadEdits.clear();
  updateIntakeInventory();
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
async function exportEntireService(){
 if(!sourcePdfBytes)throw Error("No service PDF loaded.");
 saveCurrentSpreadEdits();
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
  const edits=spreadEdits.get(spread)?.[side]||[];
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
$("download").addEventListener("click",async()=>{
 const button=$("download");button.disabled=true;
 try{
  const result=await exportEntireService();
  const url=URL.createObjectURL(new Blob([result.bytes],{type:"application/pdf"}));
  const a=document.createElement("a");a.href=url;a.download=filename+"-service-framework.pdf";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status("Downloaded "+result.pages+" pages with "+result.highlighted+" visible highlights without embedded cue metadata.");
 }catch(e){console.error(e);status("Full-service export failed: "+e.message);$("export-status").textContent="Export failed: "+e.message}
 finally{button.disabled=false}
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
 cueCsvRows=rows.map(row=>({...row}));cueCsvHeaders=(data.csv?.split(/\r?\n/)[0]||"").split(",").map(h=>h.replace(/^"|"$/g,"").trim().toLowerCase());
 importedCues=rows.filter(c=>c.source_page||c.printed_page);
 roleConfig={id:"role-1",name:$("role-name").value.trim()||"Leader",color:"#F5D03C"};
 filename=(data.pdfName||"siddur.pdf").replace(/\.pdf$/i,"");
 const details=data.masterDetails||{};siddurStyleSheet=data.styleSheet||{framework:"boxes"};
 if($("assembly-siddur"))$("assembly-siddur").value=details.siddur||"";
 if($("assembly-service"))$("assembly-service").value=details.service||"";// Legacy assembly filename preview retired.
 serviceManifest=data.manifest||null;servicePageMapping=data.pageMapping||null;serviceRoleOpacity=new Map(data.roleOpacity||serviceManifest?.opacity||[]);serviceRoleAssignments=new Map(data.roleAssignments||[]);serviceRoleDisplayNames=new Map(data.roleDisplayNames||[]);populateHighlightRoles();
 sourcePdfBytes=new Uint8Array(data.pdf);embeddedPageRecords=[];
 const source=await pdfjsLib.getDocument({data:sourcePdfBytes.slice()}).promise;
 sourcePdfPages=source.numPages;selectedSpreadFirst=1;spreadEdits.clear();cueRoleEdits.clear();
 updateIntakeInventory();
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
