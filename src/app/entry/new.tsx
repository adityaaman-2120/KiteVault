import { useLocalSearchParams } from 'expo-router';

import { EntryFormScreen } from '@/features/entries/EntryFormScreen';
import { ENTRY_TYPES } from '@/features/entries/model';

export default function NewEntryRoute() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  // The vault screen's "Add" popup passes the chosen type; anything else means a login.
  const initialType = ENTRY_TYPES.find((t) => t.value === type)?.value;
  return <EntryFormScreen initialType={initialType} />;
}
