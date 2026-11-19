import { useMemo, useRef, type ReactNode } from 'react';
import { PanResponder, useWindowDimensions, View } from 'react-native';

// Swipe sideways to move between pages. Plain JavaScript (PanResponder), so it needs no new native
// module and no new app build.

// The pages sit in a row like a normal pager: Quick add, Vault, Generator, Settings. Dragging a
// finger left shows the page to the right, dragging right shows the page to the left. Quick add
// has no button in the tab bar (only Vault, Generator and Settings do). The order must match the
// <Tabs.Screen> order in the tabs layout, which also makes each slide go the right way.
export type TabName = 'vault' | 'quick-add' | 'generator' | 'settings';
export const ROW: TabName[] = ['quick-add', 'vault', 'generator', 'settings'];

const MIN_DISTANCE = 48; // px a swipe must travel
const MIN_SPEED = 0.5; // or px/ms for a quick flick
const EDGE = 28; // px from the screen edge left to Android's own back gesture

// A slider is dragged sideways too; while one is held, the tab must not change.
let lockCount = 0;
export const lockTabSwipe = () => void lockCount++;
// Released a moment late: the slider can report "done" before the finger-up reaches this view.
export const unlockTabSwipe = () =>
  void setTimeout(() => (lockCount = Math.max(0, lockCount - 1)), 300);

// Where a swipe should go (swiping left means a negative dx). Pure, so it can be tested without a
// screen. Returns null when that swipe leads nowhere or the move is too small.
export function swipeTarget(
  current: string,
  dx: number,
  vx: number,
  startX: number,
  width: number,
): TabName | null {
  if (startX < EDGE || startX > width - EDGE) return null;
  if (Math.abs(dx) < MIN_DISTANCE && Math.abs(vx) < MIN_SPEED) return null;
  const at = ROW.indexOf(current as TabName);
  return at < 0 ? null : (ROW[at + (dx < 0 ? 1 : -1)] ?? null);
}

type Props = {
  current: string;
  onGo: (tab: TabName) => void;
  children: ReactNode;
};

export function SwipeBetweenTabs({ current, onGo, children }: Props) {
  const { width } = useWindowDimensions();
  // The page changes as soon as the swipe is long enough, while the finger is still down, so the
  // app answers right away; this makes sure it happens only once per swipe.
  const done = useRef(false);

  const responder = useMemo(() => {
    const go = (dx: number, vx: number, x0: number) => {
      if (done.current || lockCount > 0) return;
      const target = swipeTarget(current, dx, vx, x0, width);
      if (!target) return;
      done.current = true;
      onGo(target);
    };
    return PanResponder.create({
      // Asked only after the finger moved and no child (a scroller, a slider) claimed it:
      // mostly sideways, and clearly more sideways than up or down.
      onMoveShouldSetPanResponder: (_e, g) =>
        lockCount === 0 && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderGrant: () => {
        done.current = false;
      },
      onPanResponderMove: (_e, g) => go(g.dx, g.vx, g.x0),
      // Another view took over (a horizontal list started scrolling): do nothing.
      onPanResponderTerminationRequest: () => false,
      // A quick flick may only be recognised when the finger lifts.
      onPanResponderRelease: (_e, g) => go(g.dx, g.vx, g.x0),
    });
  }, [current, onGo, width]);

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
