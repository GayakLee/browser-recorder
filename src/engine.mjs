import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { movieSchema } from './schema.mjs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const local = JSON.parse(await readFile(path.join(root, 'runtime.local.json'), 'utf8'));
  if (local.browserCache) process.env.PLAYWRIGHT_BROWSERS_PATH ||= local.browserCache;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const { chromium } = await import('playwright');

export function browserPath() {
  if (process.env.BROWSER_RECORDER_CHROMIUM) return process.env.BROWSER_RECORDER_CHROMIUM;
  if (process.env.BROWSER_RECORD_CHROMIUM) return process.env.BROWSER_RECORD_CHROMIUM;
  if (process.env.BROWSER_MOVIE_CHROMIUM) return process.env.BROWSER_MOVIE_CHROMIUM;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const cache = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (existsSync(cache)) {
    for (const name of readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a,b) => Number(b.split('-')[1])-Number(a.split('-')[1]))) {
      const candidate = path.join(cache, name, 'chrome-win64', 'chrome.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('Chromium not found. Set BROWSER_RECORDER_CHROMIUM or install Playwright Chromium.');
}

export async function encode(input, output, spec, signal) {
  const args = ['-hide_banner', '-loglevel', 'warning', '-filter_threads', '2', '-nostdin', '-i', input];
  if (spec.audioPath) { await access(spec.audioPath); args.push('-i', path.resolve(spec.audioPath)); }
  args.push('-map', '0:v:0');
  if (spec.audioPath) args.push('-map', '1:a:0', '-af', 'apad', '-shortest', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k');
  else args.push('-an');
  args.push('-vf', `fps=${spec.fps},scale=${spec.width}:${spec.height}:flags=lanczos,setsar=1`, '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-n', output);
  const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true, signal });
  let log = ''; child.stderr.on('data', chunk => { log = (log + chunk).slice(-8000); });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`FFmpeg failed (${code}): ${log}`);
}

