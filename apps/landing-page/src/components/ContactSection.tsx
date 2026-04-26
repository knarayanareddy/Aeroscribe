import { useState } from "react";

export default function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", org: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contact" className="relative py-28 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(59,130,246,0.08),transparent)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            <div
              className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              Get In Touch
            </div>
            <h2
              style={{ fontFamily: "Orbitron, sans-serif" }}
              className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent leading-tight"
            >
              Ready to Accelerate Your Research?
            </h2>
            <p
              className="text-gray-400 text-lg leading-relaxed mb-8"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              Whether you're a space agency, defense contractor, university, or startup —
              Aeroscribe can transform your aerospace research pipeline. Get early access today.
            </p>

            {/* Info cards */}
            <div className="space-y-4">
              {[
                {
                  icon: "🚀",
                  title: "Early Access Program",
                  desc: "Join 50+ organizations already using Aeroscribe in research mode.",
                },
                {
                  icon: "🤝",
                  title: "Partnership & Collaboration",
                  desc: "Explore co-development and white-label opportunities.",
                },
                {
                  icon: "🎓",
                  title: "Academic Licensing",
                  desc: "Free access for qualifying universities and research institutions.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02]"
                >
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div>
                    <div
                      className="font-semibold text-white text-sm mb-1"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {item.title}
                    </div>
                    <div
                      className="text-gray-400 text-sm"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Form */}
          <div className="p-8 rounded-3xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3
                  className="text-2xl font-bold text-white mb-3"
                  style={{ fontFamily: "Orbitron, sans-serif" }}
                >
                  Message Received!
                </h3>
                <p
                  className="text-gray-400"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}
                >
                  Our team will be in touch within 24 hours. Welcome to the future of aerospace research.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h3
                  className="text-xl font-bold text-white mb-6"
                  style={{ fontFamily: "Orbitron, sans-serif" }}
                >
                  Request Access
                </h3>

                {[
                  { key: "name", label: "Full Name", placeholder: "Dr. Jane Smith", type: "text" },
                  { key: "email", label: "Email Address", placeholder: "jane@aerospace.org", type: "email" },
                  { key: "org", label: "Organization", placeholder: "NASA / ESA / University...", type: "text" },
                ].map((field) => (
                  <div key={field.key}>
                    <label
                      className="block text-sm font-medium text-gray-300 mb-1.5"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      required
                      value={form[field.key as keyof typeof form]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    />
                  </div>
                ))}

                <div>
                  <label
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    Message
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Tell us about your research goals..."
                    required
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm resize-none"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-base transition-all duration-300 shadow-xl shadow-blue-900/40 hover:shadow-blue-700/60 hover:-translate-y-0.5"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}
                >
                  Submit Request →
                </button>

                <p
                  className="text-xs text-gray-500 text-center"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}
                >
                  We respect your privacy. No spam, ever.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
