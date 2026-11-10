"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Real-time aurora: three noise-driven light curtains (teal / blue / pink — the Strix palette)
 * drawn by a small WebGL shader. Rendered at reduced resolution, paused when off-screen or when
 * the tab is hidden, and frozen for users who prefer reduced motion. Falls back to blurred CSS
 * gradients when WebGL is unavailable. The canvas uses `mix-blend-mode: screen`, so its black
 * background disappears into the page.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
uniform float k; // overall intensity

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

vec3 curtain(vec2 uv, float aspect, float fi, vec3 c){
  float x = uv.x * aspect;
  float speed = 0.025 + 0.012 * fi;
  // slow large-scale drift + a gentle sine sway give the ribbon its shape
  float wave = fbm(vec2(x * 0.9 + t * speed + fi * 3.7, t * 0.04 + fi * 1.3));
  float center = 0.70 - fi * 0.10 + (wave - 0.5) * 0.38 + sin(x * 1.3 + t * 0.12 + fi * 2.1) * 0.05;
  float d = uv.y - center;
  // bright lower edge that glows softly below and fades in a long tail upwards (no hard cut-off)
  float below = exp(min(d, 0.0) * 34.0);
  float above = exp(-max(d, 0.0) * (6.5 + fi * 2.0));
  float band = below * above;
  // thin vertical rays that shimmer and drift — what makes it read as an aurora, not a glow
  float rays = pow(fbm(vec2(x * 16.0 + fi * 5.0 + t * 0.05, t * 0.15 + fi)), 1.7) * 2.2;
  float pulse = 0.6 + 0.4 * sin(t * 0.22 + fi * 2.4 + x * 0.7);
  return c * band * (0.35 + rays) * pulse;
}

void main(){
  vec2 uv = gl_FragCoord.xy / r;
  float aspect = r.x / r.y;
  vec3 col = vec3(0.0);
  col += curtain(uv, aspect, 0.0, vec3(0.16, 0.86, 0.72)) * 0.62;  // teal
  col += curtain(uv, aspect, 1.0, vec3(0.45, 0.72, 1.00)) * 0.50;  // blue
  col += curtain(uv, aspect, 2.0, vec3(0.90, 0.52, 0.84)) * 0.40;  // pink
  // a faint wash of colour high in the sky
  col += vec3(0.04, 0.08, 0.13) * smoothstep(0.45, 1.0, uv.y) * 0.5;
  // soft filmic roll-off so overlapping curtains never clip to flat white
  col = 1.0 - exp(-col * 1.6);
  // fade out toward the bottom so the page content stays readable
  col *= smoothstep(0.0, 0.5, uv.y) * k;
  gl_FragColor = vec4(col, 1.0);
}`;

export function Aurora({ className = "", intensity = 1, scale = 0.5 }: { className?: string; intensity?: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl || gl.isContextLost()) {
      setFallback(true);
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setFallback(true);
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFallback(true);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");
    const uK = gl.getUniformLocation(prog, "k");
    gl.uniform1f(uK, intensity);

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uR, w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now() - 40_000; // start mid-animation so it looks alive immediately
    let visible = true;
    let raf = 0;
    let lastDraw = 0;
    const draw = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - lastDraw >= 33) {
        // ~30 fps is plenty for slow-moving light
        lastDraw = now;
        gl.uniform1f(uT, (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(canvas);
    const onVis = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVis);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      // free GPU objects but keep the context alive: React (and re-mounts) may reuse this same canvas
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [intensity, scale]);

  if (fallback)
    return (
      <div className={`aurora-fallback ${className}`} aria-hidden>
        <span />
        <span />
        <span />
      </div>
    );
  return <canvas ref={ref} aria-hidden className={`block mix-blend-screen ${className}`} />;
}
