import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Chip, RoundButton, ScreenContainer, TextField } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type Folder } from '@/vault';

import { addFolder, deleteFolder, describeSaveError, renameFolder } from './entryActions';
import { NoResults } from './NoResults';

// Ideas for a first folder, shown only while there are none.
const SUGGESTIONS = ['Work', 'Personal', 'Banking', 'Family'];

// A small folder drawn with plain views, like the other icons.
function FolderGlyph({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 19 }}>
      <View
        style={{
          width: 10,
          height: 5,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          backgroundColor: color,
        }}
      />
      <View style={{ flex: 1, borderRadius: 4, borderTopLeftRadius: 0, backgroundColor: color }} />
    </View>
  );
}

function FolderRow({ folder, count }: { folder: Folder; count: number }) {
  const { colors, radius, spacing, typography } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await renameFolder(folder.id, name);
      setEditing(false);
    } catch (e) {
      setError(describeSaveError(e));
    }
  }

  const confirmDelete = () =>
    Alert.alert(
      `Delete "${folder.name}"?`,
      count > 0
        ? `Its ${count} ${count === 1 ? 'entry stays' : 'entries stay'} in your vault, without a folder.`
        : 'The folder is empty.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete folder',
          style: 'destructive',
          onPress: () =>
            void deleteFolder(folder.id).catch((e) =>
              Alert.alert('Could not save', describeSaveError(e)),
            ),
        },
      ],
    );

  if (editing) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <TextField
          label="Folder name"
          value={name}
          onChangeText={setName}
          error={error ?? undefined}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Save" onPress={() => void save()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setEditing(false);
                setName(folder.name);
                setError(null);
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FolderGlyph color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[typography.heading, { color: colors.text }]}>
          {folder.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {count} {count === 1 ? 'entry' : 'entries'}
        </Text>
      </View>
      <RoundButton
        symbol="✎"
        name="Rename"
        onPress={() => setEditing(true)}
        tint={colors.primary}
        background={colors.primarySoft}
      />
      <RoundButton
        symbol="✕"
        name="Delete"
        onPress={confirmDelete}
        tint={colors.danger}
        background={colors.surfaceMuted}
      />
    </View>
  );
}

export function FoldersScreen() {
  const { colors, radius, spacing, typography } = useTheme();
  const folders = useVaultStore((s) => s.data?.folders) ?? [];
  const entries = useVaultStore((s) => s.data?.entries);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAdd = name.trim() !== '' && !busy;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addFolder(name);
      setName('');
    } catch (e) {
      setError(describeSaveError(e));
    }
    setBusy(false);
  }

  const countIn = (folderId: string) =>
    (entries ?? []).filter((e) => e.folderId === folderId && e.deletedAt === undefined).length;

  return (
    <ScreenContainer scroll>
      {/* The field and a round + button side by side. */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="New folder"
              value={name}
              onChangeText={setName}
              placeholder="Folder name"
              returnKeyType="done"
              onSubmitEditing={() => canAdd && void add()}
              error={error ?? undefined}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add folder"
            accessibilityState={{ disabled: !canAdd, busy }}
            disabled={!canAdd}
            onPress={() => void add()}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              opacity: !canAdd ? 0.4 : pressed ? 0.85 : 1,
              // Lines the button up with the box of the field, not with its error line.
              marginBottom: error ? 22 : 0,
            })}
          >
            <Text
              style={{ color: colors.onPrimary, fontSize: 28, lineHeight: 32, fontWeight: '600' }}
            >
              +
            </Text>
          </Pressable>
        </View>
        {folders.length === 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {SUGGESTIONS.map((suggestion) => (
              <Chip
                key={suggestion}
                tone="soft"
                label={suggestion}
                selected={name === suggestion}
                onPress={() => setName(suggestion)}
              />
            ))}
          </View>
        ) : null}
      </Card>

      {folders.length === 0 ? (
        <View style={{ minHeight: 300 }}>
          <NoResults kind="folders" />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text
            style={[
              typography.caption,
              {
                color: colors.textMuted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 1,
                paddingHorizontal: spacing.xs,
              },
            ]}
          >
            {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
          </Text>
          <Card flush>
            {folders.map((folder, index) => (
              <View
                key={folder.id}
                style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null}
              >
                <FolderRow folder={folder} count={countIn(folder.id)} />
              </View>
            ))}
          </Card>
        </View>
      )}

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
        <Text style={{ fontSize: 18, color: colors.primary }}>ⓘ</Text>
        <Text style={[typography.caption, { color: colors.text, flex: 1, lineHeight: 18 }]}>
          Deleting a folder never deletes the entries inside it.
        </Text>
      </View>
    </ScreenContainer>
  );
}
