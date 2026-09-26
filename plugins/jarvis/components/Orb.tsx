// Jarvis's presence: a soft, breathing blob that shows at a glance whether Jarvis is
// listening, hearing you, thinking, or talking.
//
// It animates from engine.levels() on every frame through a ref, never through
// React state, so a 60 fps meter costs no re-renders.
import { useEffect, useRef } from "react";
import { engine, type Mode } from "@/lib/engine";

/** RGB per mode. Listening and hearing share a hue; hearing is brighter. */
const COLORS: Record<Mode, readonly [number, number, number]> = {
  off: [100, 116, 139],
  starting: [100, 116, 139],
  listening: [56, 189, 248],
  hearing: [125, 249, 255],
  sending: [167, 139, 250],
  thinking: [167, 139, 250],
  speaking: [253, 224, 150],
};

const POINTS = 96;

export function Orb({ mode, size }: { mode: Mode; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas === null || canvas === undefined || context === null || context === undefined) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.scale(ratio, ratio);

    let frame = 0;
    let level = 0;
    const color: [number, number, number] = [...COLORS[modeRef.current]];

    const draw = (now: number) => {
      const current = modeRef.current;
      const { mic, out } = engine.levels();
      const target =
        current === "speaking" ? out : current === "hearing" || current === "listening" ? mic : 0;
      // Rise fast, fall slow: reads as voice rather than flicker.
      level += (target - level) * (target > level ? 0.35 : 0.08);
      const goal = COLORS[current];
      for (let channel = 0; channel < 3; channel += 1) {
        color[channel] = (color[channel] ?? 0) + ((goal[channel] ?? 0) - (color[channel] ?? 0)) * 0.08;
      }
      const [r, g, b] = color.map(Math.round) as [number, number, number];
      const t = now / 1000;
      const center = size / 2;
      const thinking = current === "thinking" || current === "sending";
      const breath = thinking ? 0.06 * Math.sin(t * 3) : 0.03 * Math.sin(t * 1.2);
      const base = size * 0.27 * (1 + breath + level * 0.45);
      const wobble = size * (0.012 + level * 0.06) * (current === "off" ? 0.4 : 1);

      context.clearRect(0, 0, size, size);

      const halo = context.createRadialGradient(center, center, base * 0.4, center, center, size / 2);
      halo.addColorStop(0, `rgba(${r},${g},${b},${0.28 + level * 0.3})`);
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);

      context.beginPath();
      for (let index = 0; index <= POINTS; index += 1) {
        const angle = (index / POINTS) * Math.PI * 2;
        const radius =
          base +
          wobble * Math.sin(angle * 3 + t * 1.7) +
          wobble * 0.7 * Math.sin(angle * 5 - t * 2.3) +
          wobble * 0.4 * Math.sin(angle * 7 + t * 3.1);
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      const body = context.createRadialGradient(
        center - base * 0.3,
        center - base * 0.35,
        base * 0.1,
        center,
        center,
        base * 1.1,
      );
      body.addColorStop(0, `rgba(255,255,255,0.95)`);
      body.addColorStop(0.35, `rgba(${r},${g},${b},0.95)`);
      body.addColorStop(1, `rgba(${Math.round(r * 0.35)},${Math.round(g * 0.35)},${Math.round(b * 0.45)},0.9)`);
      context.fillStyle = body;
      context.fill();

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} aria-hidden="true" />;
}