export class MovieEngine {
  jobs = new Map();
  create(input) {
    const spec = movieSchema.parse(input);
    if (spec.width % 2 || spec.height % 2) throw new Error('Width and height must be even for H.264.');
    if ([...this.jobs.values()].some(j => ['queued', 'running', 'encoding'].includes(j.status))) throw new Error('A movie is already running.');
    const id = randomUUID();
    const job = { id, status: 'queued', step: 0, createdAt: new Date().toISOString(), controller: new AbortController(), queue: [], manual: spec.manual, headless: spec.headless, fps: spec.fps, zoomDurationMs: spec.zoomDurationMs, framePacing: spec.framePacing, stopping: false };
    this.jobs.set(id, job);
    job.done = this.run(job, spec).catch(error => { job.status = job.controller.signal.aborted ? 'cancelled' : 'failed'; job.error = error.message; }).finally(async () => {
      for (const pending of job.queue.splice(0)) pending.reject?.(new Error(job.error || 'Recording has ended'));
      job.finishedAt = new Date().toISOString();
      await writeFile(path.join(root, 'tmp', id, 'result.json'), JSON.stringify(this.status(id), null, 2)).catch(() => {});
    });
    return this.status(id);
  }
  status(id) {
    const job = this.jobs.get(id); if (!job) throw new Error('Unknown movie id');
    const { controller, done, queue, wake, stopping, ...publicJob } = job; return publicJob;
  }
  cancel(id) {
    const job = this.jobs.get(id); if (!job) throw new Error('Unknown movie id');
    if (['queued', 'running', 'encoding'].includes(job.status)) { job.controller.abort(); job.wake?.(); }
    return this.status(id);
  }
  action(id, input) {
    const job = this.jobs.get(id);
    if (!job?.manual || !['queued', 'running'].includes(job.status) || job.stopping) throw new Error('No interactive recording is accepting actions');
    const action = movieSchema.parse({ html: '<html></html>', actions: [input] }).actions[0];
    if (job.queue.length >= 200) throw new Error('Too many queued actions');
    job.queue.push(action); job.wake?.(); return this.status(id);
  }
  stop(id) {
    const job = this.jobs.get(id); if (!job?.manual) throw new Error('Not an interactive recording');
    job.stopping = true; job.wake?.(); return this.status(id);
  }
  view(id) {
    const job = this.jobs.get(id);
    if (!job?.manual || !['queued', 'running'].includes(job.status) || job.stopping) throw new Error('No interactive recording is available to inspect');
    if (job.queue.length >= 200) throw new Error('Too many queued actions');
    return new Promise((resolve, reject) => {
      job.queue.push({ action: '__view', resolve, reject }); job.wake?.();
    });
  }
  async *steps(job, spec) {
    yield* spec.actions;
    while (spec.manual) {
      job.controller.signal.throwIfAborted();
      if (job.queue.length) { yield job.queue.shift(); continue; }
      if (job.stopping) return;
      await new Promise(resolve => {
        const wake = () => { job.controller.signal.removeEventListener('abort', wake); resolve(); };
        job.wake = wake; job.controller.signal.addEventListener('abort', wake, { once: true });
      });
      job.wake = undefined;
    }
  }
  async run(job, spec) {
    const dir = path.join(root, 'tmp', job.id);
    await mkdir(dir, { recursive: true }); await mkdir(path.join(root, 'outputs'), { recursive: true });
    await writeFile(path.join(dir, 'scene.json'), JSON.stringify(spec, null, 2));
    const signal = job.controller.signal;
    const timeout = setTimeout(() => job.controller.abort(new Error('Movie exceeds five minute limit')), 300000);
    let browser;
    try {
      signal.throwIfAborted(); job.status = 'running';
      const unlimited = spec.framePacing === 'unlimited' || (spec.framePacing === 'auto' && spec.fps >= 60);
      job.effectiveFramePacing = unlimited ? 'unlimited' : 'display';
      browser = await chromium.launch({ headless: spec.headless, executablePath: browserPath(), args: unlimited ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [] });
      const abort = () => { void browser.close().catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: 'dark', recordVideo: { dir, size: { width: spec.width, height: spec.height }, fps: spec.fps } });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('dialog', dialog => void dialog.dismiss());
      if (spec.cursor) {
        await context.addInitScript(() => {
          const mount = () => { const el = document.createElement('div'); el.id = '__movie_cursor'; el.style.cssText = 'position:fixed;left:24px;top:24px;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #6c5ce7;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 5px #6c5ce733'; document.documentElement.appendChild(el); addEventListener('mousemove', e => { el.style.left = `${e.clientX-9}px`; el.style.top = `${e.clientY-9}px`; }); };
          if (document.documentElement) mount(); else addEventListener('DOMContentLoaded', mount, { once: true });
        });
      }
      const navigate = async url => {
        try { await page.goto(url, { waitUntil: 'domcontentloaded' }); }
        catch (error) {
          signal.throwIfAborted();
          if (!spec.manual || page.isClosed() || !browser.isConnected()) throw error;
          // A user navigation can interrupt goto; keep the manual recording alive.
          await writeFile(path.join(dir, 'navigation-warning.txt'), error.message);
        }
      };
      if (spec.url) await navigate(spec.url); else await page.setContent(spec.html);
      const capture = async filename => {
        try { await page.screenshot({ path: path.join(dir, filename), timeout: 5000 }); return true; }
        catch (error) {
          signal.throwIfAborted();
          if (!spec.manual || page.isClosed() || !browser.isConnected()) throw error;
          await writeFile(path.join(dir, 'screenshot-warning.txt'), error.message);
          return false;
        }
      };
      const log = [];
      for await (const action of this.steps(job, spec)) {
        if (action.action === '__view') {
          try { action.resolve(await inspectPage(page, dir, job.step)); }
          catch (error) { action.reject(error); signal.throwIfAborted(); }
          continue;
        }
        signal.throwIfAborted(); job.step++;
        log.push({ step: job.step, action: action.action, at: new Date().toISOString() });
        await writeFile(path.join(dir, 'actions.json'), JSON.stringify(log, null, 2));
        if (action.action === 'goto') await navigate(action.url);
        if (action.action === 'type' || action.action === 'click') {
          const target = page.locator(action.selector).first();
          await target.scrollIntoViewIfNeeded();
          const box = await target.boundingBox();
          if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
          if (action.action === 'click') await target.click();
          else { await target.click(); await target.pressSequentially(action.text, { delay: action.delayMs }); }
        }
        if (action.action === 'press') await page.keyboard.press(action.key);
        if (action.action === 'fill') await page.locator(action.selector).first().fill(action.text);
        if (action.action === 'select') await page.locator(action.selector).first().selectOption(action.values);
        if (action.action === 'check') await page.locator(action.selector).first().setChecked(action.checked);
        if (action.action === 'upload') {
          for (const file of action.files) {
            if (!path.isAbsolute(file)) throw new Error('Upload files must use absolute local paths');
            await access(file);
          }
          if (action.chooser) {
            const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.locator(action.selector).first().click()]);
            await chooser.setFiles(action.files);
          } else await page.locator(action.selector).first().setInputFiles(action.files);
        }
        if (action.action === 'wait') await sleep(action.durationMs, undefined, { signal });
        if (action.action === 'scroll') {
          await animatePage(page, action);
        }
        if (action.action === 'zoom') log.at(-1).zoom = await animatePage(page, { ...action, durationMs: action.durationMs ?? spec.zoomDurationMs });
        signal.throwIfAborted();
        await capture(`step-${job.step}.png`);
        Object.assign(log.at(-1), { completedAt: new Date().toISOString(), url: page.url(), title: await page.title() });
        await writeFile(path.join(dir, 'actions.json'), JSON.stringify(log, null, 2));
      }
      await sleep(400, undefined, { signal });
      job.final = { url: page.url(), title: await page.title() };
      const hasPreview = await capture('final.png');
      const video = page.video(); await context.close();
      const input = await video.path();
      await browser.close(); signal.removeEventListener('abort', abort);
      signal.throwIfAborted(); job.status = 'encoding';
      const output = path.join(root, 'outputs', `${spec.name}-${job.id.slice(0, 8)}.mp4`);
      await encode(input, output, spec, signal);
      job.output = output; if (hasPreview) job.preview = path.join(dir, 'final.png'); job.status = 'completed';
    } finally { clearTimeout(timeout); if (browser) await browser.close().catch(() => {}); }
  }
}

