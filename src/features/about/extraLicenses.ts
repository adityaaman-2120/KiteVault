// Components that are not npm dependencies, so scripts/generate-licenses.js cannot find them.
export type ExtraComponent = {
  name: string;
  license: string;
  url: string;
  note: string;
};

export const EXTRA_COMPONENTS: ExtraComponent[] = [
  {
    name: 'EFF Large Wordlist for Passphrases',
    license: 'CC BY 3.0 US',
    url: 'https://www.eff.org/dice',
    note:
      'The words used by the passphrase generator. Copyright Electronic Frontier Foundation, ' +
      'licensed under Creative Commons Attribution 3.0 United States ' +
      '(https://creativecommons.org/licenses/by/3.0/us/). The numbers were removed and four ' +
      'hyphenated words were left out.',
  },
  {
    name: 'OpenSSL 3 (inside react-native-quick-crypto)',
    license: 'Apache-2.0',
    url: 'https://www.openssl.org',
    note: 'Provides Argon2id, AES-256-GCM and the secure random number generator.',
  },
  {
    name: 'AndroidX Biometric',
    license: 'Apache-2.0',
    url: 'https://developer.android.com/jetpack/androidx/releases/biometric',
    note: 'The system fingerprint and face prompt.',
  },
  {
    name: 'RootBeer (inside jail-monkey)',
    license: 'Apache-2.0',
    url: 'https://github.com/scottyab/rootbeer',
    note: 'Root detection for the warning banner.',
  },
  {
    name: 'Hermes JavaScript engine',
    license: 'MIT',
    url: 'https://github.com/facebook/hermes',
    note: 'Runs the app code. Shipped with React Native.',
  },
];
