import About from './components/About';
import Capabilities from './components/Capabilities';
import ContactSection from './components/ContactSection';
import Docs from './components/Docs';
import Footer from './components/Footer';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import Maintainers from './components/Maintainers';
import Navbar from './components/Navbar';
import ResearchAreas from './components/ResearchAreas';

export default function App() {
  return (
    <div id="top" className="min-h-screen overflow-x-hidden bg-ink text-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <About />
        <Capabilities />
        <ResearchAreas />
        <HowItWorks />
        <Docs />
        <Maintainers />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}
