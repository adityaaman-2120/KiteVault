import { View } from 'react-native';

import type { EntryType } from '@/vault';

// Tile colours for the kinds that have no website: one steady colour each, white symbol on top.
const COLORS: Record<Exclude<EntryType, 'login'>, string> = {
  note: '#B7791F', // amber
  card: '#0F7F86', // teal
  identity: '#6650C8', // violet
};
export const typeColor = (type: EntryType): string => (type === 'login' ? '#3B4A8C' : COLORS[type]);

const WHITE = '#FFFFFF';

// Symbols drawn with plain views, like the tab icons, so the app needs no icon library.
export function TypeGlyph({ type, size }: { type: EntryType; size: number }) {
  const s = size;
  if (type === 'note') {
    return (
      <View
        style={{
          width: s * 0.78,
          height: s,
          borderRadius: s * 0.14,
          backgroundColor: WHITE,
          paddingHorizontal: s * 0.14,
          justifyContent: 'center',
          gap: s * 0.13,
        }}
      >
        {[1, 1, 0.6].map((w, i) => (
          <View
            key={i}
            style={{
              width: `${w * 100}%`,
              height: s * 0.07,
              borderRadius: s,
              backgroundColor: COLORS.note,
            }}
          />
        ))}
      </View>
    );
  }
  if (type === 'card') {
    return (
      <View
        style={{
          width: s,
          height: s * 0.72,
          borderRadius: s * 0.14,
          backgroundColor: WHITE,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: s * 0.16, marginTop: s * 0.14, backgroundColor: COLORS.card }} />
        <View
          style={{
            width: s * 0.26,
            height: s * 0.1,
            marginTop: s * 0.14,
            marginLeft: s * 0.12,
            borderRadius: s,
            backgroundColor: COLORS.card,
            opacity: 0.55,
          }}
        />
      </View>
    );
  }
  // identity: a head over shoulders
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View
        style={{
          width: s * 0.38,
          height: s * 0.38,
          borderRadius: s,
          backgroundColor: WHITE,
          marginBottom: s * 0.06,
        }}
      />
      <View
        style={{
          width: s * 0.8,
          height: s * 0.4,
          borderTopLeftRadius: s * 0.4,
          borderTopRightRadius: s * 0.4,
          backgroundColor: WHITE,
        }}
      />
    </View>
  );
}
