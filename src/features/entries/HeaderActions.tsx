import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  children: ReactNode;
  // A small count on the corner, for example the number of items in the Trash.
  badge?: number;
  // The button's own colour: a solid for the icon and badge, and a soft wash behind it.
  tint: { solid: string; wash: string; washPressed: string };
};

// A round button for the dark header. The colours are light enough to read on it in both themes.
function HeaderButton({ label, onPress, children, badge = 0, tint }: ButtonProps) {
  const { typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? tint.washPressed : tint.wash,
      })}
    >
      {children}
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tint.solid,
          }}
        >
          <Text
            style={[typography.caption, { color: '#0E1630', fontWeight: '700', lineHeight: 14 }]}
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

const FOLDER_TINT = {
  solid: '#FFB547',
  wash: 'rgba(255,181,71,0.2)',
  washPressed: 'rgba(255,181,71,0.36)',
};
const TRASH_TINT = {
  solid: '#FF8A80',
  wash: 'rgba(255,138,128,0.2)',
  washPressed: 'rgba(255,138,128,0.36)',
};

type Props = { trashCount: number; onFolders: () => void; onTrash: () => void };

// Folders (to manage them) and Trash (to restore things): actions, not filters, so they live in
// the header instead of among the filter chips.
export function HeaderActions({ trashCount, onFolders, onTrash }: Props) {
  return (
    <>
      <HeaderButton label="Folders" onPress={onFolders} tint={FOLDER_TINT}>
        <FolderIcon color={FOLDER_TINT.solid} />
      </HeaderButton>
      <HeaderButton
        label={trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
        onPress={onTrash}
        badge={trashCount}
        tint={TRASH_TINT}
      >
        <TrashIcon color={TRASH_TINT.solid} />
      </HeaderButton>
    </>
  );
}
