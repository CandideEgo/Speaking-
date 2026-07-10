"use client";

import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";

export function FinalCTA() {
  return (
    <section className="py-[88px]">
      <div className="container-page">
        <div className="bg-ink rounded-2xl overflow-hidden relative px-6 sm:px-10 py-14 text-center">
          {/* Decorative gradient */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,90,31,0.6), transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="!text-[28px] sm:!text-[42px] !font-extrabold !tracking-[-0.03em] !leading-tight text-on-dark mb-4">
              今天开始，开口说英语
            </h2>
            <p className="text-[17px] text-on-dark-soft mb-9 max-w-[500px] mx-auto">
              免费注册，无需信用卡。看真实视频，学地道英语。
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <LinkButton
                href="/register"
                variant="dark"
                size="lg"
                icon={ArrowRight}
                iconRight
              >
                免费试用
              </LinkButton>
              <LinkButton href="/browse" variant="ghostDark" size="lg">
                浏览视频内容
              </LinkButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
