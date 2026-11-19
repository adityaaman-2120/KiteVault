import { useMemo, type ReactNode } from 'react';
import { PanResponder, useWindowDimensions, View } from 'react-native';

// Swipe left to go to the next tab, right to go back. Plain JavaScript (PanResponder), so it needs
// no new native module and no new app build.

// The tab order must match the order of the <Tabs.Screen> entries.
export const TAB_ORDER = ['vault', 'generator', 'settings'] as const;

const MIN_DISTANCE = 60; // px a swipe must travel
const MIN_SPEED = 0.5; // or px/ms for a quick flick
const EDGE = 28; // px from the screen edge left to Android's own back gesture

// A slider is dragged sideways too; while one is held, the tab must not change.
let lockCount = 0;
export const lockTabSwipe = () => void lockCount++;
// Released a moment late: the slider can report "done" before the finger-up reaches this view.
export const unlockTabSwipe = () =>
  void setTimeout(() => (lockCount = Math.max(0, lockCount - 1)), 300);

// Where a swipe should go: swiping left (negative dx) goes forward, right goes back. Pure, so it
// can be tested without a screen. Returns null when there is nowhere to go or the move is too small.
export function swipeTarget(
  current: string,
  dx: number,
  vx: number,
  startX: number,
  width: number,
): (typeof TAB_ORDER)[number] | null {
  if (startX < EDGE || startX > width - EDGE) return null;
  if (Math.abs(dx) < MIN_DISTANCE && Math.abs(vx) < MIN_SPEED) return null;
  const at = TAB_ORDER.indexOf(current as (typeof TAB_ORDER)[number]);
  if (at < 0) return null;
  return TAB_ORDER[at + (dx < 0 ? 1 : -1)] ?? null;
}

type Props = {
  current: string;
  onGo: (tab: (typeof TAB_ORDER)[number]) => void;
  children: ReactNode;
};

export function SwipeBetweenTabs({ current, onGo, children }: Props) {
  const { width } = useWindowDimensions();

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Asked only after the finger moved and no child (a scroller, a slider) claimed it:
        // mostly sideways, and clearly more sideways than up or down.
        onMoveShouldSetPanResponder: (_e, g) =>
          lockCount === 0 && Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        // Another view took over (a horizontal list started scrolling): do nothing.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          if (lockCount > 0) return;
          const target = swipeTarget(current, g.dx, g.vx, g.x0, width);
          if (target) onGo(target);
        },
      }),
    [current, onGo, width],
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
