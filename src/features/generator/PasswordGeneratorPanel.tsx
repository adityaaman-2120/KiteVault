import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ChoiceGroup, StrengthMeter, ToggleRow } from '@/components';
import { copySecret } from '@/features/clipboard/clipboardService';
import { useTheme } from '@/theme';

import {
  DEFAULT_PASSPHRASE_OPTIONS,
  generatePassphrase,
  MAX_WORDS,
  MIN_WORDS,
  passphraseEntropyBits,
  SEPARATORS,
  type PassphraseOptions,
} from './passphrase';
import {
  DEFAULT_PASSWORD_OPTIONS,
  generatePassword,
  MAX_LENGTH,
  MIN_LENGTH,
  passwordEntropyBits,
  type PasswordOptions,
} from './passwordGenerator';
import { strengthFromBits } from './strength';

type Mode = 'password' | 'passphrase';
const MODES = [
  { value: 'password', label: 'Password' },
  { value: 'passphrase', label: 'Passphrase' },
] as const;

const KIND_KEYS = ['uppercase', 'lowercase', 'numbers', 'symbols'] as const;

type Props = {
  // When given, a "Use this password" button hands the current value to the caller.
  onUse?: (value: string) => void;
};

export function PasswordGeneratorPanel({ onUse }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [mode, setMode] = useState<Mode>('password');
  const [password, setPassword] = useState(DEFAULT_PASSWORD_OPTIONS);
  const [passphrase, setPassphrase] = useState(DEFAULT_PASSPHRASE_OPTIONS);
  const [generated, setGenerated] = useState(() => generatePassword(DEFAULT_PASSWORD_OPTIONS));
  const [notice, setNotice] = useState<string | null>(null);

  const bits =
    mode === 'password' ? passwordEntropyBits(password) : passphraseEntropyBits(passphrase);
  const strength = strengthFromBits(bits);

  const make = (nextMode: Mode, pw: PasswordOptions, pp: PassphraseOptions) =>
    setGenerated(nextMode === 'password' ? generatePassword(pw) : generatePassphrase(pp));

  function changeMode(next: Mode) {
    setMode(next);
    setNotice(null);
    make(next, password, passphrase);
  }

  function changePassword(patch: Partial<PasswordOptions>) {
    const next = { ...password, ...patch };
    // At least one kind of character must stay switched on.
    if (!KIND_KEYS.some((key) => next[key])) {
      setNotice('Keep at least one kind of character switched on.');
      return;
    }
    setNotice(null);
    setPassword(next);
    make('password', next, passphrase);
  }

  function changePassphrase(patch: Partial<PassphraseOptions>) {
    const next = { ...passphrase, ...patch };
    setPassphrase(next);
    make('passphrase', password, next);
  }

  return (
    <Card>
      <ChoiceGroup<Mode> label="Type" options={MODES} value={mode} onChange={changeMode} />

      <View
        style={{
          backgroundColor: colors.surfaceMuted,
          borderRadius: 12,
          padding: spacing.lg,
        }}
      >
        <Text
          testID="generated-password"
          selectable
          style={[
            typography.heading,
            { color: colors.text, fontFamily: 'monospace', letterSpacing: 0.5 },
          ]}
        >
          {generated}
        </Text>
      </View>

      <StrengthMeter score={strength.score} label={strength.label} hint={strength.hint} />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Copy" onPress={() => void copySecret(generated)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Regenerate"
            variant="secondary"
            onPress={() => make(mode, password, passphrase)}
          />
        </View>
      </View>
      {onUse ? <Button title="Use this password" onPress={() => onUse(generated)} /> : null}

      {mode === 'password' ? (
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: colors.textMuted }]}>
              Length: {password.length}
            </Text>
            <Slider
              accessibilityLabel="Password length"
              accessibilityValue={{ min: MIN_LENGTH, max: MAX_LENGTH, now: password.length }}
              minimumValue={MIN_LENGTH}
              maximumValue={MAX_LENGTH}
              step={1}
              value={password.length}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              onValueChange={(value: number) => changePassword({ length: Math.round(value) })}
            />
          </View>
          <ToggleRow
            label="Uppercase (A-Z)"
            value={password.uppercase}
            onChange={(v) => changePassword({ uppercase: v })}
          />
          <ToggleRow
            label="Lowercase (a-z)"
            value={password.lowercase}
            onChange={(v) => changePassword({ lowercase: v })}
          />
          <ToggleRow
            label="Numbers (0-9)"
            value={password.numbers}
            onChange={(v) => changePassword({ numbers: v })}
          />
          <ToggleRow
            label="Symbols (!@#$...)"
            value={password.symbols}
            onChange={(v) => changePassword({ symbols: v })}
          />
          <ToggleRow
            label="Avoid look-alike characters"
            description="Leaves out I, l, 1, O, 0 and o."
            value={password.excludeLookAlikes}
            onChange={(v) => changePassword({ excludeLookAlikes: v })}
          />
          {notice ? (
            <Text accessibilityRole="alert" style={[typography.caption, { color: colors.warning }]}>
              {notice}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: colors.textMuted }]}>
              Words: {passphrase.words}
            </Text>
            <Slider
              accessibilityLabel="Number of words"
              accessibilityValue={{ min: MIN_WORDS, max: MAX_WORDS, now: passphrase.words }}
              minimumValue={MIN_WORDS}
              maximumValue={MAX_WORDS}
              step={1}
              value={passphrase.words}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              onValueChange={(value: number) => changePassphrase({ words: Math.round(value) })}
            />
          </View>
          <ChoiceGroup
            label="Separator"
            options={SEPARATORS}
            value={passphrase.separator}
            onChange={(value) => changePassphrase({ separator: value })}
          />
          <ToggleRow
            label="Capitalize words"
            value={passphrase.capitalize}
            onChange={(v) => changePassphrase({ capitalize: v })}
          />
          <ToggleRow
            label="Add a number"
            value={passphrase.includeNumber}
            onChange={(v) => changePassphrase({ includeNumber: v })}
          />
        </View>
      )}

      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Made on this phone with its secure random number generator. Nothing is sent anywhere.
      </Text>
    </Card>
  );
}
