import { useRouter } from 'expo-router';
import { Alert, Linking, Text, View } from 'react-native';

import { Button, Card, EmptyState, LetterAvatar, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry } from '@/vault';

import { TotpCode } from '@/features/totp/TotpCode';
import { removeEntryTotp } from '@/features/totp/totpActions';
import { useNow } from '@/features/totp/useNow';

import { DetailRow } from './DetailRow';
import { describeSaveError, moveToTrash, setFavorite } from './entryActions';
import { formatDate, toOpenableUrl } from './format';
import { typeLabel } from './model';

async function openWebsite(raw: string) {
  const url = toOpenableUrl(raw);
  if (!url) {
    Alert.alert('Cannot open', 'This does not look like a web address.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Cannot open', 'No app on this phone could open that address.');
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Card>
      <Text
        style={[
          typography.caption,
          {
            color: colors.textMuted,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1,
          },
        ]}
      >
        {title}
      </Text>
      <View style={{ gap: spacing.lg }}>{children}</View>
    </Card>
  );
}

export function EntryDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const entry = useVaultStore((s) => s.data?.entries.find((e) => e.id === id));
  const folderName = useVaultStore((s) =>
    entry?.folderId ? s.data?.folders.find((f) => f.id === entry.folderId)?.name : undefined,
  );

  if (!entry || entry.deletedAt !== undefined) {
    return (
      <ScreenContainer>
        <EmptyState title="Entry not found" message="It may have been deleted." />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const confirmDelete = () =>
    Alert.alert(
      'Move to Trash?',
      `"${entry.title}" will stay in the Trash for 30 days. You can restore it until then.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to Trash',
          style: 'destructive',
          onPress: () => {
            moveToTrash(entry.id).then(
              () => router.back(),
              (error) => Alert.alert('Could not save', describeSaveError(error)),
            );
          },
        },
      ],
    );

  const toggleFavorite = () =>
    setFavorite(entry.id, !entry.favorite).catch((error) =>
      Alert.alert('Could not save', describeSaveError(error)),
    );

  return (
    <ScreenContainer scroll>
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
        <LetterAvatar title={entry.title} size={76} />
        <Text style={[typography.title, { color: colors.text, textAlign: 'center' }]}>
          {entry.title}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {typeLabel(entry.type)}
          {folderName ? ` · ${folderName}` : ''}
          {entry.favorite ? ' · ★ Favorite' : ''}
        </Text>
      </View>

      <TypeFields entry={entry} />

      <TwoFactorSection entry={entry} />

      {entry.notes ? (
        <Section title="Notes">
          <DetailRow label="Notes" value={entry.notes} />
        </Section>
      ) : null}

      {entry.customFields.length > 0 ? (
        <Section title="Custom fields">
          {entry.customFields.map((field) => (
            <DetailRow
              key={field.id}
              label={field.label || 'Field'}
              value={field.value}
              secret={field.hidden}
            />
          ))}
        </Section>
      ) : null}

      {entry.passwordHistory.length > 0 ? (
        <Section title="Password history">
          {entry.passwordHistory.map((item, index) => (
            <DetailRow
              key={`${item.changedAt}-${index}`}
              label={`Until ${formatDate(item.changedAt)}`}
              value={item.password}
              secret
            />
          ))}
        </Section>
      ) : null}

      <Section title="Details">
        <DetailRow label="Created" value={formatDate(entry.createdAt)} copyable={false} />
        <DetailRow label="Updated" value={formatDate(entry.updatedAt)} copyable={false} />
      </Section>

      <Button title="Edit" onPress={() => router.push(`/entry/edit/${entry.id}`)} />
      <Button
        title={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
        variant="secondary"
        onPress={toggleFavorite}
      />
      <Button title="Move to Trash" variant="danger" onPress={confirmDelete} />
    </ScreenContainer>
  );
}

function TwoFactorSection({ entry }: { entry: Entry }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  if (!entry.totpSecret) {
    return (
      <Button
        title="Add 2FA"
        variant="secondary"
        onPress={() => router.push(`/entry/totp/${entry.id}`)}
      />
    );
  }
  const remove = () =>
    Alert.alert(
      'Remove 2FA?',
      'The 2FA secret will be deleted from this entry. Make sure you can still sign in to the website without it, or turn 2FA off there first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove 2FA',
          style: 'destructive',
          onPress: () => {
            removeEntryTotp(entry.id).catch((error) =>
              Alert.alert('Could not save', describeSaveError(error)),
            );
          },
        },
      ],
    );
  return (
    <Card>
      <Text style={[typography.label, { color: colors.textMuted }]}>Two-factor code</Text>
      <LiveTotp entry={entry} />
      <Button
        title="Replace 2FA"
        variant="secondary"
        onPress={() => router.push(`/entry/totp/${entry.id}`)}
      />
      <Button title="Remove 2FA" variant="secondary" onPress={remove} />
    </Card>
  );
}

// Only mounted while the entry has a code, so the one-second clock runs only then.
function LiveTotp({ entry }: { entry: Entry }) {
  const now = useNow();
  return <TotpCode secret={entry.totpSecret ?? ''} params={entry.totpParams} now={now} />;
}

function TypeFields({ entry }: { entry: Entry }) {
  if (entry.type === 'login') {
    return (
      <Section title="Login">
        {entry.username ? <DetailRow label="Username" value={entry.username} /> : null}
        {entry.password ? <DetailRow label="Password" value={entry.password} secret /> : null}
        {entry.urls.map((url) => (
          <DetailRow
            key={url}
            label="Website"
            value={url}
            extra={[{ label: 'Open', onPress: () => void openWebsite(url) }]}
          />
        ))}
      </Section>
    );
  }
  if (entry.type === 'card' && entry.card) {
    const { holder, number, expiry, cvv, pin } = entry.card;
    return (
      <Section title="Card">
        {holder ? <DetailRow label="Cardholder" value={holder} /> : null}
        {number ? <DetailRow label="Card number" value={number} secret /> : null}
        {expiry ? <DetailRow label="Expiry" value={expiry} /> : null}
        {cvv ? <DetailRow label="Security code" value={cvv} secret /> : null}
        {pin ? <DetailRow label="PIN" value={pin} secret /> : null}
      </Section>
    );
  }
  if (entry.type === 'identity' && entry.identity) {
    const { fullName, email, phone, address } = entry.identity;
    return (
      <Section title="Identity">
        {fullName ? <DetailRow label="Full name" value={fullName} /> : null}
        {email ? <DetailRow label="Email" value={email} /> : null}
        {phone ? <DetailRow label="Phone" value={phone} /> : null}
        {address ? <DetailRow label="Address" value={address} /> : null}
      </Section>
    );
  }
  return null;
}
