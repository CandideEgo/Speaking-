/* #28 入画字幕的版式与整段文稿的入口 —— 四条路线（B1..B4）共享的接线
 *
 * 三条路线（#27）证明了「点词只在画面内当前句」之后，画面内那句字幕就成了本票唯一的战场：
 * 它占几行、多大字、和控制条谁让谁。这里把四问里「四条路线都一样」的部分收敛成一个文件：
 *   ① 画面内字幕的渲染 + 字号档 / 语言档（真实入口＝控制条上的 Aa）
 *   ② 「折几行」的实测：把句子塞进真 DOM 量高度，不是估算
 *   ③ 词卡（#27 乙 的形态：贴画面下沿，卡口可切）+ 卡口切换
 *   ④ 共享读数行：可见画面 / 字幕块 / 每行字符容量 / 热区
 *
 * 用法（见 B1..B4）：
 *   <link rel="stylesheet" href="_sub.css">
 *   <script src="_demo.js"></script><script src="_wordtap.js"></script><script src="_sub.js"></script>
 *   <script>SB.bind({ ctl: "#ctl", ... });</script>
 *   <script src="shell.js"></script>      ← 标尺要用 SHELL.bands，必须在前
 */
(function () {
  var D = window.DEMO || { script: [] };
  var S = (window.SHELL = window.SHELL || {});

  /* 字号档：中文永远比英文小一档（两种语言的最优行高不同，抄自「每日英语听力」分开设样式的做法） */
  var SIZES = {
    s: { en: 14, lh: 19, zh: 11.5, zlh: 16, name: "小 14px" },
    m: { en: 16, lh: 22, zh: 12.5, zlh: 17, name: "中 16px" },
    l: { en: 18, lh: 25, zh: 14.0, zlh: 19, name: "大 18px" }
  };

  /* 语言档：both = 中英双语（画面内 2–3 行）；en = 中文出画，只在文稿里（画面内 1–2 行） */
  /* st.size = 用户在 Aa 里选的档位（＝上限）；st.eff = 实际渲染用的档位。
     「降档封顶」这类策略由路线通过 cfg.fit 提供，只能把 eff 压到 size 之下，不能反过来。 */
  var st = { size: "m", eff: null, lang: "en", openWord: null, cur: 2, ctl: "always" };
  var els = {};
  var hooks = { onStyle: [], onCurrent: [], onCtl: [] };
  var cfg = {};

  function q(s) { return document.querySelector(s); }
  function box(s) { var el = typeof s === "string" ? q(s) : s; return el ? el.getBoundingClientRect() : null; }
  function roundH(s) { var r = box(s); return r ? Math.round(r.height) : 0; }
  function overlap(a, b) {
    var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (!ra.height || !rb.height) return 0;
    return Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
  }

  /* ── ① 画面内字幕 ───────────────────────────────────────────── */
  function curSize() { return SIZES[st.eff || st.size]; }

  function applyStyle() {
    var z = curSize();
    els.en.style.fontSize = z.en + "px";
    els.en.style.lineHeight = z.lh + "px";
    els.zh.style.fontSize = z.zh + "px";
    els.zh.style.lineHeight = z.zlh + "px";
    els.zh.hidden = st.lang === "en";
  }

  /* 用真 DOM 量折行：句子塞进 #burnEn、读它的高度，不是按字宽估算 */
  function burnRead() {
    var z = curSize();
    var enH = roundH(els.en);
    var zhH = st.lang === "en" ? 0 : roundH(els.zh);
    return {
      enLines: Math.round(enH / z.lh),
      zhLines: st.lang === "en" ? 0 : Math.round(zhH / z.zlh),
      enH: enH, zhH: zhH,
      h: roundH(els.burn)
    };
  }

  function renderBurn(idx) {
    st.cur = Math.max(0, Math.min(D.script.length - 1, idx));
    var row = D.script[st.cur];
    els.en.innerHTML = WT.words(row.en, { tappable: true, hot: true });
    els.zh.textContent = row.zh;
    st.eff = cfg.fit ? (cfg.fit(st.size, row.en, st.lang, st.cur) || st.size) : st.size;
    applyStyle();
    notify("onCurrent", st.cur);
    /* 换句就换了一套几何（折几行、可见画面多少）——读数当场跟上。
       调用方（点行 / 滚动预览 / 上一下句按钮）都不必再自己 refresh。 */
    WT.refresh();
    return burnRead();
  }

  /* 量文本用的探针：一个挂在 #burn 里、同宽、看不见的盒子，量完就删。
     ★ 不能拿 els.en 直接改 innerHTML 来量 —— 那会把画面里正在被点的 <button class="word"> 拆掉重建，
     点击冒泡到 .main 时 e.target 已经脱离文档（closest("#burn") 变 false），词卡刚开就被自己关掉。
     量尺是只读的东西，不许动被测对象。 */
  function probe(width, sizeKey) {
    var z = SIZES[sizeKey];
    var d = document.createElement("div");
    d.className = els.en.className;                 /* 复用 .burn-en 的字重 / 字距 */
    d.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;margin:0;" +
      "width:" + width + "px;font-size:" + z.en + "px;line-height:" + z.lh + "px";
    els.burn.appendChild(d);
    return d;
  }

  /* 某个句子在某一档下折几行（只跟英文有关：中文行不改变英文的折行） */
  function linesOf(text, sizeKey) {
    var w = Math.round(els.en.getBoundingClientRect().width) || (els.burn.clientWidth - 20);
    var d = probe(w, sizeKey);
    d.innerHTML = WT.words(text, { tappable: false });
    var n = Math.round(d.getBoundingClientRect().height / SIZES[sizeKey].lh);
    d.remove();
    return n;
  }

  /* 每行能放多少字符：量 26 个字母的平均字宽再除可用宽度（含每个词 2px 的内边距，故标「估」） */
  function charCap(sizeKey) {
    var avail = els.burn.clientWidth - 20;          /* .burn 左右各 10px 内边距 */
    var d = probe(avail, sizeKey);
    d.style.width = "auto";
    d.style.display = "inline-block";
    d.style.whiteSpace = "nowrap";
    d.textContent = "abcdefghijklmnopqrstuvwxyz";
    var avg = d.getBoundingClientRect().width / 26;
    d.remove();
    return Math.floor(avail / avg);
  }

  /* ── ② 控制条：常驻 / 点出 ─────────────────────────────────── */
  var hideTimer = null, settleTimer = null;
  function showCtl(on, autoHide) {
    if (st.ctl !== "tap") return;
    var ctl = q(cfg.ctl || "#ctl");
    if (!ctl) return;
    ctl.classList.add("tap");
    ctl.classList.toggle("on", !!on);
    st.ctlOn = !!on;
    clearTimeout(hideTimer);
    if (on && autoHide !== false) hideTimer = setTimeout(function () { showCtl(false); }, 3000);
    var hint = q("#ctlHint");
    if (hint) hint.classList.toggle("on", !on);
    notify("onCtl", !!on);
    WT.refresh();      /* 控制条一起一落就改变「可见画面 / 盖住字幕多少」——读数得跟着动 */
                       /* build 之前调用时 renderRead 找不到 .wt-read，会自己早退 */
    /* 但 .ctl 是 transform 过渡（.18s）过来的：这一瞬间量到的还是旧位置。
       等它落定再刷一次，否则面板会拿「上一态」的几何当现状报出来。 */
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { WT.refresh(); }, 260);
  }

  /* ── ③ Aa：字号档 + 语言档的真实入口 ───────────────────────── */
  function mountAA(rowSel) {
    var row = q(rowSel);
    if (!row) return;
    var btn = document.createElement("button");
    btn.id = "aaBtn";
    btn.className = "aa-btn";
    btn.setAttribute("aria-label", "字幕样式与语言");
    btn.textContent = "Aa";
    var sp = row.querySelector(".sp");
    if (sp) sp.after(btn); else row.appendChild(btn);

    var pop = document.createElement("div");
    pop.className = "aa-pop";
    pop.id = "aaPop";
    pop.hidden = true;
    pop.innerHTML =
      '<div class="aa-hd">画面内字幕</div>' +
      '<div class="aa-row"><span>语言</span><div class="seg" data-k="lang">' +
        '<button data-v="both">中英</button><button data-v="en">仅英文</button></div></div>' +
      '<div class="aa-row"><span>字号</span><div class="seg" data-k="size">' +
        '<button data-v="s">小</button><button data-v="m">中</button><button data-v="l">大</button></div></div>' +
      '<div class="aa-hint">选中的档位只作用于画面内那句；文稿列表字号不受它影响（现状文稿字号是 <code>page.tsx:61-70</code> 的三档写死映射）。</div>';
    /* 挂到 .app 而不是 .frame：.frame 有 overflow:hidden，弹层会被裁掉 */
    q(".app").appendChild(pop);

    function sync() {
      pop.querySelectorAll("[data-k]").forEach(function (g) {
        var k = g.getAttribute("data-k");
        g.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("on", st[k] === b.getAttribute("data-v"));
        });
      });
    }
    pop.querySelectorAll("[data-k] button").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var g = b.parentElement.getAttribute("data-k");
        st[g] = b.getAttribute("data-v");
        renderBurn(st.cur);        /* 换档要重算折行，也就可能重算「降档封顶」的实际档位 */
        sync(); notify("onStyle"); WT.refresh();
      });
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (pop.hidden) {
        /* 弹层落在控制条下沿之下的那块空白上（不盖画面、不盖字幕） */
        var a = box(".app"), r = row.getBoundingClientRect();
        pop.style.top = Math.round(r.bottom - a.top + 6) + "px";
      }
      pop.hidden = !pop.hidden;
      showCtl(true, false);
      WT.refresh();
    });
    document.querySelector(".main").addEventListener("click", function () { pop.hidden = true; });
    els.aaPop = pop; els.aaBtn = btn;
    sync();
  }

  /* ── ③b 控制条上的按钮：本票不动的那些，点了要说得出它归谁 ── */
  function toast(msg) {
    var el = q("#sbToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sbToast"; el.className = "sb-toast";
      q(".app").appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("on"); }, 1600);
  }

  function wireCtl() {
    var row = q(".ctl .row");
    if (!row) return;
    row.querySelectorAll("button").forEach(function (b) {
      var label = b.getAttribute("aria-label") || "";
      if (/播放|暂停/.test(label)) {
        b.addEventListener("click", function () {
          var p = q(".wt-paused");
          var on = p ? !p.classList.contains("on") : false;
          if (p) p.classList.toggle("on", on);
          b.innerHTML = on
            ? '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5.5v13l11-6.5z"/></svg>';
        });
      } else if (/^画面内字幕/.test(label)) {   /* 别用 /字幕/ —— Aa 的 aria-label 是「字幕样式与语言」，会一起被匹配上 */
        b.addEventListener("click", function () {
          st.sub = !subOn();
          els.burn.hidden = !subOn();
          b.classList.toggle("on", subOn());
          b.setAttribute("aria-label", subOn() ? "画面内字幕已开" : "画面内字幕已关");
          if (!subOn()) { if (els.aaPop) els.aaPop.hidden = true; if (els.cardClose) els.cardClose(); }
          toast(subOn() ? "画面内字幕：开 · 可见画面 " + visiblePicture() + "px"
                        : "画面内字幕：关 · 可见画面回到 " + visiblePicture() + "px（字幕全部退回画面外）");
          WT.refresh();
        });
      } else if (label) {
        var msg = /倍速/.test(label) ? "倍速：本票不动 —— 控制条只回答「常驻还是点出」"
                : /全屏/.test(label) ? "全屏与方向策略归 #25" : "";
        if (msg) b.addEventListener("click", function () { toast(msg); });
      }
    });
  }

  /* ── ④ 词卡（#27 乙 的形态）─────────────────────────────────── */
  function mountCard(opts) {
    opts = opts || {};
    var app = q(".app");
    var card = document.createElement("div");
    card.className = "edgecard";
    card.id = "edgeCard";
    card.innerHTML =
      '<div class="ec-grab"><i></i></div>' +
      '<div class="ec-why" id="ecWhy"></div>' +
      '<div id="ecHost"></div>' +
      '<div class="ec-foot"><button class="btn" data-speak>发音</button>' +
      '<button class="btn primary" data-save>加入词库</button></div>';
    app.appendChild(card);
    var host = card.querySelector("#ecHost");
    els.card = card; els.cardHost = host;

    /* WT.state.dock === false（默认）= 贴画面下沿，露控制条；true = 贴字幕下沿，盖控制条 */
    function atBurn() { return !!WT.state.dock; }
    function cardH() { return Math.round(els.card.getBoundingClientRect().height) || 0; }
    function layout() {
      if (!els.card) return;
      var a = box(".app");
      /* 三个卡口（前两个是 #27 定的，第三个是 乙 逼出来的）：
         top        = 贴画面下沿，露出控制条（#27 的默认）
         bottom     = 贴字幕下沿，盖住控制条
         aboveBurn  = 贴字幕上沿 —— 卡片挂在字幕之上，高度只能吃到「可见画面」那一段 */
      var edge = cfg.cardEdge ? cfg.cardEdge() : (atBurn() ? "bottom" : "top");
      var top;
      if (edge === "aboveBurn") {
        /* 窗口的上边界是画框顶（不是 .app 顶）：卡片不许翻出画面压住顶栏 */
        var ceil = Math.round(box(".frame").top - a.top);
        top = Math.round(box(els.burn).top - a.top - cardH());
        els.card.style.top = top + "px";
        els.card.style.maxHeight = Math.max(120, Math.round(box(els.burn).top - a.top - ceil - 4)) + "px";
        /* 高度被 maxHeight 改过，重算一次落点 */
        var t2 = Math.round(box(els.burn).top - a.top - cardH());
        if (Math.abs(t2 - top) > 1) { top = t2; els.card.style.top = top + "px"; }
      } else {
        top = Math.round((edge === "bottom" ? box(els.burn).bottom : box(".player").bottom) - a.top);
        els.card.style.top = top + "px";
        var tab = q(".tabbar");
        var tabH = tab ? Math.round(tab.getBoundingClientRect().height) : 56;
        els.card.style.maxHeight = Math.max(200, Math.floor(a.height - top - tabH - 4)) + "px";
      }
      if (st.openWord) {
        if (cfg.why) { q("#ecWhy").innerHTML = cfg.why(); return; }
        var gap = atBurn() ? 0 : Math.round(box(".player").bottom - box(els.burn).bottom);
        q("#ecWhy").innerHTML = atBurn()
          ? "卡口＝贴字幕下沿 · 断层 0px · 代价：控制条被盖住"
          : "卡口＝贴画面下沿 · 断层 " + gap + "px（那截是控制条，留住了）";
      }
    }
    function open(word) {
      st.openWord = word;
      host.innerHTML = "";
      host.appendChild(WT.card(word, { onClose: close, onAutoClose: close }));
      card.classList.add("on");
      layout(); WT.refresh();
    }
    function close() {
      st.openWord = null;
      card.classList.remove("on");
      host.innerHTML = "";
      layout(); WT.refresh();
    }
    els.burn.addEventListener("click", function (e) {
      var w = e.target.closest(".word");
      if (!w) return;
      var word = WT.clean(w.textContent);
      if (st.openWord === word) { close(); return; }
      els.burn.querySelectorAll(".word.sel").forEach(function (x) { x.classList.remove("sel"); });
      w.classList.add("sel");
      open(word);
    });
    document.querySelector(".main").addEventListener("click", function (e) {
      if (st.openWord === null) return;
      /* e.target 已脱离文档 = 这次点击落在了一个刚被重绘掉的节点上（画面内那句重排过），
         它是「里面」的点击，不是「外面」的 —— 别拿它关卡片 */
      if (!e.target.isConnected) return;
      if (e.target.closest("#edgeCard") || e.target.closest("#burn")) return;
      close();
    });
    card.querySelector("[data-speak]").addEventListener("click", function () { WT.flash(card, "发音（原型示意）"); });
    card.querySelector("[data-save]").addEventListener("click", function () {
      if (WT.state.autoClose) close(); else WT.flash(card, "已加入词库（原型示意）");
    });
    card.addEventListener("transitionend", function () { layout(); WT.refresh(); });
    window.addEventListener("resize", layout);
    els.cardLayout = layout; els.cardClose = close; els.cardOpen = open;
  }

  /* ── ⑤ 共享读数行 ───────────────────────────────────────────── */
  /* 可见画面 = 画框顶到「入画字幕上沿」之间的那截净空。
     直接量两个矩形的距离，而不是「画框高 − 字幕高 − 控制条高」：
     乙 的「字幕上移让位」一态是靠 transform 把字幕推上去的，算术式会漏掉它。 */
  function subOn() { return st.sub !== false; }
  function ctlH() {
    if (st.ctl !== "tap") return roundH(cfg.ctl || "#ctl");
    return st.ctlOn ? 65 : 3;        /* 点出态：常驻的只有 3px 细进度；浮起时是完整的 65px */
  }
  function visiblePicture() {
    var f = box(".frame");
    if (!subOn()) return Math.round(f.height - ctlH());   /* 字幕全出画＝回到「字幕在画面外」的形态 */
    return Math.round(box(els.burn).top - f.top);
  }

  function reads(extra) {
    var base = [
      { label: "可见画面（16:9 原高 211）", get: function () {
          var v = visiblePicture();
          return { v: v + "px（占画面 " + Math.round(v / 211 * 100) + "% · 占屏高 " + (v / 812 * 100).toFixed(1) + "%）",
                   tone: v >= 100 ? "good" : "" };
        } },
      { label: "入画字幕块（含折行）", get: function () {
          var b = burnRead();
          var txt = b.enLines + " 行英文" + (b.zhLines ? " + " + b.zhLines + " 行中文" : "（中文出画）");
          return { v: b.h + "px（" + txt + "）", tone: b.h <= 60 ? "good" : "bad" };
        } },
      { label: "当前句在本档折几行", get: function () {
          var b = burnRead();
          return { v: "英文 " + b.enLines + " 行 / 中文 " + (b.zhLines || 0) + " 行", tone: "" };
        } },
      { label: "英文每行字符容量（估）", get: function () {
          var z = curSize();
          return { v: "≈" + charCap(st.eff || st.size) + " 字符/行 @" + z.en + "px", tone: "" };
        } },
      { label: "本片最长句 71 字符折几行", get: function () {
          var k = st.eff || st.size;
          var n = linesOf(D.script[1].en, k, st.lang);
          return { v: n + " 行 @" + SIZES[k].en + "px", tone: n > 2 ? "bad" : "" };
        } },
      { label: "画面内词热区（44px 底线）", get: function () {
          var ws = els.en.querySelectorAll(".word");
          if (!ws.length) return "—";
          var mn = 1e9, mx = 0;
          Array.prototype.forEach.call(ws, function (w) {
            var hh = WT.hit(w);
            if (hh) { mn = Math.min(mn, hh.h); mx = Math.max(mx, hh.h); }
          });
          return { v: mn + "–" + mx + "px（22px 行距 + 外扩 4px）", tone: mx >= 44 ? "good" : "bad" };
        } },
      { label: "字号 / 语言档", get: function () {
          var v = SIZES[st.size].name + " · " + (st.lang === "en" ? "仅英文" : "中英双语");
          if (st.eff && st.eff !== st.size) v += " → 实际渲染 " + SIZES[st.eff].name + "（降档封顶生效）";
          return { v: v, tone: "" };
        } }
    ];
    if (st.openWord) {
      base.push({ label: "词卡遮住入画字幕", get: function () {
        var r = overlap(els.card, els.burn);
        return { v: Math.round(r) + "px", tone: r > 0 ? "bad" : "good" };
      } });
      base.push({ label: "词卡上沿 ← 入画字幕下沿", get: function () {
        var gap = els.card.getBoundingClientRect().top - els.burn.getBoundingClientRect().bottom;
        return { v: Math.round(gap) + "px", tone: "" };
      } });
    }
    return base.concat(extra || []);
  }

  function toggles(extra, dock) {
    var t = [
      { key: "pause", label: "点词后", on: "暂停", off: "继续播" },
      { key: "autoClose", label: "加入词库后", on: "自动关", off: "保持" }
    ];
    /* #27 定的默认卡口＝贴画面下沿（露控制条）；这个开关把它切到贴字幕下沿 */
    if (dock) t.push({ key: "dock", label: "词卡卡口", values: ["贴画面下沿（露控制条）", "贴字幕下沿（盖控制条）"] });
    return (extra || []).concat(t);
  }

  /* ── 通知 ── */
  function notify(name, arg) { (hooks[name] || []).forEach(function (f) { f(arg); }); }

  function bind(options) {
    cfg = options || {};
    els.burn = q(cfg.burn || "#burn");
    els.en = q(cfg.burnEn || "#burnEn");
    els.zh = q(cfg.burnZh || "#burnZh");
    if (!els.burn || !els.en) return null;
    /* cfg.mode = 「常驻 / 点出」；cfg.ctl = 控制条的选择器。两者曾经共用一个键，结果 q("tap") 查不到元素 */
    st.ctl = cfg.mode || "always";
    st.lang = cfg.lang || "both";        /* 甲 把中文请出画面是它的赌注，其余三条路线与 #24 对照同样默认中英双语 */

    var list = q(cfg.listSel || "#script");
    if (list) list.innerHTML = "";                       /* WT.build 会灌进来 */

    mountAA(cfg.aaRow || ".ctl .row");
    mountCard();
    wireCtl();
    if (st.ctl === "tap") { showCtl(false, false); }

    WT.build({
      listSel: cfg.listSel || "#script",
      onRow: function (idx) { renderBurn(idx); (cfg.onRow || function () {})(idx); },
      /* 文稿列表里的词也能点（产品的现有行为，本票不动）：开同一张词卡，但不换句 ——
         换句只认「点行」，否则「滚动预览 / 点行跳播」这组对照就说不清了 */
      onWord: cfg.onWord || function (w) { els.cardOpen && els.cardOpen(w); },
      toggles: toggles(cfg.toggles, cfg.dock !== false),
      boxes: (cfg.boxes || []).slice(),
      read: reads(cfg.reads),
      note: cfg.note
    });

    WT.on(function () { els.cardLayout && els.cardLayout(); });   /* 开关只改几何，不许再调 WT.refresh() */

    renderBurn(cfg.start != null ? cfg.start : st.cur);
    if (els.cardLayout) els.cardLayout();
    /* WT.build 的那次 refresh() 发生在 renderBurn 之前 —— 面板的首次绘制量到的是一块空字幕（18px / 0 行）。
       这里补一次：量尺必须描述它此刻看见的 DOM，否则面板一打开就先撒一个谎。 */
    WT.refresh();
    /* 而此刻壳还没挂（shell.js 等 DOMContentLoaded）：.main 满高 812、文稿列表读到 537px。
       壳挂完会广播 shell:ready —— 再补最后一面，此后所有读数都落在最终版面上。 */
    window.addEventListener("shell:ready", function () { WT.refresh(); });
    return { state: st, SIZES: SIZES, curSize: curSize, applyStyle: applyStyle, renderBurn: renderBurn,
             burnRead: burnRead, linesOf: linesOf, charCap: charCap, visiblePicture: visiblePicture,
             showCtl: showCtl, layoutCard: function () { els.cardLayout && els.cardLayout(); },
             closeCard: function () { els.cardClose && els.cardClose(); },
             on: function (name, f) { (hooks[name] = hooks[name] || []).push(f); },
             overlap: overlap };
  }

  window.SB = {
    bind: bind, state: st, SIZES: SIZES, reads: reads,
    overlap: overlap, visiblePicture: visiblePicture,
    linesOf: linesOf, charCap: charCap, toast: toast, subOn: subOn
  };
})();
