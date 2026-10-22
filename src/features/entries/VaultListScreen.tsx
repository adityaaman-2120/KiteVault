import { useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, EmptyState, SegmentedControl } from '@/components';
import { LockButton } from '@/features/lock/LockButton';
import { useTheme } from '@/theme';
import { useVaultStore, type Entry, type EntryType } from '@/vault';

import {
  describeSaveError,
  purgeExpired,
  removeSeedEntries,
  seedFakeEntries,
} from './entryActions';
import { AuthenticatorList } from '@/features/totp/AuthenticatorList';

import { AddEntrySheet } from './AddEntrySheet';
import { EntryRow, ROW_GAP, rowHeight } from './EntryRow';
import { ENTRY_TYPES, isTrashed } from './model';
import { SearchBar } from './SearchBar';
import { filterEntries, sortEntries } from './search';

const keyExtractor = (entry: Entry) => entry.id;
const getItemLayout = (_: unknown, index: number) => {
  const length = rowHeight() + ROW_GAP;
  return { length, offset: length * index, index };
};
const Separator = () => <View style={{ height: ROW_GAP }} />;
const NO_ENTRIES: Entry[] = [];
// The brand amber, readable on the dark header in both themes.
const AMBER = '#FFB547';

// Small text button for the development helpers (only built into dev builds).
function DevButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text
        style={[typography.caption, { color: colors.textMuted, textDecorationLine: 'underline' }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function VaultListScreen() {
  const router = useRouter();
  const { colors, elevation, radius, spacing, typography } = useTheme();
  const entries = useVaultStore((s) => s.data?.entries) ?? NO_ENTRIES;
  const folders = useVaultStore((s) => s.data?.folders);

  const [adding, setAdding] = useState(false);
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* The dark top panel holds the title, the lock button and the search, like a header. */}
      <SafeAreaView
        edges={['top']}
        style={{
          backgroundColor: colors.header,
          borderBottomLeftRadius: radius.xl,
          borderBottomRightRadius: radius.xl,
        }}
      >
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel="KiteVault"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <Image
                source={require('../../../assets/images/brand-mark.png')}
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={{ width: 44, height: 44 }}
                resizeMode="contain"
              />
              <View>
                <Text style={[typography.title, { color: colors.onHeader }]}>
                  Kite<Text style={{ color: AMBER }}>Vault</Text>
                </Text>
                <Text style={[typography.caption, { color: colors.onHeader, opacity: 0.7 }]}>
                  {filtering ? `${visible.length} of ${active.length}` : `${active.length}`} entries
                  · encrypted on this phone
                </Text>
              </View>
            </View>
            <LockButton />
          </View>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search title, username or website"
          />
        </View>
      </SafeAreaView>

      <View
        style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}
      >
        {/* The main views of the vault. Only one is active at a time. */}
        <SegmentedControl
          options={[
            {
              label: 'All',
              selected: !favoritesOnly && !authenticatorOnly,
              onPress: () => {
                setFavoritesOnly(false);
                setType(null);
                setAuthenticatorOnly(false);
              },
            },
            {
              label: '★ Favorites',
              selected: favoritesOnly,
              onPress: () => {
                setFavoritesOnly((v) => !v);
                setAuthenticatorOnly(false);
              },
            },
            {
              label: 'Authenticator',
              selected: authenticatorOnly,
              onPress: () => {
                setAuthenticatorOnly((v) => !v);
                setFavoritesOnly(false);
              },
            },
          ]}
        />

        {/* Chips keep a 48dp touch area but look compact, so the rows overlap a little. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, marginVertical: -5 }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
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
            style={{ flexGrow: 0, marginVertical: -5 }}
          >
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip
                tone="soft"
                label="All folders"
                selected={folderId === null}
                onPress={() => setFolderId(null)}
              />
              <Chip
                tone="soft"
                label="No folder"
                selected={folderId === ''}
                onPress={() => setFolderId(folderId === '' ? null : '')}
              />
              {folders.map((f) => (
                <Chip
                  tone="soft"
                  key={f.id}
                  label={f.name}
                  selected={folderId === f.id}
                  onPress={() => setFolderId(folderId === f.id ? null : f.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: spacing.sm,
            marginVertical: -5,
          }}
        >
          <Chip
            tone="soft"
            label="Folders"
            selected={false}
            onPress={() => router.push('/folders')}
          />
          <Chip
            tone="soft"
            label={trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
            selected={false}
            onPress={() => router.push('/trash')}
          />
        </View>

        {__DEV__ ? (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <DevButton
              title="Seed 2,000 (dev)"
              onPress={() => void runDev(() => seedFakeEntries(2000))}
            />
            <DevButton title="Remove seed (dev)" onPress={() => void runDev(removeSeedEntries)} />
          </View>
        ) : null}

        {active.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
            <EmptyState title="No entries yet" message="Add your first password to get started." />
            <Button title="Add entry" onPress={() => setAdding(true)} />
          </View>
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
        ) : authenticatorOnly ? (
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
            // Room so the floating button never covers the last row.
            contentContainerStyle={{ paddingBottom: 88, paddingTop: 4 }}
          />
        )}
      </View>

      {active.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add entry"
          onPress={() => setAdding(true)}
          style={({ pressed }) => [
            {
              position: 'absolute',
              right: spacing.lg,
              bottom: spacing.lg,
              width: 60,
              height: 60,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
            elevation.float,
          ]}
        >
          {/* A plus drawn with two bars, so it is crisp and exactly centred. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}
          >
            <View
              style={{
                position: 'absolute',
                width: 22,
                height: 3,
                borderRadius: 2,
                backgroundColor: colors.onPrimary,
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: 3,
                height: 22,
                borderRadius: 2,
                backgroundColor: colors.onPrimary,
              }}
            />
          </View>
        </Pressable>
      ) : null}

      <AddEntrySheet
        visible={adding}
        onClose={() => setAdding(false)}
        onPick={(picked) => {
          setAdding(false);
          router.push(`/entry/new?type=${picked}`);
        }}
      />
    </View>
  );
}
