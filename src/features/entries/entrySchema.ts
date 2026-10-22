import { z } from 'zod';

import type { Entry, EntryType } from '@/vault';

import { MAX_PASSWORD_HISTORY, newId } from './model';
import { toOpenableUrl } from './format';

const text = (max: number) => z.string().max(max, `Use at most ${max} characters.`);

const customFieldSchema = z.object({
  id: z.string(),
  label: text(100),
  value: text(5000),
  hidden: z.boolean(),
});

const MONTH_YEAR = /^(0[1-9]|1[0-2])\/\d{2}$/;

// One flat shape for the whole form; the rules that depend on the entry type are in superRefine.
export const entryFormSchema = z
  .object({
    type: z.enum(['login', 'note', 'card', 'identity']),
    title: text(200).refine((v) => v.trim().length > 0, 'Enter a title.'),
    username: text(500),
    password: text(5000),
    urls: z.array(z.object({ value: text(2000) })).max(20),
    notes: text(50_000),
    customFields: z.array(customFieldSchema).max(50),
    folderId: z.string(),
    favorite: z.boolean(),
    card: z.object({
      holder: text(200),
      number: text(40),
      expiry: text(10),
      cvv: text(10),
      pin: text(20),
    }),
    identity: z.object({
      fullName: text(200),
      email: text(320),
      phone: text(50),
      address: text(1000),
    }),
  })
  .superRefine((form, ctx) => {
    const problem = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    form.customFields.forEach((field, i) => {
      if (!field.label.trim() && field.value.trim()) {
        problem(['customFields', i, 'label'], 'Give this field a name.');
      }
    });

    if (form.type === 'login') {
      form.urls.forEach((url, i) => {
        if (url.value.trim() && !toOpenableUrl(url.value)) {
          problem(['urls', i, 'value'], 'Enter a valid web address (http or https).');
        }
      });
    }

    if (form.type === 'card') {
      const digits = form.card.number.replace(/[\s-]/g, '');
      if (digits && !/^\d{12,19}$/.test(digits)) {
        problem(['card', 'number'], 'Card numbers have 12 to 19 digits.');
      }
      if (form.card.expiry && !MONTH_YEAR.test(form.card.expiry)) {
        problem(['card', 'expiry'], 'Use MM/YY, for example 09/28.');
      }
      if (form.card.cvv && !/^\d{3,4}$/.test(form.card.cvv)) {
        problem(['card', 'cvv'], 'The security code has 3 or 4 digits.');
      }
    }

    if (form.type === 'identity') {
      const email = form.identity.email.trim();
      if (email && !z.email().safeParse(email).success) {
        problem(['identity', 'email'], 'Enter a valid email address.');
      }
    }
  });

export type EntryFormValues = z.infer<typeof entryFormSchema>;

export function emptyForm(type: EntryType = 'login'): EntryFormValues {
  return {
    type,
    title: '',
    username: '',
    password: '',
    urls: [{ value: '' }],
    notes: '',
    customFields: [],
    folderId: '',
    favorite: false,
    card: { holder: '', number: '', expiry: '', cvv: '', pin: '' },
    identity: { fullName: '', email: '', phone: '', address: '' },
  };
}

export function entryToForm(entry: Entry): EntryFormValues {
  const base = emptyForm(entry.type);
  return {
    ...base,
    title: entry.title,
    username: entry.username,
    password: entry.password,
    urls: entry.urls.length > 0 ? entry.urls.map((value) => ({ value })) : base.urls,
    notes: entry.notes,
    customFields: entry.customFields.map((f) => ({ ...f })),
    folderId: entry.folderId ?? '',
    favorite: entry.favorite,
    card: { ...base.card, ...entry.card },
    identity: { ...base.identity, ...entry.identity },
  };
}

// Builds the entry to store. Only the fields that belong to the chosen type are kept, so a
// note never carries a stale password from a half-filled form.
export function formToEntry(
  form: EntryFormValues,
  existing: Entry | undefined,
  now: number,
): Entry {
  const isLogin = form.type === 'login';
  const password = isLogin ? form.password : '';
  const history = existing?.passwordHistory ?? [];
  const passwordChanged = existing !== undefined && existing.password !== password;

  const entry: Entry = {
    id: existing?.id ?? newId(),
    type: form.type,
    title: form.title.trim(),
    username: isLogin ? form.username.trim() : '',
    password,
    urls: isLogin ? form.urls.map((u) => u.value.trim()).filter(Boolean) : [],
    notes: form.notes,
    customFields: form.customFields
      .filter((f) => f.label.trim() || f.value.trim())
      .map((f) => ({
        id: f.id || newId(),
        label: f.label.trim(),
        value: f.value,
        hidden: f.hidden,
      })),
    favorite: form.favorite,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    // Keep the old password when it changes (never an empty one), newest first.
    passwordHistory:
      passwordChanged && existing.password
        ? [{ password: existing.password, changedAt: now }, ...history].slice(
            0,
            MAX_PASSWORD_HISTORY,
          )
        : history,
  };

  if (form.folderId) entry.folderId = form.folderId;
  // Two-factor settings are changed on their own screen, not in this form.
  if (existing?.totpSecret) entry.totpSecret = existing.totpSecret;
  if (existing?.totpParams) entry.totpParams = existing.totpParams;
  // Apps linked for autofill are not edited in this form; keep them.
  if (existing?.appLinks) entry.appLinks = existing.appLinks;
  if (form.type === 'card') entry.card = { ...form.card };
  if (form.type === 'identity') entry.identity = { ...form.identity };
  if (existing?.deletedAt !== undefined) entry.deletedAt = existing.deletedAt;
  return entry;
}
