import * as Device from 'expo-device';

import { generateRandomBytes } from '@/crypto';

// A random id for this phone, made once and kept in the settings file. It only tells backup
// versions apart ("made by this phone" or "made by another one"). It is not the Android id and
// cannot be linked to the hardware or to a person.
export function newDeviceId(): string {
  return Array.from(generateRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

// What backup versions call this phone: the phone model plus the first four characters of its
// random id, so two identical phones can still be told apart. The name the user gave the phone
// ("Sam's Pixel") is deliberately NOT used: backup labels are not encrypted, and that name often
// contains a real name.
export function deviceLabel(deviceId: string): string {
  let model = 'Android phone';
  try {
    model = Device.modelName?.trim() || model;
  } catch {
    // Keep the generic name.
  }
  return `${model} (${deviceId.slice(0, 4)})`;
}
