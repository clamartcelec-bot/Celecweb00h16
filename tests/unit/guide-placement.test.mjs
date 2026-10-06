import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const source = ts.transpileModule(readFileSync(new URL('../../src/experience/guidePlacement.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { guidePlacement, ROBOT_RATIO } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sizes = [[320,568],[390,844],[768,600],[1440,900],[812,375],[360,260],[1440,500]];
function contained(p, w, h, top = 0, left = 0) {
  assert.ok(p.x >= left && p.x + p.width <= left + w, `horizontal ${JSON.stringify(p)}`);
  assert.ok(p.y >= top && p.y + p.width * ROBOT_RATIO + 36 <= top + h, `vertical ${JSON.stringify(p)}`);
}
test('robot and call controls remain inside every viewport throughout scrolling', () => {
  for (const [w,h] of sizes) for (const embedded of [true,false]) {
    const initialTop = w <= 760 ? 660 : 500;
    for (let scrollY = 0; scrollY <= 1200; scrollY += 10) {
      const anchor = {left:20,top:initialTop-scrollY,width:w<=760?200:270,height:225,bottom:initialTop-scrollY+225};
      contained(guidePlacement({viewportWidth:w,viewportHeight:h,headerBottom:80,scrollY,embedded,anchor}),w,h);
    }
  }
});
test('off-screen hero starts near header and descends continuously to the dock', () => {
  let previous;
  for (let scrollY = 0; scrollY <= 900; scrollY += 1) {
    const p = guidePlacement({viewportWidth:390,viewportHeight:568,headerBottom:80,scrollY,embedded:true,anchor:{left:20,top:660-scrollY,width:200,height:166,bottom:826-scrollY}});
    if (!previous) { assert.equal(p.mode,'compact'); assert.equal(p.y,92); }
    else { assert.ok(p.y >= previous.y); assert.ok(Math.abs(p.y-previous.y)<4); }
    previous=p;
  }
  assert.equal(previous.mode,'docked');
});
test('large first screen preserves integrated hero size and position', () => {
  const p=guidePlacement({viewportWidth:1440,viewportHeight:900,headerBottom:80,scrollY:0,embedded:true,anchor:{left:700,top:500,width:270,height:225,bottom:725}});
  assert.equal(p.mode,'hero'); assert.equal(p.width,270); assert.equal(p.x,700); assert.equal(p.y,500);
});
test('presentation and keyboard visual viewport keep robot and controls accessible', () => {
  for(const [w,h] of sizes) contained(guidePlacement({viewportWidth:w,viewportHeight:h,viewportTop:120,viewportLeft:30,headerBottom:150,scrollY:800,embedded:true,stage:{left:w-70,top:150,width:700,height:300,bottom:450}}),w,h,120,30);
});
