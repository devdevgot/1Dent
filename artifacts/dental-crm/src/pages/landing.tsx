import "@/landing.css";
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
  return (
    <div className="min-h-screen font-manrope">
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
