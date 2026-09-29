/* #26 跟读/练习区容器原型 —— 四条方案共享的「跟读内容 + 状态机 + 波形」
 *
 * 只做三件事：
 *   ① 演示数据（要跟读的句子 / 最近跟读 5 条 / 波形包络）—— 内容共用，容器各写各的；
 *   ② 状态机（放本句 → 自动开录 → 回放对比 → 满意/重录/下一句）—— 复刻 useSentenceShadowing
 *      与 useSpeakingRecorder 的真实顺序，但不真录音（原型不碰麦克风）；
 *   ③ 渲染公共层级（原句 / 状态行 / 波形对比 / 动作行 / 最近跟读）—— PR.mount(host, opts)。
 *
 * 用法见 P0..P3。依赖 _demo.js（DEMO.script）与 _wordtap.css（#24 乙 的外壳）。
 */
(function () {
  var D = window.DEMO || { script: [], current: {} };

  /* ── 最近跟读：5 条（对应 attempts.slice(0, 5)）── */
  var attempts = [
    { at: "22:14", dur: "00:05", ok: true },
    { at: "22:11", dur: "00:07" },
    { at: "22:09", dur: "00:04", ok: true },
    { at: "22:06", dur: "00:06" },
    { at: "22:03", dur: "00:09" }
  ];

  /* 真录音是 webm/opus。原型放一段 0.4s 静音 WAV，好让 <audio controls> 真的画出来
     —— 现状那一行用的就是原生控件，它的形状本身就是要看的东西。 */
  var SILENT = (function () {
    try {
      var rate = 8000, n = rate * 0.4, bytes = 44 + n * 2;
      var buf = new ArrayBuffer(bytes), v = new DataView(buf);
      function s(o, str) { for (var i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); }
      s(0, "RIFF"); v.setUint32(4, bytes - 8, true); s(8, "WAVE");
      s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      s(36, "data"); v.setUint32(40, n * 2, true);
      var b = new Uint8Array(buf), bin = "";
      for (var k = 0; k < b.length; k++) bin += String.fromCharCode(b[k]);
      return "data:audio/wav;base64," + btoa(bin);
    } catch (e) { return ""; }
  })();

  /* ── 包络：同一个 seed 每次画出同一张图 ── */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function envelope(seed, n) {
    var h = hash(seed), out = [];
    for (var i = 0; i < n; i++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      var a = (h % 977) / 977;
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      var b = (h % 977) / 977;
      var shape = 0.55 + 0.45 * Math.sin((i / n) * Math.PI);
      out.push(Math.max(.06, Math.min(1, (.25 + a * .75) * shape * (.55 + b * .45))));
    }
    return out;
  }

  /* half: null（居中）/ "up"（画中线上方）/ "down"（画中线下方） */
  function paint(cv, env, color, half) {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    var n = env.length, bw = Math.max(1, w / n - 1);
    for (var i = 0; i < n; i++) {
      var bh = half ? Math.max(1.2, env[i] * (h / 2 - 2)) : Math.max(1.5, env[i] * (h - 4));
      var x = i * (bw + 1);
      var y = half === "up" ? (h / 2 - bh) : half === "down" ? (h / 2) : (h - bh) / 2;
      ctx.globalAlpha = .45 + env[i] * .55;
      ctx.fillRect(x, y, bw, bh);
    }
    ctx.globalAlpha = 1;
  }

  var COLOR_ORIG = "#a1a1aa", COLOR_MINE = "#ff5a1f";

  /* ── ② 状态机 ──
     复刻真顺序：逐句跟读 start() → 放本句 → 句末自动开录 → 停止 → reviewing → 下一句。
     差别一处：现状录制中不显示计时（seconds 只在上传时用掉），这里把它画出来并读数。 */
  var state = { mode: "idle", sec: 0, idx: 2, saved: 0, playing: null };
  var listeners = [];
  var t1 = null, t2 = null;

  function emit() { listeners.forEach(function (f) { f(state); }); }
  function clear() { if (t1) { clearTimeout(t1); t1 = null; } if (t2) { clearInterval(t2); t2 = null; } }
  function auto() { return !!(window.WT && WT.state.autoAdvance); }

  function play() {
    clear();
    state.mode = "playing"; state.sec = 0; emit();
    t1 = setTimeout(beginRec, 1600);
  }
  function beginRec() {
    clear();
    state.mode = "rec"; state.sec = 0; emit();
    t2 = setInterval(function () { state.sec++; if (state.sec > 99) stop(); emit(); }, 1000);
  }
  function stop() {
    clear();
    state.mode = "review"; emit();
    if (auto()) t1 = setTimeout(next, 1600);
  }
  function next() {
    state.idx = (state.idx + 1) % D.script.length;
    play();
  }
  function exit() { clear(); state.mode = "idle"; state.sec = 0; emit(); }
  function save() {
    state.saved++; emit();
    if (auto()) { clear(); t1 = setTimeout(function () { exit(); }, 900); }
  }
  function setMode(m) {
    clear();
    if (m === "playing") play();
    else if (m === "rec") beginRec();
    else if (m === "review") { state.mode = "review"; state.sec = state.sec || 5; emit(); }
    else exit();
  }

  function clock(s) { return "00:" + String(s).padStart(2, "0"); }

  /* ── ③ 公共层级 ── */
  function wordSpans(en) {
    return en.split(/\s+/).filter(Boolean).map(function (t) { return '<span class="w">' + t + "</span>"; }).join(" ");
  }

  function historyHTML(mode) {
    if (mode === "none") return "";
    if (mode === "strip") {
      return '<button class="pr-strip" data-pr-hist><span class="k">最近跟读</span>' +
        '<span>最近跟读 ' + attempts.length + " 条</span>" +
        '<span class="n">展开 ▸</span></button>';
    }
    return '<div class="pr-hist" data-pr-hist>' +
      '<div class="pr-hd"><span>最近跟读</span><span class="c">' + attempts.length + " 条</span></div>" +
      '<div class="pr-hlist">' + attempts.map(function (a) {
        return '<div class="pr-hrow">' +
          '<audio controls preload="none" src="' + SILENT + '"></audio>' +
          '<span class="pr-ht">' + a.at + " · " + a.dur + "</span>" +
          (a.ok ? '<span class="pr-hs">✓ 满意</span>' : "") +
          '<button class="pr-hdel" aria-label="删除这条跟读录音">🗑</button>' +
          "</div>";
      }).join("") + "</div></div>";
  }

  /* opts: { hist: "full"|"strip"|"none", hide: ["sent"|"state"|"wave"|"acts"] } */
  function mount(host, opts) {
    opts = opts || {};
    var hide = opts.hide || [];
    function want(n) { return hide.indexOf(n) < 0; }
    var html = '<div class="pr-wrap">';
    if (want("sent")) {
      html += '<div class="pr-sent"><div class="pr-k"><span>要跟读的这一句</span><span class="n" data-pr-count></span></div>' +
        '<div class="pr-en" data-pr-en></div><div class="pr-zh" data-pr-zh></div></div>';
    }
    if (want("state")) html += '<div class="pr-state" data-pr-state><span class="dot"></span><span data-pr-text></span><span class="tm" data-pr-tm></span></div>';
    if (want("wave")) {
      html += '<div class="pr-wave" data-pr-wave>' +
        '<button class="pr-wrow" data-pr-row="orig" data-act="playorig" type="button"><span class="pr-wlbl">▶ 原声</span>' +
        '<canvas class="pr-wcv" data-wave="orig"></canvas></button>' +
        '<button class="pr-wrow" data-pr-row="mine" data-act="playmine" type="button"><span class="pr-wlbl">▶ 我的</span>' +
        '<canvas class="pr-wcv" data-wave="mine"></canvas></button>' +
        '<button class="pr-wrow" data-pr-row="both" data-act="playboth" type="button" hidden><span class="pr-wlbl">▶ 对比</span>' +
        '<canvas class="pr-wcv" data-wave="both"></canvas></button>' +
        "</div>" +
        '<div class="pr-wnote" data-pr-wnote></div>';
    }
    if (want("acts")) html += '<div class="pr-acts" data-pr-acts></div>';
    html += historyHTML(opts.hist || "full");
    html += "</div>";
    host.innerHTML = html;
    render(host);
    return host.firstChild;
  }

  function render(host) {
    host = host || document;
    var row = D.script[state.idx] || { en: "", zh: "" };
    var en = host.querySelector("[data-pr-en]");
    if (en) en.innerHTML = wordSpans(row.en);
    var zh = host.querySelector("[data-pr-zh]");
    if (zh) zh.textContent = row.zh;
    var c = host.querySelector("[data-pr-count]");
    if (c) c.textContent = D.index + state.idx - 2 + " / " + D.total;

    var st = host.querySelector("[data-pr-state]");
    if (st) {
      st.className = "pr-state" + (state.mode === "rec" ? " rec" : state.mode === "review" ? " review" : "");
      var text = { idle: "按麦克风开始 —— 先听一遍原句", playing: "正在放本句…（放完自动开录）",
        rec: "● 录音中 —— 读完按停止", review: "录音已保存 —— 对比一下" }[state.mode];
      st.querySelector("[data-pr-text]").textContent = text;
      st.querySelector("[data-pr-tm]").textContent = state.mode === "rec" ? clock(state.sec) : state.mode === "review" ? clock(state.sec) : "";
    }

    var wave = host.querySelector("[data-pr-wave]");
    if (wave) {
      var merged = !!(window.WT && WT.state.waveOne);
      var rec = state.mode === "rec";
      var show = rec || state.mode === "review";
      wave.hidden = !show;
      /* 录音中：只留一条按容器实宽的实时波形（现状是固定 200px 的一条，且没有计时）。
         回放态才需要「原声 / 我的」的对比，此时才由「合并一条」开关决定一条还是两条。 */
      function row(k) { return wave.querySelector('[data-pr-row="' + k + '"]'); }
      row("orig").hidden = rec || merged;
      row("mine").hidden = merged && !rec;
      row("both").hidden = !merged || rec;
      var mineLbl = row("mine").querySelector(".pr-wlbl");
      if (mineLbl) mineLbl.textContent = rec ? "● 实时" : "▶ 我的";
      var note = host.querySelector("[data-pr-wnote]");
      if (note) {
        note.hidden = !show;
        note.textContent = rec
          ? "录音中：一条按容器实宽的实时波形 + 计时（现状：AudioWaveform 固定 200px、无宽度类，且录音中不显示秒数）"
          : merged ? "回放对比：原声在上、我的在下，共用一条画布（合并方案）"
          : "回放对比：两行分开（现状 WaveformCompare 两行各一条 canvas width=400）";
      }
    }

    var acts = host.querySelector("[data-pr-acts]");
    if (acts) {
      if (state.mode === "rec") {
        acts.innerHTML = '<button class="btn rec" data-act="stop">■ 停止录音</button>' +
          '<button class="btn" data-act="exit">取消</button>';
      } else if (state.mode === "review") {
        acts.innerHTML = '<button class="btn" data-act="again">重录</button>' +
          '<button class="btn ok" data-act="save">✓ 满意</button>' +
          '<button class="btn primary" data-act="next">下一句</button>';
      } else if (state.mode === "playing") {
        acts.innerHTML = '<button class="btn" data-act="skip">跳过原句，直接录</button>' +
          '<button class="btn" data-act="exit">取消</button>';
      } else {
        acts.innerHTML = '<button class="btn primary" data-act="start">🎤 开始跟读本句</button>';
      }
    }

    paintAll(host);
  }

  function paintAll(host) {
    host = host || document;
    var seed = "s" + state.idx;
    Array.prototype.forEach.call(host.querySelectorAll("[data-wave]"), function (cv) {
      if (cv.hidden || !cv.clientWidth) return;
      var k = cv.getAttribute("data-wave");
      if (k === "orig") paint(cv, envelope(seed + "-orig", 72), COLOR_ORIG, null);
      else if (k === "mine") paint(cv, envelope(seed + "-mine" + (state.mode === "rec" ? "-live" + state.sec : state.saved + state.mode), 72), COLOR_MINE, null);
      else if (k === "both") {
        paint(cv, envelope(seed + "-orig", 72), COLOR_ORIG, "up");
        paint(cv, envelope(seed + "-mine" + state.saved, 72), COLOR_MINE, "down");
      } else if (k === "live") paint(cv, envelope("live" + (state.sec % 7), 24), COLOR_MINE, null);
    });
  }

  function on(fn) { listeners.push(fn); }
  function each(fn) { listeners.forEach(fn); }

  /* 量尺小件：四个页面共用，免得每页各写一遍 */
  function rect(sel) {
    var e = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!e) return null;
    var r = e.getBoundingClientRect();
    return r.width || r.height ? r : null;
  }
  function overlap(a, b) {
    var ra = rect(a), rb = rect(b);
    if (!ra || !rb) return 0;
    return Math.round(Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)));
  }
  /* 可见高度：元素被祖先裁掉的部分不算 —— 抽屉/承载面板会裁，单看矩形会报大 */
  function visibleH(sel) {
    var r = rect(sel);
    if (!r) return 0;
    var top = r.top, bottom = r.bottom;
    var e = typeof sel === "string" ? document.querySelector(sel) : sel;
    var p = e.parentElement;
    while (p && !p.classList.contains("app")) {
      var pr = p.getBoundingClientRect();
      var oy = getComputedStyle(p).overflowY;
      if (oy === "hidden" || oy === "auto" || oy === "scroll") {
        top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
      }
      p = p.parentElement;
    }
    return Math.round(Math.max(0, bottom - top));
  }
  /* 是否在滚动视口内（逐级收紧：祖先里凡是会裁的容器都算） */
  function inView(sel, boxSel) {
    var r = rect(sel);
    if (!r) return null;
    var e = typeof sel === "string" ? document.querySelector(sel) : sel;
    var b = rect(boxSel || ".app");
    if (!b) return null;
    var box = { top: b.top, bottom: b.bottom };
    var p = e.parentElement;
    while (p && !p.classList.contains("app")) {
      var pr = p.getBoundingClientRect();
      var oy = getComputedStyle(p).overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "hidden") {
        box.top = Math.max(box.top, pr.top);
        box.bottom = Math.min(box.bottom, pr.bottom);
      }
      p = p.parentElement;
    }
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
  }
  function overflowY(sel) {
    var e = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!e) return 0;
    return Math.round(e.scrollHeight - e.clientHeight);
  }

  function minTarget(sels) {
    var best = null;
    Array.prototype.forEach.call(sels, function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (e) {
        var r = e.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var v = Math.min(r.width, r.height);
        if (!best || v < best.v) best = { v: Math.round(v), sel: sel };
      });
    });
    return best;
  }
  /* 横向撑破：容器内容宽 - 容器宽，取最大 */
  function overflowX(sels) {
    var worst = 0, who = "";
    Array.prototype.forEach.call(sels, function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (e) {
        var d = e.scrollWidth - e.clientWidth;
        if (d > worst) { worst = d; who = sel; }
      });
    });
    return { px: Math.round(worst), sel: who };
  }

  window.PR = {
    state: state,
    attempts: attempts,
    mount: mount,
    render: render,
    on: on,
    emit: emit,
    start: play,
    skip: beginRec,
    stop: stop,
    next: next,
    exit: exit,
    save: save,
    again: function () { state.mode = "idle"; emit(); },
    setMode: setMode,
    clock: clock,
    envelope: envelope,
    paintAll: paintAll,
    rect: rect,
    overlap: overlap,
    visibleH: visibleH,
    minTarget: minTarget,
    overflowX: overflowX,
    inView: inView,
    overflowY: overflowY,
    SILENT: SILENT
  };

  /* 所有动作按钮走同一处委托：四个页面不必各写一遍 */
  document.addEventListener("click", function (e) {
    if (e.target.closest(".pr-strip")) {
      var wrapHost = e.target.closest(".pr-wrap").parentNode;
      var hide = (wrapHost.getAttribute("data-hide") || "").split(",").filter(Boolean);
      mount(wrapHost, { hist: "full", hide: hide });
      if (window.WT) WT.refresh();
      return;
    }
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var a = b.getAttribute("data-act");
    if (a === "start") play();
    else if (a === "skip") beginRec();
    else if (a === "stop") stop();
    else if (a === "again") { state.mode = "idle"; state.sec = 0; emit(); }
    else if (a === "save") save();
    else if (a === "next") next();
    else if (a === "exit") exit();
    else if (a === "playorig" || a === "playmine" || a === "playboth") {
      b.classList.add("on");
      setTimeout(function () { b.classList.remove("on"); }, 900);
    }
  });
})();
