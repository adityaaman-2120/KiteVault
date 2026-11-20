import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type AlertButton,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import {
  closeDialog,
  currentDialog,
  onDialogsCleared,
  showDialog,
  subscribeDialog,
  type DialogRequest,
} from './dialogQueue';

type Tone = 'danger' | 'warning' | 'info';

// Decoration only: the words carry the meaning.
export function toneOf(title: string, buttons: AlertButton[]): Tone {
  if (buttons.some((b) => b.style === 'destructive')) return 'danger';
  return /^(could not|cannot|unable)/i.test(title) ? 'warning' : 'info';
}
const SYMBOL: Record<Tone, string> = { danger: '!', warning: '!', info: 'i' };

function DialogButton({ button, onPress }: { button: AlertButton; onPress: () => void }) {
  const { colors, radius, typography } = useTheme();
  const destructive = button.style === 'destructive';
  const filled = button.style !== 'cancel';
  const fill = destructive ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={button.text}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: filled ? fill : colors.primarySoft,
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text
        numberOfLines={1}
        style={[
          typography.label,
          { fontSize: 16, fontWeight: '700', color: filled ? colors.onPrimary : colors.primary },
        ]}
      >
        {button.text}
      </Text>
    </Pressable>
  );
}

// Draws every Alert.alert in the app's own style instead of the system box: a sheet that rises
// from the bottom, like the "Add to your vault" popup. Mounted once at the root; it takes over
// Alert.alert while mounted, so no call site had to change.
export function DialogHost() {
  const { colors, elevation, radius, spacing, typography } = useTheme();
  const { height } = useWindowDimensions();
  const dialog = useSyncExternalStore(subscribeDialog, currentDialog);
  // The sheet stays on screen until it has finished sinking after a button is pressed.
  const [shown, setShown] = useState<DialogRequest | null>(dialog);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const original = Alert.alert;
    Alert.alert = showDialog;
    return () => {
      Alert.alert = original;
    };
  }, []);

  // Locking drops the messages: hide at once, without the sinking animation.
  useEffect(
    () =>
      onDialogsCleared(() => {
        progress.stopAnimation();
        progress.setValue(0);
        setShown(null);
      }),
    [progress],
  );

  useEffect(() => {
    if (dialog) {
      setShown(dialog);
      progress.setValue(0);
      const run = Animated.spring(progress, {
        toValue: 1,
        stiffness: 240,
        damping: 28,
        mass: 1,
        overshootClamping: true,
        useNativeDriver: true,
      });
      run.start();
      return () => run.stop();
    }
    const run = Animated.spring(progress, {
      toValue: 0,
      stiffness: 320,
      damping: 34,
      mass: 1,
      overshootClamping: true,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setShown(null);
    });
    return () => run.stop();
  }, [dialog, progress]);

  if (!shown) return null;

  const tone = toneOf(shown.title, shown.buttons);
  const accent =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.primary;
  // The main action first, Cancel last, all full width like the buttons of a sheet.
  const buttons = [...shown.buttons].sort(
    (a, b) => Number(a.style === 'cancel') - Number(b.style === 'cancel'),
  );
  // Back, or a tap on the dimmed area, does what Cancel does; with no Cancel it presses the only
  // button. With several other buttons it does nothing, so nothing is chosen by accident.
  const dismiss = () => {
    const choice =
      shown.buttons.find((b) => b.style === 'cancel') ??
      (shown.buttons.length === 1 ? shown.buttons[0] : undefined);
    if (choice) closeDialog(choice);
  };

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={dismiss}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(5, 9, 24, 0.6)', opacity: progress },
            ]}
          />
        </Pressable>
        <Animated.View
          style={{
            transform: [
              {
                translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
              },
            ],
          }}
        >
          <SafeAreaView
            edges={['bottom']}
            accessibilityViewIsModal
            style={[
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
              elevation.float,
            ]}
          >
            <View style={{ padding: spacing.lg, paddingTop: spacing.md, gap: spacing.lg }}>
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: radius.md,
                    backgroundColor: accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.onPrimary, fontSize: 26, fontWeight: '800' }}>
                    {SYMBOL[tone]}
                  </Text>
                </View>
                <Text
                  accessibilityRole="header"
                  style={[typography.heading, { color: colors.text, fontSize: 20, flex: 1 }]}
                >
                  {shown.title}
                </Text>
              </View>
              {shown.message ? (
                <Text
                  style={[
                    typography.body,
                    { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
                  ]}
                >
                  {shown.message}
                </Text>
              ) : null}
              <View style={{ gap: spacing.sm }}>
                {buttons.map((button, index) => (
                  <DialogButton
                    key={`${button.text}-${index}`}
                    button={button}
                    onPress={() => closeDialog(button)}
                  />
                ))}
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
