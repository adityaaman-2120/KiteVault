import { memo } from 'react';
import { Image, Text, View } from 'react-native';

import { BRAND_IMAGES } from '@/features/icons/brandImages.generated';
import { matchBrand } from '@/features/icons/brandMatch';
import type { AppLink, EntryType } from '@/vault';

import { LetterAvatar } from './LetterAvatar';
import { TypeGlyph, typeColor } from './TypeGlyph';

type Props = {
  title: string;
  type?: EntryType;
  urls?: string[];
  appLinks?: AppLink[];
  size?: number;
};

// Brightness of a #RRGGBB colour from 0 (black) to 1 (white), to pick a readable glyph colour.
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

const edge = { borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' } as const;

// The picture beside an entry. Fully offline, in this order:
//   1. a known service (by address, linked app or exact title): its logo on a tile in its colour;
//   2. a known service with no logo in the set: the first letter on a tile in its colour;
//   3. a note, card or identity: a drawn symbol for that kind;
//   4. a login: the first letter on a tile whose colour comes from the title.
export const EntryIcon = memo(function EntryIcon({
  title,
  type = 'login',
  urls,
  appLinks,
  size = 44,
}: Props) {
  const brand = matchBrand({ title, urls, appLinks });
  const tile = {
    width: size,
    height: size,
    borderRadius: size * 0.32,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  if (brand) {
    // Light brand colours (yellow, white) get a dark glyph; the rest a white one.
    const ink = luminance(brand.hex) > 0.5 ? '#14181F' : '#FFFFFF';
    const logo = brand.glyph ? BRAND_IMAGES[brand.key] : undefined;
    return (
      <View
        testID="entry-icon"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // A thin edge keeps very dark brand colours (GitHub, Apple) visible on the dark theme.
        style={[tile, edge, { backgroundColor: brand.hex }]}
      >
        {logo ? (
          <Image
            testID="entry-icon-logo"
            source={logo}
            resizeMode="contain"
            style={{ width: size * 0.56, height: size * 0.56, tintColor: ink }}
          />
        ) : (
          <Text style={{ color: ink, fontWeight: '700', fontSize: size * 0.45 }}>
            {Array.from(brand.name)[0]?.toUpperCase()}
          </Text>
        )}
      </View>
    );
  }

  if (type !== 'login') {
    return (
      <View
        testID="entry-icon"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[tile, edge, { backgroundColor: typeColor(type) }]}
      >
        <TypeGlyph type={type} size={size * 0.56} />
      </View>
    );
  }

  return <LetterAvatar title={title} size={size} />;
});
