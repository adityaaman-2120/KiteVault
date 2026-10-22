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

import { BrandHeader, Button, ScreenContainer } from '@/components';
import { isCloudBackupAvailable } from '@/features/backup/config';
import { useTheme } from '@/theme';

export const SLIDES = [
  {
    icon: '📱',
    title: 'Everything stays on your device',
    body: 'Your passwords are encrypted and stored only on this phone. There is no account and no tracking.',
  },
  {
    icon: '🔑',
    title: 'Only you hold the key',
    body: 'Your master password cannot be recovered by anyone, including Kitelux. If you forget it, your passwords are gone for good, unless you set up a recovery key.',
  },
  {
    icon: '☁️',
    title: 'Optional encrypted backup',
    body: 'Back up to your own Google Drive if you like. The backup is encrypted on your phone before it leaves, and only your master password can open it.',
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
    <ScreenContainer headerless>
      <BrandHeader size="large" />
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
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 96,
                height: 96,
                borderRadius: radius.xl,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ fontSize: 44 }}>{item.icon}</Text>
            </View>
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
