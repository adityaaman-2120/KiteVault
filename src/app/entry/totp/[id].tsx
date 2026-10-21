import { useLocalSearchParams } from 'expo-router';

import { TotpSetupScreen } from '@/features/totp/TotpSetupScreen';

export default function TotpSetupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TotpSetupScreen id={id} />;
}
