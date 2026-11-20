import { Pressable, Text } from 'react-native';

// A round icon button. `name` is the spoken name; the symbol is only decoration.
export function RoundButton({
  symbol,
  name,
  onPress,
  tint,
  background,
}: {
  symbol: string;
  name: string;
  onPress: () => void;
  tint: string;
  background: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: tint, fontSize: 20, lineHeight: 24, fontWeight: '700' }}>{symbol}</Text>
    </Pressable>
  );
}
