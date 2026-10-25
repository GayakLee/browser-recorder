import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { MovieEngine, animatePage } from '../src/engine.mjs';
import { actionSchema } from '../src/schema.mjs';
const { chromium } = await import('playwright');

test('manual recording survives interrupted startup and subsequent site navigation', { timeout: 60000 }, async () => {
  let slowRequested;
  const requested = new Promise(resolve => { slowRequested = resolve; });
  const server = createServer((req, res) => {
    if (req.url === '/slow') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html><title>Loading</title>');
      slowRequested();
      return;
    }
    res.end('<html><title>Destination</title><h1>Recording continues</h1></html>');
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  const port = server.address().port;
  const originalLaunch = chromium.launch;
  let browser;
  chromium.launch = async function (...args) {
    browser = await originalLaunch.apply(this, args);
    return browser;
  };
  const engine = new MovieEngine();
  let job;
  try {
    job = engine.create({ url: `http://127.0.0.1:${port}/slow`, manual: true, headless: true, actions: [], name: 'navigation-regression' });
    await Promise.race([requested, engine.jobs.get(job.id).done.then(() => { throw new Error(JSON.stringify(engine.status(job.id))); })]);
    const page = browser.contexts()[0].pages()[0];
    await page.waitForURL(`http://127.0.0.1:${port}/slow`, { waitUntil: 'commit' });
    await sleep(200);
    await page.goto(`http://localhost:${port}/destination`);
    await sleep(500);
    assert.equal(engine.status(job.id).status, 'running');
    assert.equal(browser.isConnected(), true);
    await page.goto(`http://127.0.0.1:${port}/second`);
    await sleep(500);
    assert.equal(engine.status(job.id).status, 'running');
    assert.equal(await page.locator('#__movie_cursor').count(), 1);
    await page.evaluate(() => {
      window.zoomSamples = [];
      window.layoutBefore = { width: document.documentElement.clientWidth, heading: document.querySelector('h1').offsetWidth };
      window.sampleTimer = setInterval(() => window.zoomSamples.push(visualViewport.scale), 50);
    });
    await animatePage(page, { action: 'zoom', scale: 1.7, durationMs: 1000 });
    const samples = await page.evaluate(() => { clearInterval(window.sampleTimer); return window.zoomSamples; });
    assert.ok(samples.filter(x => x > 1 && x < 1.7).length >= 5, JSON.stringify(samples));
    assert.deepEqual(await page.evaluate(() => ({ width: document.documentElement.clientWidth, heading: document.querySelector('h1').offsetWidth })), await page.evaluate(() => window.layoutBefore));
    assert.ok(Math.abs(await page.evaluate(() => visualViewport.scale) - 1.7) < 0.01);
    await animatePage(page, { action: 'zoom', scale: 1, durationMs: 800 });
    assert.ok(Math.abs(await page.evaluate(() => visualViewport.scale) - 1) < 0.00001);
    await page.setContent('<style>body{margin:0;width:1920px;height:3000px}#target{position:absolute;left:600px;top:320px;width:80px;height:80px;background:red}</style><div id="target"></div><p style="width:400px">Fixed line wrapping stays fixed during physical zoom.</p>');
    const layout = await page.evaluate(() => ({ width: innerWidth, height: document.querySelector('p').offsetHeight }));
    for (const anchor of [{}, { x: 640, y: 360 }, { selector: '#target' }]) {
      const result = await animatePage(page, { action: 'zoom', scale: 2, durationMs: 800, ...anchor });
      assert.ok(Math.abs(result.actualAnchor.x - result.anchor.x) < 3, JSON.stringify(result));
      assert.ok(Math.abs(result.actualAnchor.y - result.anchor.y) < 3, JSON.stringify(result));
      if (!Object.keys(anchor).length) assert.deepEqual(result.anchor, { x: 960, y: 540 });
      assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: document.querySelector('p').offsetHeight })), layout);
      await animatePage(page, { action: 'zoom', scale: 1, durationMs: 400, ...anchor });
    }
    await assert.rejects(animatePage(page, { action: 'zoom', scale: 2, durationMs: 0, x: 2000, y: 10 }), /inside the visible viewport/);
    await assert.rejects(animatePage(page, { action: 'zoom', scale: 2, durationMs: 0, selector: '#missing' }), /missing or invisible/);
    assert.equal(actionSchema.safeParse({ action: 'zoom', scale: 2, x: 10 }).success, false);
    assert.equal(actionSchema.safeParse({ action: 'zoom', scale: 2, selector: '#target', x: 10, y: 20 }).success, false);
    engine.stop(job.id);
    await engine.jobs.get(job.id).done;
    const result = engine.status(job.id);
    assert.equal(result.status, 'completed', result.error);
    assert.equal(result.final.url, `http://127.0.0.1:${port}/second`);
    assert.ok(result.output.endsWith('.mp4'));
    console.log(JSON.stringify(result));
  } finally {
    if (job) { engine.cancel(job.id); await engine.jobs.get(job.id).done; }
    chromium.launch = originalLaunch;
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
