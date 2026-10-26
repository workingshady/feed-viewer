/**
 * Fast dots for canvases with tens of thousands of points. One huge path of `arc()` calls costs
 * seconds in browsers (path filling grows faster than linearly); stamping a pre-drawn circle with
 * `drawImage` costs milliseconds.
 */
const sprites = new Map<string, HTMLCanvasElement>();

/** A cached image of a filled (optionally stroked) circle, drawn at device-pixel resolution. */
export function dotSprite(fill: string, radius: number, dpr: number, stroke?: { color: string; width: number }): HTMLCanvasElement {
  const key = `${fill}|${radius}|${dpr}|${stroke?.color ?? ""}|${stroke?.width ?? 0}`;
  let c = sprites.get(key);
  if (c) return c;
  const pad = (stroke?.width ?? 0) + 1;
  const size = Math.ceil((radius + pad) * 2 * dpr);
  c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.beginPath();
  ctx.arc(radius + pad, radius + pad, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color;
    ctx.stroke();
  }
  if (sprites.size > 500) sprites.clear();
  sprites.set(key, c);
  return c;
}

/** Stamps a sprite centred on (x, y) in CSS pixels. */
export function stamp(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, dpr: number) {
  const w = sprite.width / dpr;
  ctx.drawImage(sprite, x - w / 2, y - w / 2, w, w);
}
