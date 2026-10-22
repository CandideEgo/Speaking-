"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Crown, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { api, ApiError, isProUser } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/common/PageTransition";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import type { User } from "@/types";

interface PurchaseTier {
  name: string;
  days: number;
  price_fen: number;
}

interface PurchaseLink {
  url: string;
  expires_in_seconds: number;
  tiers: PurchaseTier[];
}

interface BrowserKind {
  wechat: boolean;
  mobile: boolean;
}

const BENEFITS = [
  "逐词点读：字幕里点词即查，释义、音标、真题例句当场看到",
  "智能复习：生词按遗忘曲线自动排期，到点回炉",
  "词单与真题：四六级真题、视频词单随学随练",
  "多端同步：手机、电脑接着学，同步进度与收藏",
];

const QR_SIZE = 240;

function yuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

function expiryText(user: User): string {
  if (!user.plan_expires_at) return "";
  return new Date(user.plan_expires_at).toLocaleDateString("zh-CN");
}

/**
 * 会员购买页（B 方案：只从站内进入）。
 *
 * 买家先登录，再从这里拿到金数据收款页链接；链接里的 x_field_1 是服务端
 * 签名的购买标识，付款后由轮询/webhook 自动把会员开到当前账号，所以收款页
 * 不需要收集手机号。
 *
 * 收款页只支持微信内支付（页面只开了微信支付，且要微信身份），所以非微信
 * 环境不直接跳转：桌面显示二维码让用户用微信扫，手机浏览器引导复制链接去
 * 微信里打开。付款成功后本页会轮询账号状态，自动刷新出新的有效期。
 */
