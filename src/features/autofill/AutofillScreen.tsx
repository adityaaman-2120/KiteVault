import { useEffect, useState } from 'react';
import { Alert, AppState, Text, View } from 'react-native';

import { Button, Card, ScreenContainer } from '@/components';
import { getUnlockState, type UnlockState } from '@/native/keystore';
import {
  getAutofillStatus,
  openAutofillSettings,
  type AutofillStatus,
} from '@/native/keystore/autofill';
import { useTheme } from '@/theme';

export const AUTOFILL_EXPLANATION =
  'After you tap a user name or password box in Chrome or another app, KiteVault offers "Unlock KiteVault to fill". It never shows or fills anything until you unlock with your fingerprint or face, and it fills only on the exact website or app a login was saved for.';

export const CHROME_STEPS =
  'Chrome needs version 135 or newer. After choosing KiteVault below, open Chrome, then Settings > Autofill services, and choose "Autofill using another service".';

export const WEBSITES_AND_APPS_NOTE =
  'Websites are matched by their saved web address (https only, in browsers KiteVault knows). Apps are matched only for logins that were saved from that same app. In any other app, choose "Search my vault" and pick a login by hand; KiteVault warns you first.';

export const SAVING_NOTE =
  'When you sign in or sign up somewhere, Android can ask "Save to KiteVault?". If you agree, KiteVault opens, asks you to unlock, and shows what will be saved. You can change the title, choose a folder, or update the password of a login you already have (the old password is kept in its history). Nothing is saved without that confirmation, and a waiting login is deleted after 10 minutes.';

export function describeUnlock(state: UnlockState): { ok: boolean; text: string } {
  switch (state) {
    case 'ready':
      return { ok: true, text: 'On' };
    case 'reauth-required':
      return {
        ok: false,
        text: 'Needs your master password first. Unlock KiteVault with it once.',
      };
    case 'invalidated':
      return {
        ok: false,
        text: 'Off, because your fingerprints or face changed. Turn it on again in Settings.',
      };
    case 'unavailable':
      return { ok: false, text: 'No fingerprint or face is set up on this phone.' };
    default:
      return { ok: false, text: 'Off. Autofill needs it: turn on biometric unlock in Settings.' };
  }
}

type State = { autofill: AutofillStatus; unlock: UnlockState };

export function AutofillScreen() {
  const { colors, spacing, typography } = useTheme();
  const [state, setState] = useState<State | null>(null);

  // Read the status when the screen opens and whenever the app comes back to the front (for
  // example after the user chose KiteVault in Android's settings).
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getUnlockState().then((unlock) => {
        if (!cancelled) setState({ autofill: getAutofillStatus(), unlock });
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  function choose() {
    if (!openAutofillSettings()) {
      Alert.alert(
        'Could not open the page',
        'Open your phone’s Settings, search for "Autofill service" and choose KiteVault.',
      );
    }
  }

  const unlock = state ? describeUnlock(state.unlock) : null;
  const ready = state?.autofill.enabled === true && unlock?.ok === true;

  const row = (label: string, value: string, ok: boolean) => (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text
        accessibilityLabel={`${label}: ${value}`}
        style={[typography.body, { color: ok ? colors.success : colors.text }]}
      >
        {ok ? '✓ ' : ''}
        {value}
      </Text>
    </View>
  );

  return (
    <ScreenContainer scroll>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Autofill status</Text>
        {state === null || unlock === null ? (
          <Text style={[typography.body, { color: colors.textMuted }]}>Checking…</Text>
        ) : (
          <>
            {row(
              'Autofill service',
              !state.autofill.supported
                ? 'Not available on this phone'
                : state.autofill.enabled
                  ? 'On: KiteVault is your autofill service'
                  : 'Off: choose KiteVault in Android’s settings',
              state.autofill.enabled,
            )}
            {row('Biometric unlock', unlock.text, unlock.ok)}
            <Text
              accessibilityRole="alert"
              style={[typography.heading, { color: ready ? colors.success : colors.warning }]}
            >
              {ready ? 'Ready to fill' : 'Not ready yet'}
            </Text>
          </>
        )}
        <Button
          title="Open Android autofill settings"
          onPress={choose}
          disabled={state !== null && !state.autofill.supported}
        />
      </Card>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>How it works</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{AUTOFILL_EXPLANATION}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{WEBSITES_AND_APPS_NOTE}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{SAVING_NOTE}</Text>
      </Card>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Chrome</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{CHROME_STEPS}</Text>
      </Card>
    </ScreenContainer>
  );
}
