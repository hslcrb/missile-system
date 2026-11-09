import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const style=read('styles.css');
const main=read('src/main.js');
const structures=read('src/structures.js');

test('theme toggle and four visual modes are available',()=>{
  assert.match(html,/id="themeBtn"/);
  assert.match(style,/html\[data-theme="light"\]/);
  for(const mode of ['flight','long','self','coast']){
    assert.ok(html.includes('data-mode="'+mode+'"'),'missing '+mode);
  }
  assert.match(main,/localStorage\.setItem\('kinetic-lab-theme'/);
});

test('three imaginary buildings and manual restoration are accessible',()=>{
  for(const index of [0,1,2]){
    assert.ok(html.includes('data-structure="'+index+'"'));
  }
  assert.match(html,/id="restoreStructuresBtn"/);
  assert.match(structures,/InstancedMesh/);
  assert.match(structures,/stepBody/);
});

test('all referenced main.js HTML controls are present',()=>{
  const ids=[...new Set([...main.matchAll(/byId\('([^']+)'\)/g)].map(match=>match[1]))];
  for(const id of ids){
    assert.ok(html.includes('id="'+id+'"'),'missing DOM id '+id);
  }
  assert.ok(ids.length>=30);
});

test('site stays a static bundle and avoids GitHub Actions workflows',()=>{
  assert.match(html,/type="module" src="\.\/src\/main\.js"/);
  assert.ok(!existsSync(new URL('../.github/workflows',import.meta.url)));
  assert.ok(!existsSync(new URL('../functions',import.meta.url)));
});
