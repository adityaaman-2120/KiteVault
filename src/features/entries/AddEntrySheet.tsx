import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import type { EntryType } from '@/vault';

const CHOICES: { type: EntryType; label: string; hint: string; icon: string }[] = [
  { type: 'login', label: 'Login', hint: 'Website, username and password', icon: '🔑' },
  { type: 'note', label: 'Secure note', hint: 'Private text only you can read', icon: '📝' },
  { type: 'card', label: 'Card', hint: 'Payment card details', icon: '💳' },
  { type: 'identity', label: 'Identity', hint: 'Name, email, phone and address', icon: '🪪' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (type: EntryType) => void;
};

// A popup from the bottom that asks what kind of entry to add.
export function AddEntrySheet({ visible, onClose, onPick }: Props) {
  const { colors, elevation, radius, spacing, typography } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Tapping the dimmed area closes the popup. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ ...absoluteFill, backgroundColor: 'rgba(5, 9, 24, 0.6)' }}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
            elevation.float,
          ]}
        >
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
              }}
            />
            <Text accessibilityRole="header" style={[typography.heading, { color: colors.text }]}>
              Add to your vault
            </Text>
            {CHOICES.map((choice) => (
              <Pressable
                key={choice.type}
                accessibilityRole="button"
                accessibilityLabel={`New ${choice.label.toLowerCase()}`}
                onPress={() => onPick(choice.type)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: 64,
                  padding: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.background,
                })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{choice.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                    {choice.label}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {choice.hint}
                  </Text>
                </View>
                <Text style={[typography.heading, { color: colors.textMuted }]}>›</Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
