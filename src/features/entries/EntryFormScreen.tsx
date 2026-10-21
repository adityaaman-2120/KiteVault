import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type Path,
} from 'react-hook-form';
import { Text, View } from 'react-native';

import {
  Button,
  Card,
  ChoiceGroup,
  EmptyState,
  ScreenContainer,
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
          {...rest}
        />
      )}
    />
  );
}

export function EntryFormScreen({ id }: { id?: string }) {
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
    defaultValues: existing ? entryToForm(existing) : emptyForm(),
    mode: 'onTouched',
  });
  const urls = useFieldArray({ control, name: 'urls' });
  const customFields = useFieldArray({ control, name: 'customFields' });
  const type = useWatch({ control, name: 'type' });
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

  return (
    <ScreenContainer scroll>
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
      ) : (
        <Text style={[typography.label, { color: colors.textMuted }]}>
          Editing a {ENTRY_TYPES.find((t) => t.value === type)?.label.toLowerCase()}
        </Text>
      )}

      <FormTextField control={control} name="title" label="Title" />

      {type === 'login' ? (
        <Card>
          <FormTextField control={control} name="username" label="Username" />
          <FormTextField control={control} name="password" label="Password" secret />
          <Button
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
                <Button
                  title="Remove website"
                  variant="secondary"
                  onPress={() => urls.remove(index)}
                />
              ) : null}
            </View>
          ))}
          <Button
            title="Add another website"
            variant="secondary"
            onPress={() => urls.append({ value: '' })}
          />
        </Card>
      ) : null}

      {type === 'card' ? (
        <Card>
          <FormTextField control={control} name="card.holder" label="Cardholder name" />
          <FormTextField
            control={control}
            name="card.number"
            label="Card number"
            secret
            keyboardType="number-pad"
          />
          <FormTextField
            control={control}
            name="card.expiry"
            label="Expiry (MM/YY)"
            placeholder="09/28"
          />
          <FormTextField
            control={control}
            name="card.cvv"
            label="Security code"
            secret
            keyboardType="number-pad"
          />
          <FormTextField
            control={control}
            name="card.pin"
            label="PIN"
            secret
            keyboardType="number-pad"
          />
        </Card>
      ) : null}

      {type === 'identity' ? (
        <Card>
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
        </Card>
      ) : null}

      <FormTextField
        control={control}
        name="notes"
        label={type === 'note' ? 'Note' : 'Notes'}
        multiline
      />

      <Card>
        <Text style={[typography.label, { color: colors.textMuted }]}>Custom fields</Text>
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
            <Button
              title="Remove field"
              variant="secondary"
              onPress={() => customFields.remove(index)}
            />
          </View>
        ))}
        <Button
          title="Add custom field"
          variant="secondary"
          onPress={() => customFields.append({ id: newId(), label: '', value: '', hidden: false })}
        />
      </Card>

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

      {saveError ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {saveError}
        </Text>
      ) : null}

      <Button
        title={formState.isSubmitting ? 'Saving…' : 'Save'}
        loading={formState.isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </ScreenContainer>
  );
}
