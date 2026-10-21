import { Button } from '@/components';

import { copySecret } from './clipboardService';

// A button that copies a username or password. `getValue` is called only when pressed, so the
// secret is not kept in props or state while the screen is open.
export function CopyButton({ title, getValue }: { title: string; getValue: () => string }) {
  return <Button title={title} variant="secondary" onPress={() => void copySecret(getValue())} />;
}
