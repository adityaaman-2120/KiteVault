// Every link or intent that arrives from outside the app (kitevault://..., or the development
// client's exp+kitevault://...) is turned into "open the app normally".
//
// Why: Expo Router would otherwise map any address, such as kitevault://export or
// kitevault://entry/123, straight to that screen, so a web page or another app could steer an
// unlocked app to a screen of its choice. KiteVault has no feature that needs an outside link:
// autofill opens the app with a plain launcher intent. The lock still decides what is shown.
export function redirectSystemPath(_event: { path: string; initial: boolean }): string {
  return '/';
}
