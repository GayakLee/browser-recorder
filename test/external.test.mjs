import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { root } from '../src/engine.mjs';

test('external sites retain MCP recording through smooth zoom and scroll', { skip: !(process.env.BROWSER_RECORDER_EXTERNAL_TEST || process.env.BROWSER_RECORD_EXTERNAL_TEST || process.env.BROWSER_MOVIE_EXTERNAL_TEST), timeout: 180000 }, async () => {
  const client = new Client({ name: 'external-navigation-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: 'node', args: [path.join(root, 'mcp.mjs')] }));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  try {
    const job = await call('recording_start', { url: 'https://www.python.org/', headless: true, name: 'external-sites-smooth' });
    const actions = [
      { action: 'wait', durationMs: 1200 },
      { action: 'goto', url: 'https://www.python.org/about/' },
      { action: 'wait', durationMs: 1800 },
      { action: 'zoom', scale: 1.5, durationMs: 1800, selector: '.python-logo' },
      { action: 'wait', durationMs: 700 },
      { action: 'scroll', y: 650, durationMs: 1800 },
      { action: 'zoom', scale: 1, durationMs: 1800 },
      { action: 'goto', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
      { action: 'wait', durationMs: 1800 },
      { action: 'zoom', scale: 1.4, durationMs: 1800, x: 900, y: 400 },
      { action: 'scroll', y: 700, durationMs: 2000 },
      { action: 'zoom', scale: 1, durationMs: 1800 },
      { action: 'wait', durationMs: 1000 },
    ];
    for (const step of actions) await call('browser_action', { id: job.id, step });
    await call('recording_stop', { id: job.id });
    let state;
    for (let i = 0; i < 600; i++) {
      state = await call('movie_status', { id: job.id });
      if (!['queued', 'running', 'encoding'].includes(state.status)) break;
      await sleep(250);
    }
    assert.equal(state.status, 'completed', JSON.stringify(state));
    const log = JSON.parse(await readFile(path.join(root, 'tmp', job.id, 'actions.json'), 'utf8'));
    assert.match(log[0].title, /Python/);
    assert.match(log[2].title, /Python/);
    assert.match(log[8].title, /JavaScript.*MDN/);
    assert.equal(log.length, actions.length);
    assert.ok(log.every(step => step.completedAt));
    for (const step of [log[3], log[9]]) {
      assert.ok(Math.abs(step.zoom.anchor.x - step.zoom.actualAnchor.x) < 3, JSON.stringify(step));
      assert.ok(Math.abs(step.zoom.anchor.y - step.zoom.actualAnchor.y) < 3, JSON.stringify(step));
    }
    console.log(JSON.stringify({ ...state, visited: [log[0], log[2], log[8]] }));
  } finally { await client.close(); }
});
