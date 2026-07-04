import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { BentoShowcase } from "@/components/landing/BentoShowcase";
import { TestimonialGrid } from "@/components/landing/TestimonialGrid";
import { PricingSection } from "@/components/landing/PricingSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing page marketing content — shared between:
 * - `/landing` route (standalone; auth-redirects authenticated visitors to the app)
 * - `(main)` layout (rendered for unauthenticated visitors hitting `/` or any app
 *   route, so the public landing is the first thing they see instead of a bare
 *   login redirect).
 *
 * No auth logic here — callers wrap with their own auth handling.
 */
export function LandingContent() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <LandingNav />
      <HeroSection />
      <TrustStrip />
      <FeatureGrid />
      <BentoShowcase />
      <TestimonialGrid />
      <PricingSection />
      <FinalCTA />
      <LandingFooter />
    </div>
  );
}
