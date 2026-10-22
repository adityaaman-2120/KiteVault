import { configure } from '@testing-library/react-native';

// The suite runs many CPU-heavy tests (Argon2) in parallel; give async queries more time so
// they do not fail on a busy machine.
// Coverage instrumentation makes the same tests several times slower, so waiting is generous.
// It only matters when a test fails: a passing query returns as soon as it finds its element.
configure({ asyncUtilTimeout: 15000 });
