"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";

interface LearningRecord {
  video_id: string;
  progress_percentage: number;
}

interface LearningRecordsResponse {
  records: LearningRecord[];
  total: number;
}

/**
 * SpeakingFAB — Floating Action Button for quick access to speaking practice.
 *
 * Mobile-only (md:hidden). Fixed bottom-right, above the MobileTabBar.
 * On tap: navigates to the last-watched video, or /browse if no history.
 * Auto-hides on scroll down, reappears on scroll up.
 */
export default function SpeakingFAB() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Scroll-direction visibility
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    // Show when scrolling up or near the top
    if (currentScrollY <= 64 || currentScrollY < lastScrollY) {
      setVisible(true);
    } else {
      setVisible(false);
    }
    setLastScrollY(currentScrollY);
  }, [lastScrollY]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const handleTap = useCallback(async () => {
    try {
      const data = await api<LearningRecordsResponse>("/api/v1/learning/records?page_size=1");
      if (data.records && data.records.length > 0) {
        router.push(`/watch/${data.records[0].video_id}`);
      } else {
        router.push("/browse");
      }
    } catch {
      router.push("/browse");
    }
  }, [router]);

  if (!isAuthenticated) return null;

  return (
    <div
      className={`
        fixed bottom-20 right-4 z-30 md:hidden
        flex flex-col items-center gap-1
        transition-all duration-300 ease-in-out
        ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"}
      `}
    >
      <button
        onClick={handleTap}
        aria-label="口语练习"
        className="
          flex items-center justify-center
          h-14 w-14 rounded-full
          bg-coral text-white
          shadow-lg shadow-coral/30
          active:scale-95
          transition-transform duration-150
        "
      >
        <Mic size={24} className="fill-white" />
      </button>
      <span className="text-[10px] font-medium text-muted-foreground leading-none">口语练习</span>
    </div>
  );
}
