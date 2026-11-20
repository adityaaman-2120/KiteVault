import { act, renderHook } from '@testing-library/react-native';

import { useSessionStore } from '@/features/session/useSessionStore';
import { DEFAULT_APP_SETTINGS, parseAppSettings } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useVaultStore } from '@/vault';

import { createShakeDetector } from '../shakeDetector';
import { useShakeToLock } from '../useShakeToLock';

// Whether the app build has the native sensor module (what the hook checks for).
const setNativeModule = (present: boolean) => {
  (globalThis as { expo?: unknown }).expo = present
    ? { modules: { ExponentAccelerometer: {} } }
    : { modules: {} };
};

type Listener = (m: { x: number; y: number; z: number }) => void;
const mockSensor: { listener: Listener | null; removed: number; broken: boolean } = {
  listener: null,
  removed: 0,
  broken: false,
};
jest.mock('expo-sensors/build/Accelerometer', () => ({
  __esModule: true,
  // Reading it throws when "broken", like an app build that has no sensor module.
  get default() {
    if (mockSensor.broken) throw new Error("Cannot find native module 'ExponentPedometer'");
    return {
      setUpdateInterval: jest.fn(),
      addListener: (l: Listener) => {
        mockSensor.listener = l;
        return {
          remove: () => {
            mockSensor.removed++;
            mockSensor.listener = null;
          },
        };
      },
    };
  },
}));

describe('shake detector', () => {
  function run(readings: [number, number, number, number][]) {
    const onShake = jest.fn();
    const d = createShakeDetector(onShake);
    for (const [x, y, z, t] of readings) d.feed(x, y, z, t);
    return onShake;
  }
  const rest = (t: number): [number, number, number, number] => [0, 0, 1, t];
  const jolt = (t: number, sign = 1): [number, number, number, number] => [3 * sign, 0, 1, t];

  test('three hard jolts within a second count as a shake', () => {
    expect(run([jolt(0), rest(50), jolt(200, -1), rest(250), jolt(400)])).toHaveBeenCalledTimes(1);
  });

  test('a phone lying still, walking-sized movement and a single bump do not', () => {
    expect(run([rest(0), rest(60), rest(120)])).not.toHaveBeenCalled();
    expect(
      run([
        [1.2, 0.4, 1.1, 0],
        [0.9, 0.5, 1.3, 200],
        [1.3, 0.3, 0.8, 400],
      ]),
    ).not.toHaveBeenCalled();
    expect(run([jolt(0), rest(100), rest(200)])).not.toHaveBeenCalled();
  });

  test('readings of the same jolt in a burst count once', () => {
    expect(run([jolt(0), jolt(30), jolt(60), jolt(90)])).not.toHaveBeenCalled();
  });

  test('jolts spread over too long a time do not add up', () => {
    expect(run([jolt(0), jolt(700), jolt(1500)])).not.toHaveBeenCalled();
  });

  test('fires once, then ignores shaking for a moment', () => {
    const onShake = run([
      jolt(0),
      jolt(200, -1),
      jolt(400), // shake
      jolt(600, -1),
      jolt(800),
      jolt(1000, -1), // still within the pause
    ]);
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  test('bad numbers are ignored', () => {
    expect(
      run([
        [NaN, 0, 1, 0],
        [Infinity, 0, 1, 200],
        [NaN, NaN, NaN, 400],
      ]),
    ).not.toHaveBeenCalled();
  });
});

describe('useShakeToLock', () => {
  const lock = jest.fn();
  const shake = () => {
    let t = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => t);
    for (const sign of [1, -1, 1]) {
      mockSensor.listener?.({ x: 3 * sign, y: 0, z: 1 });
      t += 200;
    }
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    lock.mockClear();
    mockSensor.listener = null;
    mockSensor.removed = 0;
    mockSensor.broken = false;
    setNativeModule(true);
    useVaultStore.setState({ lock } as never);
    useSettingsStore.setState({ ...DEFAULT_APP_SETTINGS });
  });

  test('locks the vault when shaken while unlocked', async () => {
    useSessionStore.setState({ status: 'unlocked' });
    await renderHook(() => useShakeToLock());
    expect(mockSensor.listener).not.toBeNull();
    await act(async () => shake());
    expect(lock).toHaveBeenCalledTimes(1);
  });

  test('does not listen while the vault is locked', async () => {
    useSessionStore.setState({ status: 'locked' });
    await renderHook(() => useShakeToLock());
    expect(mockSensor.listener).toBeNull();
  });

  test('does not listen when the setting is off', async () => {
    useSessionStore.setState({ status: 'unlocked' });
    useSettingsStore.setState({ shakeToLock: false });
    await renderHook(() => useShakeToLock());
    expect(mockSensor.listener).toBeNull();
  });

  test('stops listening when the vault locks', async () => {
    useSessionStore.setState({ status: 'unlocked' });
    await renderHook(() => useShakeToLock());
    expect(mockSensor.listener).not.toBeNull();
    await act(async () => useSessionStore.setState({ status: 'locked' }));
    expect(mockSensor.listener).toBeNull();
  });
});

describe('on an app build without the sensor module', () => {
  afterEach(() => {
    mockSensor.broken = false;
  });

  test('without the native module nothing is even loaded', async () => {
    setNativeModule(false);
    mockSensor.broken = true; // would throw if it were touched
    useSessionStore.setState({ status: 'unlocked' });
    await expect(renderHook(() => useShakeToLock())).resolves.toBeDefined();
    expect(mockSensor.listener).toBeNull();
  });

  test('a module that fails to load is also survived', async () => {
    mockSensor.broken = true;
    useSessionStore.setState({ status: 'unlocked' });
    await expect(renderHook(() => useShakeToLock())).resolves.toBeDefined();
    expect(mockSensor.listener).toBeNull();
  });
});

describe('the shakeToLock setting', () => {
  test('is on by default, also for settings saved before it existed', () => {
    expect(DEFAULT_APP_SETTINGS.shakeToLock).toBe(true);
    expect(parseAppSettings({}).shakeToLock).toBe(true);
    expect(parseAppSettings({ backgroundLockSeconds: 30 }).shakeToLock).toBe(true);
  });

  test('stays off once the user turns it off', () => {
    expect(parseAppSettings({ shakeToLock: false }).shakeToLock).toBe(false);
  });
});
