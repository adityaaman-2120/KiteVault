import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  Button,
  Callout,
  Card,
  CardGroup,
  Chip,
  EyeButton,
  LetterAvatar,
  ScreenContainer,
  TextField,
} from '@/components';
import { describeSaveError } from '@/features/entries/entryActions';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { discardPendingSave, getPendingSaves, type PendingSave } from '@/native/keystore/autofill';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry } from '@/vault';

import { saveAsNewLogin, updateLoginPassword } from './saveActions';
import { findExistingLogins, findLoginsAtOrigin, originText, suggestedTitle } from './saveMatching';

export const SAVE_WARNING =
  'Only save this if you just signed in or signed up there yourself. KiteVault never saves anything without this confirmation.';

const NO_ENTRIES: Entry[] = [];

type Mode = 'update' | 'new';

// The screen opened after the user agreed to "Save to KiteVault?" in another app. It is only
// reachable while the vault is unlocked, so the user has already unlocked KiteVault to get here.
export function PendingSaveScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  // The password is on screen here; keep it out of screenshots.
  useForceScreenProtection();

  const [pending, setPending] = useState<PendingSave[] | null>(null);

  // Read the waiting logins once. Leaving the screen drops every password held here.
  useEffect(() => {
    let cancelled = false;
    getPendingSaves().then((list) => {
      if (!cancelled) setPending(list);
    });
    return () => {
      cancelled = true;
      setPending(null);
    };
  }, []);

  if (pending === null) {
    return (
      <ScreenContainer>
        <Text style={[typography.body, { color: colors.textMuted }]}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const current = pending[0];
  if (!current) {
    return (
      <ScreenContainer>
        <Card>
          <Text style={[typography.heading, { color: colors.text }]}>Nothing to save</Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            No login is waiting. A login waits for 10 minutes after you agree to save it.
          </Text>
        </Card>
        <Button title="Done" onPress={() => router.replace('/vault')} />
      </ScreenContainer>
    );
  }

  // Deletes the waiting copy, then moves on to the next one (or leaves).
  const finished = async (id: string) => {
    await discardPendingSave(id);
    const left = pending.filter((p) => p.id !== id);
    setPending(left);
    if (left.length === 0) router.replace('/vault');
  };

  // `key` gives every waiting login fresh fields.
  return (
    <PendingSaveCard
      key={current.id}
      save={current}
      waitingAfter={pending.length - 1}
      onFinished={finished}
    />
  );
}

function PendingSaveCard({
  save,
  waitingAfter,
  onFinished,
}: {
  save: PendingSave;
  waitingAfter: number;
  onFinished: (id: string) => Promise<void>;
}) {
  const { colors, spacing, typography } = useTheme();
  const entries = useVaultStore((s) => s.data?.entries) ?? NO_ENTRIES;
  const folders = useVaultStore((s) => s.data?.folders);

  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState(() => suggestedTitle(save.origin));
  const [folderId, setFolderId] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A page with no user-name box (a change-password page) gives us no account to match, so the
  // logins for that place are the candidates, and with several of them the person chooses.
  const noUserName = save.username.trim() === '';
  const existing = useMemo(
    () =>
      noUserName
        ? findLoginsAtOrigin(entries, save.origin)
        : findExistingLogins(entries, save.origin, save.username),
    [entries, save.origin, save.username, noUserName],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const samePasswordLogin = noUserName
    ? (existing.find((e) => e.password === save.password) ?? null)
    : null;
  const chosen = existing.find((e) => e.id === chosenId) ?? null;
  const target = noUserName
    ? (samePasswordLogin ?? chosen ?? (existing.length === 1 ? existing[0]! : null))
    : (existing[0] ?? null);
  const needsChoice = noUserName && existing.length > 1 && target === null;
  const alreadySaved = target !== null && target.password === save.password;
  const effectiveMode: Mode = mode ?? (target ? 'update' : 'new');

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (effectiveMode === 'update' && target) await updateLoginPassword(target.id, save);
      else await saveAsNewLogin(save, { title, folderId });
      await onFinished(save.id);
    } catch (e) {
      // The waiting login is kept, so the user can try again.
      setError(describeSaveError(e));
      setBusy(false);
    }
  }

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      await onFinished(save.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll>
      {/* Who it is for: the site or app, big, so it is the first thing read. */}
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
        <LetterAvatar title={suggestedTitle(save.origin)} size={64} />
        <Text style={[typography.label, { color: colors.textMuted }]}>Save to KiteVault?</Text>
        <Text
          accessibilityLabel={`Saved for ${originText(save.origin)}`}
          style={[typography.title, { color: colors.text, textAlign: 'center' }]}
        >
          {originText(save.origin)}
        </Text>
        {waitingAfter > 0 ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {`${waitingAfter} more waiting after this one.`}
          </Text>
        ) : null}
      </View>

      <CardGroup>
        <Card>
          <Text style={[typography.body, { color: colors.text }]}>
            User name: {save.username || '(none)'}
          </Text>
        </Card>
        <Card>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text
              style={[
                typography.body,
                { color: colors.text, flex: 1, fontFamily: shown ? 'monospace' : undefined },
              ]}
            >
              Password: {shown ? save.password : '••••••••••'}
            </Text>
            <EyeButton
              revealed={shown}
              accessibilityLabel={shown ? 'Hide password' : 'Show password'}
              onPress={() => setShown((v) => !v)}
            />
          </View>
        </Card>
      </CardGroup>

      <Callout tone="warning" title="Check before you save">
        {SAVE_WARNING}
      </Callout>

      {alreadySaved ? (
        <Card>
          <Text style={[typography.heading, { color: colors.text }]}>Already saved</Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {`"${target.title}" already has this password. Nothing needs to change.`}
          </Text>
          <Button title="Done" onPress={() => void dismiss()} loading={busy} />
        </Card>
      ) : (
        <>
          {needsChoice ? (
            <Card>
              <Text style={[typography.heading, { color: colors.text }]}>
                Which login did you change?
              </Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                That page showed no user name, and you have more than one login for this site.
                Choose the one whose password you changed, or save this as a new login.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {existing.map((login) => (
                  <Chip
                    key={login.id}
                    label={login.username ? `${login.title} (${login.username})` : login.title}
                    selected={false}
                    onPress={() => {
                      setChosenId(login.id);
                      setMode('update');
                    }}
                  />
                ))}
                <Chip
                  label="Save as new login"
                  selected={effectiveMode === 'new'}
                  onPress={() => setMode('new')}
                />
              </View>
            </Card>
          ) : null}

          {target ? (
            <Card>
              <Text style={[typography.heading, { color: colors.text }]}>
                You already have a login for this
              </Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                {noUserName
                  ? `"${target.title}" is saved for this site. That page showed no user name, so this looks like a change of its password.`
                  : `"${target.title}" is saved with this user name but a different password.${
                      existing.length > 1
                        ? ` (${existing.length} logins match; the newest is used.)`
                        : ''
                    }`}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Chip
                  label="Update password"
                  selected={effectiveMode === 'update'}
                  onPress={() => setMode('update')}
                />
                <Chip
                  label="Save as new login"
                  selected={effectiveMode === 'new'}
                  onPress={() => setMode('new')}
                />
              </View>
              {effectiveMode === 'update' ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  The old password is kept in this login&apos;s password history.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {effectiveMode === 'new' ? (
            <View style={{ gap: spacing.lg }}>
              <TextField label="Title" value={title} onChangeText={setTitle} editable={!busy} />
              {folders && folders.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={[typography.label, { color: colors.text }]}>Folder</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Chip
                        label="No folder"
                        selected={folderId === ''}
                        onPress={() => setFolderId('')}
                      />
                      {folders.map((f) => (
                        <Chip
                          key={f.id}
                          label={f.name}
                          selected={folderId === f.id}
                          onPress={() => setFolderId(f.id)}
                        />
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}

          <Button
            title={
              effectiveMode === 'update' && target
                ? `Update password for "${target.title}"`
                : 'Save to KiteVault'
            }
            onPress={() => void confirm()}
            loading={busy}
            disabled={effectiveMode === 'new' && title.trim() === ''}
          />
          <Button
            title="Not now"
            variant="secondary"
            onPress={() => void dismiss()}
            disabled={busy}
          />
        </>
      )}
    </ScreenContainer>
  );
}
