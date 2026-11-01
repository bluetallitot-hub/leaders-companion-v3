/* Rivok Hebrew word-det ONNX browser proof of concept. Apache-2.0 model:
   https://huggingface.co/Rivok/paddleocr-hebrew
   Original preprocessing: RivoksLab/paddleocr-hebrew/paddleocr_hebrew/detect.py
   Browser component extraction approximates OpenCV contour/unclip; NOT identical. */
(function(){
"use strict";
const MODEL="https://huggingface.co/Rivok/paddleocr-hebrew/resolve/main/word-det/det.onnx";
let session=null;
async function loadModel(){
 if(!window.ort)throw Error("ONNX Runtime Web did not load.");
 if(!session){
  ort.env.wasm.wasmPaths="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
  session=await ort.InferenceSession.create(MODEL,{executionProviders:["wasm"]});
 }
 return session;
}
function components(mask,w,h){
 const seen=new Uint8Array(mask.length),boxes=[],stack=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const start=y*w+x;
  if(!mask[start]||seen[start])continue;
  seen[start]=1;stack.push(start);
  let minX=x,maxX=x,minY=y,maxY=y,count=0;
  while(stack.length){
   const p=stack.pop(),px=p%w,py=(p/w)|0;count++;
   if(px<minX)minX=px;if(px>maxX)maxX=px;
   if(py<minY)minY=py;if(py>maxY)maxY=py;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const nx=px+dx,ny=py+dy;
    if(nx<0||ny<0||nx>=w||ny>=h)continue;
    const np=ny*w+nx;
    if(mask[np]&&!seen[np]){seen[np]=1;stack.push(np);}
   }
  }
  const bw=maxX-minX+1,bh=maxY-minY+1;
  if(count<3||bw<6||bh<6)continue;
  // Conservative bounding expansion in lieu of OpenCV's polygon unclip.
  const pad=Math.max(1,Math.round(Math.min(bw,bh)*0.18));
  boxes.push([Math.max(0,minX-pad),Math.max(0,minY-pad),Math.min(w,maxX+pad+1),Math.min(h,maxY+pad+1)]);
 }
 return boxes;
}
async function detect(canvas,progress){
 progress?.("Loading Rivok word detector (4.6 MB)…");
 const sess=await loadModel();
 const scale=Math.min(1,1280/Math.max(canvas.width,canvas.height));
 const validW=Math.max(1,Math.floor(canvas.width*scale));
 const validH=Math.max(1,Math.floor(canvas.height*scale));
 const w=Math.ceil(validW/32)*32,h=Math.ceil(validH/32)*32;
 const scratch=document.createElement("canvas");scratch.width=validW;scratch.height=validH;
 const ctx=scratch.getContext("2d",{willReadFrequently:true});ctx.drawImage(canvas,0,0,validW,validH);
 const rgba=ctx.getImageData(0,0,validW,validH).data;
 const input=new Float32Array(3*w*h);
 const mean=[.485,.456,.406],std=[.229,.224,.225],plane=w*h;
 for(let y=0;y<validH;y++)for(let x=0;x<validW;x++){
  const p=(y*validW+x)*4,q=y*w+x;
  for(let c=0;c<3;c++)input[c*plane+q]=(rgba[p+c]/255-mean[c])/std[c];
 }
 progress?.("Running Rivok detector locally in browser…");
 const feeds={[sess.inputNames[0]]:new ort.Tensor("float32",input,[1,3,h,w])};
 const outputs=await sess.run(feeds),out=outputs[sess.outputNames[0]];
 const dims=out.dims;
 if(dims.length!==4||dims[0]!==1||dims[1]!==1)throw Error("Unexpected detector output shape: "+dims.join("×"));
 const oh=dims[2],ow=dims[3],prob=out.data,mask=new Uint8Array(validW*validH);
 for(let y=0;y<validH;y++)for(let x=0;x<validW;x++){
  const py=Math.min(oh-1,Math.floor(y*oh/h)),px=Math.min(ow-1,Math.floor(x*ow/w));
  mask[y*validW+x]=prob[py*ow+px]>.40?1:0;
 }
 const boxes=components(mask,validW,validH).map(b=>b.map((v,i)=>Math.round(v/scale)));
 progress?.("Detected "+boxes.length+" candidate regions. Inspect purple rectangles.");
 return {words:boxes.map(bbox=>({bbox})),imageWidth:canvas.width,imageHeight:canvas.height,
  engine:"Rivok word-det ONNX / browser component approximation",model:MODEL};
}
window.RivokBrowser={detect};
})();