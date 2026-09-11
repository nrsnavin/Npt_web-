import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let Modal, Field, Notice, root, dom, temporary;
test.before(async () => {
  temporary=await mkdtemp(path.resolve('.ui-test-'));
  const outfile=path.join(temporary,'components.mjs');
  await build({entryPoints:['src/components/ui.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile});
  ({Modal,Field,Notice}=await import(pathToFileURL(outfile)));
  dom=new JSDOM('<!doctype html><body><button id="launch">Launch</button><div id="root"></div></body>',{pretendToBeVisual:true});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  // jsdom has no layout engine; visible controls receive a nonempty rectangle in this behavior test.
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};
  root=createRoot(document.getElementById('root'));
});
test.after(async()=>{await act(async()=>root.unmount());dom.window.close();await rm(temporary,{recursive:true,force:true});});

test('dialog names itself, contains keyboard focus, closes with Escape and restores focus',async()=>{
  let closed=0;const launch=document.getElementById('launch');launch.focus();
  await act(async()=>root.render(React.createElement(Modal,{open:true,title:'Edit customer',onClose:()=>closed++},React.createElement('input',{'aria-label':'Company'}),React.createElement('button',null,'Save'))));
  const dialog=document.querySelector('[role="dialog"]');assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'Edit customer');
  const first=dialog.querySelector('button');const last=[...dialog.querySelectorAll('button')].at(-1);
  assert.equal(document.activeElement,first);last.focus();document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(document.activeElement,first);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(document.activeElement,last);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(closed,1);
  await act(async()=>root.render(null));assert.equal(document.activeElement,launch);assert.equal(document.body.style.overflow,'');
});

test('field errors are associated with the input and notices are announced',async()=>{
  await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(Field,{label:'Amount',error:'Enter an amount'},React.createElement('input',{type:'number'})),React.createElement(Notice,null,'Save failed'))));
  const input=document.querySelector('input');assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(document.getElementById(input.getAttribute('aria-describedby')).textContent,'Enter an amount');assert.equal(document.querySelectorAll('[role="alert"]').length,2);
});
