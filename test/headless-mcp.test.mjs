import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { root } from '../src/engine.mjs';

test('MCP alone inspects, types, fills, uploads, selects, checks and records headlessly', { timeout: 60000 }, async () => {
  const dir = path.join(root, 'tmp', `headless-flow-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'attachment.txt');
  await writeFile(file, 'MCP file attachment without an OS dialog.');
  const client = new Client({ name: 'headless-workflow-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp.mjs')] }));
  const call = async (name, args) => {
    const response = await client.callTool({ name, arguments: args });
    assert.ok(!response.isError, JSON.stringify(response.content.filter(c => c.type === 'text')));
    return { value: JSON.parse(response.content[0].text), response };
  };
  try {
    const html = '<!doctype html><title>Headless MCP workflow</title><style>body{font:28px system-ui;padding:80px;background:#182638;color:white}input,button,select{font:inherit;margin:15px;padding:10px}</style><h1>Headless MCP workflow</h1><input placeholder="Search text"><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Apply</button><input id="file" type="file" hidden onchange="document.querySelector(\'#attached\').textContent=this.files[0]?.name||\'none\'"><p id="attached">none</p><select id="choice"><option value="a">Alpha</option><option value="b">Beta</option></select><input id="agree" type="checkbox"><output>Waiting</output>';
    const { value: job } = await call('recording_start', { html: html + `<button id="choose" onclick="document.getElementById('file').click()">Attach file</button>`, name: 'headless-mcp-workflow' });
    assert.equal(job.headless, true);
    const first = await call('browser_view', { id: job.id });
    assert.equal(first.response.content[1].type, 'image');
    assert.equal(first.response.content[1].mimeType, 'image/png');
    const input = first.value.elements.find(e => e.name === 'Search text');
    assert.ok(input?.selector);
    assert.equal(first.value.elements.find(e => e.selector === '#file').visible, false);
    const action = async step => call('browser_action', { id: job.id, step });
    await action({ action: 'type', selector: input.selector, text: 'Typed through MCP', delayMs: 20 });
    let view = (await call('browser_view', { id: job.id })).value;
    const typedInput = view.elements.find(e => e.value === 'Typed through MCP');
    assert.ok(typedInput);
    await action({ action: 'fill', selector: typedInput.selector, text: 'Replaced through MCP' });
    const button = view.elements.find(e => e.tag === 'button');
    await action({ action: 'click', selector: button.selector });
    await action({ action: 'upload', selector: '#file', files: [file] });
    await action({ action: 'select', selector: '#choice', values: ['b'] });
    await action({ action: 'check', selector: '#agree', checked: true });
    view = (await call('browser_view', { id: job.id })).value;
    assert.match(view.text, /Replaced through MCP/);
    assert.equal(view.elements.find(e => e.selector === '#file').files[0].name, 'attachment.txt');
    assert.equal(view.elements.find(e => e.selector === '#choice').value, 'b');
    assert.equal(view.elements.find(e => e.selector === '#agree').checked, true);
    await action({ action: 'upload', selector: '#file', files: [], chooser: false });
    view = (await call('browser_view', { id: job.id })).value;
    assert.equal(view.elements.find(e => e.selector === '#file').files.length, 0);
    await action({ action: 'upload', selector: '#choose', files: [file], chooser: true });
    view = (await call('browser_view', { id: job.id })).value;
    assert.equal(view.elements.find(e => e.selector === '#file').files[0].name, 'attachment.txt');
    const scene = JSON.parse(await readFile(path.join(root, 'tmp', job.id, 'scene.json'), 'utf8'));
    assert.equal(scene.headless, true);
    await action({ action: 'zoom', scale: 1.3, durationMs: 800, selector: 'h1' });
    view = (await call('browser_view', { id: job.id })).value;
    assert.ok(view.viewport.scale > 1.2);
    await call('recording_stop', { id: job.id });
    let state;
    for (let i = 0; i < 160; i++) {
      state = (await call('movie_status', { id: job.id })).value;
      if (!['queued', 'running', 'encoding'].includes(state.status)) break;
      await sleep(250);
    }
    assert.equal(state.status, 'completed', JSON.stringify(state));
    const closedView = await client.callTool({ name: 'browser_view', arguments: { id: job.id } });
    assert.equal(closedView.isError, true);
    const { value: cancelled } = await call('recording_start', { html: '<title>Cancel queued inspection</title>' });
    const pendingView = client.callTool({ name: 'browser_view', arguments: { id: cancelled.id } });
    await call('movie_cancel', { id: cancelled.id });
    assert.equal((await pendingView).isError, true);
    console.log(JSON.stringify({ output: state.output, headless: scene.headless, preview: view.preview }));
  } finally { await client.close(); }
});
