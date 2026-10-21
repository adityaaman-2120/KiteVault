import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, EmptyState, ScreenContainer, TextField } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type Folder } from '@/vault';

import { addFolder, deleteFolder, describeSaveError, renameFolder } from './entryActions';

function FolderRow({ folder, count }: { folder: Folder; count: number }) {
  const { colors, spacing, typography } = useTheme();
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
      <Card>
        <TextField
          label="Folder name"
          value={name}
          onChangeText={setName}
          error={error ?? undefined}
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
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[typography.body, { color: colors.text }]}>{folder.name}</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {count} {count === 1 ? 'entry' : 'entries'}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Rename" variant="secondary" onPress={() => setEditing(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Delete" variant="danger" onPress={confirmDelete} />
        </View>
      </View>
    </Card>
  );
}

export function FoldersScreen() {
  const { colors, typography } = useTheme();
  const folders = useVaultStore((s) => s.data?.folders);
  const entries = useVaultStore((s) => s.data?.entries);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <Card>
        <TextField
          label="New folder"
          value={name}
          onChangeText={setName}
          error={error ?? undefined}
        />
        <Button
          title="Add folder"
          onPress={() => void add()}
          loading={busy}
          disabled={name.trim() === ''}
        />
      </Card>
      {(folders ?? []).length === 0 ? (
        <View style={{ minHeight: 200 }}>
          <EmptyState title="No folders yet" message="Folders help you group entries." />
        </View>
      ) : (
        (folders ?? []).map((folder) => (
          <FolderRow key={folder.id} folder={folder} count={countIn(folder.id)} />
        ))
      )}
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Deleting a folder never deletes the entries inside it.
      </Text>
    </ScreenContainer>
  );
}
