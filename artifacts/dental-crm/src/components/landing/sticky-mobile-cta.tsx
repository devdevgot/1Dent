import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export function StickyMobileCta() {
  return (
    <div className="landing-sticky-cta md:hidden">
      <Link href="/register" className="landing-btn landing-btn-accent font-manrope w-full">
        Начать бесплатно
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
