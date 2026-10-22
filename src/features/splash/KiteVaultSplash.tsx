// The KiteVault launch animation, from Kitelux: a kite flies in, the keyhole spark lights up,
// and the name appears. It is drawn with react-native-svg and animated with Reanimated, and it
// shows no vault data, so it is safe to show before the vault is unlocked.
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

const C = {
  night: '#0B1230',
  nightGlow: '#26316E',
  gold: '#FFB547',
  goldLight: '#FFC861',
  orange: '#FF9F45',
  coral: '#FF8A4C',
  red: '#F2643F',
  glow: '#FFE7A8',
  soft: '#C9D2F0',
  white: '#FFFFFF',
};

// Kite artwork lives in a 120 x 160 box (same paths as the brand mark).
const KITE_W = 132; // rendered size (1.1x)
const KITE_H = 176;
const KITE_CENTER_Y = 50.6; // spar crossing, in rendered px

const STARS = [
  { x: 0.12, y: 0.11, r: 1.6, d: 50 },
  { x: 0.31, y: 0.18, r: 1.1, d: 300 },
  { x: 0.85, y: 0.1, r: 1.8, d: 150 },
  { x: 0.72, y: 0.2, r: 1.1, d: 450 },
  { x: 0.1, y: 0.36, r: 1.3, d: 250 },
  { x: 0.91, y: 0.39, r: 1.2, d: 350 },
  { x: 0.51, y: 0.08, r: 1.0, d: 500 },
  { x: 0.18, y: 0.66, r: 1.1, d: 400 },
  { x: 0.85, y: 0.71, r: 1.4, d: 200 },
  { x: 0.77, y: 0.55, r: 1.0, d: 550 },
];

type Props = {
  // Called once, when the animation ends or the person taps to skip it.
  onFinish?: () => void;
  // The name, as [white part, gold part].
  appName?: [string, string];
  // Optional fonts. When they are not loaded the phone's own font is used.
  boldFont?: string;
  regularFont?: string;
};

