import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components';
import { useTheme } from '@/theme';

type Props = {
  // "empty": the vault has no entries. "codes": the Authenticator view has nothing.
  // "matches": a search or filter found nothing.
  kind: 'empty' | 'matches' | 'codes' | 'trash' | 'folders';
  // Clears the filters, or (for "empty") starts adding an entry.
  onAction?: () => void;
};

// A magnifying glass (matches) or a clock face (codes), drawn with plain views.
function Symbol({ kind, color }: { kind: Props['kind']; color: string }) {
  if (kind === 'folders') {
    // A folder: a small tab on a rounded body.
    return (
      <View style={{ width: 44, height: 36 }}>
        <View
          style={{
            width: 18,
            height: 8,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            backgroundColor: color,
          }}
        />
        <View
          style={{ flex: 1, borderRadius: 6, borderTopLeftRadius: 0, backgroundColor: color }}
        />
      </View>
    );
  }
  if (kind === 'trash') {
    // A bin: handle, lid and a body with a rounded bottom.
    return (
      <View style={{ width: 40, height: 44, alignItems: 'center' }}>
        <View
          style={{
            width: 14,
            height: 6,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            backgroundColor: color,
          }}
        />
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: color }} />
        <View
          style={{
            width: 30,
            height: 28,
            marginTop: 3,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
            backgroundColor: color,
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            paddingTop: 5,
          }}
        >
          <View
            style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.25)' }}
          />
          <View
            style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.25)' }}
          />
        </View>
      </View>
    );
  }
  if (kind === 'empty') {
    // A key: a ring for the head, a shaft and two teeth.
    return (
      <View style={{ width: 44, height: 44, transform: [{ rotate: '-45deg' }] }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 12,
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 4,
            borderColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 18,
            top: 20,
            width: 25,
            height: 4,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 31,
            top: 23,
            width: 4,
            height: 8,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 39,
            top: 23,
            width: 4,
            height: 6,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }
  if (kind === 'matches') {
    return (
      <View style={{ width: 44, height: 44 }}>
        <View
          style={{
            position: 'absolute',
            left: 3,
            top: 3,
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 4,
            borderColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 26,
            top: 33,
            width: 17,
            height: 5,
            borderRadius: 3,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 4,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 7,
          width: 4,
          height: 12,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 18,
          top: 17,
          width: 11,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// Shown in the same place for every empty result: pinned near the top, with the text area a fixed
// two or three lines tall, so switching between Favorites and Authenticator never makes it jump.
export function NoResults({ kind, onAction }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const codes = kind === 'codes';
  const empty = kind === 'empty';
  const trash = kind === 'trash' || kind === 'folders';
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: spacing.xxl,
        paddingHorizontal: spacing.xl,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 104,
          height: 104,
          borderRadius: 52,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Symbol kind={kind} color={colors.accent} />
        </View>
      </View>
      <Text
        style={[
          typography.heading,
          { color: colors.text, marginTop: spacing.lg, alignSelf: 'stretch', textAlign: 'center' },
        ]}
      >
        {kind === 'folders'
          ? 'No folders yet'
          : trash
            ? 'Trash is empty'
            : empty
              ? 'No entries yet'
              : codes
                ? 'No codes'
                : 'No matches'}
      </Text>
      <Text
        style={[
          typography.body,
          {
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: spacing.xs,
            minHeight: 60, // three lines, so the button below stays put
          },
        ]}
      >
        {kind === 'folders'
          ? 'Folders help you group entries, like Work or Banking.'
          : trash
            ? 'Entries you delete will appear here, and you can restore them for 30 days.'
            : empty
              ? 'Add your first password, card or note. It is encrypted and stays only on this phone.'
              : codes
                ? 'No entry has a 2FA code yet. Open an entry and choose Add 2FA.'
                : 'Nothing fits your search and filters.'}
      </Text>
      {trash ? null : empty ? (
        // Its own button (not the shared one) so the longer label can never be cut short.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add your first entry"
          onPress={onAction ?? (() => {})}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            alignSelf: 'stretch',
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ color: colors.onPrimary, fontSize: 22, fontWeight: '700' }}>+</Text>
          <Text
            numberOfLines={1}
            style={{ color: colors.onPrimary, fontSize: 16, fontWeight: '700', flexShrink: 1 }}
          >
            Add your first entry
          </Text>
        </Pressable>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Button
            title={codes ? 'Show all entries' : 'Clear search and filters'}
            variant="secondary"
            compact
            onPress={onAction ?? (() => {})}
          />
        </View>
      )}
    </View>
  );
}
