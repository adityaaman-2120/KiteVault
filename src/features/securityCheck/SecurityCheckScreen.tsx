import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Button, Card, ScreenContainer, ToggleRow } from '@/components';
import { isTrashed } from '@/features/entries/model';
import { evaluatePassword } from '@/features/onboarding/passwordStrength';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry } from '@/vault';

import {
  analyzeEntries,
  ISSUE_TITLE,
  type CheckResult,
  type Issue,
  type IssueKind,
} from './analyze';
import { BREACH_ERROR_TEXT, BreachCheckError, findBreached, sha1Upper } from './hibp';

export const BREACH_EXPLANATION =
  'Checks your passwords against the public Have I Been Pwned list of passwords that appeared in data breaches. For each password, KiteVault sends only the first 5 characters of its SHA-1 hash to api.pwnedpasswords.com and compares the rest on this phone. Your passwords, the full hashes, your user names and which entry a password belongs to never leave the phone. It uses the internet, only when you tap the button, and is off until you turn it on.';

const NO_ENTRIES: Entry[] = [];

type Row = { type: 'header'; kind: IssueKind; count: number } | { type: 'issue'; issue: Issue };

type Breach =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; checked: number; found: number }
  | { status: 'error'; message: string };

export function SecurityCheckScreen() {
  const router = useRouter();
  const { colors, radius, spacing, typography } = useTheme();
  const entries = useVaultStore((s) => s.data?.entries) ?? NO_ENTRIES;
  const breachEnabled = useSettingsStore((s) => s.breachCheckEnabled);
  const update = useSettingsStore((s) => s.update);

  const [result, setResult] = useState<CheckResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [include2fa, setInclude2fa] = useState(true);
  // SHA-1 of each password found in a breach, never the password. Dropped when the screen closes.
  const [breached, setBreached] = useState<ReadonlyMap<string, number> | undefined>();
  const [breach, setBreach] = useState<Breach>({ status: 'idle' });
  const stop = useRef<AbortController | null>(null);

  // Turning the breach check off forgets its results.
  const activeBreached = breachEnabled ? breached : undefined;

  useEffect(() => {
    let cancelled = false;
    analyzeEntries(entries, {
      now: Date.now(),
      rate: (password, inputs) => evaluatePassword(password, inputs).score,
      hash: sha1Upper,
      breached: activeBreached,
      include2fa,
      onProgress: (done, total) => {
        if (!cancelled) setProgress({ done, total });
      },
    }).then((next) => {
      if (cancelled) return;
      setResult(next);
      setProgress(null);
    });
    return () => {
      cancelled = true;
    };
  }, [entries, activeBreached, include2fa]);

  // Leaving the screen stops a running check.
  useEffect(() => () => stop.current?.abort(), []);

  async function runBreachCheck() {
    if (breach.status === 'running') return;
    const passwords = entries
      .filter((e) => e.type === 'login' && !isTrashed(e) && e.password !== '')
      .map((e) => e.password);
    const controller = new AbortController();
    stop.current = controller;
    setBreach({ status: 'running', done: 0, total: 0 });
    try {
      const found = await findBreached(passwords, {
        signal: controller.signal,
        onProgress: (done, total) => setBreach({ status: 'running', done, total }),
      });
      setBreached(found);
      const distinct = new Set(passwords).size;
      const foundPasswords = new Set(passwords.filter((p) => found.has(sha1Upper(p)))).size;
      setBreach({ status: 'done', checked: distinct, found: foundPasswords });
    } catch (error) {
      const kind = error instanceof BreachCheckError ? error.kind : 'offline';
      setBreach(
        kind === 'cancelled'
          ? { status: 'idle' }
          : { status: 'error', message: BREACH_ERROR_TEXT[kind] },
      );
    }
  }

  const rows = useMemo<Row[]>(() => {
    if (!result) return [];
    const out: Row[] = [];
    let last: IssueKind | null = null;
    for (const issue of result.issues) {
      if (issue.kind !== last) {
        out.push({ type: 'header', kind: issue.kind, count: result.counts[issue.kind] });
        last = issue.kind;
      }
      out.push({ type: 'issue', issue });
    }
    return out;
  }, [result]);

  const scoreColor =
    result?.score == null
      ? colors.textMuted
      : result.score >= 75
        ? colors.success
        : result.score >= 50
          ? colors.warning
          : colors.danger;

  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
      <Card>
        <Text style={[typography.label, { color: colors.textMuted }]}>Security score</Text>
        {result ? (
          <View
            accessible
            accessibilityLabel={`Security score ${result.score ?? 'none'}, ${result.label}`}
          >
            <Text style={{ color: scoreColor, fontSize: 44, fontWeight: '700' }}>
              {result.score === null ? '–' : result.score}
              {result.score === null ? '' : <Text style={{ fontSize: 18 }}> / 100</Text>}
            </Text>
            <Text style={[typography.heading, { color: colors.text }]}>{result.label}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {result.logins} {result.logins === 1 ? 'login' : 'logins'} checked on this phone
              {activeBreached
                ? ', including the breach check'
                : '. The breach check has not been run.'}
            </Text>
          </View>
        ) : (
          <Text style={[typography.body, { color: colors.textMuted }]}>
            Checking{progress ? ` ${progress.done} of ${progress.total}` : ''}…
          </Text>
        )}
      </Card>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Breach check (optional)</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{BREACH_EXPLANATION}</Text>
        <ToggleRow
          label="Allow the breach check"
          value={breachEnabled}
          onChange={(value) => {
            if (!value) {
              stop.current?.abort();
              setBreached(undefined);
              setBreach({ status: 'idle' });
            }
            void update({ breachCheckEnabled: value });
          }}
        />
        {breachEnabled ? (
          <View style={{ gap: spacing.md }}>
            <Button
              title={
                breach.status === 'running'
                  ? `Checking… ${breach.done} of ${breach.total}`
                  : 'Check passwords now'
              }
              onPress={() => void runBreachCheck()}
              loading={breach.status === 'running'}
            />
            {breach.status === 'running' ? (
              <Button title="Stop" variant="secondary" onPress={() => stop.current?.abort()} />
            ) : null}
            {breach.status === 'done' ? (
              <Text
                accessibilityRole="alert"
                style={[
                  typography.body,
                  { color: breach.found > 0 ? colors.danger : colors.success },
                ]}
              >
                {breach.found > 0
                  ? `${breach.found} of ${breach.checked} different passwords were found in breaches.`
                  : `None of your ${breach.checked} different passwords were found in known breaches.`}
              </Text>
            ) : null}
            {breach.status === 'error' ? (
              <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
                {breach.message}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <ToggleRow
        label="Suggest 2FA"
        description="Lists well-known sites that offer two-factor codes. A suggestion only: it does not change the score."
        value={include2fa}
        onChange={setInclude2fa}
      />

      {result && result.issues.length === 0 && result.logins > 0 ? (
        <Text style={[typography.body, { color: colors.success }]}>No problems found.</Text>
      ) : null}
    </View>
  );

  return (
    <ScreenContainer>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(row) =>
          row.type === 'header' ? `h-${row.kind}` : `${row.issue.kind}-${row.issue.entryId}`
        }
        ListHeaderComponent={header}
        initialNumToRender={15}
        windowSize={7}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text
              style={[
                typography.heading,
                { color: colors.text, paddingTop: spacing.md, paddingBottom: spacing.sm },
              ]}
            >
              {ISSUE_TITLE[item.kind]} ({item.count})
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.issue.title}. ${item.issue.detail} Open to fix.`}
              onPress={() => router.push(`/entry/${item.issue.entryId}`)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.sm,
                gap: 2,
              }}
            >
              <Text style={[typography.label, { color: colors.text }]} numberOfLines={1}>
                {item.issue.title}
                {item.issue.username ? ` · ${item.issue.username}` : ''}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {item.issue.detail}
              </Text>
              <Text style={[typography.caption, { color: colors.primary }]}>Open to fix ›</Text>
            </Pressable>
          )
        }
      />
    </ScreenContainer>
  );
}
