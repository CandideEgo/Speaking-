import fs from "node:fs";
import path from "node:path";
const root = "C:/Users/Fuwei/speaking";
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const backend = files(path.join(root, "backend/app")).filter(f => f.endsWith(".py"));
const frontend = files(path.join(root, "frontend/src")).filter(f => /\.(ts|tsx|css)$/.test(f));
const api = backend.filter(f => f.includes(`${path.sep}api${path.sep}v1${path.sep}`));
const endpointCounts = api.map(f => {
  const src = fs.readFileSync(f, "utf8");
  const routes = [...src.matchAll(/@router\.(get|post|put|patch|delete|websocket)\(/g)].length;
  return { file: path.relative(root, f).replaceAll("\\", "/"), routes };
});
const result = {
  counts: {
    backendPythonFiles: backend.length,
    frontendSourceFiles: frontend.length,
    frontendPages: frontend.filter(f => f.endsWith(`${path.sep}page.tsx`)).length,
    apiModules: api.length,
    apiDecorators: endpointCounts.reduce((a, b) => a + b.routes, 0),
    models: backend.filter(f => f.includes(`${path.sep}models${path.sep}`)).reduce((a, f) => a + [...fs.readFileSync(f, "utf8").matchAll(/__tablename__\s*=/g)].length, 0),
    migrationFiles: files(path.join(root, "backend/migrations/versions")).filter(f => f.endsWith(".py")).length,
    backendTestFiles: files(path.join(root, "backend/tests")).filter(f => /test_.*\.py$/.test(f)).length,
    frontendUnitTestFiles: frontend.filter(f => /\.test\.tsx?$/.test(f)).length,
    frontendE2eSpecs: files(path.join(root, "frontend/e2e")).filter(f => f.endsWith(".spec.ts")).length,
    gpuTestFiles: files(path.join(root, "gpu-worker/tests")).filter(f => /test_.*\.py$/.test(f)).length,
  },
  largestFiles: [...backend, ...frontend].map(f => ({file: path.relative(root, f).replaceAll("\\", "/"), lines: fs.readFileSync(f, "utf8").split("\n").length})).sort((a,b)=>b.lines-a.lines).slice(0, 18),
  endpointCounts
};
fs.writeFileSync(path.join(root, "docs/comprehensive-audit-2026-10-29/evidence/inventory.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({counts: result.counts, largestFiles: result.largestFiles}, null, 2));
