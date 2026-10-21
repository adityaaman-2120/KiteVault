// The only place that imports the native crypto library (react-native-quick-crypto, OpenSSL).
// Everything else in src/crypto goes through here, so the library is easy to swap or mock.
export {
  argon2,
  Buffer,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'react-native-quick-crypto';
