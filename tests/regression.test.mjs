// Leader's Companion V3 regression checks. Run: node --test tests/regression.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const intake=read('app/html/siddur-intake.html');
const facing=read('app/html/facing-import.html');
const editor=read('app/js/facing-import.js');
test('Facing-page editor JavaScript parses',()=>{new Function(editor)});
test('Visible release versions match',()=>{
 const a=intake.match(/aria-label="Page version"[^>]*>V(\d+\.\d+)/);
 const b=facing.match(/aria-label="Page version"[^>]*>V(\d+\.\d+)/);
 assert.ok(a&&b,'Both screens must display a version');
 assert.equal(a[1],b[1]);
 assert.ok(facing.includes('facing-import.js?v='+b[1]),'Editor cache key must match displayed version');
});
test('Legacy instruction and assembly panels are not visible in Intake',()=>{
 assert.match(intake,/<section class="panel" hidden aria-hidden="true"><h2>8\. Legacy page instructions/);
 assert.match(intake,/<section class="panel" hidden aria-hidden="true"><h2>9\. Legacy assembly controls/);
});
test('Instruction preview and exported PDF both render instructions',()=>{
 assert.match(editor,/function renderInstructionPreviews\(/);
 assert.match(editor,/renderInstructionPreviews\(\);/);
 assert.match(editor,/instructionTextForPage\(instructionState\)/);
 assert.match(editor,/copy\.drawImage\(image,/);
 assert.doesNotMatch(editor,/const printable=line=>/);
});
test('Page approval is checked at export and invalidated by changes',()=>{
 assert.match(editor,/function pageApprovalFingerprint\(/);
 assert.match(editor,/pageApprovalCurrent\(pageMetadata\[side\]\)/);
 assert.match(editor,/Resolve or explicitly override all page warnings before downloading/);
});
test('Progressive Leader Copy exports approved pages in source order',()=>{
 assert.match(editor,/const approved=verifiedWorkingPages\(\)/);
 assert.match(editor,/for\(let j=0;j<approved\.length;j\+\+\)/);
 assert.match(editor,/const \[sourceIndex,record\]=approved\[j\]/);
 assert.match(editor,/source\.getPage\(sourceIndex\)/);
 assert.match(editor,/const crop=record\.production\?\.approvedCrop\|\|detectCrop/);
 assert.match(editor,/page\.drawImage\(image,\{x:pageX,y:pageY,width,height\}\)/);
 assert.match(editor,/await drawApprovedPageFields\(page,record,side,out,font,bold\)/);
});
test('Original PDF bytes are loaded into derived documents, not modified in place',()=>{
 assert.match(editor,/PDFLib\.PDFDocument\.load\(sourcePdfBytes\.slice\(\)\)/);
 assert.match(editor,/out\.copyPages\(original,\[index\]\)/);
});

test('V3.314 cover and section pages are metadata-driven with fixed approved geometry',()=>{
 assert.match(editor,/const V314=\{border:/);
 assert.match(editor,/function v314Blank\(out\)/);
 assert.match(editor,/Software Version: V3\.316/);
 assert.match(editor,/function v314SectionEntries\(approved,section,limit\)/);
 assert.match(editor,/const entries=v314SectionEntries\(approved,nextSection,limit\)/);
 assert.match(editor,/Math\.ceil\(entries\.length\/pageSize\)/);
 assert.doesNotMatch(editor,/async function masterWithFields\(/);
});
test('V3.314 preserves invisible publication bounding boxes',()=>{
 assert.match(editor,/const boxes=\{instructions:/);
 assert.match(editor,/for\(const b of Object\.values\(boxes\)\)wipe/);
 assert.match(editor,/fontSize:12,rtl:/);
});

test('V3.315 cues are multi-row and direction aware',()=>{
 assert.match(editor,/const cues=\(state\.cues\|\|\[\]\)\.slice\(0,3\)/);
 assert.match(editor,/for\(let i=0;i<cues\.length;i\+\+\)/);
 assert.match(editor,/const left=hebrew\?end:begin,right=hebrew\?begin:end/);\n assert.match(editor,/const shortenInside=/);\n assert.match(editor,/page\.drawLine\(\{start:\{x:mid-9,y\}/);
 assert.doesNotMatch(editor,/SAMPLE ONLY/);
});
