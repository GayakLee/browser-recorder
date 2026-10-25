import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { root, browserPath, animatePage, encode } from '../src/engine.mjs';
const { chromium } = await import('playwright');

test('physical zoom keeps its anchor steady throughout continuous motion', { timeout: 30000 }, async () => {
  const dir = path.join(root, 'tmp', `zoom-motion-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: browserPath() });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir, size: { width: 1920, height: 1080 }, fps: 30 } });
    const page = await context.newPage();
    await page.setContent('<style>body{margin:0;height:3000px;background:#182638}#target{position:absolute;left:900px;top:500px;width:120px;height:80px;background:#fa3040}</style><div id="target"></div>');
    await page.evaluate(() => {
      window.motionSamples = [];
      window.sampleMotion = true;
      const frame = t => {
        const v = visualViewport;
        window.motionSamples.push({ t, scale: v.scale, x: (960 - v.pageLeft) * v.scale, y: (540 - v.pageTop) * v.scale });
        if (window.sampleMotion) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await sleep(300);
    for (const scale of [2, 1]) {
      await animatePage(page, { action: 'zoom', scale, durationMs: 1800, x: 960, y: 540 });
      await sleep(200);
    }
    const samples = await page.evaluate(() => { window.sampleMotion = false; return window.motionSamples; });
    const changes = samples.filter((s, i) => i && Math.abs(s.scale - samples[i - 1].scale) > 0.000001);
    const gaps = changes.slice(1).map((s, i) => s.t - changes[i].t).filter(ms => ms < 400).sort((a, b) => a - b);
    const maxAnchorError = Math.max(...samples.map(s => Math.hypot(s.x - 960, s.y - 540)));
    const p95GapMs = gaps[Math.floor(gaps.length * 0.95)];
    const report = { scaleUpdates: changes.length, maxAnchorError, p95GapMs };
    await writeFile(path.join(dir, 'motion.json'), JSON.stringify({ report, samples }, null, 2));
    assert.ok(changes.length >= 80, JSON.stringify(report));
    assert.ok(p95GapMs < 60, JSON.stringify(report));
    assert.ok(maxAnchorError < 4, JSON.stringify(report));
    const video = page.video();
    await context.close();
    await encode(await video.path(), path.join(dir, 'motion.mp4'), { fps: 30, width: 1920, height: 1080 }, new AbortController().signal);
    const frames = execFileSync('ffmpeg', ['-v', 'error', '-threads', '2', '-filter_threads', '2', '-i', path.join(dir, 'motion.mp4'), '-vf', 'scale=480:270', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 128 * 1024 * 1024 });
    const masses = [];
    const frameSize = 480 * 270 * 3;
    // Integrate marker color instead of measuring JPEG/chroma-subsampled hard edges.
    for (let offset = 0; offset + frameSize <= frames.length; offset += frameSize) {
      let mass = 0;
      for (let y = 50; y < 220; y++) for (let x = 140; x < 340; x++) {
        const pixel = offset + (y * 480 + x) * 3;
        mass += Math.max(0, frames[pixel] - Math.max(frames[pixel + 1], frames[pixel + 2]));
      }
      masses.push(mass);
    }
    let activeFrames = 0, changingFrames = 0;
    for (let i = 1; i < masses.length; i++) if (masses[i] > 150000 && masses[i] < 390000) {
      activeFrames++;
      if (Math.abs(masses[i] - masses[i - 1]) > 1500) changingFrames++;
    }
    assert.ok(activeFrames >= 50, `Insufficient motion in encoded video: ${activeFrames}`);
    assert.ok(changingFrames / activeFrames >= 0.85, JSON.stringify({ activeFrames, changingFrames }));
    await writeFile(path.join(dir, 'encoded-motion.json'), JSON.stringify({ activeFrames, changingFrames, masses }, null, 2));
    console.log(JSON.stringify({ activeFrames, changingFrames }));
    console.log(JSON.stringify({ ...report, video: path.join(dir, 'motion.mp4') }));
  } finally { await browser.close(); }
});
