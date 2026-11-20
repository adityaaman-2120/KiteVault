import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card, EntryIcon, RoundButton, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry } from '@/vault';

import { deleteForever, describeSaveError, emptyTrash, restoreFromTrash } from './entryActions';
import { NoResults } from './NoResults';
import { describeDaysLeft } from './format';
import { TRASH_RETENTION_DAYS, isExpiredInTrash, isTrashed, trashDaysLeft } from './model';

const fail = (error: unknown) => Alert.alert('Could not save', describeSaveError(error));

function TrashRow({ entry, now }: { entry: Entry; now: number }) {
  const { colors, spacing, typography } = useTheme();
  const daysLeft = trashDaysLeft(entry, now);
  // Calm at first, amber in the last week, red in the last three days.
  const urgency = daysLeft <= 3 ? colors.danger : daysLeft <= 7 ? colors.warning : colors.textMuted;
  const fraction = Math.max(0.04, Math.min(1, daysLeft / TRASH_RETENTION_DAYS));

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
    <View style={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <EntryIcon
          title={entry.title}
          type={entry.type}
          urls={entry.urls}
          appLinks={entry.appLinks}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[typography.heading, { color: colors.text }]}>
            {entry.title}
          </Text>
          <Text style={[typography.caption, { color: urgency, fontWeight: '600' }]}>
            {describeDaysLeft(daysLeft)}
          </Text>
        </View>
        <RoundButton
          symbol="↺"
          name="Restore"
          onPress={() => void restoreFromTrash(entry.id).catch(fail)}
          tint={colors.primary}
          background={colors.primarySoft}
        />
        <RoundButton
          symbol="✕"
          name="Delete forever"
          onPress={confirmDelete}
          tint={colors.danger}
          background={colors.surfaceMuted}
        />
      </View>
      {/* How much of the 30 days is left. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${fraction * 100}%`,
            height: 3,
            borderRadius: 2,
            backgroundColor: urgency,
          }}
        />
      </View>
    </View>
  );
}

export function TrashScreen() {
  const { colors, radius, spacing, typography } = useTheme();
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.primarySoft,
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <Text style={{ fontSize: 18, color: colors.primary }}>🗑</Text>
        <Text style={[typography.caption, { color: colors.text, flex: 1, lineHeight: 18 }]}>
          Deleted entries stay here for {TRASH_RETENTION_DAYS} days, then are removed for good.
        </Text>
      </View>
      {trashed.length === 0 ? (
        <NoResults kind="trash" />
      ) : (
        <>
          <Text
            style={[
              typography.caption,
              {
                color: colors.textMuted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: -spacing.sm,
                paddingHorizontal: spacing.xs,
              },
            ]}
          >
            {trashed.length} {trashed.length === 1 ? 'item' : 'items'}
          </Text>
          <Card flush>
            {trashed.map((entry, index) => (
              <View
                key={entry.id}
                style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null}
              >
                <TrashRow entry={entry} now={now} />
              </View>
            ))}
          </Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Empty Trash"
            onPress={confirmEmpty}
            style={({ pressed }) => ({
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: colors.danger,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={[typography.label, { color: colors.danger, fontSize: 15, fontWeight: '700' }]}
            >
              Empty Trash
            </Text>
          </Pressable>
        </>
      )}
    </ScreenContainer>
  );
}