export function KiteVaultSplash({
  onFinish,
  appName = ['Kite', 'Vault'],
  boldFont,
  regularFont,
}: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();

  const kiteTop = H * 0.26;
  const kiteLeft = (W - KITE_W) / 2;
  const centerY = kiteTop + KITE_CENTER_Y;

  const fly = useSharedValue(0);
  const bob = useSharedValue(0);
  const sway = useSharedValue(0);
  const light = useSharedValue(0);
  const rays = useSharedValue(0);
  const spark = useSharedValue(0);
  const pulse = useSharedValue(0);
  const from = useSharedValue(0);

  // A tap and the end of the animation can both ask to finish; only the first one counts.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinishRef.current?.();
  }, []);

  useEffect(() => {
    if (reduced) {
      fly.value = 1;
      light.value = 1;
      rays.value = 1;
      spark.value = 1;
      from.value = 1;
      const timer = setTimeout(finish, 600);
      return () => clearTimeout(timer);
    }
    fly.value = withDelay(
      200,
      withTiming(1, { duration: 1500, easing: Easing.bezier(0.45, 0.05, 0.3, 1) }),
    );
    bob.value = withDelay(
      1800,
      withRepeat(
        withSequence(withTiming(1, { duration: 1600 }), withTiming(0, { duration: 1600 })),
        -1,
      ),
    );
    sway.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    light.value = withDelay(1600, withTiming(1, { duration: 650 }));
    rays.value = withDelay(
      1650,
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
    );
    spark.value = withDelay(
      1600,
      withTiming(1, { duration: 550, easing: Easing.bezier(0.3, 1.6, 0.5, 1) }),
    );
    pulse.value = withDelay(
      2300,
      withRepeat(
        withSequence(withTiming(1, { duration: 1300 }), withTiming(0, { duration: 1300 })),
        -1,
      ),
    );
    from.value = withDelay(
      2700,
      withTiming(1, { duration: 700 }, (done) => {
        if (done) scheduleOnRN(finish);
      }),
    );
    // The values are shared values, so they are not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const flyStyle = useAnimatedStyle(() => {
    const p = fly.value;
    const k = [0, 0.45, 0.78, 1];
    return {
      opacity: interpolate(p, [0, 0.12], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, k, [-190, -80, 10, 0]) },
        { translateY: interpolate(p, k, [520, 200, -12, 0]) },
        { rotate: `${interpolate(p, k, [-26, 12, -5, 0])}deg` },
        { scale: interpolate(p, k, [0.4, 0.7, 1.04, 1]) },
      ],
    };
  });

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * bob.value }, { rotate: `${2 * bob.value}deg` }],
  }));

  const tailStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(sway.value, [0, 1], [-7, 7])}deg` }],
  }));

  const shadeStyle = useAnimatedStyle(() => ({ opacity: 1 - light.value }));

  const sparkStyle = useAnimatedStyle(() => ({ transform: [{ scale: spark.value }] }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: light.value * (1 - 0.3 * pulse.value),
    transform: [{ scale: (0.3 + 0.7 * light.value) * (1 + 0.08 * pulse.value) }],
  }));

  const raysStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rays.value, [0, 0.4, 1], [0, 1, 0.3]),
    transform: [{ scale: interpolate(rays.value, [0, 0.4, 1], [0.6, 1, 1.06]) }],
  }));

  const fromStyle = useAnimatedStyle(() => ({ opacity: from.value }));

  const letters = [
    ...appName[0].split('').map((ch) => ({ ch, color: C.white })),
    ...appName[1].split('').map((ch) => ({ ch, color: C.gold })),
  ];

  return (
    <Pressable
      style={styles.root}
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel={`${appName.join('')} from Kitelux. Tap to skip.`}
    >
      {/* Night sky */}
      <Svg style={StyleSheet.absoluteFill} width={W} height={H}>
        <Defs>
          <RadialGradient id="sky" cx="50%" cy="110%" rx="80%" ry="70%">
            <Stop offset="0%" stopColor={C.nightGlow} />
            <Stop offset="100%" stopColor={C.night} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#sky)" />
      </Svg>

      {STARS.map((s, i) => (
        <Star key={i} x={s.x * W} y={s.y * H} r={s.r} delay={reduced ? 0 : s.d} still={reduced} />
      ))}

      {/* Glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          { left: W / 2 - 115, top: centerY - 115, width: 230, height: 230 },
          glowStyle,
        ]}
      >
        <Svg width={230} height={230}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={C.glow} stopOpacity={0.75} />
              <Stop offset="45%" stopColor={C.gold} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={C.gold} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={115} cy={115} r={115} fill="url(#glow)" />
        </Svg>
      </Animated.View>

      {/* Rays */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          { left: W / 2 - 100, top: centerY - 100, width: 200, height: 200 },
          raysStyle,
        ]}
      >
        <Svg width={200} height={200}>
          <Path
            d="M100 29 L100 7 M100 171 L100 193 M29 100 L7 100 M171 100 L193 100 M50 50 L35 35 M150 50 L165 35 M50 150 L35 165 M150 150 L165 165"
            stroke={C.glow}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* Kite */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: kiteLeft,
            top: kiteTop,
            width: KITE_W,
            height: KITE_H,
            transformOrigin: '50% 40%',
          },
          flyStyle,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 30%' }, bobStyle]}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { transformOrigin: '50% 65%' }, tailStyle]}
          >
            <Svg width={KITE_W} height={KITE_H} viewBox="0 0 120 160">
              <Path
                d="M60 104 C54 114 66 122 58 132 C52 140 62 148 56 156"
                stroke={C.gold}
                strokeWidth={2.2}
                strokeLinecap="round"
                fill="none"
              />
              <Path d="M52 114 L59 118 L52 122 Z M66 114 L59 118 L66 122 Z" fill={C.coral} />
              <Path d="M50 136 L57 140 L50 144 Z M64 136 L57 140 L64 144 Z" fill={C.gold} />
            </Svg>
          </Animated.View>

          <Svg style={StyleSheet.absoluteFill} width={KITE_W} height={KITE_H} viewBox="0 0 120 160">
            <Path d="M60 14 L28 46 L60 46 Z" fill={C.goldLight} />
            <Path d="M60 14 L92 46 L60 46 Z" fill={C.orange} />
            <Path d="M28 46 L60 104 L60 46 Z" fill={C.coral} />
            <Path d="M92 46 L60 104 L60 46 Z" fill={C.red} />
            <Path
              d="M60 14 L60 104 M28 46 L92 46"
              stroke="#7A3412"
              strokeOpacity={0.25}
              strokeWidth={1.2}
              fill="none"
            />
          </Svg>

          <Animated.View style={[StyleSheet.absoluteFill, shadeStyle]}>
            <Svg width={KITE_W} height={KITE_H} viewBox="0 0 120 160">
              <Path d="M60 14 L92 46 L60 104 L28 46 Z" fill={C.night} fillOpacity={0.55} />
            </Svg>
          </Animated.View>

          <Animated.View
            style={[StyleSheet.absoluteFill, { transformOrigin: '50% 28.75%' }, sparkStyle]}
          >
            <Svg width={KITE_W} height={KITE_H} viewBox="0 0 120 160">
              <Path
                d="M60 34 Q61.6 44.4 72 46 Q61.6 47.6 60 58 Q58.4 47.6 48 46 Q58.4 44.4 60 34 Z"
                fill={C.white}
              />
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Wordmark */}
      <View style={[styles.abs, styles.wordRow, { top: kiteTop + KITE_H + 36, width: W }]}>
        {letters.map((l, i) => (
          <Letter
            key={i}
            ch={l.ch}
            color={l.color}
            delay={reduced ? 0 : 1950 + i * 50}
            still={reduced}
            font={boldFont}
          />
        ))}
      </View>

      {/* From Kitelux */}
      <Animated.View style={[styles.abs, styles.from, { width: W }, fromStyle]}>
        <Text style={[styles.fromLabel, regularFont ? { fontFamily: regularFont } : null]}>
          from
        </Text>
        <View style={styles.fromRow}>
          <Svg width={16} height={22} viewBox="24 10 72 98">
            <Path d="M60 14 L28 46 L60 46 Z" fill={C.goldLight} />
            <Path d="M60 14 L92 46 L60 46 Z" fill={C.orange} />
            <Path d="M28 46 L60 104 L60 46 Z" fill={C.coral} />
            <Path d="M92 46 L60 104 L60 46 Z" fill={C.red} />
          </Svg>
          <Text style={[styles.fromName, boldFont ? { fontFamily: boldFont } : null]}>
            Kite<Text style={{ color: C.gold }}>lux</Text>
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function Star({
  x,
  y,
  r,
  delay,
  still,
}: {
  x: number;
  y: number;
  r: number;
  delay: number;
  still: boolean;
}) {
  const o = useSharedValue(still ? 0.8 : 0);
  useEffect(() => {
    if (still) return;
    o.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.9, { duration: 800 }),
          withTiming(0.35, { duration: 700 }),
          withTiming(0.8, { duration: 900 }),
        ),
        -1,
        true,
      ),
    );
    // Starts once; the delay and the shared value never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        { left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r },
        { backgroundColor: C.white },
        style,
      ]}
    />
  );
}

function Letter({
  ch,
  color,
  delay,
  still,
  font,
}: {
  ch: string;
  color: string;
  delay: number;
  still: boolean;
  font?: string;
}) {
  const p = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    p.value = withDelay(
      delay,
      withTiming(1, { duration: 450, easing: Easing.bezier(0.3, 1.3, 0.5, 1) }),
    );
    // Starts once; the delay and the shared value never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.4], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: 18 * (1 - p.value) }],
  }));
  return (
    <Animated.Text style={[styles.letter, { color }, font ? { fontFamily: font } : null, style]}>
      {ch}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.night, overflow: 'hidden' },
  abs: { position: 'absolute' },
  wordRow: { flexDirection: 'row', justifyContent: 'center' },
  letter: { fontSize: 54, fontWeight: '800', letterSpacing: -1.8, lineHeight: 62 },
  from: { bottom: 56, alignItems: 'center', gap: 8 },
  fromLabel: { fontSize: 12, letterSpacing: 1.2, color: C.soft },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fromName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, color: C.white },
});
