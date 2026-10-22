// Times Argon2id on THIS computer for a few settings, to help choose the unlock cost.
//
//   node scripts/bench-kdf.js
//
// A computer is much faster than a mid-range phone, so the numbers here are only a floor. The real
// figure for the app must be measured on a phone: see "Performance" in docs/RELEASE_POLISH.md.
// Needs Node 24.7 or newer (crypto.argon2). Uses a throw-away password; nothing is stored.
const { argon2Sync, randomBytes } = require('node:crypto');

const SETTINGS = [
  { label: 'floor (19 MiB, 2 passes)', memory: 19 * 1024, passes: 2 },
  { label: '46 MiB, 1 pass (OWASP)', memory: 46 * 1024, passes: 1 },
  { label: '64 MiB, 3 passes (app default)', memory: 64 * 1024, passes: 3 },
  { label: '64 MiB, 2 passes', memory: 64 * 1024, passes: 2 },
  { label: '96 MiB, 3 passes', memory: 96 * 1024, passes: 3 },
  { label: '128 MiB, 3 passes', memory: 128 * 1024, passes: 3 },
];
const RUNS = 5;

if (typeof argon2Sync !== 'function') {
  console.error('This needs Node 24.7 or newer.');
  process.exit(1);
}

const nonce = randomBytes(16);
for (const s of SETTINGS) {
  const times = [];
  for (let i = 0; i < RUNS + 1; i++) {
    const start = process.hrtime.bigint();
    argon2Sync('argon2id', {
      message: Buffer.from('benchmark-only-password'),
      nonce,
      parallelism: 1,
      tagLength: 32,
      memory: s.memory,
      passes: s.passes,
    });
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.shift(); // the first run warms up
  times.sort((a, b) => a - b);
  console.log(
    s.label.padEnd(34),
    `median ${times[Math.floor(RUNS / 2)].toFixed(0)} ms`.padEnd(16),
    `(min ${times[0].toFixed(0)}, max ${times[RUNS - 1].toFixed(0)})`,
  );
}