async function inspectPage(page, dir, step) {
  const reference = randomUUID();
  const metadata = await page.evaluate(reference => {
    const viewport = visualViewport;
    const elements = [];
    for (const element of document.querySelectorAll('input,textarea,button,a[href],select,[contenteditable="true"],[role="button"],h1,h2')) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const fileInput = element.matches('input[type="file"]');
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && rect.bottom > viewport.offsetTop && rect.right > viewport.offsetLeft && rect.top < viewport.offsetTop + viewport.height && rect.left < viewport.offsetLeft + viewport.width;
      if (!visible && !fileInput) continue;
      if (elements.length >= 100) break;
      const ref = `${reference}-${elements.length}`;
      element.setAttribute('data-browser-recorder-ref', ref);
      const selector = element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1 ? `#${CSS.escape(element.id)}` : `[data-browser-recorder-ref="${ref}"]`;
      elements.push({ selector, tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), name: (element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.getAttribute('placeholder') || element.innerText || '').slice(0, 200), visible, disabled: Boolean(element.disabled), value: element.matches('input[type="password"],input[type="file"]') ? undefined : typeof element.value === 'string' ? element.value.slice(0, 500) : undefined, checked: typeof element.checked === 'boolean' ? element.checked : undefined, files: fileInput ? [...element.files].map(file => ({ name: file.name, size: file.size })) : undefined, options: element.tagName === 'SELECT' ? [...element.options].slice(0, 50).map(option => ({ value: option.value, text: option.text })) : undefined });
    }
    return { url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight, scale: viewport.scale }, elements, text: (document.body?.innerText || '').slice(0, 12000) };
  }, reference);
  const preview = path.join(dir, `view-${reference}.png`);
  const buffer = await page.screenshot({ path: preview, timeout: 5000 });
  return { ...metadata, step, preview, image: buffer.toString('base64') };
}

export async function animatePage(page, action) {
  action = { ...action, durationMs: action.durationMs ?? 900 };
  if (action.action === 'zoom') {
    const session = await page.context().newCDPSession(page);
    try {
      const metrics = await session.send('Page.getLayoutMetrics');
      const from = metrics.cssVisualViewport.scale;
      const viewport = page.viewportSize();
      let x = action.x ?? viewport.width / 2;
      let y = action.y ?? viewport.height / 2;
      if (action.selector) {
        const target = page.locator(action.selector).first();
        if (!await target.count()) throw new Error('Zoom target is missing or invisible');
        const box = await target.boundingBox();
        if (!box) throw new Error('Zoom target is missing or invisible');
        x = (box.x + box.width / 2) * from;
        y = (box.y + box.height / 2) * from;
      }
      if (x <= 0 || y <= 0 || x >= viewport.width || y >= viewport.height) throw new Error('Zoom anchor must be inside the visible viewport; scroll target into view first.');
      const pointX = metrics.cssVisualViewport.pageX + x / from;
      const pointY = metrics.cssVisualViewport.pageY + y / from;
      const started = performance.now();
      const factor = action.scale / from;
      if (Math.abs(factor - 1) > 0.00001) {
        // Chromium's touchpad path updates scale and anchor together on its compositor.
        // Its speed model uses 200 pixels to double or halve the page scale.
        const distance = 200 * (Math.max(factor, 1 / factor) - 1);
        await session.send('Input.synthesizePinchGesture', {
          x: x / from, y: y / from, scaleFactor: factor, gestureSourceType: 'mouse',
          relativeSpeed: action.durationMs ? Math.max(1, Math.round(distance / (action.durationMs / 1000))) : 1000000,
        });
      }
      const final = (await session.send('Page.getLayoutMetrics')).cssVisualViewport;
      return { anchor: { x, y }, scale: final.scale, durationMs: action.durationMs, elapsedMs: Math.round(performance.now() - started), actualAnchor: { x: (pointX - final.pageX) * final.scale, y: (pointY - final.pageY) * final.scale } };
    } finally { await session.detach().catch(() => {}); }
  }
  await page.evaluate(async action => {
    const element = document.documentElement;
    const startY = scrollY;
    const startX = scrollX;
    const originalBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = 'auto';
    const apply = t => {
      const eased = t * t * (3 - 2 * t);
      scrollTo(startX, startY + action.y * eased);
    };
    try {
      if (!action.durationMs) { apply(1); return; }
      await new Promise(resolve => {
        let start;
        const frame = now => {
          start ??= now;
          const t = Math.min(1, (now - start) / action.durationMs);
          apply(t);
          if (t < 1) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
    } finally { element.style.scrollBehavior = originalBehavior; }
  }, action);
}
