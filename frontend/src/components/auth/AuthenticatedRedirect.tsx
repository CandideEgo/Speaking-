"use client";

import { FullPageSpinner } from "@/components/common/Spinner";
import { RedirectStuckState } from "@/components/auth/RedirectStuckState";

/**
 * 登录/注册页在「本地已登录」期间渲染什么 —— 两页逐字相同的过渡态，收敛于此。
 *
 * 不能返回 null：那会让页面在整个 RSC flight + 首次 chunk 下载期间一片空白
 * （用户报告为「登录白屏」）。这段窗口必须留着 spinner —— 弱网、部署后旧
 * chunk 都是**合法的慢导航**，不是故障。
 *
 * 只有登录墙读不到镜像 cookie、跳过去必被弹回时才换成恢复卡；判定见
 * `useRedirectIfAuthenticated`（同步读 cookie，不是计时）。
 */
export function AuthenticatedRedirect({
  redirectStuck,
  next,
}: {
  redirectStuck: boolean;
  next: string;
}) {
  if (redirectStuck) return <RedirectStuckState next={next} />;
  return <FullPageSpinner />;
}
