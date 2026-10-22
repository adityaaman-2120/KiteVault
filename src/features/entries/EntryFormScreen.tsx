import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Children, useState, type ReactNode } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type Path,
} from 'react-hook-form';
import { ScrollView, Text, View } from 'react-native';

import {
  Button,
  ChoiceGroup,
  EmptyState,
  LetterAvatar,
  ScreenContainer,
  TextAction,
  TextField,
  ToggleRow,
} from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore, type EntryType } from '@/vault';

import { PasswordGeneratorPanel } from '@/features/generator/PasswordGeneratorPanel';

import { describeSaveError, saveEntryFromForm } from './entryActions';
import { emptyForm, entryFormSchema, entryToForm, type EntryFormValues } from './entrySchema';
import { ENTRY_TYPES, newId } from './model';

type FieldProps = {
  control: Control<EntryFormValues>;
  name: Path<EntryFormValues>;
  label: string;
  secret?: boolean;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad' | 'url';
};

// Connects one text field to the form and shows its validation message.
function FormTextField({ control, name, label, ...rest }: FieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          value={String(field.value ?? '')}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          plain
          {...rest}
        />
      )}
    />
  );
}

const TYPE_ICONS: Record<EntryType, string> = {
  login: '🔑',
  note: '📝',
  card: '💳',
  identity: '🪪',
};

// The first letter of the title once there is one; until then the type's icon (never a "?").
function TypeBadge({ type, title }: { type: EntryType; title: string }) {
  const { colors, radius } = useTheme();
  if (title.trim() !== '') return <LetterAvatar title={title} size={48} />;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 24 }}>{TYPE_ICONS[type]}</Text>
    </View>
  );
}

