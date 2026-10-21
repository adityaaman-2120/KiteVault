import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card } from '@/components';
import { describeSaveError } from '@/features/entries/entryActions';
import { formatDate } from '@/features/entries/format';
import { useTheme } from '@/theme';
import { getRecoveryInfo, removeRecoveryKey, type RecoveryInfo } from '@/vault';

export function RecoveryKeyCard() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const [info, setInfo] = useState<RecoveryInfo | null>(null);

  const refresh = useCallback(() => {
    void getRecoveryInfo().then(
      (next) => setInfo(next),
      () => setInfo(null),
    );
  }, []);
  // Read again whenever the screen is shown, so it is right after the key was made or removed.
  useFocusEffect(refresh);

  const confirmRemove = () =>
    Alert.alert(
      'Remove the recovery key?',
      'Your written copy will stop working. You will only be able to open the vault with your master password.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removeRecoveryKey().then(refresh, (error) =>
              Alert.alert('Could not save', describeSaveError(error)),
            ),
        },
      ],
    );

  if (info === null) return null;

  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Recovery key</Text>
      {info.exists ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>
          A recovery key was made on {formatDate(info.createdAt ?? 0)}. It can open your vault if
          you forget your master password.
        </Text>
      ) : (
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Optional. If you forget your master password and have no recovery key, your data cannot be
          recovered.
        </Text>
      )}
      <Text style={[typography.body, { color: colors.danger }]}>
        Anyone with the recovery key can open your vault. Keep it offline.
      </Text>
      <Button
        title={info.exists ? 'Make a new recovery key' : 'Create recovery key'}
        variant="secondary"
        onPress={() => router.push('/recovery-key')}
      />
      {info.exists ? (
        <Button title="Remove recovery key" variant="danger" onPress={confirmRemove} />
      ) : null}
    </Card>
  );
}
