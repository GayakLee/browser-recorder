import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { root } from '../src/engine.mjs';

test('double-click EXE path opens a headed browser and saves manual interaction', { skip: process.platform !== 'win32' || !(process.env.BROWSER_RECORDER_HEADED_TEST || process.env.BROWSER_RECORD_HEADED_TEST), timeout: 45000 }, async () => {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools', 'build-launcher.ps1')], { windowsHide: true });
  const dir = path.join(root, 'tmp', `headed-launcher-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const ready = path.join(dir, 'ready.json');
  const hook = path.join(dir, 'launch-hook.mjs');
  const fixture = '<!doctype html><title>Visible launcher recording test</title><style>body{font:28px system-ui;padding:80px;background:#182638;color:white}input,button{font:inherit;padding:15px}</style><h1>Visible browser recording</h1><input id="text"><button id="apply" onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Apply</button><output></output>';
  // The real executable receives no arguments, exactly like double-clicking it.
  // Test-only instrumentation replaces the startup site with a deterministic page.
  await writeFile(hook, `
    import ${JSON.stringify(pathToFileURL(path.join(root, 'src', 'engine.mjs')).href)};
    import { writeFile } from 'node:fs/promises';
    const { chromium } = await import('playwright');
    const launch = chromium.launch.bind(chromium);
    chromium.launch = async options => {
      const browser = await launch(options);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async settings => {
        const context = await newContext(settings);
        await context.route('https://example.com/**', route => route.fulfill({contentType:'text/html',body:${JSON.stringify(fixture)}}));
        context.on('page', page => page.once('domcontentloaded', () => {
          void (async () => {
            await page.locator('#text').pressSequentially('Recorded in a visible window', {delay:25});
            await page.locator('#apply').click();
            await page.waitForTimeout(500);
            await writeFile(${JSON.stringify(ready)}, JSON.stringify({headless:options.headless,text:await page.locator('output').innerText()}));
          })().catch(error => writeFile(${JSON.stringify(ready)},JSON.stringify({error:error.message})));
        }));
        return context;
      };
      return browser;
    };
  `);
  const child = spawn(path.join(root, 'browser-recorder.exe'), [], { cwd: path.dirname(root), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(hook).href}` } });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  try {
    let observation;
    for (let i = 0; i < 100; i++) {
      try { observation = JSON.parse(await readFile(ready, 'utf8')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (child.exitCode !== null) throw new Error(stdout + stderr);
      await sleep(150);
    }
    assert.ok(observation, 'Visible recording did not become ready');
    assert.equal(observation.error, undefined);
    assert.equal(observation.headless, false);
    assert.equal(observation.text, 'Recorded in a visible window');
    child.stdin.end('\n');
    assert.equal(await closed, 0, stdout + stderr);
    const state = JSON.parse(stdout);
    assert.equal(state.status, 'completed', JSON.stringify(state));
    assert.equal(state.headless, false);
    assert.equal(state.final.title, 'Visible launcher recording test');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate', '-show_entries', 'format=duration', '-of', 'json', state.output], { encoding: 'utf8' }));
    assert.deepEqual([probe.streams[0].codec_name, probe.streams[0].width, probe.streams[0].height, probe.streams[0].avg_frame_rate], ['h264', 1920, 1080, '30/1']);
    assert.ok(Number(probe.format.duration) > 1);
    console.log(JSON.stringify({ output: state.output, headless: state.headless, preview: state.preview }));
  } finally {
    if (child.exitCode === null) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
});
