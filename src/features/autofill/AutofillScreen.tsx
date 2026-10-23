import { useEffect, useState } from 'react';
import { Alert, AppState, Text, View } from 'react-native';

import { Button, Callout, Card, CardGroup, ScreenContainer } from '@/components';
import { getUnlockState, type UnlockState } from '@/native/keystore';
import {
  getAutofillStatus,
  openAutofillSettings,
  type AutofillStatus,
} from '@/native/keystore/autofill';
import { useTheme } from '@/theme';

export const AUTOFILL_EXPLANATION =
  'After you tap a user name or password box in Chrome or another app, KiteVault offers "Unlock KiteVault to fill". It never shows or fills a saved login until you unlock with your fingerprint or face, and it fills only on the exact website or app a login was saved for.';

export const STRONG_PASSWORD_NOTE =
  'On a sign-up page KiteVault can make a strong password for you: tap the new-password box and choose "Suggest strong password". If a page does not say that it is a sign-up, cancel the fingerprint check and choose "Make a strong password". You can pick the length (12, 16, 20 or 32) and turn symbols off, for sites that do not accept them. This never reads your vault, so it also works when biometric unlock is off.';

export const CHANGE_PASSWORD_NOTE =
  'On a page to change a password, tap the old-password box to fill it, and the new-password boxes to get a strong password. After you submit, KiteVault offers to update the login you already have for that site. Sign-ins that ask for the user name first and the password on the next page are filled one page at a time, when the page marks its user-name box.';

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
  const { colors, radius, spacing, typography } = useTheme();
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

  // One line of the checklist: a round tick or cross, the name, and what it says.
  const row = (label: string, value: string, ok: boolean) => (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ok ? colors.success : colors.surfaceMuted,
        }}
      >
        <Text
          style={{
            color: ok ? colors.surface : colors.textMuted,
            fontWeight: '700',
            fontSize: 14,
          }}
        >
          {ok ? '✓' : '!'}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
        <Text
          accessibilityLabel={`${label}: ${value}`}
          style={[typography.body, { color: ok ? colors.success : colors.text }]}
        >
          {ok ? '✓ ' : ''}
          {value}
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenContainer scroll>
      {/* The answer first: is it ready, and if not, what is missing. */}
      <View
        style={{
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.lg,
          backgroundColor: colors.primarySoft,
        }}
      >
        {state === null || unlock === null ? (
          <Text style={[typography.body, { color: colors.textMuted }]}>Checking…</Text>
        ) : (
          <>
            <Text
              accessibilityRole="alert"
              style={[typography.title, { color: ready ? colors.success : colors.warning }]}
            >
              {ready ? 'Ready to fill' : 'Not ready yet'}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Autofill status</Text>
            <View style={{ gap: spacing.md }}>
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
            </View>
          </>
        )}
        <Button
          title="Open Android autofill settings"
          onPress={choose}
          disabled={state !== null && !state.autofill.supported}
        />
      </View>

      <Callout tone="info" title="Chrome">
        {CHROME_STEPS}
      </Callout>

      <Text
        accessibilityRole="header"
        style={[
          typography.caption,
          {
            color: colors.textMuted,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginLeft: spacing.xs,
          },
        ]}
      >
        How it works
      </Text>
      <CardGroup>
        {(
          [
            ['Filling a login', [AUTOFILL_EXPLANATION, WEBSITES_AND_APPS_NOTE]],
            ['Signing up', [STRONG_PASSWORD_NOTE]],
            ['Changing a password', [CHANGE_PASSWORD_NOTE]],
            ['Saving', [SAVING_NOTE]],
          ] as const
        ).map(([heading, paragraphs]) => (
          <Card key={heading}>
            <Text style={[typography.heading, { color: colors.text }]}>{heading}</Text>
            {paragraphs.map((text) => (
              <Text key={text} style={[typography.body, { color: colors.textMuted }]}>
                {text}
              </Text>
            ))}
          </Card>
        ))}
      </CardGroup>
    </ScreenContainer>
  );
}
