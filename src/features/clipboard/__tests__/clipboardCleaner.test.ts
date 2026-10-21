import { createClipboardCleaner } from '../clipboardCleaner';

// A fake clipboard, clock and timer queue. `advance` runs due timers; `jump` moves the clock
// without running them (an app whose JS was suspended in the background).
function setup() {
  let time = 1_000_000;
  let nextId = 0;
  let foreground = true;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clipboard = { text: '' };
  const writes: string[] = [];
  const failures = { read: false };

  const cleaner = createClipboardCleaner({
    read: async () => {
      if (failures.read) throw new Error('not allowed');
      return clipboard.text;
    },
    write: async (text) => {
      clipboard.text = text;
      writes.push(text);
    },
    isForeground: () => foreground,
    now: () => time,
    setTimer: (run, ms) => {
      timers.set(++nextId, { at: time + ms, run });
      return nextId;
    },
    clearTimer: (id) => timers.delete(id as number),
  });

  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  return {
    cleaner,
    clipboard,
    writes,
    failures,
    setForeground: (value: boolean) => (foreground = value),
    pendingTimers: () => timers.size,
    async advance(ms: number) {
      const target = time + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].run();
        await flush();
      }
      time = target;
      await flush();
    },
    async jump(ms: number) {
      time += ms;
      await flush();
    },
    flush,
  };
}

describe('clipboard cleaner', () => {
  test('puts the value on the clipboard right away', async () => {
    const t = setup();
    await t.cleaner.copy('hunter2', 30_000);
    expect(t.clipboard.text).toBe('hunter2');
  });

  test('clears it after the delay, not before', async () => {
    const t = setup();
    await t.cleaner.copy('hunter2', 30_000);
    await t.advance(29_999);
    expect(t.clipboard.text).toBe('hunter2');
    await t.advance(1);
    expect(t.clipboard.text).toBe('');
  });

  test('leaves the clipboard alone if the user copied something else meanwhile', async () => {
    const t = setup();
    await t.cleaner.copy('hunter2', 30_000);
    t.clipboard.text = 'a shopping list'; // copied from another app
    await t.advance(30_000);
    expect(t.clipboard.text).toBe('a shopping list');
    expect(t.writes).toEqual(['hunter2']); // we never wrote the empty string
  });

  test('"never" does not schedule anything', async () => {
    const t = setup();
    await t.cleaner.copy('hunter2', null);
    await t.cleaner.copy('hunter2', 0);
    expect(t.pendingTimers()).toBe(0);
    await t.advance(60 * 60_000);
    expect(t.clipboard.text).toBe('hunter2');
  });

  test('a newer copy replaces the older timer, and only the newest is cleared', async () => {
    const t = setup();
    await t.cleaner.copy('first', 30_000);
    await t.advance(20_000);
    await t.cleaner.copy('second', 30_000);
    await t.advance(10_000); // the first timer's original deadline
    expect(t.clipboard.text).toBe('second');
    await t.advance(20_000);
    expect(t.clipboard.text).toBe('');
  });

  test('copying with "never" after a timed copy cancels the old timer', async () => {
    const t = setup();
    await t.cleaner.copy('first', 30_000);
    await t.cleaner.copy('second', null);
    await t.advance(60_000);
    expect(t.clipboard.text).toBe('second');
  });

  describe('app in the background', () => {
    test('does not read or clear while in the background, then clears on return', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.setForeground(false);
      await t.advance(30_000);
      expect(t.clipboard.text).toBe('hunter2'); // we could not check, so we did nothing

      t.setForeground(true);
      t.cleaner.appForegrounded();
      await t.flush();
      expect(t.clipboard.text).toBe('');
    });

    test('on return it still checks that the clipboard is ours', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.setForeground(false);
      await t.advance(30_000);
      t.clipboard.text = 'something else';
      t.setForeground(true);
      t.cleaner.appForegrounded();
      await t.flush();
      expect(t.clipboard.text).toBe('something else');
    });

    test('returning before the delay is over changes nothing yet', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.setForeground(false);
      await t.advance(10_000);
      t.setForeground(true);
      t.cleaner.appForegrounded();
      await t.flush();
      expect(t.clipboard.text).toBe('hunter2');
      await t.advance(20_000);
      expect(t.clipboard.text).toBe('');
    });

    test('works when JS timers were paused and only the clock moved on', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.setForeground(false);
      await t.jump(5 * 60_000); // timer never ran
      t.setForeground(true);
      t.cleaner.appForegrounded();
      await t.flush();
      expect(t.clipboard.text).toBe('');
    });
  });

  describe('safety', () => {
    test('if the clipboard cannot be read, it is not touched', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.failures.read = true;
      await t.advance(30_000);
      expect(t.clipboard.text).toBe('hunter2');
      expect(t.writes).toEqual(['hunter2']);
    });

    test('a copy made while the check is reading is never wiped by the old check', async () => {
      const t = setup();
      let releaseRead!: () => void;
      let reads = 0;
      const clipboard = { text: '' };
      let time = 0;
      const timers: (() => void)[] = [];
      const cleaner = createClipboardCleaner({
        read: async () => {
          reads++;
          await new Promise<void>((resolve) => (releaseRead = resolve));
          return clipboard.text;
        },
        write: async (text) => {
          clipboard.text = text;
        },
        isForeground: () => true,
        now: () => time,
        setTimer: (run) => timers.push(run),
        clearTimer: () => {},
      });

      await cleaner.copy('old', 1000);
      time = 1000;
      timers[0]!(); // the check starts and waits inside read()
      await t.flush();
      expect(reads).toBe(1);

      await cleaner.copy('new', 1000); // user copies again while the check is waiting
      releaseRead();
      await t.flush();
      expect(clipboard.text).toBe('new');
    });

    test('cancel forgets the pending clear', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.cleaner.cancel();
      await t.advance(60_000);
      expect(t.clipboard.text).toBe('hunter2');
      expect(t.pendingTimers()).toBe(0);
    });

    test('an empty clipboard is never "cleared" with a needless write', async () => {
      const t = setup();
      await t.cleaner.copy('hunter2', 30_000);
      t.clipboard.text = '';
      await t.advance(30_000);
      expect(t.writes).toEqual(['hunter2']);
    });
  });
});
