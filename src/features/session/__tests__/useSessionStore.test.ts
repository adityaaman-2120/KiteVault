import { useSessionStore } from '../useSessionStore';

test('starts with no vault and can change status', () => {
  expect(useSessionStore.getState().status).toBe('no-vault');
  useSessionStore.getState().setStatus('locked');
  expect(useSessionStore.getState().status).toBe('locked');
  useSessionStore.getState().setStatus('no-vault');
});
