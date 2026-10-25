import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { root } from '../src/engine.mjs';
import path from 'node:path';
test('MCP records input/click/scroll, exports video, cancels and recovers', { timeout: 120000 }, async () => {
  const client = new Client({ name: 'browser-recorder-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: 'node', args: [path.join(root, 'mcp.mjs')] }));
  assert.equal(client.getServerVersion().name, 'browser-recorder');
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result)); return JSON.parse(result.content[0].text);
  };
  const wait = async id => {
    for (let i = 0; i < 200; i++) {
      const state = await call('movie_status', { id });
      if (!['queued', 'running', 'encoding'].includes(state.status)) return state;
      await sleep(250);
    }
    throw new Error('Recording timed out');
  };
  try {
    const tools = await client.listTools(); assert.equal(tools.tools.length, 7);
    const invalid = await client.callTool({ name: 'movie_create', arguments: { html: '<html></html>', actions: [{ action: 'shell', command: 'test' }] } });
    assert.equal(invalid.isError, true);
    const cancelled = await call('recording_start', { html: '<input id="x">' });
    await call('movie_cancel', { id: cancelled.id });
    assert.equal((await wait(cancelled.id)).status, 'cancelled');
    const spec = JSON.parse(await readFile(path.join(root, 'examples', 'demo.json'), 'utf8'));
    spec.name = 'mcp-browser-demo';
    const job = await call('recording_start', { ...spec, actions: [], headless: true });
    const busy = await client.callTool({ name: 'movie_create', arguments: spec }); assert.equal(busy.isError, true);
    for (const step of spec.actions) await call('browser_action', { id: job.id, step });
    await call('recording_stop', { id: job.id });
    const state = await wait(job.id);
    assert.equal(state.status, 'completed', state.error);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',state.output], { encoding: 'utf8' }));
    const video = probe.streams.find(s => s.codec_type === 'video');
    assert.deepEqual([video.codec_name, video.width, video.height, video.avg_frame_rate], ['h264',1920,1080,'30/1']);
    assert.ok(Number(probe.format.duration) > 5);
    console.log(JSON.stringify({ output: state.output, preview: state.preview, duration: probe.format.duration }));
  } finally { await client.close(); }
});
