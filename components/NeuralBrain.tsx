"use client";

import { useEffect, useRef } from "react";

/**
 * A rotating particle brain drawn on a 2D canvas: thousands of small outlined triangles laid out
 * on a procedurally folded brain surface (two hemispheres, cerebellum, brain stem), a gold rim,
 * and "thinking" sparks that travel across it — faster while the agent is working (`active`).
 */

type P = { x: number; y: number; z: number; nx: number; ny: number; nz: number; c: number; rim: boolean; spin: number; size: number };

const PALETTE = ["#f4f1ea", "#a78bfa", "#2dd4bf", "#f5c542", "#7c83ff", "#fca5a5"];
const GOLD = 3;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// small 3D value noise for the folds
function makeNoise(r: () => number) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = r() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x: number, y: number, z: number) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = s(x - xi), yf = s(y - yi), zf = s(z - zi);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf
    );
  };
}

function buildBrain(count: number) {
  const r = rng(4663);
  const noise = makeNoise(r);
  const pts: P[] = [];
  const colorFor = (x: number, y: number, z: number) => {
    const n = noise(x * 2.2 + 11, y * 2.2 + 3, z * 2.2 + 7) * 0.5 + 0.5;
    const roll = (n + r() * 0.45) % 1;
    return roll < 0.42 ? 0 : roll < 0.64 ? 1 : roll < 0.74 ? 2 : roll < 0.81 ? GOLD : roll < 0.95 ? 4 : 5;
  };
  const add = (x: number, y: number, z: number, nx: number, ny: number, nz: number, rim = true, c?: number) =>
    pts.push({ x, y, z, nx, ny, nz, c: c ?? colorFor(x, y, z), rim, spin: r() * Math.PI * 2, size: 0.6 + r() * 0.5 });

  // cerebrum — two folded hemispheres
  const RX = 0.7, RY = 0.74, RZ = 1.0;
  let guard = 0;
  while (pts.length < count * 0.8 && guard++ < count * 12) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    // folds: ridged noise on the surface direction; keep more particles on the ridges
    const ridge = 1 - Math.abs(noise(dx * 3.4 + 5, dy * 3.4, dz * 3.4 - 2));
    if (r() > 0.08 + ridge ** 3 * 0.95) continue;
    const k = 1 + (ridge - 0.6) * 0.17;
    let x = dx * RX * k, y = dy * RY * k, z = dz * RZ * k;
    // longitudinal fissure between the hemispheres
    const side = Math.sign(x) || 1;
    x += side * 0.045;
    y -= 0.16 * Math.exp(-((x / 0.09) ** 2)) * Math.max(0, dy);
    // flatter underside, temporal lobes
    if (y < -0.22) y = -0.22 + (y + 0.22) * 0.6;
    if (z > 0.55) y *= 0.92;
    add(x, y + 0.16, z, dx, dy, dz);
  }
  // cerebellum — tucked under the back, finely striped
  while (pts.length < count * 0.95) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    if (r() > 0.25 + Math.abs(Math.sin(dy * 14)) * 0.75) continue;
    add(dx * 0.44, dy * 0.2 - 0.3, dz * 0.27 - 0.62, dx, dy, dz);
  }
  // brain stem
  while (pts.length < count) {
    const t = r(), a = r() * Math.PI * 2;
    const rad = 0.1 - t * 0.03;
    add(Math.cos(a) * rad, -0.22 - t * 0.55, -0.32 - t * 0.08 + Math.sin(a) * rad, Math.cos(a), 0, Math.sin(a), false, r() < 0.6 ? 0 : 1);
  }
  return pts;
}

function buildFloaters(n: number) {
  const r = rng(77);
  return Array.from({ length: n }, () => ({
    x: (r() * 2 - 1) * 1.9, y: (r() * 2 - 1) * 1.3, z: (r() * 2 - 1) * 1.6,
    vx: (r() - 0.5) * 0.02, vy: 0.01 + r() * 0.03, c: Math.floor(r() * PALETTE.length), spin: r() * 6.28, size: 1.6 + r() * 1.6,
  }));
}

