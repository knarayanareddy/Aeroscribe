import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./components/About";
import Capabilities from "./components/Capabilities";
import ResearchAreas from "./components/ResearchAreas";
import HowItWorks from "./components/HowItWorks";
import Team from "./components/Team";
import Publications from "./components/Publications";
import ContactSection from "./components/ContactSection";
import Footer from "./components/Footer";

export default function App() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-[#020817] text-white min-h-screen overflow-x-hidden">
      <Navbar scrollY={scrollY} />
      <Hero />
      <About />
      <Capabilities />
      <ResearchAreas />
      <HowItWorks />
      <Team />
      <Publications />
      <ContactSection />
      <Footer />
    </div>
  );
}
