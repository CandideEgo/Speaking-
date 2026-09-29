/* #28 真实字幕压力测试 —— 一个脚本跑完三件事，产物是本目录 shots/ 里那批截图与控制台读数。
 *
 * 跑法：  node docs/design/mobile/prototypes/_real/run.js
 *
 * 它不把原型复制进仓库：每次都从**当前**的原型目录（B1-fit.html / B2-tap.html 及其 _*.css/_*.js）
 * 在系统临时目录里拼一份 fixture，只把 _demo.js 换成真实语料，量完即删。
 * 这样原型永远只有一份真身，快照不会烂掉。
 *
 * 纪律（本票一直守的）：
 *   · 量尺只读，不许改动被测对象；
 *   · 读数是真实的 getBoundingClientRect()；
 *   · 每一步都写明它量的那一态，别让「面板说的」和「此刻 DOM 的样子」分家。
 */
const { chromium } = require("C:/Users/Administrator/Speaking/frontend/node_modules/playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HERE = __dirname;
const SRC = path.join(HERE, "..");                 /* 原型目录 */
const OUT = path.join(HERE, "shots");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wf28-real-"));
["_base.css", "_wordtap.css", "_sub.css", "_wordtap.js", "_sub.js", "shell.js",
 "B1-fit.html", "B2-tap.html"].forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(TMP, f)));
fs.mkdirSync(OUT, { recursive: true });

/* 语料：corpus.js 是给浏览器之外的 Node 读的，用个 window 壳把它取出来 */
const REAL = (() => {
  const win = {};
  new Function("window", fs.readFileSync(path.join(HERE, "corpus.js"), "utf8") + "\nreturn window.REAL;")(win);
  return win.REAL;
})();

const file = n => "file:///" + path.join(TMP, n).replace(/\\/g, "/");

/* 把一批真实句子写成 fixture 的 _demo.js（原型读 window.DEMO） */
function useCorpus(list, title) {
  fs.writeFileSync(path.join(TMP, "_demo.js"),
    "/* 由 run.js 生成：真实字幕语料，不是原型自带的那 10 句演示句。 */\n" +
    "window.DEMO = " + JSON.stringify({
      title: title, channel: "生产库", level: "混合", duration: "17:43", viewed: "9:05",
      index: 98, total: list.length, progress: 0.5,
      current: { en: list[0].en, zh: list[0].zh || "" },
      script: list.map((s, i) => ({ t: s.t || "00:00", en: s.en, zh: s.zh || "", cur: i === 0 }))
    }, null, 1) + ";\n");
}

/* 量尺：只读，绝不改 DOM */
const probe = () => {
  const R = s => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect();
    return { y: Math.round(b.top), h: Math.round(b.height), b: Math.round(b.bottom) }; };
  const f = R(".frame"), burn = R("#burn"), en = R("#burnEn"), zh = R("#burnZh");
  const z = SB.SIZES[SB.state.eff || SB.state.size];
  return {
    frameH: f.h, burnH: burn.h,
    enLines: Math.round(en.h / z.lh),
    zhLines: SB.state.lang === "en" ? 0 : Math.round(zh.h / z.zlh),
    vis: SB.visiblePicture(),
    clipped: Math.max(0, Math.round(f.y - burn.y)),      /* >0 = 字幕块顶出画框，被 overflow:hidden 裁掉 */
    eff: z.en, lang: SB.state.lang,
    mark: (document.getElementById("clearDim") || {}).textContent || ""   /* 画框上那行标注，用来和读数对账 */
  };
};

const stat = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/* 开到一个确定的版面：控制条沉下 + 指定语言 / 档位（甲 还能指定封顶开关） */
async function open(page, f, lang, size, cap) {
  await page.goto(file(f));
  await page.waitForTimeout(480);
  await page.evaluate(() => { if (window.SB.state.ctlOn) document.querySelector(".frame").click(); });
  await page.evaluate(([lang, size]) => {
    document.querySelector(`#aaPop [data-k="lang"] [data-v="${lang}"]`).click();
    document.querySelector(`#aaPop [data-k="size"] [data-v="${size}"]`).click();
  }, [lang, size]);
  if (cap !== undefined) {
    await page.evaluate(cap => {
      const b = document.querySelector('[data-sw="cap"]');
      if (b && b.classList.contains("on") !== cap) b.click();
    }, cap);
  }
  await page.waitForTimeout(220);
}

