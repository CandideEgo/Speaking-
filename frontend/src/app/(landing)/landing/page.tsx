"use client";

import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { BentoShowcase } from "@/components/landing/BentoShowcase";
import { TestimonialGrid } from "@/components/landing/TestimonialGrid";
import { PricingSection } from "@/components/landing/PricingSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

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