export function NeuralBrain({ className = "", active = false, density = 3600 }: { className?: string; active?: boolean; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = buildBrain(density);
    const floaters = buildFloaters(46);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // pointer tilts the brain a little
    let tx = 0, ty = 0, mx = 0, my = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 0.8;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 0.5;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    // batches: palette color × 3 depth levels, plus spark layer
    const paths = PALETTE.map(() => [new Path2D(), new Path2D(), new Path2D()]);
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let yaw = Math.PI / 2;

    const tri = (p: Path2D, x: number, y: number, s: number, a: number) => {
      p.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      p.lineTo(x + Math.cos(a + 2.094) * s, y + Math.sin(a + 2.094) * s);
      p.lineTo(x + Math.cos(a + 4.189) * s, y + Math.sin(a + 4.189) * s);
      p.closePath();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || w === 0) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const busy = activeRef.current;
      t += dt * (busy ? 2.4 : 1);
      yaw += dt * (busy ? 0.5 : 0.18);
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;

      const Y = yaw + mx, X = -0.12 + my;
      const cy = Math.cos(Y), sy = Math.sin(Y), cx = Math.cos(X), sx = Math.sin(X);
      const scale = Math.min(w, h * 1.3) * 0.3;
      const ox = w / 2, oy = h * 0.47;
      const breathe = 1 + Math.sin(t * 1.3) * 0.012;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const row of paths) for (let i = 0; i < 3; i++) row[i] = new Path2D();
      const sparks = new Path2D();

      const rot = (x: number, y: number, z: number) => {
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        return [x1, y1, z2];
      };

      for (const p of pts) {
        const [x, y, z] = rot(p.x * breathe, p.y * breathe, p.z * breathe);
        const persp = 3.2 / (3.2 - z);
        const sxp = ox + x * scale * persp, syp = oy - y * scale * persp;
        const depth = z < -0.25 ? 0 : z < 0.3 ? 1 : 2;
        // rim: surface seen edge-on glows gold (like the outline in the reference)
        const [, , nz] = rot(p.nx, p.ny, p.nz);
        const c = p.rim && Math.abs(nz) < 0.32 ? GOLD : p.c;
        const size = p.size * (scale / 95) * persp;
        const a = p.spin + t * 0.6;
        // travelling "thought" waves
        const wave = Math.sin(p.x * 5 + p.y * 3 - p.z * 4 - t * 2.2);
        if (wave > (busy ? 0.93 : 0.975) && depth > 0) tri(sparks, sxp, syp, size * 1.35, a);
        else tri(paths[c][depth], sxp, syp, size, a);
      }

      // drifting loose triangles around the brain
      for (const f of floaters) {
        if (!reduce) {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.y > 1.4) f.y = -1.4;
        }
        const [x, y, z] = rot(f.x, f.y, f.z);
        const persp = 3.2 / (3.2 - Math.max(-2.5, Math.min(2.5, z)));
        tri(paths[f.c][z > 0 ? 1 : 0], ox + x * scale * persp, oy - y * scale * persp, f.size * (scale / 95) * persp, f.spin + t * 0.3);
      }

      ctx.lineJoin = "round";
      const alpha = [0.18, 0.5, 0.95];
      for (let d = 0; d < 3; d++) {
        ctx.lineWidth = d === 2 ? 1.05 : 0.85;
        ctx.globalAlpha = alpha[d];
        PALETTE.forEach((col, i) => {
          ctx.strokeStyle = col;
          ctx.stroke(paths[i][d]);
        });
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "#fff7d6";
      ctx.shadowBlur = 6;
      ctx.stroke(sparks);
      ctx.shadowBlur = 0;

      if (reduce) cancelAnimationFrame(raf); // one still frame
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [density]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
