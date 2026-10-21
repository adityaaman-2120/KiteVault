import { mutateVault, replaceEntry } from '@/features/entries/entryActions';

import { paramsToStore, type ParsedTotp } from './totp';

// Saves the secret inside the encrypted vault, like every other field of the entry.
export const setEntryTotp = (id: string, totp: ParsedTotp, now: () => number = Date.now) =>
  mutateVault((data) =>
    replaceEntry(data, id, (entry) => {
      const { totpParams: _old, ...rest } = entry;
      const params = paramsToStore(totp.params);
      return {
        ...rest,
        totpSecret: totp.secret,
        ...(params ? { totpParams: params } : {}),
        updatedAt: now(),
      };
    }),
  );

export const removeEntryTotp = (id: string, now: () => number = Date.now) =>
  mutateVault((data) =>
    replaceEntry(data, id, (entry) => {
      const { totpSecret: _secret, totpParams: _params, ...rest } = entry;
      return { ...rest, updatedAt: now() };
    }),
  );
