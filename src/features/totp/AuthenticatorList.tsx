import { FlatList, Text, View } from 'react-native';

import { TextAction } from '@/components';
import { useTheme } from '@/theme';
import type { Entry } from '@/vault';

import { TotpCode } from './TotpCode';
import { useNow } from './useNow';

// The entries that have a one-time code, each showing its live code. One clock drives them all.
export function AuthenticatorList({
  entries,
  onOpen,
}: {
  entries: Entry[];
  onOpen: (id: string) => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const now = useNow();
  return (
    <FlatList
      style={{ flex: 1 }}
      data={entries}
      extraData={now}
      keyExtractor={(entry) => entry.id}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text
              style={[typography.label, { color: colors.text, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {item.title}
              {item.username ? ` · ${item.username}` : ''}
            </Text>
            <TextAction
              label="Open"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => onOpen(item.id)}
            />
          </View>
          <TotpCode secret={item.totpSecret ?? ''} params={item.totpParams} now={now} compact />
        </View>
      )}
      keyboardShouldPersistTaps="handled"
    />
  );
}
