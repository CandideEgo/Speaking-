/* ══════════════════════════════════════════════════════════════
   SeeWord 原型统一脚本 —— 主题切换（全部页面共享）
   · 初始主题：localStorage('sw-theme') > prefers-color-scheme
   · 页面已有 .theme-toggle 按钮则接管；没有则自动注入右下角按钮
   ══════════════════════════════════════════════════════════════ */
(function () {
  var KEY = 'sw-theme';
  var root = document.documentElement;

  var SUN = '<svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var MOON = '<svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function preferred() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) { /* ignore */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    root.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(KEY, theme); } catch (e) { /* ignore */ }
    syncIcons();
  }

  function syncIcons() {
    var isDark = root.classList.contains('dark');
    document.querySelectorAll('.theme-toggle, #themeToggle').forEach(function (btn) {
      var sun = btn.querySelector('.icon-sun');
      var moon = btn.querySelector('.icon-moon');
      if (sun) sun.style.display = isDark ? 'none' : 'block';
      if (moon) moon.style.display = isDark ? 'block' : 'none';
    });
  }

  function init() {
    apply(preferred());

    var btn = document.querySelector('.theme-toggle') || document.getElementById('themeToggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'theme-toggle';
      btn.type = 'button';
      btn.setAttribute('aria-label', '切换主题');
      btn.title = '切换主题';
      btn.innerHTML = SUN + MOON;
      document.body.appendChild(btn);
    } else if (!btn.querySelector('.icon-sun')) {
      btn.innerHTML = SUN + MOON;
    }

    var all = document.querySelectorAll('.theme-toggle, #themeToggle');
    all.forEach(function (b) {
      b.addEventListener('click', function () {
        apply(root.classList.contains('dark') ? 'light' : 'dark');
      });
    });
    syncIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
