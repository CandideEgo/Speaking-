/* #27 点词交互原型 —— 三条路线共享的接线
 *
 * 这里只放三样东西：
 *   ① 演示数据的渲染（句子拆词、文稿列表、词卡内容）—— 内容共用，容器各写各的；
 *   ② 状态开关（暂停 / 加词后自动关 / 卡口位置）—— 「点完之后」这一问的可切部分；
 *   ③ 「量给我看」—— 按真实 getBoundingClientRect() 画标注并读数，不是目测。
 *
 * 用法（见 W1/W2/W3）：
 *   <script src="_demo.js"></script>
 *   <script src="_wordtap.js"></script>
 *   <script>window.SHELL.topBar = "compact"; ... </script>
 *   <script src="shell.js"></script>
 *   <script>WT.build({ ... });</script>
 */
(function () {
  var S = (window.SHELL = window.SHELL || {});
  var D = window.DEMO || { script: [] };

  /* 三条路线的空闲态都等于 #24 选中的乙 —— 标尺共用同一份，横向差异只来自点词本身 */
  if (!S.bands) {
    S.bands = [
      { label: "顶栏", pct: 5.4, chrome: true },
      { label: "可见画面", pct: 8.3 },
      { label: "入画字幕", pct: 9.7 },
      { label: "控制条", pct: 8.0 },
      { label: "字幕条", pct: 7.9 },
      { label: "文稿列表", pct: 53.8 },
      { label: "底部导航", pct: 6.9, chrome: true }
    ];
  }

  /* ── 词释（原型示意）─────────────────────────────────────────────
     硬约束 INV-007：没有实时 LLM 词释。未命中的词按真实行为返回空字段。 */
  var GLOSS = {
    perspective: {
      phon: "pəˈspektɪv", pos: "n.",
      ctx: "（在本视频中）看问题的角度、视角",
      senses: [{ pos: "n.", text: "观点，看法；透视（法）" }],
      def: "a particular way of thinking about or judging a situation",
      ex: "You're coming at it from the wrong perspective.",
      exzh: "你一开始就理解错了。",
      src: "真题例句 · 2023 四级"
    },
    discipline: {
      phon: "ˈdɪsəplɪn", pos: "n.",
      ctx: "（在本视频中）自律；把该做的事做下去的能力",
      senses: [{ pos: "n.", text: "纪律；训练；学科" }, { pos: "v.", text: "训练；惩罚" }],
      def: "the ability to control your behaviour so that you do what you should",
      ex: "Discipline is choosing what you want most over what you want now.",
      exzh: "自律，是选择你更想要的，而不是你现在想要的。",
      src: "真题例句 · 2021 六级"
    },
    challenging: {
      phon: "ˈtʃælɪndʒɪŋ", pos: "adj.",
      ctx: "（在本视频中）让人觉得吃力的",
      senses: [{ pos: "adj.", text: "有挑战性的；挑起争论的" }],
      def: "difficult in an interesting or enjoyable way",
      ex: "It's challenging, but that's the point.",
      exzh: "它很有挑战，而这正是重点。",
      src: "真题例句 · 2019 四级"
    }
  };
  var EMPTY = {
    phon: "", pos: "",
    ctx: "暂无语境释义 —— 原型示意：真实词释来自 ECDICT 与预生成词注，无实时 LLM 回退",
    senses: [], def: "", ex: "", exzh: "", src: ""
  };

  var state = { pause: false, autoClose: false, edge: false };
  var cfg = {};
  var listeners = [];

  function appEl() { return document.querySelector(".app"); }
  function q(sel) { return document.querySelector(sel); }
  function clean(token) { return (token || "").replace(/[^A-Za-z'-]/g, ""); }

  /* ── ① 内容渲染 ── */
  function words(text, opts) {
    opts = opts || {};
    return text.split(/\s+/).filter(Boolean).map(function (t) {
      var cls = "word" + (opts.hot ? " hot" : "");
      return opts.tappable
        ? '<button class="' + cls + '">' + t + "</button>"
        : '<span class="' + cls + '">' + t + "</span>";
    }).join(" ");
  }

  function listHTML() {
    return D.script.map(function (row, i) {
      return '<li data-idx="' + i + '" class="taprow' + (row.cur ? " on" : "") + '">' +
        '<button class="ts" data-seek="' + i + '">' + row.t + "</button>" +
        '<div class="tx"><div class="en">' + words(row.en) + "</div>" +
        '<div class="zh">' + row.zh + "</div></div></li>";
    }).join("");
  }

  function cardEl(word, opts) {
    opts = opts || {};
    var g = GLOSS[String(word).toLowerCase()] || EMPTY;
    var el = document.createElement("div");
    el.className = "wt-card";
    el.innerHTML =
      '<div class="wc-head">' +
        '<span class="wc-word">' + word + "</span>" +
        (g.phon ? '<span class="wc-phon">/' + g.phon + "/</span>" : "") +
        (g.pos ? '<span class="chip" style="padding:1px 7px;font-size:10.5px">' + g.pos + "</span>" : "") +
        (opts.showClose === false ? "" : '<button class="btn ghost wc-x" data-close-card aria-label="关闭">✕</button>') +
      "</div>" +
      '<div class="wc-body">' +
        '<div class="wc-ctx"><div class="k">▸ 在本视频中</div><p>' + g.ctx + "</p></div>" +
        (g.senses.length
          ? '<div class="wc-sec">词典释义</div>' + g.senses.map(function (s) {
              return '<div class="wc-sense"><span class="pos">' + s.pos + "</span><span>" + s.text + "</span></div>";
            }).join("") + (g.def ? '<div class="wc-exzh" style="margin-top:4px">' + g.def + "</div>" : "")
          : "") +
        '<div class="wc-sec">真题例句</div>' +
        (g.ex
          ? '<div class="wc-ex">' + g.ex + "</div>" +
            (g.exzh ? '<div class="wc-exzh">' + g.exzh + "</div>" : "") +
            (g.src ? '<div class="wc-src">— ' + g.src + "</div>" : "")
          : '<div class="wc-exzh">此词无预生成例句（INV-007：缓存未命中即返回空字段）</div>') +
      "</div>" +
      '<div class="wc-foot">' +
        '<button class="btn" data-speak>发音</button>' +
        '<button class="btn primary" data-save>加入词库</button>' +
      "</div>";

    el.querySelector("[data-speak]").addEventListener("click", function () { flash(el, "发音（原型示意）"); });
    el.querySelector("[data-save]").addEventListener("click", function () {
      if (state.autoClose && opts.onAutoClose) opts.onAutoClose();
      else flash(el, "已加入词库（原型示意）");
    });
    var x = el.querySelector("[data-close-card]");
    if (x) x.addEventListener("click", function () { opts.onClose && opts.onClose(); });
    return el;
  }

  function flash(el, msg) {
    var chip = el.querySelector(".wc-foot .btn.primary");
    if (!chip) return;
    var old = chip.textContent;
    chip.textContent = msg;
    chip.disabled = true;
    setTimeout(function () { chip.textContent = old; chip.disabled = false; }, 1200);
  }

  /* ── 长按 / 轻点（丙用，也用于区分「点行」与「长按行」） ── */
  function press(el, onLong, onTap, ms) {
    var t = null, sx = 0, sy = 0;
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      sx = e.clientX; sy = e.clientY;
      t = setTimeout(function () { t = null; onLong && onLong(e); }, ms || 400);
    });
    el.addEventListener("pointermove", function (e) {
      if (t && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) { clearTimeout(t); t = null; }
    });
    el.addEventListener("pointerup", function () {
      if (t) { clearTimeout(t); t = null; onTap && onTap(); }
    });
    el.addEventListener("pointercancel", function () { if (t) { clearTimeout(t); t = null; } });
  }

  /* ── ③ 量给我看 ── */
  /* 实测「可点区间」：从元素中心向四边逐像素探测，用 elementFromPoint 的**最上层**命中判定。
     为什么不能只读 getBoundingClientRect：行内词靠 ::after 外扩，相邻两行会互相压掉
     对方的外扩部分 —— 谁在上面由绘制顺序决定，只测矩形会把热区报大了。 */
  function hit(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var cx = Math.round(r.left + r.width / 2);
    var mid = r.top + r.height / 2;
    function topAt(y, x) { var s = document.elementsFromPoint(x === undefined ? cx : x, y); return s.length ? s[0] : null; }
    var lo = mid, hi = mid, l = cx, rr = cx, i;
    for (i = 0; i < 48 && lo > r.top - 26; i++) { if (topAt(lo - 1) !== el) break; lo--; }
    for (i = 0; i < 48 && hi < r.bottom + 26; i++) { if (topAt(hi + 1) !== el) break; hi++; }
    for (i = 0; i < 240 && l > r.left - 4; i++) { if (topAt(mid, l - 1) !== el) break; l--; }
    for (i = 0; i < 240 && rr < r.right + 4; i++) { if (topAt(mid, rr + 1) !== el) break; rr++; }
    return { w: Math.round(rr - l), h: Math.round(hi - lo) };
  }

  function boxesHTML() {
    var app = appEl();
    if (!app || !cfg.boxes) return "";
    var a = app.getBoundingClientRect();
    return cfg.boxes.reduce(function (out, b) {
      var el = q(b.sel);
      if (!el) return out;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return out;
      return out + '<div class="wt-box' + (b.tone ? " " + b.tone : "") + '" style="left:' +
        Math.round(r.left - a.left) + "px;top:" + Math.round(r.top - a.top) + "px;width:" +
        Math.round(r.width) + "px;height:" + Math.round(r.height) + 'px">' +
        (b.label ? '<span class="wt-lbl">' + b.label + "</span>" : "") + "</div>";
    }, "");
  }

  function readHTML() {
    if (!cfg.read) return "";
    return cfg.read.reduce(function (out, row) {
      var v = typeof row.get === "function" ? row.get() : row.get;
      var tone = "", text = v;
      if (v && typeof v === "object") { tone = v.tone || ""; text = v.v; }
      return out + '<div class="kv"><span class="k">' + row.label + '</span><span class="v ' + tone + '">' + text + "</span></div>";
    }, "");
  }

  function swHTML() {
    if (!cfg.toggles) return "";
    return cfg.toggles.reduce(function (out, t) {
      var val = !!state[t.key];
      var lab = t.values ? t.values[val ? 1 : 0] : (val ? t.on : t.off);
      return out + '<button data-sw="' + t.key + '" class="' + (val ? "on" : "") + '">' +
        (t.label ? t.label + "：" : "") + lab + "</button>";
    }, "");
  }

  function renderRead() {
    var re = q(".wt-read");
    if (!re) return;
    re.innerHTML = '<div class="hd">状态 &amp; 量尺</div>' +
      (cfg.toggles ? '<div class="sw">' + swHTML() + "</div>" : "") +
      readHTML() +
      (cfg.note ? '<div class="say">' + cfg.note() + "</div>" : "");
    Array.prototype.forEach.call(re.querySelectorAll("[data-sw]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-sw");
        state[k] = !state[k];
        refresh();
      });
    });
  }

  /* 先让各路线按最新 state 更新自己的 DOM，再用更新后的 DOM 画标注与读数 */
  function refresh() {
    listeners.forEach(function (f) { f(state); });
    var p = q(".wt-paused");
    if (p) p.classList.toggle("on", !!state.pause);
    var ov = q(".wt-overlay");
    if (ov) ov.innerHTML = boxesHTML();
    renderRead();
  }

  function build(options) {
    cfg = options || {};
    var app = appEl();
    var list = q(cfg.listSel || "#script");
    if (list) {
      list.innerHTML = listHTML();
      list.addEventListener("click", function (e) {
        var li = e.target.closest("li");
        if (!li) return;
        var idx = Number(li.getAttribute("data-idx"));
        if (e.target.closest(".word") && cfg.onWord) { cfg.onWord(clean(e.target.textContent), idx, li); return; }
        if (cfg.onRow) cfg.onRow(idx, li);
      });
    }
    if (!app) return;

    var ov = document.createElement("div");
    ov.className = "wt-overlay";
    var pill = document.createElement("button");
    pill.className = "wt-pill";
    pill.textContent = "量给我看";
    var read = document.createElement("div");
    read.className = "wt-read";
    pill.addEventListener("click", function () {
      var on = !read.classList.contains("on");
      read.classList.toggle("on", on);
      ov.classList.toggle("on", on);
      pill.classList.toggle("on", on);
      if (on) refresh();
    });
    app.appendChild(ov);
    app.appendChild(read);
    app.appendChild(pill);

    window.addEventListener("resize", function () { if (ov.classList.contains("on")) refresh(); });
    refresh();
    if (cfg.after) cfg.after();
  }

  window.WT = {
    state: state,
    build: build,
    refresh: refresh,
    on: function (f) { listeners.push(f); },
    press: press,
    clean: clean,
    words: words,
    card: cardEl,
    flash: flash,
    hit: hit
  };
})();
