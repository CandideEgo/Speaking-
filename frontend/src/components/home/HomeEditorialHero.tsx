"use client";

/**
 * 首页今日精选（公共页与后台预览共用）。
 *
 * 数据仍然只来自已发布编排 DTO；页面把主推组织成一张「学习任务卡」，不再
 * 保留封面播放键、开始观看、学前预览三套重复入口。场景区只跟随当前主推
 * 内容版本，后台预览也渲染同一套组件。
 */

import type { ReactElement } from "react";
import { HomeEditorialScenarios } from "@/components/home/HomeEditorialScenarios";
import { TodayTaskCard } from "@/components/home/TodayTaskCard";
import { homeScenarioCards } from "@/lib/homeScenarios";
import { editorialTask } from "@/lib/homeTask";
import type { HomeEditorialPage, HomeLayoutIssue } from "@/types/homeContent";

export type HomeEditorialMode = "preview" | "live";

/** 首页唯一页头；不与任务卡标题抢层级。 */
export function HomeEditorialHeader(): ReactElement {
  return (
    <header className="home-editorial-heading mb-4">
      <div className="min-w-0">
        <p className="text-meta text-muted">今天 · 学习计划</p>
        <h1 className="mt-1 text-display-sm font-bold tracking-tight text-ink sm:text-display">
          今天从哪里开始？
        </h1>
      </div>
    </header>
  );
}

/** 已发布内容只取主推；次推/独立表达位不再占据首页上半区。 */
export function HomeEditorialHero({
  page,
  primary = false,
  continueVideoId,
}: {
  page: HomeEditorialPage;
  mode?: HomeEditorialMode;
  primary?: boolean;
  continueVideoId?: string;
}): ReactElement | null {
  if (!page.lead) return null;
  const task = editorialTask(page.lead);
  const [scene] = homeScenarioCards({
    videoId: page.lead.video.id,
    scenarios: page.scenarios,
    content: page.lead.content,
  });
  // 场景卡就在旁边且用的是同一句时，任务卡不再重复一段 blockquote。
  const sceneSentence = scene?.scenario.sentence ?? null;
  const hideSentence = Boolean(
    sceneSentence &&
    task.sentence &&
    sceneSentence.text_en.trim() === task.sentence.text_en.trim() &&
    sceneSentence.start_time === task.sentence.start_time
  );
  return (
    <section aria-label="今日精选">
      <TodayTaskCard
        task={task}
        primary={primary}
        hideCover={continueVideoId === page.lead.video.id}
        hideSentence={hideSentence}
      />
    </section>
  );
}

/**
 * 后台预览入口：页头 + 单个精选视频 + 本期关联场景区，
 * 不含续学/复习入口与下方 feed。`issues` 是编排校验的字段级错误。
 */
export function HomeEditorialPreview({
  page,
  issues = [],
}: {
  page: HomeEditorialPage;
  mode?: HomeEditorialMode;
  issues?: HomeLayoutIssue[];
}): ReactElement {
  return (
    <div className="user-ui home-editorial-preview home-compact">
      {issues.length > 0 && (
        <div className="home-editorial-issues" role="alert">
          <strong>预览数据校验未通过</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.field}:${issue.code}:${index}`}>
                <span>{issue.field}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <HomeEditorialHeader />
      {page.lead && <HomeEditorialHero page={page} primary />}
      {page.lead && (
        <HomeEditorialScenarios
          key={page.lead.video.id}
          videoId={page.lead.video.id}
          scenarios={page.scenarios}
          content={page.lead.content}
        />
      )}
    </div>
  );
}
