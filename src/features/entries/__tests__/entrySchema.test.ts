import {
  emptyForm,
  entryFormSchema,
  entryToForm,
  formToEntry,
  type EntryFormValues,
} from '../entrySchema';
import { MAX_PASSWORD_HISTORY } from '../model';
import { entry } from '../__support__/entryTestUtils';

const valid = (over: Partial<EntryFormValues> = {}): EntryFormValues => ({
  ...emptyForm('login'),
  title: 'Example',
  ...over,
});

const messages = (values: EntryFormValues) => {
  const result = entryFormSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('validation', () => {
  test('a title is the only thing a login needs', () => {
    expect(messages(valid())).toEqual([]);
    expect(messages(valid({ title: '' }))).toEqual(['title: Enter a title.']);
    expect(messages(valid({ title: '   ' }))).toEqual(['title: Enter a title.']);
  });

  test('website must be a valid http(s) address, but may be left empty', () => {
    expect(messages(valid({ urls: [{ value: '' }] }))).toEqual([]);
    expect(messages(valid({ urls: [{ value: 'example.com' }] }))).toEqual([]);
    expect(messages(valid({ urls: [{ value: 'javascript:alert(1)' }] }))).toEqual([
      'urls.0.value: Enter a valid web address (http or https).',
    ]);
  });

  test('card fields are checked only for cards', () => {
    const bad = { holder: '', number: '1234', expiry: '13/99', cvv: '12', pin: '' };
    expect(messages(valid({ type: 'login', card: bad }))).toEqual([]);
    expect(messages(valid({ type: 'card', card: bad })).sort()).toEqual([
      'card.cvv: The security code has 3 or 4 digits.',
      'card.expiry: Use MM/YY, for example 09/28.',
      'card.number: Card numbers have 12 to 19 digits.',
    ]);
    const good = {
      holder: 'A B',
      number: '4242 4242 4242 4242',
      expiry: '09/28',
      cvv: '123',
      pin: '',
    };
    expect(messages(valid({ type: 'card', card: good }))).toEqual([]);
  });

  test('identity email is checked only for identities', () => {
    const identity = { fullName: '', email: 'not-an-email', phone: '', address: '' };
    expect(messages(valid({ type: 'note', identity }))).toEqual([]);
    expect(messages(valid({ type: 'identity', identity }))).toEqual([
      'identity.email: Enter a valid email address.',
    ]);
  });

  test('a custom field with a value needs a name', () => {
    expect(
      messages(valid({ customFields: [{ id: 'a', label: '', value: 'x', hidden: false }] })),
    ).toEqual(['customFields.0.label: Give this field a name.']);
    expect(
      messages(valid({ customFields: [{ id: 'a', label: '', value: '', hidden: false }] })),
    ).toEqual([]);
  });

  test('over-long text is refused', () => {
    expect(messages(valid({ title: 'x'.repeat(201) }))[0]).toMatch(/at most 200/);
  });
});

describe('formToEntry', () => {
  const now = 1_700_000_000_000;

  test('builds a new login', () => {
    const e = formToEntry(
      valid({
        username: ' bob ',
        password: 'pw',
        urls: [{ value: ' a.com ' }, { value: '' }],
        favorite: true,
        folderId: 'f1',
      }),
      undefined,
      now,
    );
    expect(e).toMatchObject({
      type: 'login',
      title: 'Example',
      username: 'bob',
      password: 'pw',
      urls: ['a.com'],
      favorite: true,
      folderId: 'f1',
      createdAt: now,
      updatedAt: now,
      passwordHistory: [],
    });
    expect(e.id).toMatch(/^[0-9a-f]{32}$/);
    expect(e.deletedAt).toBeUndefined();
  });

  test('keeps only the fields that belong to the type', () => {
    const note = formToEntry(
      valid({
        type: 'note',
        username: 'u',
        password: 'p',
        urls: [{ value: 'a.com' }],
        notes: 'hello',
      }),
      undefined,
      now,
    );
    expect(note).toMatchObject({ username: '', password: '', urls: [], notes: 'hello' });
    expect(note.card).toBeUndefined();

    const card = formToEntry(
      valid({
        type: 'card',
        password: 'p',
        card: { holder: 'H', number: '4242424242424242', expiry: '09/28', cvv: '123', pin: '1' },
      }),
      undefined,
      now,
    );
    expect(card.password).toBe('');
    expect(card.card?.number).toBe('4242424242424242');
    expect(card.identity).toBeUndefined();
  });

  test('drops empty custom fields and keeps the rest', () => {
    const e = formToEntry(
      valid({
        customFields: [
          { id: 'a', label: ' PIN ', value: '1234', hidden: true },
          { id: 'b', label: '', value: '', hidden: false },
        ],
      }),
      undefined,
      now,
    );
    expect(e.customFields).toEqual([{ id: 'a', label: 'PIN', value: '1234', hidden: true }]);
  });

  test('editing keeps id and created date, and moves the old password into the history', () => {
    const existing = entry({
      id: 'keep',
      password: 'old',
      createdAt: 5,
      updatedAt: 5,
      totpSecret: 'JBSWY3DP',
    });
    const edited = formToEntry({ ...entryToForm(existing), password: 'new' }, existing, now);
    expect(edited.id).toBe('keep');
    expect(edited.createdAt).toBe(5);
    expect(edited.updatedAt).toBe(now);
    expect(edited.password).toBe('new');
    expect(edited.passwordHistory).toEqual([{ password: 'old', changedAt: now }]);
    expect(edited.totpSecret).toBe('JBSWY3DP'); // not editable here, but never lost
  });

  test('an unchanged password adds no history, and history is capped', () => {
    const existing = entry({ password: 'same' });
    expect(formToEntry(entryToForm(existing), existing, now).passwordHistory).toEqual([]);

    let current = entry({ password: 'p0' });
    for (let i = 1; i <= MAX_PASSWORD_HISTORY + 5; i++) {
      current = formToEntry({ ...entryToForm(current), password: `p${i}` }, current, now + i);
    }
    expect(current.passwordHistory).toHaveLength(MAX_PASSWORD_HISTORY);
    expect(current.passwordHistory[0]?.password).toBe(`p${MAX_PASSWORD_HISTORY + 4}`);
  });

  test('an empty old password is not recorded', () => {
    const existing = entry({ password: '' });
    expect(
      formToEntry({ ...entryToForm(existing), password: 'new' }, existing, now).passwordHistory,
    ).toEqual([]);
  });

  test('round trips through the form without changes', () => {
    const existing = entry({
      customFields: [{ id: 'c', label: 'Q', value: 'A', hidden: false }],
      folderId: 'f1',
      favorite: true,
      notes: 'n',
    });
    const back = formToEntry(entryToForm(existing), existing, existing.updatedAt);
    expect(back).toEqual(existing);
  });
});
