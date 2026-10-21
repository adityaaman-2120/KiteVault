import { Button, ScreenContainer, TextField } from '@/components';

export default function NewEntryScreen() {
  return (
    <ScreenContainer scroll>
      <TextField label="Title" />
      <TextField label="Username" />
      <TextField label="Password" secret />
      <Button title="Save" disabled />
    </ScreenContainer>
  );
}
