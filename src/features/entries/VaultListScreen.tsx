import { useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, Text, View } from 'react-native';

import { Button, Chip, EmptyState, ScreenContainer, TextField } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry, type EntryType } from '@/vault';

import {
  describeSaveError,
  purgeExpired,
  removeSeedEntries,
  seedFakeEntries,
} from './entryActions';
import { AuthenticatorList } from '@/features/totp/AuthenticatorList';

import { EntryRow, ROW_GAP, ROW_HEIGHT } from './EntryRow';
import { ENTRY_TYPES, isTrashed } from './model';
import { filterEntries, sortEntries } from './search';

const keyExtractor = (entry: Entry) => entry.id;
const getItemLayout = (_: unknown, index: number) => ({
  length: ROW_HEIGHT + ROW_GAP,
  offset: (ROW_HEIGHT + ROW_GAP) * index,
  index,
});
const Separator = () => <View style={{ height: ROW_GAP }} />;
const NO_ENTRIES: Entry[] = [];

export function VaultListScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const entries = useVaultStore((s) => s.data?.entries) ?? NO_ENTRIES;
  const folders = useVaultStore((s) => s.data?.folders);

  const [query, setQuery] = useState('');
  const [type, setType] = useState<EntryType | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [authenticatorOnly, setAuthenticatorOnly] = useState(false);
  // Typing stays instant; the list catches up a moment later.
  const deferredQuery = useDeferredValue(query);

  // Each step is memoized, so typing only re-runs the cheap filter, not the sort.
  const active = useMemo(() => entries.filter((e) => !isTrashed(e)), [entries]);
  const trashCount = entries.length - active.length;
  const sorted = useMemo(() => sortEntries(active), [active]);
  const visible = useMemo(
    () =>
      filterEntries(sorted, {
        query: deferredQuery,
        type,
        favoritesOnly,
        folderId,
        withTotp: authenticatorOnly,
      }),
    [sorted, deferredQuery, type, favoritesOnly, folderId, authenticatorOnly],
  );

  // The Authenticator filter alone, without a search or other filter narrowing it.
  const onlyAuthenticator =
    authenticatorOnly && query === '' && type === null && !favoritesOnly && folderId === null;

  const folderNames = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f.name])), [folders]);
  const filtering =
    query !== '' || type !== null || favoritesOnly || folderId !== null || authenticatorOnly;

  // Trashed entries older than 30 days are removed for good (only saves if there are any).
  useEffect(() => {
    void purgeExpired().catch(() => {});
  }, []);

  const open = useCallback((id: string) => router.push(`/entry/${id}`), [router]);
  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryRow
        entry={item}
        folderName={item.folderId ? folderNames.get(item.folderId) : undefined}
        onOpen={open}
      />
    ),
    [folderNames, open],
  );

  function clearFilters() {
    setQuery('');
    setType(null);
    setFavoritesOnly(false);
    setFolderId(null);
    setAuthenticatorOnly(false);
  }

  async function runDev(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      Alert.alert('Could not save', describeSaveError(error));
    }
  }

  return (
    <ScreenContainer>
      <TextField
        label="Search"
        value={query}
        onChangeText={setQuery}
        placeholder="Title, username or website"
        autoCorrect={false}
      />

      <View style={{ gap: spacing.sm }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip
              label="All"
              selected={!favoritesOnly && type === null && !authenticatorOnly}
              onPress={() => {
                setFavoritesOnly(false);
                setType(null);
                setAuthenticatorOnly(false);
              }}
            />
            <Chip
              label="Authenticator"
              selected={authenticatorOnly}
              onPress={() => setAuthenticatorOnly((v) => !v)}
            />
            <Chip
              label="★ Favorites"
              selected={favoritesOnly}
              onPress={() => setFavoritesOnly((v) => !v)}
            />
            {ENTRY_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={type === t.value}
                onPress={() => setType((current) => (current === t.value ? null : t.value))}
              />
            ))}
          </View>
        </ScrollView>

        {folders && folders.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip
                label="All folders"
                selected={folderId === null}
                onPress={() => setFolderId(null)}
              />
              <Chip
                label="No folder"
                selected={folderId === ''}
                onPress={() => setFolderId(folderId === '' ? null : '')}
              />
              {folders.map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  selected={folderId === f.id}
                  onPress={() => setFolderId(folderId === f.id ? null : f.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Folders" variant="secondary" onPress={() => router.push('/folders')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
            variant="secondary"
            onPress={() => router.push('/trash')}
          />
        </View>
      </View>

      {__DEV__ ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Seed 2,000 (dev)"
              variant="secondary"
              onPress={() => void runDev(() => seedFakeEntries(2000))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Remove seed (dev)"
              variant="secondary"
              onPress={() => void runDev(removeSeedEntries)}
            />
          </View>
        </View>
      ) : null}

      {active.length === 0 ? (
        <EmptyState title="No entries yet" message="Add your first password to get started." />
      ) : visible.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
          <EmptyState
            title={onlyAuthenticator ? 'No codes' : 'No matches'}
            message={
              onlyAuthenticator
                ? 'No entry has a 2FA code yet. Open an entry and choose Add 2FA.'
                : 'Nothing fits your search and filters.'
            }
          />
          {filtering ? (
            <Button title="Clear search and filters" variant="secondary" onPress={clearFilters} />
          ) : null}
        </View>
      ) : (
        <>
          {filtering ? (
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {visible.length} of {active.length}
            </Text>
          ) : null}
          {authenticatorOnly ? (
            <AuthenticatorList entries={visible} onOpen={open} />
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={visible}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              ItemSeparatorComponent={Separator}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          )}
        </>
      )}

      <Button title="Add entry" onPress={() => router.push('/entry/new')} />
    </ScreenContainer>
  );
}
