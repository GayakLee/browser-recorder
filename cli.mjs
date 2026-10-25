import { readFile } from 'node:fs/promises';
import { MovieEngine } from './src/engine.mjs';
if (!['render', 'record'].includes(process.argv[2]) || !process.argv[3]) { console.error('Usage: node cli.mjs render scene.json [--headed|--headless] | record https://example.com [--headed|--headless] [--fps 1..120] [--zoom-ms MS] [--frame-pacing auto|display|unlimited]'); process.exitCode = 1; }
else {
  const engine = new MovieEngine();
  const interactive = process.argv[2] === 'record';
  const input = interactive ? { url: process.argv[3], actions: [], headless: true, manual: true } : JSON.parse(await readFile(process.argv[3], 'utf8'));
  if (process.argv.includes('--headed') && process.argv.includes('--headless')) throw new Error('Choose either --headed or --headless');
  if (process.argv.includes('--headed')) input.headless = false;
  if (process.argv.includes('--headless')) input.headless = true;
  for (const [flag, setting] of [['--fps', 'fps'], ['--zoom-ms', 'zoomDurationMs']]) {
    const index = process.argv.indexOf(flag);
    if (index !== -1) {
      if (!/^\d+$/.test(process.argv[index + 1] || '')) throw new Error(`${flag} requires an integer value`);
      input[setting] = Number(process.argv[index + 1]);
    }
  }
  const pacingIndex = process.argv.indexOf('--frame-pacing');
  if (pacingIndex !== -1) {
    if (!['auto', 'display', 'unlimited'].includes(process.argv[pacingIndex + 1])) throw new Error('--frame-pacing requires auto, display or unlimited');
    input.framePacing = process.argv[pacingIndex + 1];
  }
  const job = engine.create(input);
  if (interactive) {
    console.error('Browser Recorder: recording. Press Enter to stop and save MP4 (Ctrl+C cancels).');
    process.stdin.resume(); process.stdin.once('data', () => { engine.stop(job.id); process.stdin.pause(); });
  }
  process.once('SIGINT', () => engine.cancel(job.id));
  await engine.jobs.get(job.id).done;
  const result = engine.status(job.id); console.log(JSON.stringify(result, null, 2));
  process.stdin.pause();
  if (result.status !== 'completed') process.exitCode = 1;
}
