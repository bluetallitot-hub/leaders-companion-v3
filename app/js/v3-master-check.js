/* Diagnose master availability without changing the existing PDF production pipeline. */
window.addEventListener("DOMContentLoaded",async()=>{
 const section=document.createElement("section");section.style.cssText="margin:18px 0;padding:12px;border:1px solid #aebdb8;border-radius:8px";
 section.innerHTML='<h3>V3 PDF master files</h3><p id="v3-master-status" role="status">Checking repository templates…</p><ul id="v3-master-results"></ul>';
 const anchor=document.querySelector("main")||document.body;anchor.prepend(section);
 const status=section.querySelector("#v3-master-status"),list=section.querySelector("#v3-master-results");
 if(!window.LCV3Templates){status.textContent="Master configuration failed to load.";return}
 const results=await window.LCV3Templates.verify();
 for(const item of results){const li=document.createElement("li");li.textContent=(item.ok?"Available: ":"Missing: ")+window.LCV3Templates.files[item.key]+(item.error?" — "+item.error:"");list.append(li)}
 const missing=results.filter(r=>!r.ok);status.textContent=missing.length?missing.length+" of "+results.length+" master PDFs unavailable. Generated-page assembly is not enabled.": "All four PDF masters found. Generated-page assembly is not yet enabled.";
});
