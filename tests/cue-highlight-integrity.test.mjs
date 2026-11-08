import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/js/facing-import.js",import.meta.url),"utf8");
test("manual word and line highlights carry selected cue identity",()=>{
 assert.match(source,/highlightId:"HL-"\+\(activeCueId\|\|"unassigned"\)\+"-"\+word\.id,cueId:activeCueId/);
 assert.match(source,/highlightId:"HL-"\+\(activeCueId\|\|"unassigned"\)\+"-"\+item\.id,cueId:activeCueId/);
});
test("selection and removal are scoped to active cue",()=>{
 assert.match(source,/h\.cueId===activeCueId&&!h\.manualApproved&&overlap\(h\)/);
 assert.match(source,/h\.cueId===activeCueId&&h\.wordId===item\.id/);
 assert.match(source,/h\.cueId===activeCueId&&!h\.wordId&&h\.lineId===item\.id/);
});
test("manual editing invalidates page approval",()=>{
 assert.match(source,/pageMetadata\[i\]\.leadership\.highlightConfirmed=false;\s*pageMetadata\[i\]\.leadership\.confirmedFingerprint=null;/);
});
