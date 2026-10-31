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
async function previewBlankTemplate(){
 const W=612,H=792,inner=59.76,outer=20.16,textW=380.88,gap=4.32,sideW=146.88,header=122.4,bottom=84.24;
 const leftSide=$("finalside").value==="left",textX=leftSide?outer:inner,companionX=leftSide?outer:textX+textW+gap;
 const regions=[
 ["Top instructions",textX,H-header,textW,header-30],
 ["Corner block",companionX,H-header,sideW,header-30],
 ["Siddur text",textX,bottom,textW,H-header-bottom],
 ["Companion column",companionX,bottom,sideW,H-header-bottom],
 ["Bottom status bar",textX,28,textW,26]
 ];
 const pdf=await PDFLib.PDFDocument.create(),page=pdf.addPage([W,H]),font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
 for(const [name,x,y,w,h] of regions){
 page.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.17,.39,.58),borderWidth:1.3});
 page.drawText(name,{x:x+5,y:y+h-14,size:10,font,color:PDFLib.rgb(.15,.32,.47)});
 }
 const bytes=await pdf.save();
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 previewUrl=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
 $("viewer").src=previewUrl;$("viewer").hidden=false;
 $("download").disabled=true;
 $("status").textContent="Blank master template preview: five bounding boxes. Upload a PDF to preview content.";
}
$("preview").addEventListener("click",async()=>{if(!sourceBytes){$("status").textContent="Rendering blank master template…";try{if(!window.PDFLib)throw Error("PDF library unavailable");await previewBlankTemplate()}catch(err){$("status").textContent="Could not preview blank template: "+err.message}return;}outputBytes=null;$("download").disabled=true;$("settings").disabled=true;$("preview").disabled=true;$("status").textContent="Rendering…";try{
 const pageNo=numeric("page");if(!Number.isInteger(pageNo)||pageNo<1||pageNo>pageCount)throw Error("Select a valid physical PDF page.");
 const printed=$("printed").value.trim();if(!printed||!/^[\x20-\x7E]+$/.test(printed))throw Error("Enter a printable page number using standard characters.");
 const crop={left:numeric("left"),right:numeric("right"),top:numeric("top"),bottom:numeric("bottom")};
 if(Object.values(crop).some(v=>!Number.isFinite(v)||v<0||v>95)||crop.left+crop.right>=95||crop.top+crop.bottom>=95)throw Error("Crop settings leave too little page area.");
 const margin=numeric("margin");if(!Number.isFinite(margin)||margin<0||margin>150)throw Error("Invalid margin.");
 const [W,H]=$("size").value.split(",").map(Number),src=await PDFLib.PDFDocument.load(sourceBytes.slice()),original=src.getPage(pageNo-1);
 const sw=original.getWidth(),sh=original.getHeight(),left=sw*crop.left/100,right=sw*(1-crop.right/100),bottom=sh*crop.bottom/100,top=sh*(1-crop.top/100);
 const out=await PDFLib.PDFDocument.create(),embedded=await out.embedPage(original,{left,bottom,right,top}),page=out.addPage([W,H]);
 const layout=$("layout").value,isV2=layout==="v2",sideWidth=isV2?146.88:layout==="full"?0:numeric("sidewidth");if(!Number.isFinite(sideWidth)||sideWidth<0||sideWidth>220)throw Error("Invalid companion column width.");const gap=isV2?4.32:sideWidth?10:0,headerHeight=isV2?122.4:42;const innerMargin=isV2?59.76:margin,outerMargin=isV2?20.16:margin;const bindingSide=$("finalside").value==="left"?"right":"left";const textLeft=isV2?(bindingSide==="left"?innerMargin:outerMargin):margin+(layout==="leader"?sideWidth+gap:0);const availW=isV2?380.88:W-2*margin-sideWidth-gap;const bottomReserve=isV2?84.24:margin;const availH=H-headerHeight-bottomReserve;
 if(availW<=0||availH<=0)throw Error("Margins leave no room for content.");
 const widthPct=numeric("textwidth"),heightPct=numeric("textheight"),textAlign=$("textalign").value;if(!Number.isFinite(widthPct)||!Number.isFinite(heightPct)||widthPct<40||widthPct>100||heightPct<40||heightPct>100)throw Error("Text block percentages must be between 40 and 100.");const blockW=availW*widthPct/100,blockH=availH*heightPct/100;const scale=Math.min(blockW/(right-left),blockH/(top-bottom)),drawW=(right-left)*scale,drawH=(top-bottom)*scale;
 const blockX=textLeft+(availW-blockW)/2,blockY=bottomReserve+(availH-blockH)/2;const drawY=textAlign==="top"?blockY+blockH-drawH:textAlign==="bottom"?blockY:blockY+(blockH-drawH)/2;page.drawPage(embedded,{x:blockX+(blockW-drawW)/2,y:drawY,width:drawW,height:drawH});
 const guideFont=await out.embedFont(PDFLib.StandardFonts.Helvetica);
 const regions=isV2?[
 ["Instructions",textLeft,H-headerHeight,availW,headerHeight-30],
 ["Corner block",bindingSide==="left"?textLeft+availW+gap:outerMargin,H-headerHeight,sideWidth,headerHeight-30],
 ["Companion",bindingSide==="left"?textLeft+availW+gap:outerMargin,bottomReserve,sideWidth,availH],
 ["Status bar",textLeft,28,availW,26],
 ["Siddur region",textLeft,bottomReserve,availW,availH]
 ]:[["Siddur region",textLeft,bottomReserve,availW,availH]];
 const drawGuides=(target,showText)=>{for(const [name,x,y,w,h] of regions){target.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.32,.52,.67),borderWidth:.7});target.drawText(name,{x:x+3,y:y+h-11,size:8,font:guideFont,color:PDFLib.rgb(.25,.39,.48)});}if(showText)target.drawRectangle({x:blockX+(blockW-drawW)/2,y:drawY,width:drawW,height:drawH,borderColor:PDFLib.rgb(.83,.35,.15),borderWidth:1.1});};

 const blank=await PDFLib.PDFDocument.create(),blankPage=blank.addPage([W,H]),blankFont=await blank.embedFont(PDFLib.StandardFonts.Helvetica);
 for(const [name,x,y,w,h] of regions){blankPage.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.32,.52,.67),borderWidth:.7});blankPage.drawText(name,{x:x+3,y:y+h-11,size:8,font:blankFont,color:PDFLib.rgb(.25,.39,.48)});}
 blankBytes=await blank.save();
 const font=await out.embedFont(PDFLib.StandardFonts.HelveticaBold),fontSize=19,textWidth=font.widthOfTextAtSize(printed,fontSize);
 const finalSide=$("finalside").value;page.drawText(printed,{x:finalSide==="left"?(isV2?outerMargin:margin):W-(isV2?outerMargin:margin)-textWidth,y:H-(isV2?43:margin+21),size:fontSize,font,color:PDFLib.rgb(.78,.1,.12)});
 const productionBytes=await out.save();if($("guides").value==="template")drawGuides(page,true);outputBytes=productionBytes;const previewBytes=await out.save();config={schemaVersion:1,sourcePdfPage:pageNo,printedPageNumber:printed,cropPercent:crop,outputSizePoints:[W,H],marginPoints:margin,layoutGeometryVersion:isV2?"CTI-V2-revised":null,previewMode:$("guides").value,originalLeaf:$("leaf").value.trim(),leafSide:$("leafside").value,bookSide:$("bookside").value,finalBookSide:finalSide,finalPageNumberPlacement:finalSide==="left"?"top-left":"top-right",originalPageNumber:$("originalnumber").value.trim(),originalPageNumberPosition:$("numberedge").value,layoutPreset:layout,companionColumnWidthPoints:sideWidth,companionGapPoints:gap,protectedTextRegionPoints:{x:textLeft,y:bottomReserve,width:availW,height:availH},reservedRegionsPoints:isV2?{topInstructions:{x:textLeft,y:H-headerHeight,width:availW,height:headerHeight-30},cornerBlock:{x:bindingSide==="left"?textLeft+availW+gap:outerMargin,y:H-headerHeight,width:sideWidth,height:headerHeight-30},companionColumn:{x:bindingSide==="left"?textLeft+availW+gap:outerMargin,y:bottomReserve,width:sideWidth,height:availH},bottomStatus:{x:textLeft,y:28,width:availW,height:26}}:null,standardSiddurBlockPoints:{x:blockX,y:blockY,width:blockW,height:blockH},textBlockWidthPercent:widthPct,textBlockHeightPercent:heightPct,textVerticalAlignment:textAlign,actualPlacedTextPoints:{x:blockX+(blockW-drawW)/2,y:drawY,width:drawW,height:drawH},sourceScaleFactor:scale};
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([previewBytes],{type:"application/pdf"}));$("viewer").src=previewUrl;$("viewer").hidden=false;$("download").disabled=false;$("settings").disabled=false;$("blank").disabled=false;$("status").textContent="Preview ready. Verify crop boundaries and printed page number.";
 }catch(err){console.error("Preview failed",err);$("status").textContent="Could not generate preview: "+(err&&err.message?err.message:String(err))}finally{$("preview").disabled=false}});
$("download").addEventListener("click",()=>{if(outputBytes)save(outputBytes,"standardized-page-"+config.sourcePdfPage+".pdf","application/pdf")});
$("settings").addEventListener("click",()=>{if(config)save(JSON.stringify(config,null,2),"standardized-page-"+config.sourcePdfPage+"-settings.json","application/json")});

$("blank").addEventListener("click",()=>{if(blankBytes)save(blankBytes,"leaders-companion-layout-template.pdf","application/pdf")});
