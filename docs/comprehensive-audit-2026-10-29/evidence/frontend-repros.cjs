// Run from frontend/: node ../docs/comprehensive-audit-2026-10-29/evidence/frontend-repros.cjs
// Executes current TypeScript source with deterministic boundary stubs. No services are used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

async function watchScenario(name, samples) {
  let now = 0;
  const batches = [];
  const context = {
    exports: {},
    require: (id) => id === '@/lib/api'
      ? { api: async (_path, options) => batches.push(JSON.parse(options.body)), getApiUrl: () => '' }
      : { useAuthStore: { getState: () => ({ token: null }) } },
    window: { addEventListener: () => {} },
    crypto: { randomUUID: () => name },
    Date: { now: () => now },
    setInterval: () => 1,
    fetch: () => Promise.resolve({ ok: true }),
    document: { visibilityState: 'visible' },
  };
  vm.runInNewContext(compile('src/lib/analytics.ts'), context);
  for (const [at, position] of samples) {
    now = at;
    context.exports.trackWatchTime('video-1', position);
  }
  await context.exports.flush();
  const events = batches.flatMap((batch) => batch.events);
  return {
    name, samples,
    totalWatchSeconds: events.reduce((sum, event) => sum + (event.event_payload?.delta_s || 0), 0),
    events,
  };
}

async function paginationScenario() {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let result;
  const calls = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (update) => {
        const next = typeof update === 'function' ? update(slots[index].value) : update;
        if (!Object.is(next, slots[index].value)) {
          slots[index].value = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const old = slots[index];
        slots[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => {
          slots[index].cleanup?.();
          slots[index].cleanup = fn();
        });
      }
    },
  };
  const context = {
    exports: {}, require: () => react,
    IntersectionObserver: class { observe() {} disconnect() {} },
  };
  vm.runInNewContext(compile('src/hooks/usePaginatedList.ts'), context);
  const fetcher = async (page) => {
    calls.push(page);
    if (page === 2) throw Error('simulated page 2 failure');
    return { items: [`row-page-${page}`], total: 3, has_more: page < 3, page, page_size: 1 };
  };
  function render() {
    dirty = false;
    cursor = 0;
    result = context.exports.usePaginatedList({ fetcher, mode: 'append' });
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
  }
  async function settle() {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
      if (dirty) render();
    }
  }
  const snapshot = (step) => ({ step, page: result.page, items: result.items, error: result.error, requests: [...calls] });
  render();
  await settle();
  const states = [snapshot('initial page 1')];
  result.loadMore();
  await settle();
  states.push(snapshot('load page 2 fails'));
  result.loadMore();
  await settle();
  states.push(snapshot('click current UI retry: loadMore'));
  return {
    source: 'frontend/src/hooks/usePaginatedList.ts',
    method: 'Execute unmodified hook after TypeScript transpile with minimal React hook lifecycle harness; page 2 fetcher always rejects',
    states,
  };
}

function save(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ file, ...data }, null, 2));
}

(async () => {
  save('analytics-watch-time-repro.json', {
    source: 'frontend/src/lib/analytics.ts',
    method: 'Execute unmodified module after TypeScript transpile with controlled Date.now and mocked transport; no service or production data used',
    results: await Promise.all([
      watchScenario('normal_10_seconds', [[0, 0], [10000, 10]]),
      watchScenario('seek_to_120_after_10_seconds', [[0, 0], [10000, 120]]),
      watchScenario('repeat_5_second_clip_for_20_seconds', [[0, 0], [5000, 5], [10000, 0], [15000, 5], [20000, 0]]),
      watchScenario('leave_after_9_seconds', [[0, 0], [9000, 9]]),
    ]),
  });
  save('pagination-retry-repro.json', await paginationScenario());
})().catch((error) => { console.error(error); process.exitCode = 1; });
