import { Redirect } from 'expo-router';

import { useSessionStore } from '@/features/session/useSessionStore';

// Entry point: sends the user to the screen that matches the vault state.
export default function Index() {
  const status = useSessionStore((s) => s.status);
  if (status === 'unlocked') return <Redirect href="/vault" />;
  if (status === 'locked') return <Redirect href="/unlock" />;
  return <Redirect href="/welcome" />;
}
