"use strict";
const $=id=>document.getElementById(id);
let sourceBytes=null,sourceName="",pageCount=0,lastManifest=null;
function parsePages(spec,max){
 const result=[];
 for(const raw of spec.split(",")){
  const token=raw.trim();if(!token)continue;
  const match=token.match(/^(\d+)\s*-\s*(\d+)$/);
  if(match){const a=Number(match[1]),b=Number(match[2]);if(a>b)throw Error("Descending ranges are not supported: "+token);if(b-a>10000)throw Error("Range too large");for(let p=a;p<=b;p++)result.push(p);}
  else if(/^\d+$/.test(token))result.push(Number(token));
  else throw Error("Invalid page selection: "+token);
 }
 if(!result.length)throw Error("Enter at least one page.");
 if(result.some(p=>p<1||p>max))throw Error("Page numbers must be between 1 and "+max+".");
 return result;
}
function download(bytes,name,type){
 const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function slug(s){return s.trim().replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"")||"service"}
$("source").addEventListener("change",async e=>{
 sourceBytes=null;lastManifest=null;pageCount=0;$("extract").disabled=true;$("manifest").disabled=true;$("results").replaceChildren();
 const file=e.target.files[0];if(!file)return;
 try{
  if(!window.PDFLib)throw Error("PDF library failed to load. Check your connection.");
  const bytes=await file.arrayBuffer();const pdf=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false});
  pageCount=pdf.getPageCount();sourceBytes=bytes;sourceName=file.name;
  $("source-info").textContent=file.name+" · "+pageCount+" PDF pages";$("extract").disabled=false;$("status").textContent="";
 }catch(err){$("source-info").textContent="Unable to read PDF: "+err.message;$("status").textContent="";}
});
$("extract").addEventListener("click",async()=>{
 $("extract").disabled=true;$("status").textContent="Generating…";$("results").replaceChildren();
 try{
  const pages=parsePages($("pages").value,pageCount);
  const code=slug($("code").value).toUpperCase(),service=$("service").value.trim();
  if(!service)throw Error("Enter a service name.");
  const source=await PDFLib.PDFDocument.load(sourceBytes),out=await PDFLib.PDFDocument.create();
  const copied=await out.copyPages(source,pages.map(p=>p-1));copied.forEach(p=>out.addPage(p));
  const outputName=code+"-extracted.pdf",manifestName=code+"-page-manifest.json";
  lastManifest={schemaVersion:1,serviceCode:code,serviceName:service,sourceFile:sourceName,outputFile:outputName,pages:pages.map((p,i)=>({workingId:code+"-"+String(i+1).padStart(4,"0"),outputPage:i+1,sourcePdfPage:p,printedSiddurPage:null}))};
  const bytes=await out.save();download(bytes,outputName,"application/pdf");
  $("manifest").disabled=false;$("status").textContent="Created "+pages.length+"-page service PDF. Download the manifest too, to preserve page mapping.";
  const note=document.createElement("p");note.textContent=outputName+" · "+pages.length+" pages";$("results").append(note);
 }catch(err){$("status").textContent="Could not generate PDF: "+err.message;}
 finally{$("extract").disabled=false;}
});
$("manifest").addEventListener("click",()=>{if(lastManifest)download(JSON.stringify(lastManifest,null,2),slug(lastManifest.serviceCode)+"-page-manifest.json","application/json")});
