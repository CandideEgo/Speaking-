/* SeeWord 移动端播放页原型 —— 共享外壳与标尺
 *
 * 每个变体只写自己的「内容」，顶栏 / 底部导航 / 屏高标尺都由这里统一渲染，
 * 这样三个变体之间才可比：外壳差异是设计选择，不是手误。
 *
 * 用法：
 *   <link rel="stylesheet" href="_base.css">
 *   <script src="_demo.js"></script>
 *   <script>window.SHELL = { topBar: "full", tabBar: "visible", bands: [...] };</script>
 *   ... 内容 ...
 *   <script src="shell.js"></script>
 */
(function () {
  var S = window.SHELL || (window.SHELL = {});

  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>',
    radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 16.2a6 6 0 000-8.4M4.9 4.9a10 10 0 000 14.2M19.1 19.1a10 10 0 000-14.2"/></svg>',
    cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 9L12 4 2 9l10 5 10-5z"/><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>'
  };
  window.SW_ICON = ICON;

  var TABS = [
    { label: "首页", icon: "sparkles" },
    { label: "频道", icon: "radio" },
    { label: "练习", icon: "cap" },
    { label: "单词训练", icon: "book", badge: "99+" },
    { label: "我的", icon: "user" }
  ];

  /* 顶栏 —— full: 现行 64px 常驻；compact: 压缩为 44px 细条；overlay: 浮在画面上 */
  function topBarHTML(mode) {
    if (mode === "none") return "";
    var compact = mode === "compact";
    var overlay = mode === "overlay";
    var h = compact ? "44px" : "";
    var cls = "topbar" + (overlay ? " overlay" : "");
    var style = (h ? "height:" + h + ";" : "") +
      (overlay ? "position:absolute;top:0;left:0;right:0;background:transparent;border-bottom:0;color:#fafafa;" : "");
    return '<header class="' + cls + '" style="' + style + '">' +
      '<div class="logo">S</div>' +
      (overlay ? '<span style="font-size:13px;font-weight:600;color:rgba(250,250,250,.9)">正在播放</span>' : "") +
      '<span class="spacer"></span>' +
      '<button class="icon-btn" aria-label="搜索" style="' + (overlay ? "color:#fafafa" : "") + '">' + ICON.search + '</button>' +
      '<button class="icon-btn" aria-label="通知" style="' + (overlay ? "color:#fafafa" : "") + '">' + ICON.bell + '</button>' +
      '<span class="avatar" style="' + (overlay ? "background:rgba(250,250,250,.15);border-color:rgba(250,250,250,.3);color:#fafafa" : "") + '">我</span>' +
      '</header>';
  }

  function tabBarHTML(mode) {
    if (mode !== "visible") return "";
    var items = TABS.map(function (t, i) {
      return '<button class="tab' + (t.href === "#" || i === 0 ? "" : "") + '">' +
        (t.badge ? '<span class="badge">' + t.badge + '</span>' : "") +
        ICON[t.icon] + '<span>' + t.label + '</span></button>';
    }).join("");
    return '<nav class="tabbar" style="padding-bottom:env(safe-area-inset-bottom,0px)">' + items + '</nav>';
  }

  /* 屏高标尺：把每一段占屏高的百分比摊在右侧 */
  function measureHTML(bands) {
    if (!bands || !bands.length) return "";
    var top = 0;
    var out = bands.map(function (b) {
      var el = '<div class="band' + (b.chrome ? " chrome" : "") + '" style="top:' + top + '%;height:' + b.pct + '%">' +
        '<span>' + b.label + " " + b.pct + '%</span></div>';
      top += b.pct;
      return el;
    }).join("");
    return '<div class="measure" id="measure">' + out + '</div>' +
      '<button class="measure-btn" id="measureBtn">屏高构成</button>';
  }

  function mount() {
    var top = document.getElementById("shell-top");
    if (top) top.outerHTML = topBarHTML(S.topBar || "full");
    var bottom = document.getElementById("shell-bottom");
    if (bottom) bottom.outerHTML = tabBarHTML(S.tabBar || "visible");

    var app = document.querySelector(".app");
    if (app && S.bands) app.insertAdjacentHTML("beforeend", measureHTML(S.bands));

    var mb = document.getElementById("measureBtn");
    if (mb) mb.addEventListener("click", function () {
      document.getElementById("measure").classList.toggle("on");
      mb.textContent = document.getElementById("measure").classList.contains("on") ? "收起标尺" : "屏高构成";
    });

    // 变体说明
    var n = document.getElementById("variant-note");
    if (n && S.notes) n.innerHTML = S.notes;

    // 单词点击 → 底部弹层（#24 的三个变体都用同一套点词容器，便于横向比较）
    // #27 的点词原型自己接管点词（S.wordTap === "none"），这里让位，其余行为一概不变。
    if (S.wordTap !== "none") document.querySelectorAll(".word").forEach(function (w) {
      w.addEventListener("click", function () {
        document.querySelectorAll(".word.sel").forEach(function (x) { x.classList.remove("sel"); });
        w.classList.add("sel");
        openSheet(w.textContent.replace(/[^A-Za-z'-]/g, ""));
      });
    });
    var scrim = document.getElementById("scrim");
    if (scrim) scrim.addEventListener("click", closeSheet);
    document.querySelectorAll("[data-close-sheet]").forEach(function (b) {
      b.addEventListener("click", closeSheet);
    });
  }

  var DICT = {
    discipline: { phon: "/ˈdɪsəplɪn/", pos: "n.", zh: "自律；纪律", ex: "Discipline is choosing what you want most over what you want now." },
    perspective: { phon: "/pəˈspektɪv/", pos: "n.", zh: "视角；看法", ex: "You're coming at it from the wrong perspective." },
    challenging: { phon: "/ˈtʃælɪndʒɪŋ/", pos: "adj.", zh: "有挑战性的", ex: "It's challenging, but that's the point." }
  };

  function openSheet(word) {
    var sheet = document.getElementById("wordSheet");
    if (!sheet) return;
    var key = (word || "").toLowerCase();
    var d = DICT[key] || { phon: "/—/", pos: "n.", zh: "（原型示意：真实词释来自 ECDICT / 预生成词注，无实时 LLM）", ex: "" };
    sheet.querySelector("[data-word]").textContent = word || "";
    sheet.querySelector("[data-phon]").textContent = d.phon;
    sheet.querySelector("[data-pos]").textContent = d.pos;
    sheet.querySelector("[data-zh]").textContent = d.zh;
    sheet.querySelector("[data-ex]").textContent = d.ex;
    sheet.style.display = "flex";
    var sc = document.getElementById("scrim");
    if (sc) sc.style.display = "block";
  }
  function closeSheet() {
    var sheet = document.getElementById("wordSheet");
    if (sheet) sheet.style.display = "none";
    var sc = document.getElementById("scrim");
    if (sc) sc.style.display = "none";
  }
  window.SW = { openSheet: openSheet, closeSheet: closeSheet, ICON: ICON };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
