import { createAutoLock, type AutoLockConfig } from '../autoLock';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// A controllable clock and timer queue. `advance` moves time and runs due timers;
// `jump` moves time WITHOUT running timers, like an app whose JS was suspended in the background.
function setup(initial: Partial<AutoLockConfig> = {}) {
  const config: AutoLockConfig = {
    backgroundTimeoutMs: 30 * SECOND,
    inactivityTimeoutMs: 5 * MINUTE,
    ...initial,
  };
  let time = 1_000_000;
  let nextId = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const lock = jest.fn();

  const autoLock = createAutoLock({
    getConfig: () => config,
    lock,
    now: () => time,
    setTimer: (run, ms) => {
      timers.set(++nextId, { at: time + ms, run });
      return nextId;
    },
    clearTimer: (id) => timers.delete(id as number),
  });

  return {
    autoLock,
    lock,
    config,
    advance(ms: number) {
      const target = time + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].run();
      }
      time = target;
    },
    jump(ms: number) {
      time += ms;
    },
    pendingTimers: () => timers.size,
  };
}

describe('inactivity lock', () => {
  test('locks after the inactivity timeout, not before', () => {
    const t = setup();
    t.autoLock.setUnlocked(true);
    t.advance(5 * MINUTE - 1);
    expect(t.lock).not.toHaveBeenCalled();
    t.advance(1);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('activity restarts the countdown', () => {
    const t = setup();
    t.autoLock.setUnlocked(true);
    t.advance(4 * MINUTE);
    t.autoLock.activity();
    t.advance(4 * MINUTE);
    expect(t.lock).not.toHaveBeenCalled();
    t.advance(1 * MINUTE);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('a shorter configured timeout is respected', () => {
    const t = setup({ inactivityTimeoutMs: 1 * MINUTE });
    t.autoLock.setUnlocked(true);
    t.advance(1 * MINUTE);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('does nothing while the vault is locked', () => {
    const t = setup();
    t.autoLock.activity();
    t.advance(60 * MINUTE);
    expect(t.lock).not.toHaveBeenCalled();
    expect(t.pendingTimers()).toBe(0);
  });

  test('locking by hand cancels the timers', () => {
    const t = setup();
    t.autoLock.setUnlocked(true);
    t.autoLock.setUnlocked(false);
    t.advance(60 * MINUTE);
    expect(t.lock).not.toHaveBeenCalled();
    expect(t.pendingTimers()).toBe(0);
  });

  test('the timeout is read when the timer starts, so changed settings apply on next activity', () => {
    const t = setup();
    t.autoLock.setUnlocked(true);
    t.config.inactivityTimeoutMs = 1 * MINUTE;
    t.autoLock.activity();
    t.advance(1 * MINUTE);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });
});

describe('background lock', () => {
  test('timeout 0 locks the moment the app leaves the foreground', () => {
    const t = setup({ backgroundTimeoutMs: 0 });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('locks when the timer fires while backgrounded', () => {
    const t = setup({ backgroundTimeoutMs: 30 * SECOND });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.advance(29 * SECOND);
    expect(t.lock).not.toHaveBeenCalled();
    t.advance(1 * SECOND);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('stays unlocked when the user returns before the timeout', () => {
    const t = setup({ backgroundTimeoutMs: 30 * SECOND });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.advance(29 * SECOND);
    t.autoLock.appStateChanged('active');
    t.advance(60 * SECOND);
    expect(t.lock).not.toHaveBeenCalled();
  });

  test('locks on return if the timeout passed while JS timers were suspended', () => {
    const t = setup({ backgroundTimeoutMs: 1 * MINUTE });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.jump(61 * SECOND); // timers never ran
    t.autoLock.appStateChanged('active');
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('the exact timeout counts as expired on return', () => {
    const t = setup({ backgroundTimeoutMs: 30 * SECOND });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.jump(30 * SECOND);
    t.autoLock.appStateChanged('active');
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('a clock that went backwards locks on return', () => {
    const t = setup({ backgroundTimeoutMs: 5 * MINUTE });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.jump(-10 * MINUTE);
    t.autoLock.appStateChanged('active');
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('time spent in the background is measured from the first non-active state', () => {
    const t = setup({ backgroundTimeoutMs: 30 * SECOND });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('inactive');
    t.jump(20 * SECOND);
    t.autoLock.appStateChanged('background'); // must not restart the clock
    t.jump(15 * SECOND);
    t.autoLock.appStateChanged('active');
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('coming back restarts the inactivity countdown from zero', () => {
    const t = setup({ backgroundTimeoutMs: 30 * SECOND, inactivityTimeoutMs: 5 * MINUTE });
    t.autoLock.setUnlocked(true);
    t.advance(4 * MINUTE);
    t.autoLock.appStateChanged('background');
    t.advance(10 * SECOND);
    t.autoLock.appStateChanged('active');
    t.advance(4 * MINUTE);
    expect(t.lock).not.toHaveBeenCalled();
    t.advance(1 * MINUTE);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('the inactivity timer does not run, or lock, while backgrounded', () => {
    const t = setup({ backgroundTimeoutMs: 60 * MINUTE, inactivityTimeoutMs: 1 * MINUTE });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.advance(30 * MINUTE);
    expect(t.lock).not.toHaveBeenCalled();
  });

  test('does nothing when already locked', () => {
    const t = setup({ backgroundTimeoutMs: 0 });
    t.autoLock.appStateChanged('background');
    t.autoLock.appStateChanged('active');
    expect(t.lock).not.toHaveBeenCalled();
  });

  test('locks only once even if several triggers fire', () => {
    const t = setup({ backgroundTimeoutMs: 30 * SECOND });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.advance(30 * SECOND);
    t.autoLock.appStateChanged('active');
    t.advance(60 * MINUTE);
    expect(t.lock).toHaveBeenCalledTimes(1);
  });

  test('can lock again after being unlocked again', () => {
    const t = setup({ backgroundTimeoutMs: 0 });
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    t.autoLock.appStateChanged('active');
    t.autoLock.setUnlocked(true);
    t.autoLock.appStateChanged('background');
    expect(t.lock).toHaveBeenCalledTimes(2);
  });

  test('dispose cancels everything', () => {
    const t = setup();
    t.autoLock.setUnlocked(true);
    t.autoLock.dispose();
    t.advance(60 * MINUTE);
    expect(t.lock).not.toHaveBeenCalled();
    expect(t.pendingTimers()).toBe(0);
  });
});
