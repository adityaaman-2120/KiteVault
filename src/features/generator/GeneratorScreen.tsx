import { ScreenContainer } from '@/components';

import { PasswordGeneratorPanel } from './PasswordGeneratorPanel';

export function GeneratorScreen() {
  return (
    <ScreenContainer scroll>
      <PasswordGeneratorPanel />
    </ScreenContainer>
  );
}