// A titled group of related fields. Each child is a row, with a thin line between rows.
function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        accessibilityRole="header"
        style={[
          typography.caption,
          {
            color: colors.textMuted,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginLeft: spacing.xs,
          },
        ]}
      >
        {title}
      </Text>
      <View>
        {rows.map((row, index) => (
          <View
            key={index}
            style={{
              paddingVertical: spacing.sm + 2,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              ...(index === rows.length - 1
                ? { borderBottomWidth: 1, borderBottomColor: colors.border }
                : null),
            }}
          >
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

export function EntryFormScreen({ id, initialType }: { id?: string; initialType?: EntryType }) {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const existing = useVaultStore((s) =>
    id ? s.data?.entries.find((e) => e.id === id) : undefined,
  );
  const folders = useVaultStore((s) => s.data?.folders);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  const { control, handleSubmit, formState, setValue } = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: existing ? entryToForm(existing) : emptyForm(initialType),
    mode: 'onTouched',
  });
  const urls = useFieldArray({ control, name: 'urls' });
  const customFields = useFieldArray({ control, name: 'customFields' });
  const type = useWatch({ control, name: 'type' });
  const title = useWatch({ control, name: 'title' });
  const customFieldValues = useWatch({ control, name: 'customFields' });

  if (id && !existing) {
    return (
      <ScreenContainer>
        <EmptyState title="Entry not found" message="It may have been deleted." />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  async function onSubmit(values: EntryFormValues) {
    setSaveError(null);
    try {
      const savedId = await saveEntryFromForm(values, id);
      if (id) router.back();
      else router.replace(`/entry/${savedId}`);
    } catch (error) {
      // Nothing was saved and nothing was changed. The form stays open so no typing is lost.
      setSaveError(describeSaveError(error));
    }
  }

  const folderOptions = [
    { value: '', label: 'No folder' },
    ...(folders ?? []).map((f) => ({ value: f.id, label: f.name })),
  ];

  const heading = `${id ? 'Edit' : 'New'} ${ENTRY_TYPES.find((t) => t.value === type)?.label.toLowerCase() ?? 'entry'}`;

  return (
    <ScreenContainer>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TypeBadge type={type} title={title} />
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: colors.text, fontSize: 22, lineHeight: 28 }]}
            >
              {heading}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              Encrypted and kept only on this phone
            </Text>
          </View>
        </View>

        {!id ? (
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <ChoiceGroup<EntryType>
                label="Type"
                options={ENTRY_TYPES}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        ) : null}

        <Section title="Basics">
          <FormTextField control={control} name="title" label="Title" />
        </Section>

        {type === 'login' ? (
          <Section title="Login details">
            <FormTextField control={control} name="username" label="Username" />
            <FormTextField control={control} name="password" label="Password" secret />
            <Button
              compact
              title={showGenerator ? 'Hide generator' : 'Generate a password'}
              variant="secondary"
              onPress={() => setShowGenerator((open) => !open)}
            />
            {showGenerator ? (
              <PasswordGeneratorPanel
                onUse={(value) => {
                  // Straight into the field: the password never goes through the address bar of a screen.
                  setValue('password', value, { shouldDirty: true, shouldValidate: true });
                  setShowGenerator(false);
                }}
              />
            ) : null}
            {urls.fields.map((field, index) => (
              <View key={field.id} style={{ gap: spacing.xs }}>
                <FormTextField
                  control={control}
                  name={`urls.${index}.value`}
                  label={index === 0 ? 'Website' : `Website ${index + 1}`}
                  keyboardType="url"
                  placeholder="example.com"
                />
                {urls.fields.length > 1 ? (
                  <View style={{ alignSelf: 'flex-end' }}>
                    <TextAction
                      label="Remove website"
                      color={colors.danger}
                      onPress={() => urls.remove(index)}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            <Button
              compact
              title="Add another website"
              variant="secondary"
              onPress={() => urls.append({ value: '' })}
            />
          </Section>
        ) : null}

        {type === 'card' ? (
          <Section title="Card details">
            <FormTextField control={control} name="card.holder" label="Cardholder name" />
            <FormTextField
              control={control}
              name="card.number"
              label="Card number"
              secret
              keyboardType="number-pad"
            />
            {/* Expiry and security code are short, so they share a row. */}
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <FormTextField
                  control={control}
                  name="card.expiry"
                  label="Expiry (MM/YY)"
                  placeholder="09/28"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormTextField
                  control={control}
                  name="card.cvv"
                  label="Security code"
                  secret
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <FormTextField
              control={control}
              name="card.pin"
              label="PIN"
              secret
              keyboardType="number-pad"
            />
          </Section>
        ) : null}

        {type === 'identity' ? (
          <Section title="Identity details">
            <FormTextField control={control} name="identity.fullName" label="Full name" />
            <FormTextField
              control={control}
              name="identity.email"
              label="Email"
              keyboardType="email-address"
            />
            <FormTextField
              control={control}
              name="identity.phone"
              label="Phone"
              keyboardType="phone-pad"
            />
            <FormTextField control={control} name="identity.address" label="Address" multiline />
          </Section>
        ) : null}

        <Section title={type === 'note' ? 'Note' : 'Notes'}>
          <FormTextField
            control={control}
            name="notes"
            label={type === 'note' ? 'Note' : 'Notes'}
            multiline
          />
        </Section>

        <Section title="Custom fields">
          {customFields.fields.map((field, index) => (
            <View key={field.id} style={{ gap: spacing.sm }}>
              <FormTextField
                control={control}
                name={`customFields.${index}.label`}
                label="Field name"
              />
              <FormTextField
                control={control}
                name={`customFields.${index}.value`}
                label="Value"
                secret={customFieldValues?.[index]?.hidden === true}
              />
              <Controller
                control={control}
                name={`customFields.${index}.hidden`}
                render={({ field: toggle }) => (
                  <ToggleRow label="Hide value" value={toggle.value} onChange={toggle.onChange} />
                )}
              />
              <View style={{ alignSelf: 'flex-end' }}>
                <TextAction
                  label="Remove field"
                  color={colors.danger}
                  onPress={() => customFields.remove(index)}
                />
              </View>
            </View>
          ))}
          <Button
            compact
            title="Add custom field"
            variant="secondary"
            onPress={() =>
              customFields.append({ id: newId(), label: '', value: '', hidden: false })
            }
          />
        </Section>

        <Section title="Organize">
          <Controller
            control={control}
            name="folderId"
            render={({ field }) => (
              <ChoiceGroup
                label="Folder"
                options={folderOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="favorite"
            render={({ field }) => (
              <ToggleRow label="Favorite" value={field.value} onChange={field.onChange} />
            )}
          />
        </Section>

        {saveError ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
            {saveError}
          </Text>
        ) : null}
      </ScrollView>

      {/* Stays at the bottom so Save is always one tap away. */}
      <Button
        title={formState.isSubmitting ? 'Saving…' : 'Save'}
        loading={formState.isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </ScreenContainer>
  );
}
