// Recognises a shake from accelerometer readings (in g, gravity included, so a phone lying still
// reads about 1). Pure and clock-free, so it is easy to test. Nothing is stored or logged.

// A jolt: the total pull is far from 1 g. Walking and a bump on a table stay below this.
const JOLT_G = 1.6;
// At least this many separate jolts, within this time, make a shake.
const REQUIRED_JOLTS = 3;
const WINDOW_MS = 1200;
// Readings of one jolt arrive in a burst; only count a new jolt after this gap.
const MIN_GAP_MS = 130;
// After a shake, ignore further shaking for a moment (the vault is locking).
const COOLDOWN_MS = 2000;

export type ShakeDetector = { feed: (x: number, y: number, z: number, now: number) => void };

export function createShakeDetector(onShake: () => void): ShakeDetector {
  let jolts: number[] = [];
  let quietUntil = 0;

  return {
    feed(x, y, z, now) {
      if (now < quietUntil) return;
      const pull = Math.sqrt(x * x + y * y + z * z);
      if (!Number.isFinite(pull) || Math.abs(pull - 1) < JOLT_G) return;

      const last = jolts[jolts.length - 1];
      if (last !== undefined && now - last < MIN_GAP_MS) return;
      jolts = [...jolts.filter((t) => now - t <= WINDOW_MS), now];

      if (jolts.length >= REQUIRED_JOLTS) {
        jolts = [];
        quietUntil = now + COOLDOWN_MS;
        onShake();
      }
    },
  };
}
