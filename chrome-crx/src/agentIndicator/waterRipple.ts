interface WaveConfig {
  r: number;
  g: number;
  b: number;
  alpha: number;
  depth: number;
  offset: number;
  t: number;
}

const noisePermutation: number[] = [];
for (let i = 0; i < 512; i++) {
  noisePermutation[i] = Math.random();
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const smoothX = xf * xf * (3 - 2 * xf);
  const smoothY = yf * yf * (3 - 2 * yf);

  const tl = noisePermutation[(xi + yi * 13) & 511];
  const tr = noisePermutation[(xi + 1 + yi * 13) & 511];
  const bl = noisePermutation[(xi + (yi + 1) * 13) & 511];
  const br = noisePermutation[(xi + 1 + (yi + 1) * 13) & 511];

  const top = tl + smoothX * (tr - tl);
  const bottom = bl + smoothX * (br - bl);
  return top + smoothY * (bottom - top);
}

export interface WaterRippleHandle {
  container: HTMLElement;
  start: () => void;
  pause: () => void;
  restart: () => void;
  stop: () => void;
}

export function createWaterRipple(): WaterRippleHandle {
  const container = document.createElement('div');
  container.id = 'superduck-water-ripple-container';
  container.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 100px;
    pointer-events: none;
    z-index: 2147483646;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
  `;

  const canvas = document.createElement('canvas');
  canvas.id = 'superduck-water-ripple-canvas';
  canvas.style.cssText = `
    width: 100%;
    height: 100%;
    display: block;
    filter: blur(1px);
  `;
  container.appendChild(canvas);

  const colors: [number, number, number][] = [
    [230, 140, 85],
    [235, 160, 90],
    [240, 175, 95],
    [245, 185, 100],
    [250, 195, 110]
  ];

  const waves: WaveConfig[] = colors.map(([r, g, b], i) => ({
    r,
    g,
    b,
    alpha: 0.343 - i * 0.039,
    depth: i,
    offset: 100 + Math.random() * 100,
    t: 0
  }));

  let animationId: number | null = null;
  let animateFunc: (() => void) | null = null;
  let resizeHandler: (() => void) | null = null;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  function drawWave(ctx: CanvasRenderingContext2D, w: WaveConfig, width: number, height: number) {
    ctx.fillStyle = `rgba(${w.r}, ${w.g}, ${w.b}, ${w.alpha})`;
    ctx.beginPath();

    const step = 25;
    let started = false;
    for (let x = 0; x <= width + step; x += step) {
      const xoff = (x / width) * 3;
      const noiseVal = valueNoise(xoff + w.offset, w.t + w.offset);
      const yoff = noiseVal * 80;
      const y = height - yoff - w.depth * 12;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    w.t += 0.005;
  }

  function animate() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) {
      animationId = null;
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const w of waves) {
      drawWave(ctx, w, width, height);
    }

    animationId = requestAnimationFrame(animate);
  }

  animateFunc = animate;
  resizeHandler = resizeCanvas;

  function start() {
    requestAnimationFrame(() => {
      resizeCanvas();
      animate();
    });
    window.addEventListener('resize', resizeCanvas);
  }

  function pause() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function restart() {
    if (!animationId && animateFunc) {
      animationId = requestAnimationFrame(animateFunc);
    }
  }

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    animateFunc = null;
  }

  return { container, start, pause, restart, stop };
}
