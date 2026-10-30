import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
}

const COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#60A5FA'];
const LINK_DISTANCE = 120;

function particleCount(width: number): number {
  if (width < 640) return 24;
  if (width < 1024) return 48;
  return 84;
}

/**
 * Decorative particle field behind the hero.
 *
 * Performance and accessibility notes:
 * - the canvas is scaled by `devicePixelRatio` (capped at 2) so it is not blurry;
 * - the animation pauses when the canvas scrolls out of view or the tab is hidden;
 * - `prefers-reduced-motion` renders a single static frame instead of a loop.
 */
export default function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frameId: number | null = null;
    let inView = true;
    let pageVisible = !document.hidden;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      particles = Array.from({ length: particleCount(width) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2.5 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      }));
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i]!;
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance < LINK_DISTANCE) {
            context.beginPath();
            context.strokeStyle = `rgba(59, 130, 246, ${0.08 * (1 - distance / LINK_DISTANCE)})`;
            context.lineWidth = 0.5;
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
          }
        }
      }

      for (const particle of particles) {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fillStyle = `${particle.color}${Math.round(particle.opacity * 255)
          .toString(16)
          .padStart(2, '0')}`;
        context.fill();

        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;
      }
    };

    const shouldAnimate = () => !reduceMotion && inView && pageVisible;

    const loop = () => {
      draw();
      frameId = shouldAnimate() ? window.requestAnimationFrame(loop) : null;
    };

    const start = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    const sync = () => {
      if (shouldAnimate()) start();
      else stop();
    };

    const onResize = () => {
      resize();
      if (!shouldAnimate()) {
        draw();
      }
    };

    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      sync();
    };

    resize();
    draw();
    if (!reduceMotion) start();

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            inView = entries.some((entry) => entry.isIntersecting);
            sync();
          });
    observer?.observe(canvas);

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
