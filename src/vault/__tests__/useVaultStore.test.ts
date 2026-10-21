import { useSessionStore } from '@/features/session/useSessionStore';

import { useVaultStore } from '..';
import { resetVaultFiles } from '../__support__/testUtils';

beforeEach(() => {
  resetVaultFiles();
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('no-vault');
});
afterAll(resetVaultFiles);

test('data exists only while unlocked and the session status follows', async () => {
  const store = useVaultStore.getState();
  await store.initialize();
  expect(useSessionStore.getState().status).toBe('no-vault');

  await store.create('master password');
  expect(useVaultStore.getState().data).not.toBeNull();
  expect(useSessionStore.getState().status).toBe('unlocked');

  store.lock();
  expect(useVaultStore.getState().data).toBeNull();
  expect(useSessionStore.getState().status).toBe('locked');

  await expect(store.unlock('wrong')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  expect(useVaultStore.getState().data).toBeNull();
  expect(useSessionStore.getState().status).toBe('locked');

  await store.unlock('master password');
  expect(useVaultStore.getState().data).not.toBeNull();
  expect(useSessionStore.getState().status).toBe('unlocked');
});

test('initialize reports a locked vault when one exists', async () => {
  await useVaultStore.getState().create('master password');
  useVaultStore.getState().lock();
  useSessionStore.getState().setStatus('no-vault');
  await useVaultStore.getState().initialize();
  expect(useSessionStore.getState().status).toBe('locked');
});

test('save is refused while locked', async () => {
  await useVaultStore.getState().create('master password');
  const data = useVaultStore.getState().data!;
  useVaultStore.getState().lock();
  await expect(useVaultStore.getState().save(data)).rejects.toMatchObject({ code: 'LOCKED' });
});
