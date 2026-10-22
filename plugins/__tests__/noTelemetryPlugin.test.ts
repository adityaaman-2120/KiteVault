import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withNoTelemetry');

type Service = { $: Record<string, string> };
type Manifest = { $?: Record<string, string>; application: { service?: Service[] }[] };

const manifest = (): Manifest => ({
  $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
  application: [{ service: [{ $: { 'android:name': 'com.example.Other' } }] }],
});

test('marks the Google Data Transport destination list for removal from the final manifest', () => {
  const result = plugin.removeTelemetryComponents(manifest()) as Manifest;
  const entry = result.application[0]!.service!.find(
    (s) =>
      s.$['android:name'] ===
      'com.google.android.datatransport.runtime.backends.TransportBackendDiscovery',
  );
  expect(entry?.$['tools:node']).toBe('remove');
  expect(result.$!['xmlns:tools']).toBe('http://schemas.android.com/tools');
});

test('keeps the other services and the existing namespaces', () => {
  const result = plugin.removeTelemetryComponents(manifest()) as Manifest;
  expect(
    result.application[0]!.service!.some((s) => s.$['android:name'] === 'com.example.Other'),
  ).toBe(true);
  expect(result.$!['xmlns:android']).toBeDefined();
});

test('is safe to run twice', () => {
  const once = plugin.removeTelemetryComponents(manifest()) as Manifest;
  const twice = plugin.removeTelemetryComponents(once) as Manifest;
  expect(twice.application[0]!.service).toHaveLength(2);
});

test('is switched on in app.json', () => {
  const appJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', 'app.json'), 'utf8'),
  ) as { expo: { plugins: unknown[] } };
  expect(appJson.expo.plugins).toContain('./plugins/withNoTelemetry');
});
