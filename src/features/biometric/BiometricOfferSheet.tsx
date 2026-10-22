import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextAction } from '@/components';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { BiometricError } from '@/native/keystore';
import { useTheme } from '@/theme';

import { useBiometricOfferStore } from './biometricOfferStore';
import { enableBiometric } from './biometricService';
import { describeBiometricError } from './messages';
import { useBiometricState } from './useBiometricState';

const BENEFITS = [
  'Open KiteVault with one touch',
  'Your master password always works too',
  "Protected by your phone's Android Keystore",
];

// A fingerprint drawn as a few open rings, so no icon file or library is needed.
function FingerprintIcon({ color }: { color: string }) {
  const ring = (size: number, gap: 'top' | 'right' | 'left', turn: number) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 3,
    borderColor: color,
    ...(gap === 'top' ? { borderTopColor: 'transparent' } : null),
    ...(gap === 'right' ? { borderRightColor: 'transparent' } : null),
    ...(gap === 'left' ? { borderLeftColor: 'transparent' } : null),
    transform: [{ rotate: `${turn}deg` }],
  });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={ring(56, 'top', 20)} />
      <View style={ring(42, 'right', -10)} />
      <View style={ring(28, 'left', 30)} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

// The popup itself. It only exists while an offer is pending, so the home screen does not ask the
// phone about biometrics every time it opens.
function Offer() {
  const { colors, elevation, radius, spacing, typography } = useTheme();
  const clear = useBiometricOfferStore((s) => s.clear);
  const biometric = useBiometricState();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dismissed = useSettingsStore((s) => s.biometricPromptDismissed);
  const offerable = biometric.available && biometric.state === 'disabled' && !dismissed;

  // Nothing to offer on a phone without biometrics, or when it is already on: drop the offer.
  useEffect(() => {
    if (biometric.loaded && !offerable && !done) clear();
  }, [biometric.loaded, offerable, done, clear]);

  // "Don't ask again" is remembered, so neither this popup nor the one after an unlock comes back.
  // Biometric unlock can still be turned on in Settings.
  async function neverAsk() {
    if (busy) return;
    await useSettingsStore.getState().update({ biometricPromptDismissed: true });
    clear();
  }

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await enableBiometric();
      await biometric.refresh();
      setDone(true);
    } catch (error) {
      setMessage(
        error instanceof BiometricError && error.kind === 'cancelled'
          ? 'Biometric unlock was not turned on. You can try again, or add it later in Settings.'
          : describeBiometricError(error),
      );
    }
    setBusy(false);
  }

  if (!biometric.loaded || (!offerable && !done)) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={clear}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={clear}
          disabled={busy}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(5, 9, 24, 0.6)',
          }}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
            elevation.float,
          ]}
        >
          <View style={{ padding: spacing.xl, gap: spacing.lg, alignItems: 'center' }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primarySoft,
              }}
            >
              {done ? (
                <Text style={{ fontSize: 40, color: colors.success }}>✓</Text>
              ) : (
                <FingerprintIcon color={colors.primary} />
              )}
            </View>

            {done ? (
              <>
                <View style={{ gap: spacing.xs, alignItems: 'center' }}>
                  <Text
                    accessibilityRole="header"
                    style={[typography.title, { color: colors.text, textAlign: 'center' }]}
                  >
                    Biometric unlock is on
                  </Text>
                  <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
                    Next time, KiteVault opens with your fingerprint or face. You can change this in
                    Settings.
                  </Text>
                </View>
                <View style={{ alignSelf: 'stretch' }}>
                  <Button title="Done" onPress={clear} />
                </View>
              </>
            ) : (
              <>
                <View style={{ gap: spacing.xs, alignItems: 'center' }}>
                  <Text
                    accessibilityRole="header"
                    style={[typography.title, { color: colors.text, textAlign: 'center' }]}
                  >
                    Unlock with your fingerprint or face
                  </Text>
                  <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
                    Skip typing your master password every time.
                  </Text>
                </View>

                <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
                  {BENEFITS.map((benefit) => (
                    <View
                      key={benefit}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.primarySoft,
                        }}
                      >
                        <Text style={[typography.caption, { color: colors.success }]}>✓</Text>
                      </View>
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                        {benefit}
                      </Text>
                    </View>
                  ))}
                </View>

                {message ? (
                  <Text
                    accessibilityRole="alert"
                    style={[typography.body, { color: colors.danger, textAlign: 'center' }]}
                  >
                    {message}
                  </Text>
                ) : null}

                <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
                  <Button title="Turn on" onPress={() => void turnOn()} loading={busy} />
                  <Button title="Add later" variant="secondary" onPress={clear} disabled={busy} />
                  <TextAction
                    label="Don't ask again"
                    color={colors.textMuted}
                    disabled={busy}
                    onPress={() => void neverAsk()}
                  />
                </View>

                <Text
                  style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}
                >
                  For your safety, KiteVault asks for the master password again after a restart,
                  after 7 days, or after 5 biometric unlocks. You can turn this on any time in
                  Settings.
                </Text>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// Put this on the home screen. It shows the popup once, right after the vault was created.
export function BiometricOfferSheet() {
  const pending = useBiometricOfferStore((s) => s.pending);
  return pending ? <Offer /> : null;
}
