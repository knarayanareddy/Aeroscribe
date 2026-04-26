import { useEffect, useRef, useState } from "react";

const stats = [
  { value: "10x", label: "Faster Research Cycles" },
  { value: "99.7%", label: "Simulation Accuracy" },
  { value: "24/7", label: "Autonomous Operation" },
  { value: "∞", label: "Research Scalability" },
];

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [typedText, setTypedText] = useState("");
  const fullText = "World's First Autonomous\nAerospace Research Laboratory";

  // Typewriter effect
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; color: string;
    }[] = [];

    const colors = ["#3B82F6", "#8B5CF6", "#06B6D4", "#60A5FA"];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2.5 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      particles.forEach((p, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      // Draw particles
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(p.opacity * 255).toString(16).padStart(2, "0");
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020817]/70 via-[#020817]/60 to-[#020817]" />
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(59,130,246,0.15),transparent)]" />

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10" />

      {/* Content */}
      <div className="relative z-20 text-center px-4 max-w-6xl mx-auto pt-20">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 backdrop-blur-sm mb-8 text-blue-300 text-sm font-medium"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
          </span>
          Now Live — Autonomous Research Mode Active
        </div>

        {/* Headline */}
        <h1
          style={{ fontFamily: "Orbitron, sans-serif" }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight tracking-tight"
        >
          {typedText.split("\n").map((line, i) => (
            <span key={i} className="block">
              {i === 0 ? (
                <span className="bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-transparent">
                  {line}
                </span>
              ) : (
                <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  {line}
                </span>
              )}
            </span>
          ))}
          <span className="inline-block w-0.5 h-12 bg-blue-400 ml-1 animate-pulse align-middle" />
        </h1>

        {/* Subtitle */}
        <p
          className="text-gray-300 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          Aeroscribe harnesses cutting-edge AI to autonomously design, simulate, and validate
          aerospace systems — dramatically compressing research timelines from decades to days.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <a
            href="#about"
            className="px-8 py-4 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-base transition-all duration-300 shadow-xl shadow-blue-900/40 hover:shadow-blue-700/60 hover:-translate-y-0.5"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Explore the Platform →
          </a>
          <a
            href="#how-it-works"
            className="px-8 py-4 rounded-full border border-blue-500/40 bg-blue-500/10 backdrop-blur-sm text-blue-300 hover:text-white hover:border-blue-400 hover:bg-blue-500/20 font-semibold text-base transition-all duration-300"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Watch Demo ▶
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm"
            >
              <div
                className="text-3xl font-black bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-1"
                style={{ fontFamily: "Orbitron, sans-serif" }}
              >
                {stat.value}
              </div>
              <div className="text-xs text-gray-400 font-medium" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-gray-500">
        <span className="text-xs tracking-widest uppercase" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          Scroll
        </span>
        <div className="w-px h-12 bg-gradient-to-b from-blue-500/60 to-transparent animate-pulse" />
      </div>
    </section>
  );
}
