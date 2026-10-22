import { View, type ColorValue } from 'react-native';

type Props = { name: 'vault' | 'generator' | 'settings'; color: ColorValue; size?: number };

// Tiny icons drawn with plain views, so the app needs no icon library.
export function TabIcon({ name, color, size = 24 }: Props) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {name === 'vault' ? <Lock color={color} size={size} /> : null}
      {name === 'generator' ? <Dice color={color} size={size} /> : null}
      {name === 'settings' ? <Sliders color={color} size={size} /> : null}
    </View>
  );
}

type Shape = { color: ColorValue; size: number };

function Lock({ color, size }: Shape) {
  return (
    <>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.32,
          borderWidth: 2.5,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: size * 0.25,
          borderTopRightRadius: size * 0.25,
        }}
      />
      <View
        style={{
          width: size * 0.8,
          height: size * 0.5,
          borderRadius: size * 0.14,
          backgroundColor: color,
        }}
      />
    </>
  );
}

function Dice({ color, size }: Shape) {
  const dot = {
    width: size * 0.13,
    height: size * 0.13,
    borderRadius: size,
    backgroundColor: color,
  };
  return (
    <View
      style={{
        width: size * 0.82,
        height: size * 0.82,
        borderRadius: size * 0.22,
        borderWidth: 2.5,
        borderColor: color,
        padding: size * 0.1,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={dot} />
        <View style={dot} />
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={dot} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={dot} />
        <View style={dot} />
      </View>
    </View>
  );
}

function Sliders({ color, size }: Shape) {
  const line = (knobAt: number) => (
    <View style={{ width: size * 0.84, height: size * 0.2, justifyContent: 'center' }}>
      <View style={{ height: 2.5, borderRadius: 2, backgroundColor: color }} />
      <View
        style={{
          position: 'absolute',
          left: size * knobAt,
          width: size * 0.2,
          height: size * 0.2,
          borderRadius: size,
          backgroundColor: color,
        }}
      />
    </View>
  );
  return (
    <View style={{ gap: size * 0.16 }}>
      {line(0.5)}
      {line(0.12)}
      {line(0.6)}
    </View>
  );
}
