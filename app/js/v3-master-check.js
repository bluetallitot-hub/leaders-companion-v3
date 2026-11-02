/* Show a diagnostic only when one or more required PDF templates are missing. */
window.addEventListener("DOMContentLoaded",async()=>{
 const anchor=document.querySelector("main")||document.body;
 if(!window.LCV3Templates){
  const p=document.createElement("p");p.setAttribute("role","alert");p.textContent="PDF template configuration could not be loaded.";anchor.prepend(p);return;
 }
 const results=await window.LCV3Templates.verify();
 const missing=results.filter(item=>!item.ok);
 if(!missing.length)return; // All templates found: no diagnostic panel.
 const section=document.createElement("section");
 section.style.cssText="margin:18px 0;padding:12px;border:1px solid #aebdb8;border-radius:8px";
 const title=document.createElement("h3");title.textContent="Missing PDF templates";section.append(title);
 const summary=document.createElement("p");summary.setAttribute("role","alert");summary.textContent=missing.length+" of "+results.length+" required PDF templates unavailable.";section.append(summary);
 const list=document.createElement("ul");
 for(const item of missing){const li=document.createElement("li");li.textContent=window.LCV3Templates.files[item.key]+" — "+(item.error||"Unavailable");list.append(li)}
 section.append(list);anchor.prepend(section);
});
