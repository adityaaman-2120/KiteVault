import { useLocalSearchParams } from 'expo-router';

import { EntryFormScreen } from '@/features/entries/EntryFormScreen';

export default function EditEntryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EntryFormScreen id={id} />;
}
