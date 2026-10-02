/* ---------------------------------------------------------------------------
 * _reading.js — 三个版式变体共用的壳与数据（2026-10-02）
 *
 * 只做两件事：把顶栏 / 底栏按线上实测尺寸画出来，把真实字幕灌进列表。
 * 数据取自本地 DB 的 6fdcdd86-… 那 190 句（前 5 句），一个字的假数据都没有。
 * ------------------------------------------------------------------------- */
(function () {
  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20 9 12l10-8v16Z"/><path d="M5 19V5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5-13-7.5Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg>',
    bilingual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
    en: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
    zh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
  };

  // 本地 DB 前 5 句（真数据，见 knowledge/plans/移动端播放页-边界与句导航缺陷-诊断与方案-2026-10.md）
  const SUBS = [
    ["But I think you're coming at it from the wrong perspective.", "但我认为你是从错误的角度看待这件事。"],
    ["Most people think discipline means forcing yourself to do things.", "大多数人以为自律就是逼自己去做事。"],
    ["Or just unappealing, right, because of how challenging it actually is.", "或者干脆提不起劲——毕竟它真的挺难的。"],
    ["Fun is not easy. Fun is engaging, and engagement is a skill you build.", "有趣并不等于轻松。有趣是投入，而投入是一种能力。"],
    ["The trick is to make the hard thing feel like the thing you want to do.", "诀窍是让难事变得像你想做的事。"],
  ];
  const MODES = [["bilingual", "双语", ICON.bilingual], ["en", "英语", ICON.en], ["zh", "中文", ICON.zh]];

  window.__SUBS = SUBS;
  window.__MODES = MODES;

  window.shellTopbar = () =>
    '<button class="icon-btn">' + ICON.back + "</button>" +
    '<div class="titles"><div class="t">E2E Demo Video (CI seed)</div><div class="s">SeeWord · B2 · ≈六级</div></div>' +
    '<span class="pill"><i></i>四级</span>' +
    '<button class="icon-btn">' + ICON.more + "</button>";

  window.shellBottombar = (pct) =>
    '<div class="bar-progress"><div class="rail"></div><div class="fill" style="width:' + (pct || 6) + '%"></div></div>' +
    '<div class="bar-keys">' +
    "<button>" + ICON.prev + "上一句</button>" +
    '<button class="play">' + ICON.play + "播放</button>" +
    "<button>下一句" + ICON.next + "</button>" +
    "<button>" + ICON.mic + "跟读</button>" +
    "</div>";

  window.segControl = (active) =>
    '<div class="seg">' +
    MODES.map(([k, label, icon]) => '<button class="' + (k === active ? "on" : "") + '">' + icon + label + "</button>").join("") +
    "</div>";

  window.plainControl = (active) =>
    MODES.map(([k, label, icon]) => '<button class="plain ' + (k === active ? "on" : "") + '">' + icon + label + "</button>").join("");

  window.listItems = (current) =>
    SUBS.map(([en, zh], i) => '<li class="item ' + (i === current ? "on" : "") + '"><div class="en">' + en + '</div><div class="zh">' + zh + "</div></li>").join("");

  // 把带 data-shell 的占位符填掉
  window.mount = function (opts) {
    opts = opts || {};
    const top = document.querySelector('[data-shell="top"]');
    if (top) top.innerHTML = window.shellTopbar();
    const bottom = document.querySelector('[data-shell="bottom"]');
    if (bottom) bottom.innerHTML = window.shellBottombar(opts.pct);
    if (opts.list !== false) {
      const list = document.querySelector('[data-shell="list"]');
      if (list) list.innerHTML = window.listItems(opts.current || 0);
      const list2 = document.querySelector('[data-shell="list2"]');
      if (list2) list2.innerHTML = window.listItems(opts.current || 0);
    }
    const seg = document.querySelector('[data-shell="seg"]');
    if (seg) seg.innerHTML = window.segControl(opts.mode || "bilingual");
    const seg2 = document.querySelector('[data-shell="seg2"]');
    if (seg2) seg2.innerHTML = window.plainControl(opts.mode || "bilingual");
  };
})();
