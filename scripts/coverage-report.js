// Prints coverage per area from coverage/coverage-summary.json (made by `npm run test:coverage`),
// and lists the files in the security-critical areas whose coverage is low.
// Usage: node scripts/coverage-report.js
const fs = require('fs');
const path = require('path');

const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('Run "npm run test:coverage" first.');
  process.exit(1);
}
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const norm = (p) => p.replace(/\\/g, '/');
const rel = (p) => norm(p).split('/KiteVault/').pop();

const AREAS = {
  'crypto (src/crypto)': 'src/crypto/',
  'vault format + store (src/vault)': 'src/vault/',
  '  of which merge': 'src/vault/merge',
  'TOTP (features/totp)': 'src/features/totp/',
  'generator (features/generator)': 'src/features/generator/',
  'import / export (features/transfer)': 'src/features/transfer/',
  'cloud backup (features/backup)': 'src/features/backup/',
  'security check': 'src/features/securityCheck/',
  'autofill (TypeScript side)': 'src/features/autofill/',
  'native wrappers (src/native)': 'src/native/',
};

const pct = (covered, total) =>
  total === 0 ? '   -' : ((100 * covered) / total).toFixed(1).padStart(5);

function totals(filter) {
  const t = { statements: [0, 0], branches: [0, 0], functions: [0, 0], lines: [0, 0] };
  for (const [file, v] of Object.entries(summary)) {
    if (file === 'total' || !filter(rel(file))) continue;
    for (const key of Object.keys(t)) {
      t[key][0] += v[key].covered;
      t[key][1] += v[key].total;
    }
  }
  return t;
}

console.log('area'.padEnd(40), 'stmts', 'branch', ' funcs', ' lines');
for (const [name, prefix] of Object.entries(AREAS)) {
  const t = totals((f) => f.includes(prefix));
  console.log(
    name.padEnd(40),
    pct(...t.statements),
    ' ',
    pct(...t.branches),
    ' ',
    pct(...t.functions),
    ' ',
    pct(...t.lines),
  );
}
const all = summary.total;
console.log(
  'ALL of src (excluding Kotlin)'.padEnd(40),
  String(all.statements.pct).padStart(5),
  ' ',
  String(all.branches.pct).padStart(5),
  ' ',
  String(all.functions.pct).padStart(5),
  ' ',
  String(all.lines.pct).padStart(5),
);

const CRITICAL =
  /src\/(crypto|vault|features\/(totp|generator|transfer|backup|securityCheck|autofill))\//;
console.log('\nFiles in the areas above with lines < 90% or branches < 75%:');
let any = false;
for (const [file, v] of Object.entries(summary)) {
  const f = rel(file);
  if (file === 'total' || !CRITICAL.test(f)) continue;
  if (v.lines.pct < 90 || v.branches.pct < 75) {
    any = true;
    console.log(
      `  lines ${String(v.lines.pct).padStart(5)}  branches ${String(v.branches.pct).padStart(5)}  ${f}`,
    );
  }
}
if (!any) console.log('  none');
