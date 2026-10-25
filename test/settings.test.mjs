import test from 'node:test';
import assert from 'node:assert/strict';
import { movieSchema, actionSchema } from '../src/schema.mjs';

test('capture settings accept 120fps and a configurable session zoom duration', () => {
  const input = { html: '<title>Settings</title>', actions: [], fps: 120, zoomDurationMs: 900 };
  const spec = movieSchema.parse(input);
  assert.equal(spec.fps, 120);
  assert.equal(spec.zoomDurationMs, 900);
  assert.equal(spec.framePacing, 'auto');
  assert.equal(movieSchema.safeParse({ ...input, fps: 121 }).success, false);
  assert.equal(movieSchema.safeParse({ ...input, fps: 0 }).success, false);
  assert.equal(movieSchema.safeParse({ ...input, framePacing: 'unknown' }).success, false);
  assert.equal(movieSchema.parse({ ...input, zoomDurationMs: 1500 }).zoomDurationMs, 1500);
  assert.equal(actionSchema.parse({ action: 'zoom', scale: 1.6 }).durationMs, undefined);
  assert.equal(actionSchema.parse({ action: 'zoom', scale: 1.6, durationMs: 400 }).durationMs, 400);
});
