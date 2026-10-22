import Slider from '@react-native-community/slider';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button, ChoiceGroup, StrengthMeter, ToggleRow } from '@/components';
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
  const { colors, radius, spacing, typography } = useTheme();
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
    <View style={{ gap: spacing.lg }}>
      <ChoiceGroup<Mode> label="Type" options={MODES} value={mode} onChange={changeMode} />

      {/* The result: a dark rectangle like the form fields, with the strength right under it. */}
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            backgroundColor: colors.field,
            borderRadius: radius.lg,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.lg,
            minHeight: 84,
            justifyContent: 'center',
          }}
        >
          <Text
            testID="generated-password"
            selectable
            style={[
              typography.heading,
              {
                color: colors.text,
                fontFamily: 'monospace',
                fontSize: 19,
                lineHeight: 28,
                letterSpacing: 0.5,
              },
            ]}
          >
            {generated}
          </Text>
        </View>
        <StrengthMeter score={strength.score} label={strength.label} hint={strength.hint} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button compact title="Copy" onPress={() => void copySecret(generated)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            compact
            title="Regenerate"
            variant="secondary"
            onPress={() => make(mode, password, passphrase)}
          />
        </View>
      </View>
      {onUse ? <Button title="Use this password" onPress={() => onUse(generated)} /> : null}

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
        Options
      </Text>

      {mode === 'password' ? (
        <View>
          <OptionRow first>
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
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Uppercase (A-Z)"
              value={password.uppercase}
              onChange={(v) => changePassword({ uppercase: v })}
            />
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Lowercase (a-z)"
              value={password.lowercase}
              onChange={(v) => changePassword({ lowercase: v })}
            />
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Numbers (0-9)"
              value={password.numbers}
              onChange={(v) => changePassword({ numbers: v })}
            />
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Symbols (!@#$...)"
              value={password.symbols}
              onChange={(v) => changePassword({ symbols: v })}
            />
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Avoid look-alike characters"
              description="Leaves out I, l, 1, O, 0 and o."
              value={password.excludeLookAlikes}
              onChange={(v) => changePassword({ excludeLookAlikes: v })}
            />
          </OptionRow>
          {notice ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: colors.warning, marginTop: spacing.sm }]}
            >
              {notice}
            </Text>
          ) : null}
        </View>
      ) : (
        <View>
          <OptionRow first>
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
          </OptionRow>
          <OptionRow>
            <ChoiceGroup
              label="Separator"
              options={SEPARATORS}
              value={passphrase.separator}
              onChange={(value) => changePassphrase({ separator: value })}
            />
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Capitalize words"
              value={passphrase.capitalize}
              onChange={(v) => changePassphrase({ capitalize: v })}
            />
          </OptionRow>
          <OptionRow>
            <ToggleRow
              label="Add a number"
              value={passphrase.includeNumber}
              onChange={(v) => changePassphrase({ includeNumber: v })}
            />
          </OptionRow>
        </View>
      )}

      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Made on this phone with its secure random number generator. Nothing is sent anywhere.
      </Text>
    </View>
  );
}

// One option in the list, with a thin line under it (and above the first one).
function OptionRow({ children, first = false }: { children: ReactNode; first?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        paddingVertical: spacing.sm,
        gap: spacing.xs,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  );
}
