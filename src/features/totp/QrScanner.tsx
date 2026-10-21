import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components';
import { useTheme } from '@/theme';

import { parseTotpInput, TOTP_ERROR_TEXT, TotpError, type ParsedTotp } from './totp';

type Props = {
  onScanned: (totp: ParsedTotp) => void;
  onCancel: () => void;
};

// Looks for a 2FA QR code in the live camera picture. The picture is only shown on screen:
// nothing here takes a photo or records video, and no frame is written anywhere. Only the text
// of a code that is a valid 2FA link is passed on.
export function QrScanner({ onScanned, onCancel }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const done = useRef(false);
  const lastBad = useRef<{ data: string; at: number } | null>(null);

  function handle({ data }: { data: string }) {
    if (done.current) return;
    try {
      // A QR code for 2FA is always a link; anything else (a website, Wi-Fi) is not one.
      if (!data.trim().toLowerCase().startsWith('otpauth://')) throw new TotpError('invalid-link');
      const totp = parseTotpInput(data);
      done.current = true;
      onScanned(totp);
    } catch (e) {
      // The camera reports the same code many times a second: say it once.
      const last = lastBad.current;
      if (last && last.data === data && Date.now() - last.at < 3000) return;
      lastBad.current = { data, at: Date.now() };
      setMessage(
        e instanceof TotpError ? TOTP_ERROR_TEXT[e.code] : TOTP_ERROR_TEXT['invalid-link'],
      );
    }
  }

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={{ gap: spacing.md }}>
        <Text style={[typography.body, { color: colors.text }]}>
          {permission.canAskAgain
            ? 'KiteVault needs the camera to scan a QR code. It is used only to read the code on screen: nothing is photographed or recorded.'
            : 'Camera access is turned off for KiteVault. You can allow it in the Android settings, or type the secret key instead.'}
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={() => void requestPermission()} />
        ) : null}
        <Button title="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          height: 300,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        }}
      >
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handle}
        />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Point the camera at the QR code shown by the website or app.
      </Text>
      {message ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {message}
        </Text>
      ) : null}
      <Button title="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}
