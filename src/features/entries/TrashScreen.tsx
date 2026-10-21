import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, EmptyState, LetterAvatar, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry } from '@/vault';

import { deleteForever, describeSaveError, emptyTrash, restoreFromTrash } from './entryActions';
import { describeDaysLeft } from './format';
import { TRASH_RETENTION_DAYS, isExpiredInTrash, isTrashed, trashDaysLeft } from './model';

const fail = (error: unknown) => Alert.alert('Could not save', describeSaveError(error));

function TrashRow({ entry, now }: { entry: Entry; now: number }) {
  const { colors, spacing, typography } = useTheme();

  const confirmDelete = () =>
    Alert.alert(
      'Delete forever?',
      `"${entry.title}" will be removed for good and cannot be restored.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => void deleteForever(entry.id).catch(fail),
        },
      ],
    );

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LetterAvatar title={entry.title} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
            {entry.title}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {describeDaysLeft(trashDaysLeft(entry, now))}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Restore" onPress={() => void restoreFromTrash(entry.id).catch(fail)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Delete forever" variant="danger" onPress={confirmDelete} />
        </View>
      </View>
    </Card>
  );
}

export function TrashScreen() {
  const { colors, typography } = useTheme();
  const entries = useVaultStore((s) => s.data?.entries);
  // Fixed while the screen is open, so the "days left" text does not flicker.
  const [now] = useState(() => Date.now());

  const trashed = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => isTrashed(e) && !isExpiredInTrash(e, now))
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [entries, now],
  );

  const confirmEmpty = () =>
    Alert.alert('Empty the Trash?', `All ${trashed.length} entries will be removed for good.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Empty Trash', style: 'destructive', onPress: () => void emptyTrash().catch(fail) },
    ]);

  return (
    <ScreenContainer scroll>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Deleted entries stay here for {TRASH_RETENTION_DAYS} days, then are removed for good.
      </Text>
      {trashed.length === 0 ? (
        <View style={{ minHeight: 240 }}>
          <EmptyState title="Trash is empty" message="Entries you delete will appear here." />
        </View>
      ) : (
        <>
          {trashed.map((entry) => (
            <TrashRow key={entry.id} entry={entry} now={now} />
          ))}
          <Button title="Empty Trash" variant="danger" onPress={confirmEmpty} />
        </>
      )}
    </ScreenContainer>
  );
}
