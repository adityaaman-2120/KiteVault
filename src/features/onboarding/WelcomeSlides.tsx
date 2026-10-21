import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  FlatList,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Button, ScreenContainer } from '@/components';
import { isCloudBackupAvailable } from '@/features/backup/config';
import { useTheme } from '@/theme';

export const SLIDES = [
  {
    title: 'Everything stays on your device',
    body: 'Your passwords are encrypted and stored only on this phone. There is no account and no tracking.',
  },
  {
    title: 'Only you hold the key',
    body: 'Your master password cannot be recovered by anyone, including us. If you forget it, your data is gone.',
  },
  {
    title: 'Optional encrypted backup',
    body: 'Back up to your own Google Drive if you like. The backup is encrypted before it leaves your phone.',
  },
] as const;

export function WelcomeSlides() {
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  // Screen padding on both sides of the page.
  const pageWidth = width - spacing.lg * 2;

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  }

  function next() {
    if (last) {
      router.push('/create-vault');
    } else {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    }
  }

  return (
    <ScreenContainer>
      <Text style={[typography.label, { color: colors.primary }]}>KiteVault</Text>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(slide) => slide.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width: pageWidth, justifyContent: 'center', gap: spacing.md }}>
            <Text style={[typography.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>{item.body}</Text>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
        {SLIDES.map((slide, i) => (
          <View
            key={slide.title}
            style={{
              width: i === index ? 24 : 8,
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: i === index ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>
      <Button title={last ? 'Create your vault' : 'Next'} onPress={next} />
      {isCloudBackupAvailable() ? (
        <Button
          title="Restore from Google Drive"
          variant="secondary"
          onPress={() => router.push('/restore')}
        />
      ) : null}
    </ScreenContainer>
  );
}
