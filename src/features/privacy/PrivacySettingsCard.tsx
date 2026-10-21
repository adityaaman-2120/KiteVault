import { Text } from 'react-native';

import { Card, ChoiceGroup, ToggleRow } from '@/components';
import { CLIPBOARD_CLEAR_OPTIONS } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useTheme } from '@/theme';

export function PrivacySettingsCard() {
  const { colors, typography } = useTheme();
  const allowScreenshots = useSettingsStore((s) => s.allowScreenshots);
  const clipboardClearSeconds = useSettingsStore((s) => s.clipboardClearSeconds);
  const update = useSettingsStore((s) => s.update);

  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Privacy</Text>
      <ToggleRow
        label="Allow screenshots"
        description="Off: screenshots, screen recording and the recent-apps preview are blocked while the vault is open."
        value={allowScreenshots}
        onChange={(value) => void update({ allowScreenshots: value })}
      />
      <ChoiceGroup
        label="Clear copied passwords after"
        options={CLIPBOARD_CLEAR_OPTIONS}
        value={clipboardClearSeconds}
        onChange={(value) => void update({ clipboardClearSeconds: value })}
      />
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Only cleared if the clipboard still holds what you copied. Closing the app early can leave
        it on the clipboard.
      </Text>
    </Card>
  );
}
