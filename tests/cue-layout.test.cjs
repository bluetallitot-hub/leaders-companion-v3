const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../app/js/cue-layout.js"),"utf8");
const context={};vm.runInNewContext(source,context);
const layout=context.LCV3CueLayout.layout;
const measure=(t,f)=>Array.from(t).length*f*.58;
for(const side of [0,1]){
 for(const count of [1,2,3]){
  const cues=Array.from({length:count},(_,i)=>side===0?({startCue:"לכו נרננה",endCue:"עם מרעיתו"}):({startCue:"Come let us sing",endCue:"We are his people",startCueHebrew:"לכו נרננה",endCueHebrew:"עם מרעיתו"}));
  const rows=layout({cues,side,language:side===0?"he":"en",measure});
  assert.equal(rows.length,count);
  assert.ok(Math.abs(rows[0].rowH-50/count)<1e-8);
  for(const r of rows){
   assert.equal(r.hebrew,side===0);
   assert.ok(r.beginX>=0&&r.endX>=0);
   assert.ok(r.y>=48&&r.y+r.font*1.3<=98.001);
   assert.ok(side===0?r.beginX>r.endX:r.beginX<r.endX);
   const trailing=side===0?r.endX+r.endW:r.beginX+r.beginW;
   const leading=side===0?r.beginX:r.endX;
   assert.ok(Math.abs(r.arrowX-(trailing+leading)/2)<1e-8);
  }
  if(count===1)assert.ok(Math.abs((rows[0].y+rows[0].font*1.3/2)-73)<1e-8);
 }
}
const long=layout({cues:[{startCue:"A very very very very very very long beginning phrase",endCue:"An exceptionally very very very long ending phrase"}],side:1,language:"en",measure});
assert.ok(long[0].begin.length<52);
assert.ok(long[0].arrowX>long[0].beginX+long[0].beginW);
assert.equal(layout({cues:[],side:0,measure}).length,0);
assert.throws(()=>layout({cues:Array(4).fill({}),measure}),/Maximum three/);
const mixed=layout({cues:[
 {startCue:"ברוך אתה",endCue:"להדליק נר",cueLanguage:"english"},
 {startCue:"Light the candles",endCue:"Blessed are You",startCueHebrew:"ברוך",cueLanguage:"hebrew"}
],side:0,language:"hebrew",measure});
assert.equal(mixed[0].hebrew,true,"Hebrew cue remains RTL even with incorrect metadata");
assert.equal(mixed[1].hebrew,false,"English cue remains LTR on Hebrew page");
assert.equal(mixed[0].cueLanguage,"hebrew");
assert.equal(mixed[1].cueLanguage,"english");
console.log("Cue layout: 6 Hebrew/English × row-count cases, bounds, arrow midpoint, centering and shortening PASS");