export default function UpgradePage() {
  const { isAuthenticated, isLoading } = useRequireAuth({ redirectTo: "/login?next=/upgrade" });
  const [me, setMe] = useState<User | null>(null);
  const [link, setLink] = useState<PurchaseLink | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [purchaseFailed, setPurchaseFailed] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [browser, setBrowser] = useState<BrowserKind | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadFailed(false);
    setQrCode(null);
    const [meResult, linkResult] = await Promise.allSettled([
      api<User>("/api/v1/users/me"),
      api<PurchaseLink>("/api/v1/payments/jinshuju/purchase-link"),
    ]);
    if (meResult.status === "fulfilled") setMe(meResult.value);
    else setLoadFailed(true);
    if (linkResult.status === "fulfilled") {
      setLink(linkResult.value);
      setUnavailable(false);
      setPurchaseFailed(false);
    } else {
      setLink(null);
      const error = linkResult.reason;
      setUnavailable(error instanceof ApiError && [404, 503].includes(error.status));
      setPurchaseFailed(!(error instanceof ApiError && [404, 503].includes(error.status)));
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) void load();
  }, [isLoading, isAuthenticated, load]);

  // 从支付页切回本页/恢复页面时自动刷新一次会员状态。
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible" && isAuthenticated) void load();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [isAuthenticated, load]);

  // 浏览器环境只能在挂载后判断（服务端没有 navigator），否则会 hydration 不一致。
  useEffect(() => {
    const agent = navigator.userAgent;
    setBrowser({
      wechat: /MicroMessenger/i.test(agent),
      mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(agent),
    });
  }, []);

  const desktop = browser !== null && !browser.wechat && !browser.mobile;

  // 桌面端把带签名的收款链接生成二维码，用户用微信扫码后就在微信里打开收款页。
  useEffect(() => {
    if (!desktop || !link) return;
    let cancelled = false;
    setQrCode(null);
    setQrFailed(false);
    QRCode.toDataURL(link.url, {
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((data) => {
        if (!cancelled) setQrCode(data);
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, link]);

  // 桌面扫码付款时，付款发生在手机上：轮询本账号状态，开通后自动收尾。
  const proNow = me !== null && isProUser(me);
  useEffect(() => {
    if (!isAuthenticated || !me || proNow) return;
    let stopped = false;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (stopped) return;
      tries += 1;
      if (tries > 20) {
        window.clearInterval(timer);
        return;
      }
      void api<User>("/api/v1/users/me")
        .then((fresh) => {
          if (stopped) return;
          if (isProUser(fresh)) {
            setMe(fresh);
            toast.success("会员已开通");
            window.clearInterval(timer);
          }
        })
        .catch(() => {
          /* 忽略轮询失败，下一个周期再试 */
        });
    }, 15000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated, me, proNow]);

  const copyLink = useCallback(() => {
    if (!link) return;
    if (!navigator.clipboard) {
      toast.error("当前浏览器无法复制链接，请在微信中打开本站后购买");
      return;
    }
    navigator.clipboard
      .writeText(link.url)
      .then(() => toast.success("支付链接已复制，去微信里粘贴打开即可付款"))
      .catch(() => toast.error("复制失败，请手动选中链接复制"));
  }, [link]);

  if (loadFailed && !me) {
    return <ErrorState title="账户信息暂时未能加载" onRetry={() => void load()} />;
  }
  if (isLoading || !isAuthenticated || !me) {
    return <FullPageSpinner />;
  }

  const pro = isProUser(me);
  const mode =
    browser === null
      ? "pending"
      : browser.wechat
        ? "wechat"
        : browser.mobile
          ? "mobile"
          : "desktop";

  return (
    <PageTransition>
      <div className="py-6 sm:py-12">
        <PageHeader
          crumb="会员"
          title="升级 SeeWord 会员"
          description="查看会员权益与价格，选择适合自己的学习方式。"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card padding={5}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand-600">
                <Crown size={18} />
              </span>
              <div>
                <p className="text-copy font-semibold text-ink">
                  {pro ? "SeeWord 会员" : "当前为免费账号"}
                </p>
                <p className="mt-0.5 text-meta text-muted">
                  {pro ? `有效期至 ${expiryText(me)}` : "支付确认后更新会员状态"}
                </p>
              </div>
            </div>

            <ul className="mt-5 space-y-2.5">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex gap-2 text-copy text-body">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-500" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card padding={5}>
            <p className="text-copy font-semibold text-ink">选择档位</p>
            <p className="mt-1 text-meta text-muted">付款后自动开通至当前账号。</p>

            {link ? (
              <div className="mt-4 space-y-2">
                {link.tiers.map((tier) => (
                  <div
                    key={tier.name}
                    className="flex items-center justify-between rounded-md border border-hairline px-3 py-2"
                  >
                    <span className="text-copy text-ink">
                      {tier.name} · {tier.days} 天
                    </span>
                    <span className="text-copy font-semibold text-ink">
                      ¥{yuan(tier.price_fen)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-copy text-muted">
                {unavailable
                  ? "会员购买暂不可用，请稍后再来。"
                  : purchaseFailed
                    ? "价格暂时未能加载，请重试。"
                    : "价格加载中…"}
              </p>
            )}

            {link &&
              (mode === "desktop" ? (
                <>
                  <div className="mt-4 rounded-md border border-hairline bg-surface-soft p-4 text-center">
                    {qrCode ? (
                      <span className="mx-auto inline-block rounded-sm bg-white p-2">
                        <img
                          src={qrCode}
                          alt="微信扫码支付二维码"
                          width={QR_SIZE}
                          height={QR_SIZE}
                          className="block"
                        />
                      </span>
                    ) : (
                      <div
                        className="mx-auto grid place-items-center rounded-sm bg-white p-2 text-meta text-muted"
                        style={{ width: QR_SIZE, height: QR_SIZE }}
                      >
                        {qrFailed ? "二维码未能生成，请复制支付链接" : "二维码生成中…"}
                      </div>
                    )}
                    <p className="mt-3 text-copy font-semibold text-ink">用手机微信扫一扫</p>
                    <p className="mt-1 text-meta leading-relaxed text-muted">
                      扫码后就在微信里选择档位并完成支付，付款成功本页会自动更新会员状态。
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-3 w-full"
                    icon={Copy}
                    disabled={!link}
                    onClick={copyLink}
                  >
                    复制支付链接
                  </Button>
                </>
              ) : mode === "mobile" ? (
                <>
                  <div className="mt-4 rounded-md border border-hairline bg-surface-soft p-4">
                    <p className="text-copy font-semibold text-ink">请在微信里打开后再支付</p>
                    <p className="mt-1 text-meta leading-relaxed text-muted">
                      这个收款页只支持微信内支付。复制下面的支付链接，打开微信粘贴发送（例如发给文件传输助手）后点开即可付款。
                    </p>
                  </div>
                  <Button className="mt-3 w-full" icon={Copy} disabled={!link} onClick={copyLink}>
                    复制支付链接
                  </Button>
                </>
              ) : (
                <Button
                  className="mt-4 w-full"
                  disabled={!link}
                  onClick={() => {
                    if (link) window.location.href = link.url;
                  }}
                >
                  {link ? "去支付" : "暂不可购买"}
                </Button>
              ))}

            <p className="mt-3 text-meta leading-relaxed text-muted">
              支付完成后回到本页查看会员状态。开通可能需要几分钟；如仍未生效，请通过帮助与反馈提供订单号。
            </p>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void load()}
              className="mt-2 inline-flex cursor-pointer items-center gap-1 text-meta text-brand-700 hover:underline"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              {purchaseFailed || unavailable ? "重新加载" : "刷新会员状态"}
            </button>
            {loadFailed && (
              <p role="status" className="mt-2 text-meta text-muted">
                会员状态暂时未能更新，请稍后重试。
              </p>
            )}
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
