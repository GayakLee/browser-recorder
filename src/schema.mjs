import { z } from 'zod';
const duration = z.number().int().min(0).max(60000);
export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), url: z.string().url() }),
  z.object({ action: z.literal('type'), selector: z.string().min(1), text: z.string().max(30000), delayMs: z.number().min(0).max(1000).default(70) }),
  z.object({ action: z.literal('fill'), selector: z.string().min(1), text: z.string().max(30000) }),
  z.object({ action: z.literal('upload'), selector: z.string().min(1), files: z.array(z.string().min(1)).max(20), chooser: z.boolean().default(false) }),
  z.object({ action: z.literal('select'), selector: z.string().min(1), values: z.array(z.string()).min(1).max(50) }),
  z.object({ action: z.literal('check'), selector: z.string().min(1), checked: z.boolean() }),
  z.object({ action: z.literal('click'), selector: z.string().min(1) }),
  z.object({ action: z.literal('press'), key: z.string().min(1) }),
  z.object({ action: z.literal('scroll'), y: z.number().min(-10000).max(10000), durationMs: duration.default(800) }),
  z.object({ action: z.literal('zoom'), scale: z.number().min(1).max(3), durationMs: duration.optional(), selector: z.string().min(1).optional(), x: z.number().nonnegative().optional(), y: z.number().nonnegative().optional() }),
  z.object({ action: z.literal('wait'), durationMs: duration }),
]).superRefine((value, ctx) => {
  if (value.action !== 'zoom') return;
  if ((value.x === undefined) !== (value.y === undefined) || (value.selector !== undefined && value.x !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Zoom accepts selector OR both x and y; omit all for viewport center.' });
  }
});
export const movieSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/).default('browser-recorder'),
  url: z.string().url().optional(), html: z.string().max(300000).optional(),
  width: z.number().int().min(320).max(3840).default(1920),
  height: z.number().int().min(240).max(2160).default(1080),
  fps: z.number().int().min(1).max(120).default(30),
  zoomDurationMs: duration.default(900),
  framePacing: z.enum(['auto', 'display', 'unlimited']).default('auto'),
  headless: z.boolean().default(true), cursor: z.boolean().default(true),
  audioPath: z.string().optional(), manual: z.boolean().default(false),
  actions: z.array(actionSchema).max(200),
}).refine(value => Boolean(value.url) !== Boolean(value.html), 'Specify exactly one of url or html');
