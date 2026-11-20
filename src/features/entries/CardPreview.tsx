import { Text, View } from 'react-native';

import { typeColor } from '@/components/TypeGlyph';

// Groups of four, digits hidden except the last four ("•••• •••• •••• 4242").
export function maskedCardNumber(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 4) return '•••• •••• •••• ••••';
  const last = digits.slice(-4);
  const groups = Math.max(Math.ceil((digits.length - 4) / 4), 3);
  return `${Array(groups).fill('••••').join(' ')} ${last}`;
}

// A picture of the card on the details screen. Decoration only: the real values are in the rows
// below, so screen readers skip it. Never shows more than the last four digits.
export function CardPreview({
  holder,
  number,
  expiry,
}: {
  holder: string;
  number: string;
  expiry: string;
}) {
  const base = typeColor('card');
  return (
    <View
      testID="card-preview"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        aspectRatio: 1.586,
        width: '100%',
        maxWidth: 380,
        alignSelf: 'center',
        borderRadius: 20,
        backgroundColor: base,
        padding: 20,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      {/* Soft circles for depth. */}
      <View
        style={{
          position: 'absolute',
          right: -50,
          top: -60,
          width: 190,
          height: 190,
          borderRadius: 95,
          backgroundColor: 'rgba(255,255,255,0.10)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 40,
          bottom: -90,
          width: 190,
          height: 190,
          borderRadius: 95,
          backgroundColor: 'rgba(0,0,0,0.12)',
        }}
      />
      {/* The chip. */}
      <View
        style={{
          width: 42,
          height: 31,
          borderRadius: 7,
          backgroundColor: '#E5C36B',
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.2)',
        }}
      />
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 20,
          fontWeight: '600',
          letterSpacing: 2,
          fontFamily: 'monospace',
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {maskedCardNumber(number)}
      </Text>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        <Text
          style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 }}
          numberOfLines={1}
        >
          {holder.toUpperCase()}
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>{expiry}</Text>
      </View>
    </View>
  );
}
