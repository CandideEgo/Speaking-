/* 三个变体共用同一份演示数据 —— 只变布局，不变内容。
   数据取自本项目线上那条 CNBC 视频的形状（中英双语、187 句、8:10）。 */
window.DEMO = {
  title: "How to make discipline so fun it's hard to skip",
  channel: "CNBC Make It",
  level: "四级",
  duration: "8:10",
  viewed: "17:43",
  index: 95,
  total: 187,
  progress: 0.28,
  current: {
    en: "But I think you're coming at it from the wrong perspective.",
    zh: "但我觉得，你一开始就理解错了。"
  },
  /**
   * 整段文稿。`cur` 标出当前句（与 current 同一条），用于「列表里滚到哪」。
   * 每条都有 en / zh；点词只对英文生效。
   */
  script: [
    { t: "00:12", en: "Most people think discipline means forcing yourself to do things.", zh: "大多数人以为自律就是逼自己去做事。", enZh: "大多数人以为自律就是逼自己去做事。" },
    { t: "00:17", en: "Or just unappealing, right, because of how challenging it actually is.", zh: "或者干脆提不起劲——毕竟它真的挺难的。" },
    { t: "00:22", en: "But I think you're coming at it from the wrong perspective.", zh: "但我觉得，你一开始就理解错了。", cur: true },
    { t: "00:26", en: "Fun is not easy. Fun is engaging.", zh: "有趣，从来就不是轻松的事。有趣是让人投入。" },
    { t: "00:31", en: "The trick is to make the first two minutes almost effortless.", zh: "诀窍在于让最开始的两分钟几乎毫不费力。" },
    { t: "00:37", en: "Shrink the task until starting feels trivial.", zh: "把任务缩小到「开始」这件事显得微不足道。" },
    { t: "00:43", en: "Then let the momentum carry the rest of the session.", zh: "然后让惯性带走这一轮剩下的部分。" },
    { t: "00:49", en: "That is why streaks work better than willpower.", zh: "这就是为什么连续打卡比意志力管用。" },
    { t: "00:55", en: "You are not fighting yourself, you are removing friction.", zh: "你不是在跟自己较劲，你是在去掉摩擦。" },
    { t: "01:01", en: "Start small enough that skipping it feels silly.", zh: "小到「不做」反而显得荒唐，就够了。" }
  ]
};
