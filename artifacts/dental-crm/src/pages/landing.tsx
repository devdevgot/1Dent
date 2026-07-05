import { useEffect } from "react";
import "@/landing.css";
import { SITE } from "@/config/site";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { PainPoints } from "@/components/landing/pain-points";
import { Features } from "@/components/landing/features";
import { AiSection } from "@/components/landing/ai-section";
import { RolesSection } from "@/components/landing/roles-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { SocialProof } from "@/components/landing/social-proof";
import { CtaFooter } from "@/components/landing/cta-footer";

export default function LandingPage() {
  useEffect(() => {
    document.title = SITE.landingTitle;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", SITE.seo.description);
  }, []);

  return (
    <div className="landing-page min-h-screen scroll-smooth">
      <Navbar />
      <Hero />
      <PainPoints />
      <Features />
      <AiSection />
      <RolesSection />
      <PricingSection />
      <SocialProof />
      <CtaFooter />
    </div>
  );
}
