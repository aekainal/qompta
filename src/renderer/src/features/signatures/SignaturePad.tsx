/**
 * Drawing area for a signature, with the mouse, a stylus or a finger.
 *
 * The stroke is smoothed (quadratic curves between the points) and exported as a
 * transparent PNG, **cropped** as close as possible to the ink: the signature
 * then sits cleanly on the document rule, whatever space is left around it.
 */

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

export interface SignaturePadHandle {
  clear(): void;
  /** Cropped PNG data-URI, or null if nothing was drawn. */
  toDataUrl(): string | null;
}

const WIDTH = 640;
const HEIGHT = 220;

export const SignaturePad = forwardRef<SignaturePadHandle, { color: string; onDraw?: () => void }>(
  function SignaturePad({ color, onDraw }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const inked = useRef(false);

    useEffect(() => {
      const c = canvas.current!;
      const ratio = window.devicePixelRatio || 1;
      c.width = WIDTH * ratio;
      c.height = HEIGHT * ratio;
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }, []);

    function point(e: React.PointerEvent): { x: number; y: number } {
      const r = canvas.current!.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT };
    }

    function down(e: React.PointerEvent) {
      canvas.current!.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = point(e);
      const ctx = canvas.current!.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
      inked.current = true;
      onDraw?.();
    }

    function move(e: React.PointerEvent) {
      if (!drawing.current || !last.current) return;
      const p = point(e);
      const ctx = canvas.current!.getContext("2d")!;
      // Thickness modulated by the stylus pressure (mouse: pressure 0.5).
      ctx.lineWidth = 1.6 + (e.pressure || 0.5) * 2.2;
      ctx.strokeStyle = color;
      const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }

    function up() {
      drawing.current = false;
      last.current = null;
    }

    useImperativeHandle(ref, () => ({
      clear() {
        const c = canvas.current!;
        c.getContext("2d")!.clearRect(0, 0, WIDTH, HEIGHT);
        inked.current = false;
      },
      toDataUrl() {
        if (!inked.current) return null;
        const c = canvas.current!;
        const ctx = c.getContext("2d")!;
        const { width, height } = c;
        const data = ctx.getImageData(0, 0, width, height).data;
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return null;
        const pad = 6;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad);
        maxY = Math.min(height - 1, maxY + pad);
        const out = document.createElement("canvas");
        out.width = maxX - minX + 1;
        out.height = maxY - minY + 1;
        out.getContext("2d")!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      },
    }));

    return (
      <canvas
        ref={canvas}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full touch-none rounded-lg border border-dashed bg-white"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, cursor: "crosshair" }}
      />
    );
  },
);
