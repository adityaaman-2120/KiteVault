import { googleAuth } from '../googleAuth';

// No mock of the Google library here: in Jest its native module cannot load, which is exactly
// what a build without the library looks like. Everything must fail cleanly, not crash.
test('without the native library every call reports "unavailable"', async () => {
  await expect(googleAuth.signIn()).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(googleAuth.signInSilently()).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(googleAuth.getAccessToken()).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(googleAuth.refreshAccessToken('x')).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(googleAuth.signOut()).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(googleAuth.revokeAccess()).rejects.toMatchObject({ kind: 'unavailable' });
  expect(googleAuth.currentEmail()).toBeNull();
});
