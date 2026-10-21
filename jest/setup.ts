import { configure } from '@testing-library/react-native';

// The suite runs many CPU-heavy tests (Argon2) in parallel; give async queries more time so
// they do not fail on a busy machine.
configure({ asyncUtilTimeout: 5000 });
