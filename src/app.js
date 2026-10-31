"use strict";
const $=id=>document.getElementById(id);let sourceBytes=null,pageCount=0,outputBytes=null,previewUrl=null,config=null,blankBytes=null;
const numeric=id=>Number($(id).value);
function save(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
const TEST_DB="leaders-companion-local-test",TEST_KEY="test.pdf";
function testStore(){return new Promise((resolve,reject)=>{const request=indexedDB.open(TEST_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore("files");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function testFile(mode,value){const db=await testStore();try{return await new Promise((resolve,reject)=>{const tx=db.transaction("files",mode==="get"?"readonly":"readwrite");const request=mode==="get"?tx.objectStore("files").get(TEST_KEY):tx.objectStore("files").put(value,TEST_KEY);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}}
async function loadSource(bytes,name){if(!window.PDFLib)throw Error("PDF library unavailable");const stableBytes=new Uint8Array(bytes).slice();const pdf=await PDFLib.PDFDocument.load(stableBytes.slice());pageCount=pdf.getPageCount();sourceBytes=stableBytes;$("source-info").textContent=name+" · "+pageCount+" physical pages";$("page").max=pageCount;$("page").value=1;$("download").disabled=true;$("viewer").hidden=true;$("status").textContent="Ready."}
async function refreshTest(){try{const record=await testFile("get");$("use-test").disabled=false;$("test-info").textContent=record?"Saved test.pdf available in this browser.":"Upload test.pdf once to save it in this browser."}catch(e){$("use-test").disabled=false;$("test-info").textContent="Local storage unavailable; select test.pdf manually."}}
$("use-test").addEventListener("change",async()=>{
 if(!$("use-test").checked){sourceBytes=null;outputBytes=null;$("download").disabled=true;$("source-info").textContent="Choose a PDF or preview the blank template";return}
 $("test-info").textContent="Loading reference test page…";
 try{
  const response=await fetch("fixtures/SinglePGText.pdf",{cache:"no-store"});
  if(response.ok){await loadSource(await response.arrayBuffer(),"Reference: SinglePGText.pdf");$("test-info").textContent="Reference page loaded from the website.";return}
  const saved=await testFile("get");
  if(saved){await loadSource(saved.bytes,"Locally saved test.pdf");$("test-info").textContent="Reference not yet on website; using your locally saved test.pdf.";return}
  throw Error("Reference PDF is not installed in the repository yet. Upload fixtures/SinglePGText.pdf once.");
 }catch(e){$("use-test").checked=false;$("test-info").textContent=e.message;$("status").textContent=e.message}
});
refreshTest();
$("source").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;sourceBytes=null;outputBytes=null;$("use-test").checked=false;try{const bytes=await file.arrayBuffer();await loadSource(bytes,file.name);if(file.name.toLowerCase()==="test.pdf"){try{await testFile("put",{bytes:bytes.slice(0),updatedAt:Date.now()});await refreshTest();$("use-test").checked=true;$("status").textContent="Ready. test.pdf saved locally for future use."}catch(e){$("status").textContent="PDF loaded, but browser could not save test.pdf: "+e.message}}}catch(err){$("source-info").textContent="Unable to load PDF: "+err.message}});
function templateRegions(W,H,textX,companionX,textW,sideW,bottom,headerHeight,outerX){
 const gutter=4.32, contentLeft=Math.min(textX,companionX), contentRight=Math.max(textX+textW,companionX+sideW);
 const numberW=48, rowY=H-46, rowH=24;
 const numberOnLeft=companionX<textX;
 const numberX=numberOnLeft?contentLeft:contentRight-numberW;
 const serviceX=numberOnLeft?numberX+numberW+gutter:contentLeft;
 const serviceW=contentRight-contentLeft-numberW-gutter;
 const titleY=H-86, titleH=34, instructionY=H-headerHeight, instructionTop=titleY-gutter;
 return [
 ["Page number",numberX,rowY,numberW,rowH],
 ["Service name",serviceX,rowY,serviceW,rowH],
 ["Page title",textX,titleY,textW,titleH],
 ["Instructions",textX,instructionY,textW,instructionTop-instructionY],
 ["Corner block",companionX,instructionY,sideW,titleY+titleH-instructionY],
 ["Siddur text",textX,bottom,textW,H-headerHeight-bottom],
 ["Begin / End cues",textX,54,textW,bottom-54-gutter],
 ["Companion column",companionX,54,sideW,H-headerHeight-54],
 ["Bottom status bar",contentLeft,28,contentRight-contentLeft,26]
 ];
}
// Each template rectangle is an allocation; the inset is the safe content area.
// Insets are contained within existing geometry and never change page margins.
function safeInset(name){
 if(name==="Siddur text"||name==="Companion column")return 7.2; // 0.10 inch
 if(name==="Bottom status bar"||name==="Begin / End cues")return 4.32; // 0.06 inch
 return 5.76; // 0.08 inch for header metadata
}
function drawRegionGuides(page,regions,font){
 for(const [name,x,y,w,h] of regions){
  const p=safeInset(name);
  page.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.32,.52,.67),borderWidth:.8});
  if(w>2*p&&h>2*p)page.drawRectangle({x:x+p,y:y+p,width:w-2*p,height:h-2*p,borderColor:PDFLib.rgb(.55,.62,.66),borderWidth:.45,dashArray:[3,3]});
  page.drawText(name,{x:x+3,y:y+h-11,size:8,font,color:PDFLib.rgb(.25,.39,.48)});
 }
}
async function previewBlankTemplate(){
 const W=612,H=792,inner=59.76,outer=20.16,textW=380.88,gap=4.32,sideW=146.88,header=176;
 // Spread order is physical: left-hand page first, right-hand page second.
 const pdf=await PDFLib.PDFDocument.create(),page=pdf.addPage([W*2,H]),font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
 for(const [side,offset] of [["left",0],["right",W]]){
  const isLeft=side==="left";
  const textX=isLeft?outer+sideW+gap:inner,companionX=isLeft?outer:textX+textW+gap;
  const regions=templateRegions(W,H,textX,companionX,textW,sideW,84.24,header,0);
  // Offset every region into the spread without changing its local geometry.
  drawRegionGuides(page,regions.map(([name,x,y,w,h])=>[name,x+offset,y,w,h]),font);
  page.drawLine({start:{x:offset,y:0},end:{x:offset,y:H},thickness:.5,color:PDFLib.rgb(.8,.8,.8)});
  page.drawText(isLeft?"LEFT PAGE (binding at right)":"RIGHT PAGE (binding at left)",{x:offset+outer,y:H-13,size:9,font,color:PDFLib.rgb(.28,.35,.36)});
 }
 const bytes=await pdf.save();
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 previewUrl=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
 $("viewer").src=previewUrl;$("viewer").hidden=false;
 $("download").disabled=true;
 $("status").textContent="Facing-page master preview: left and right layouts rendered together. Dashed lines show inner safe areas.";
}
$("preview").addEventListener("click",async()=>{if(!sourceBytes){$("status").textContent="Rendering blank master template…";try{if(!window.PDFLib)throw Error("PDF library unavailable");await previewBlankTemplate()}catch(err){$("status").textContent="Could not preview blank template: "+err.message}return;}outputBytes=null;$("download").disabled=true;$("settings").disabled=true;$("preview").disabled=true;$("status").textContent="Rendering…";try{
 const pageNo=numeric("page");if(!Number.isInteger(pageNo)||pageNo<1||pageNo>pageCount)throw Error("Select a valid physical PDF page.");
 let printed=$("printed").value.trim();if(!printed||!/^[\x20-\x7E]+$/.test(printed))throw Error("Enter a printable page number using standard characters.");
 const crop={left:numeric("left"),right:numeric("right"),top:numeric("top"),bottom:numeric("bottom")};
 if(Object.values(crop).some(v=>!Number.isFinite(v)||v<0||v>95)||crop.left+crop.right>=95||crop.top+crop.bottom>=95)throw Error("Crop settings leave too little page area.");
 const margin=numeric("margin");if(!Number.isFinite(margin)||margin<0||margin>150)throw Error("Invalid margin.");
 const [W,H]=$("size").value.split(",").map(Number),src=await PDFLib.PDFDocument.load(sourceBytes.slice()),original=src.getPage(pageNo-1);
 const sw=original.getWidth(),sh=original.getHeight();
 // Verified visual crop for the scanned SinglePGText.pdf reference (page 159).
 // This is a calibrated reference fixture, not automatic classification of arbitrary pages.
 const referenceMode=$("use-test").checked&&pageNo===1&&Math.abs(sw-376.08)<1&&Math.abs(sh-502.56)<1;
 const left=referenceMode?44:sw*crop.left/100,right=referenceMode?338:sw*(1-crop.right/100),bottom=referenceMode?sh-470:sh*crop.bottom/100,top=referenceMode?sh-45:sh*(1-crop.top/100);
 if(referenceMode){printed="159";$("printed").value="159";$("service-name").value="Shabbat Evening Service";}

 const out=await PDFLib.PDFDocument.create(),embedded=await out.embedPage(original,{left,bottom,right,top}),page=out.addPage([W,H]);
 const layout=$("layout").value,isV2=layout==="v2",sideWidth=isV2?146.88:layout==="full"?0:numeric("sidewidth");if(!Number.isFinite(sideWidth)||sideWidth<0||sideWidth>220)throw Error("Invalid companion column width.");const gap=isV2?4.32:sideWidth?10:0,headerHeight=isV2?176:42;const innerMargin=isV2?59.76:margin,outerMargin=isV2?20.16:margin;const bindingSide=$("finalside").value==="left"?"right":"left";const textLeft=isV2?(bindingSide==="left"?innerMargin:outerMargin+sideWidth+gap):margin+(layout==="leader"?sideWidth+gap:0);const availW=isV2?380.88:W-2*margin-sideWidth-gap;const bottomReserve=isV2?84.24:margin;const availH=H-headerHeight-bottomReserve;
 if(availW<=0||availH<=0)throw Error("Margins leave no room for content.");
 const contentPad=isV2?safeInset("Siddur text"):0;const widthPct=numeric("textwidth"),heightPct=numeric("textheight"),textAlign=$("textalign").value;if(!Number.isFinite(widthPct)||!Number.isFinite(heightPct)||widthPct<40||widthPct>100||heightPct<40||heightPct>100)throw Error("Text block percentages must be between 40 and 100.");const blockW=(availW-2*contentPad)*widthPct/100,blockH=(availH-2*contentPad)*heightPct/100;const scale=Math.min(blockW/(right-left),blockH/(top-bottom)),drawW=(right-left)*scale,drawH=(top-bottom)*scale;
 const blockX=textLeft+(availW-blockW)/2,blockY=bottomReserve+(availH-blockH)/2;const drawY=isV2?bottomReserve+availH-contentPad-drawH:textAlign==="top"?blockY+blockH-drawH:textAlign==="bottom"?blockY:blockY+(blockH-drawH)/2;page.drawPage(embedded,{x:blockX+(blockW-drawW)/2,y:drawY,width:drawW,height:drawH});
 const guideFont=await out.embedFont(PDFLib.StandardFonts.Helvetica);
 const companionX=bindingSide==="left"?textLeft+availW+gap:outerMargin;
 const regions=isV2?templateRegions(W,H,textLeft,companionX,availW,sideWidth,bottomReserve,headerHeight,bindingSide==="left"?W-outerMargin-sideWidth:outerMargin):[["Siddur text",textLeft,bottomReserve,availW,availH]];
 const drawGuides=(target,showText)=>{drawRegionGuides(target,regions,guideFont);if(showText)target.drawRectangle({x:blockX+(blockW-drawW)/2,y:drawY,width:drawW,height:drawH,borderColor:PDFLib.rgb(.83,.35,.15),borderWidth:1.1});};

 const blank=await PDFLib.PDFDocument.create(),blankPage=blank.addPage([W,H]),blankFont=await blank.embedFont(PDFLib.StandardFonts.Helvetica);
 drawRegionGuides(blankPage,regions,blankFont);
 blankBytes=await blank.save();
 if(isV2){
  const metaFont=await out.embedFont(PDFLib.StandardFonts.Helvetica);
  const drawMeta=(value,x,y,maxWidth,size)=>{if(!value)return;const v=value.replace(/[^\\x20-\\x7e]/g,"").trim();if(!v)return;let fontSize=size;while(fontSize>7&&metaFont.widthOfTextAtSize(v,fontSize)>maxWidth)fontSize-=.5;page.drawText(v,{x,y,size:fontSize,font:metaFont,color:PDFLib.rgb(.18,.24,.28)});};
  const headerRegions=templateRegions(W,H,textLeft,companionX,availW,sideWidth,bottomReserve,headerHeight,0);const serviceBox=headerRegions[1];drawMeta($("service-name").value,serviceBox[1]+5.76,serviceBox[2]+7,serviceBox[3]-11.52,12);
  drawMeta($("page-title").value,textLeft+5.76,H-78,availW-11.52,16);
 }
 const font=await out.embedFont(PDFLib.StandardFonts.HelveticaBold),fontSize=19,textWidth=font.widthOfTextAtSize(printed,fontSize);
 const finalSide=$("finalside").value;page.drawText(printed,{x:finalSide==="left"?(isV2?outerMargin:margin):W-(isV2?outerMargin:margin)-textWidth,y:H-(isV2?38:margin+21),size:fontSize,font,color:PDFLib.rgb(.78,.1,.12)});
 const productionBytes=await out.save();if($("guides").value==="template")drawGuides(page,true);outputBytes=productionBytes;const previewBytes=await out.save();config={schemaVersion:1,sourcePdfPage:pageNo,printedPageNumber:printed,extractionMethod:referenceMode?"calibrated-visual-crop":"manual-percentage-crop",sourceClipPoints:{left,bottom,right,top},classificationConfidence:referenceMode?"reference-only":null,cropPercent:crop,outputSizePoints:[W,H],marginPoints:margin,layoutGeometryVersion:isV2?"CTI-V2-revised":null,previewMode:$("guides").value,originalLeaf:$("leaf").value.trim(),leafSide:$("leafside").value,bookSide:$("bookside").value,finalBookSide:finalSide,finalPageNumberPlacement:finalSide==="left"?"top-left":"top-right",serviceName:$("service-name").value.trim(),pageTitle:$("page-title").value.trim(),originalPageNumber:$("originalnumber").value.trim(),originalPageNumberPosition:$("numberedge").value,layoutPreset:layout,companionColumnWidthPoints:sideWidth,companionGapPoints:gap,protectedTextRegionPoints:{x:textLeft,y:bottomReserve,width:availW,height:availH},reservedRegionsPoints:isV2?{topInstructions:{x:textLeft,y:H-headerHeight,width:availW,height:headerHeight-30},cornerBlock:{x:bindingSide==="left"?outerMargin:textLeft+availW+gap,y:H-headerHeight,width:sideWidth,height:headerHeight-30},companionColumn:{x:bindingSide==="left"?outerMargin:textLeft+availW+gap,y:bottomReserve,width:sideWidth,height:availH},bottomStatus:{x:bindingSide==="left"?outerMargin:textLeft,y:28,width:availW+gap+sideWidth,height:26}}:null,standardSiddurBlockPoints:{x:blockX,y:blockY,width:blockW,height:blockH},textBlockWidthPercent:widthPct,textBlockHeightPercent:heightPct,textVerticalAlignment:textAlign,actualPlacedTextPoints:{x:blockX+(blockW-drawW)/2,y:drawY,width:drawW,height:drawH},sourceScaleFactor:scale,regionSafeInsetsPoints:isV2?{"Siddur text":7.2,"Companion column":7.2,"Bottom status bar":4.32,"Metadata and instructions":5.76}:null,topAlignedToStandardSiddurRegion:isV2};
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([previewBytes],{type:"application/pdf"}));$("viewer").src=previewUrl;$("viewer").hidden=false;$("download").disabled=false;$("settings").disabled=false;$("blank").disabled=false;$("status").textContent="Preview ready. Reference page uses calibrated crop; other PDFs use manual crop. Verify placement.";
 }catch(err){console.error("Preview failed",err);$("status").textContent="Could not generate preview: "+(err&&err.message?err.message:String(err))}finally{$("preview").disabled=false}});
$("download").addEventListener("click",()=>{if(outputBytes)save(outputBytes,"standardized-page-"+config.sourcePdfPage+".pdf","application/pdf")});
$("settings").addEventListener("click",()=>{if(config)save(JSON.stringify(config,null,2),"standardized-page-"+config.sourcePdfPage+"-settings.json","application/json")});

$("blank").addEventListener("click",()=>{if(blankBytes)save(blankBytes,"leaders-companion-layout-template.pdf","application/pdf")});