const goRow = (page, i) => page.evaluate(i => document.querySelectorAll("#script li")[i].click(), i);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });

  /* ══ 一、5 句真实字幕 · 头对头 ═══════════════════════════════ */
  useCorpus(REAL.five, "How Micron's Building Biggest U.S. Chip Fab");
  console.log("\n═══ 一、5 句真实字幕（375×812 @2x，中档 16px）═══");
  const head = {};
  for (const [tag, f, lang] of [["甲·仅英文", "B1-fit.html", "en"], ["甲·中英双语", "B1-fit.html", "both"], ["乙·中英双语", "B2-tap.html", "both"]]) {
    await open(page, f, lang, "m");
    const rows = [];
    for (let i = 0; i < REAL.five.length; i++) {
      await goRow(page, i);
      await page.waitForTimeout(190);
      rows.push({ i, len: REAL.five[i].en.length, ...(await page.evaluate(probe)) });
      if (i === 2) {
        await page.screenshot({ path: path.join(OUT, "FRAME-" + tag + ".png") });
        await page.locator(".frame").screenshot({ path: path.join(OUT, "ONLYFRAME-" + tag + ".png") });
      }
    }
    head[tag] = rows;
    console.log("\n【" + tag + "】");
    rows.forEach(x => console.log(`  #${x.i} ${String(x.len).padStart(3)} 字符 · EN ${x.enLines} 行 + ZH ${x.zhLines} 行 · 块高 ${String(x.burnH).padStart(3)}px · 可见画面 ${String(x.vis).padStart(4)}px · 顶出画框 ${x.clipped}px · 画框标注「${x.mark}」`));
  }
  console.log("\n  同口径对打（甲 仅英文 vs 乙 中英双语）：");
  for (let i = 0; i < 5; i++) {
    const a = head["甲·仅英文"][i], b = head["乙·中英双语"][i];
    console.log(`    #${i}: 甲 ${String(a.vis).padStart(4)}px（无中文） vs 乙 ${String(b.vis).padStart(4)}px（含 ${b.zhLines} 行中文） → 乙多 ${b.vis - a.vis}px`);
  }

  /* ══ 二、179 字符那句的 2×2×3 网格 ══════════════════════════ */
  console.log("\n═══ 二、12 态网格（179 字符长句，甲 的封顶一律关掉 —— 比的是用户自己选的档）═══");
  const grid = [];
  for (const [tag, f] of [["甲", "B1-fit.html"], ["乙", "B2-tap.html"]]) {
    for (const lang of ["en", "both"]) {
      await open(page, f, lang, "m", false);
      for (const size of ["s", "m", "l"]) {
        await page.evaluate(([lang, size]) => {
          document.querySelector(`#aaPop [data-k="lang"] [data-v="${lang}"]`).click();
          document.querySelector(`#aaPop [data-k="size"] [data-v="${size}"]`).click();
        }, [lang, size]);
        await page.waitForTimeout(240);
        await goRow(page, 2);
        await page.waitForTimeout(180);
        grid.push({ tag, lang, size, ...(await page.evaluate(probe)) });
        if (size === "m") await page.screenshot({ path: path.join(OUT, `GRID-${tag}-${lang}-m.png`) });
      }
    }
  }
  console.log("  路线 语言    档   英文行 中文行   字幕块   可见画面   顶出画框   画框标注");
  grid.forEach(r => console.log(["  " + r.tag, r.lang === "en" ? "仅英文" : "中英双",
    String(r.eff).padStart(2) + "px", String(r.enLines).padStart(4), String(r.zhLines).padStart(5),
    String(r.burnH).padStart(6) + "px", String(r.vis).padStart(7) + "px", String(r.clipped).padStart(8) + "px",
    "\"" + r.mark + "\""].join("  ")));

  /* ══ 三、131 句生产采样 · 分布 ═════════════════════════════ */
  useCorpus(REAL.sampled, "生产字幕分布采样（仅英文）");
  console.log("\n═══ 三、131 句生产字幕（仅英文 · 中档 16px · 同口径）═══");
  const dist = {};
  for (const [tag, f, cap] of [["甲 · 允许长高", "B1-fit.html", false], ["甲 · 降档封顶", "B1-fit.html", true], ["乙 · 控制条沉下", "B2-tap.html", undefined]]) {
    await open(page, f, "en", "m", cap);
    const rows = [];
    for (let i = 0; i < REAL.sampled.length; i++) {
      await goRow(page, i);
      await page.waitForTimeout(70);
      rows.push({ len: REAL.sampled[i].en.length, ...(await page.evaluate(probe)) });
    }
    dist[tag] = rows;
    const vis = rows.map(x => x.vis);
    const hist = {}, eff = {};
    rows.forEach(x => { hist[x.enLines] = (hist[x.enLines] || 0) + 1; eff[x.eff] = (eff[x.eff] || 0) + 1; });
    console.log("\n【" + tag + "】n=" + rows.length);
    console.log(`  可见画面: 最差 ${Math.min(...vis)} | p10 ${stat(vis, .1)} | 中位 ${stat(vis, .5)} | 最好 ${Math.max(...vis)}`);
    console.log(`  跌破 #24 基线 67px: ${(rows.filter(x => x.vis < 67).length / rows.length * 100).toFixed(0)}%  ·  顶出画框: ${rows.filter(x => x.clipped > 0).length} 句`);
    console.log(`  英文折行: ${Object.keys(hist).sort((a, b) => a - b).map(k => k + "行:" + hist[k]).join("  ")}`);
    /* 「降档封顶」的代价必须量出来 —— 否则只会看到它把中位从 86 抬到 92，看不到它是怎么抬的 */
    console.log(`  实际生效字号: ${Object.keys(eff).sort((a, b) => a - b).map(k => k + "px:" + eff[k] + "句(" + (eff[k] / rows.length * 100).toFixed(0) + "%)").join("  ")}`);
  }
  console.log("\n  按句长看（真实句）：");
  const A = dist["甲 · 允许长高"], C = dist["甲 · 降档封顶"], B = dist["乙 · 控制条沉下"];
  const idx = [...A.keys()].sort((x, y) => A[x].len - A[y].len);
  [0, .25, .5, .75, .9, 1].forEach(p => {
    const i = idx[Math.min(idx.length - 1, Math.floor(p * idx.length))];
    console.log(`    ${String(A[i].len).padStart(3)} 字符 → 甲长高 ${A[i].enLines}行/${String(A[i].vis).padStart(3)}px · 甲封顶 ${C[i].enLines}行/${String(C[i].vis).padStart(3)}px · 乙 ${B[i].enLines}行/${String(B[i].vis).padStart(3)}px`);
  });

  console.log("\n报错:", errs.length ? errs : "0 条");
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
