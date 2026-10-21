import { useRouter } from 'expo-router';

import { Button, EmptyState, ListItem, ScreenContainer } from '@/components';

export default function VaultScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <EmptyState title="No entries yet" message="Add your first password to get started." />
      {/* Placeholder row to preview the entry screen. */}
      <ListItem
        title="Example entry"
        subtitle="example.com"
        onPress={() => router.push('/entry/1')}
      />
      <Button title="Add entry" onPress={() => router.push('/entry/new')} />
    </ScreenContainer>
  );
}
