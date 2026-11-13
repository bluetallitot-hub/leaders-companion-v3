(function(root){
"use strict";
function layout({cues=[],side=0,language="",measure,roleColor=()=>"#182c36"}){
 if(typeof measure!=="function")throw Error("Cue layout requires a font measurement function");
 if(cues.length>3)throw Error("Maximum three cues per page");
 const scriptOf=cue=>{
  // Logical boundary text is authoritative. Translations and page language
  // must not override the script of the cue that is actually printed.
  const begin=String(cue.startCue||cue.beginCue||cue.startCueHebrew||"");
  const end=String(cue.endCue||cue.endCueText||cue.endCueHebrew||"");
  const actual=(begin+" "+end).trim();
  const hebrew=(actual.match(/[\u0590-\u05ff]/g)||[]).length;
  const latin=(actual.match(/[A-Za-z]/g)||[]).length;
  if(hebrew>latin)return "hebrew";
  if(latin>hebrew)return "english";
  const explicit=String(cue.cueLanguage||cue.language||"").toLowerCase();
  if(["hebrew","h","he"].includes(explicit))return "hebrew";
  if(["english","e","en"].includes(explicit))return "english";
  return "unknown";
 };
 const textX=side===0?171.36:59.76,boxX=textX+2,boxW=376,boxY=48,boxH=50;
 const left=boxX+8,right=boxX+boxW-8,mid=(left+right)/2;
 const rowH=boxH/Math.max(cues.length,1);
 const rowCenters=cues.map((_,i)=>boxY+boxH-(i+.5)*rowH);
 const safe=t=>String(t||"").replace(/י[\u0591-\u05c7]*ה[\u0591-\u05c7]*ו[\u0591-\u05c7]*ה[\u0591-\u05c7]*/g,"ה׳").trim();
 const width=(t,f)=>measure(safe(t),f);
 const shorten=(value,font,max,removeFirst)=>{
  let words=safe(value).split(/\s+/).filter(Boolean);
  while(words.length>1&&width(words.join(" "),font)>max){if(removeFirst)words.shift();else words.pop();}
  const t=words.join(" ");
  // Never cut within a word. A single overlong word must be reported as
  // overflow rather than silently corrupted in the printed cue.
  if(width(t,font)>max)throw Error("Cue contains a word too wide for the approved field");
  return t;
 };
 return cues.map((cue,i)=>{
  const cueScript=scriptOf(cue);
  if(cueScript==="unknown")throw Error("Cannot determine cue direction from cue text");
  const hebrew=cueScript==="hebrew";
  // Typography varies with cue count; the approved cue box never resizes.
  // A single cue gets the largest practical type, while the established
  // two-/three-cue sizes remain unchanged pending typography approval.
  const font=cues.length===1?28:Math.min(17,Math.max(10,rowH*.58));
  const beginSource=safe(hebrew?(cue.startCueHebrew||cue.startCue||cue.beginCue):(cue.startCue||cue.beginCue||cue.startCueHebrew));
  const endSource=safe(hebrew?(cue.endCueHebrew||cue.endCue||cue.endCueText):(cue.endCue||cue.endCueText||cue.endCueHebrew));
  const beginWords=beginSource.split(/\\s+/).filter(Boolean);
  const endWords=endSource.split(/\\s+/).filter(Boolean);
  // Optimize both phrases together, rather than imposing an arbitrary
  // 148pt maximum on each. Reserve only the arrow clearance and actual
  // padding, then retain the largest total number of whole words.
  const available=right-left-26;
  let best=null;
  for(let bi=1;bi<=beginWords.length;bi++){
   const candidateBegin=beginWords.slice(0,bi).join(" ");
   const bw=width(candidateBegin,font);
   if(bw>available)break;
   for(let ei=1;ei<=endWords.length;ei++){
    const candidateEnd=endWords.slice(-ei).join(" ");
    const ew=width(candidateEnd,font);
    if(bw+ew>available)break;
    const score=bi+ei;
    if(!best||score>best.score||(score===best.score&&bw+ew>best.used))
     best={begin:candidateBegin,end:candidateEnd,score,used:bw+ew};
   }
  }
  if(!best)throw Error("Cue words cannot fit within the approved field");
  const {begin,end}=best;
  const beginW=width(begin,font),endW=width(end,font);
  const beginX=hebrew?right-beginW:left,endX=hebrew?left:right-endW;
  const gapLeft=hebrew?endX+endW:beginX+beginW;
  const gapRight=hebrew?beginX:endX;
  if(gapRight-gapLeft<26)throw Error("Cue text cannot fit with arrow clearance");
  // Row centers are evenly spaced in the immutable strip. Text and arrow
  // share a vertical center, independent of the cue count.
  const lineH=font*1.18;
  // Optical adjustment within the immutable cue rectangle: the previous\n  // rasterized serif text sat visibly above the box center in PDF preview.\n  const y=rowCenters[i]-lineH/2-6;
  const row={begin,end,beginX,endX,beginW,endW,arrowX:(gapLeft+gapRight)/2,
   y,font,rowH,lineH,centerY:rowCenters[i],hebrew,cueLanguage:cueScript,color:roleColor(cue.role||cue.roleId)};
  for(const [x,w] of [[beginX,beginW],[endX,endW]]){
   if(x<left-.001||x+w>right+.001)throw Error("Cue text exceeds approved bounds");
  }
  if(y<boxY-.001||y+lineH>boxY+boxH+.001)throw Error("Cue text exceeds row height");
  return row;
 });
}
root.LCV3CueLayout={layout};
})(typeof globalThis!=="undefined"?globalThis:window);
