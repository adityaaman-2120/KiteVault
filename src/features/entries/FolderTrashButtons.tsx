import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

// The size of the round buttons (dp).
const SIZE = 34;

type ButtonProps = {
  label: string;
  onPress: () => void;
  children: ReactNode;
  // The button's own colour: the icon and the badge, and a soft wash of it behind the icon.
  color: string;
  // A small count on the corner, for example the number of items in the Trash.
  badge?: number;
};

// A round button for the folder row. The wash is the button's colour at a low strength, so it
// reads on the page in both themes.
function RoundButton({ label, onPress, children, color, badge = 0 }: ButtonProps) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // The circle is small, but the area that reacts to a touch is still 44 dp.
      hitSlop={5}
      onPress={onPress}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${color}${pressed ? '40' : '24'}`,
      })}
    >
      {/* The drawn icons are made for a bigger circle, so they are scaled down with it. */}
      <View style={{ transform: [{ scale: 0.85 }] }}>{children}</View>
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color,
          }}
        >
          <Text
            style={[
              typography.caption,
              { color: colors.onPrimary, fontWeight: '700', fontSize: 11, lineHeight: 14 },
            ]}
          >
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Icons drawn with plain views, like the tab icons.
function FolderIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 16 }}>
      <View
        style={{
          width: 9,
          height: 5,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 3,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 3,
          width: 20,
          height: 13,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 16, height: 18, alignItems: 'center' }}>
      <View
        style={{
          width: 6,
          height: 2,
          borderTopLeftRadius: 1,
          borderTopRightRadius: 1,
          backgroundColor: color,
        }}
      />
      <View style={{ width: 16, height: 2.5, borderRadius: 1, backgroundColor: color }} />
      <View
        style={{
          marginTop: 1.5,
          width: 12,
          height: 12,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

type Props = { trashCount: number; onFolders: () => void; onTrash: () => void };

// Folders (to manage them) and Trash (to restore things). They are actions, not filters, so they
// sit fixed at the right end of the folder row while the folder chips scroll beside them.
export function FolderTrashButtons({ trashCount, onFolders, onTrash }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <RoundButton label="Folders" onPress={onFolders} color={colors.accent}>
        <FolderIcon color={colors.accent} />
      </RoundButton>
      <RoundButton
        label={trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
        onPress={onTrash}
        color={colors.danger}
        badge={trashCount}
      >
        <TrashIcon color={colors.danger} />
      </RoundButton>
    </View>
  );
}
