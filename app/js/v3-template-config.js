/* V3 PDF masters live at repository root /templates/. */
window.LCV3Templates=Object.freeze({
 base:new URL("../../templates/pdf/",document.baseURI).href,
 files:Object.freeze({
  siddur:"Leaders_Companion_V3_Master_Template_v1.4_Clean_Original_Geometry.pdf",
  cover:"Leaders_Companion_V3_Master_Cover_Template_v1.2_BW_Bordered.pdf",
  sectionTitle:"Leaders_Companion_V3_Section_Title_Master_v1.0.pdf",
  sectionContents:"Leaders_Companion_V3_Section_Contents_Master_v1.0.pdf"
 }),
 async load(key){const name=this.files[key];if(!name)throw Error("Unknown master: "+key);const url=new URL(name,this.base);const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw Error("Missing PDF master "+name+" ("+response.status+")");const bytes=new Uint8Array(await response.arrayBuffer());if(String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")throw Error("Invalid PDF master "+name);return bytes},
 async verify(){return Promise.all(Object.keys(this.files).map(async key=>{try{await this.load(key);return {key,ok:true}}catch(e){return {key,ok:false,error:e.message}}}))}
});
