"use strict";
const $=id=>document.getElementById(id);let sourceBytes=null,pageCount=0,outputBytes=null,previewUrl=null,config=null;
const numeric=id=>Number($(id).value);
function save(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
$("source").addEventListener("change",async e=>{sourceBytes=null;outputBytes=null;$("preview").disabled=true;$("download").disabled=true;$("settings").disabled=true;const file=e.target.files[0];if(!file)return;try{if(!window.PDFLib)throw Error("PDF library unavailable");const bytes=await file.arrayBuffer(),pdf=await PDFLib.PDFDocument.load(bytes);pageCount=pdf.getPageCount();sourceBytes=bytes;$("source-info").textContent=file.name+" · "+pageCount+" physical pages";$("page").max=pageCount;$("preview").disabled=false;$("status").textContent="Ready."}catch(err){$("source-info").textContent="Unable to load PDF: "+err.message}});
$("preview").addEventListener("click",async()=>{outputBytes=null;$("download").disabled=true;$("settings").disabled=true;$("preview").disabled=true;$("status").textContent="Rendering…";try{
 const pageNo=numeric("page");if(!Number.isInteger(pageNo)||pageNo<1||pageNo>pageCount)throw Error("Select a valid physical PDF page.");
 const printed=$("printed").value.trim();if(!printed||!/^[\x20-\x7E]+$/.test(printed))throw Error("Enter a printable page number using standard characters.");
 const crop={left:numeric("left"),right:numeric("right"),top:numeric("top"),bottom:numeric("bottom")};
 if(Object.values(crop).some(v=>!Number.isFinite(v)||v<0||v>95)||crop.left+crop.right>=95||crop.top+crop.bottom>=95)throw Error("Crop settings leave too little page area.");
 const margin=numeric("margin");if(!Number.isFinite(margin)||margin<0||margin>150)throw Error("Invalid margin.");
 const [W,H]=$("size").value.split(",").map(Number),src=await PDFLib.PDFDocument.load(sourceBytes),original=src.getPage(pageNo-1);
 const sw=original.getWidth(),sh=original.getHeight(),left=sw*crop.left/100,right=sw*(1-crop.right/100),bottom=sh*crop.bottom/100,top=sh*(1-crop.top/100);
 const out=await PDFLib.PDFDocument.create(),embedded=await out.embedPage(original,{left,bottom,right,top}),page=out.addPage([W,H]);
 const layout=$("layout").value,sideWidth=layout==="full"?0:numeric("sidewidth");if(!Number.isFinite(sideWidth)||sideWidth<0||sideWidth>220)throw Error("Invalid companion column width.");const gap=sideWidth?10:0,headerHeight=42,availW=W-2*margin-sideWidth-gap,availH=H-2*margin-headerHeight;
 if(availW<=0||availH<=0)throw Error("Margins leave no room for content.");
 const scale=Math.min(availW/(right-left),availH/(top-bottom)),drawW=(right-left)*scale,drawH=(top-bottom)*scale;
 const textLeft=margin+(layout==="leader"?sideWidth+gap:0);page.drawPage(embedded,{x:textLeft+(availW-drawW)/2,y:margin+(availH-drawH)/2,width:drawW,height:drawH});
 const font=await out.embedFont(PDFLib.StandardFonts.HelveticaBold),fontSize=19,textWidth=font.widthOfTextAtSize(printed,fontSize);
 const finalSide=$("finalside").value;page.drawText(printed,{x:finalSide==="left"?margin:W-margin-textWidth,y:H-margin-21,size:fontSize,font,color:PDFLib.rgb(.78,.1,.12)});
 outputBytes=await out.save();config={schemaVersion:1,sourcePdfPage:pageNo,printedPageNumber:printed,cropPercent:crop,outputSizePoints:[W,H],marginPoints:margin,originalLeaf:$("leaf").value.trim(),leafSide:$("leafside").value,bookSide:$("bookside").value,finalBookSide:finalSide,finalPageNumberPlacement:finalSide==="left"?"top-left":"top-right",originalPageNumber:$("originalnumber").value.trim(),originalPageNumberPosition:$("numberedge").value,layoutPreset:layout,companionColumnWidthPoints:sideWidth,companionGapPoints:gap,protectedTextRegionPoints:{x:textLeft,y:margin,width:availW,height:availH}};
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([outputBytes],{type:"application/pdf"}));$("viewer").src=previewUrl;$("viewer").hidden=false;$("download").disabled=false;$("settings").disabled=false;$("status").textContent="Preview ready. Verify crop boundaries and printed page number.";
 }catch(err){$("status").textContent="Could not generate preview: "+err.message}finally{$("preview").disabled=false}});
$("download").addEventListener("click",()=>{if(outputBytes)save(outputBytes,"standardized-page-"+config.sourcePdfPage+".pdf","application/pdf")});
$("settings").addEventListener("click",()=>{if(config)save(JSON.stringify(config,null,2),"standardized-page-"+config.sourcePdfPage+"-settings.json","application/json")});
