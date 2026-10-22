import { RECOVERY_GROUPS } from '@/vault';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The KiteVault kite (four shaded facets and a keyhole), as vector shapes so it is sharp at any
// print size. Inline on purpose: the page must not load anything, not even a picture.
const KITE_SVG = `<svg viewBox="286 195 452 636" width="40" height="56" aria-hidden="true">
  <path d="M512 197 L288 421 L512 421 Z" fill="#FFC861"/>
  <path d="M512 197 L736 421 L512 421 Z" fill="#FF9F45"/>
  <path d="M288 421 L512 827 L512 421 Z" fill="#FF8A4C"/>
  <path d="M736 421 L512 827 L512 421 Z" fill="#F2643F"/>
  <circle cx="512" cy="411" r="51" fill="#0E1630"/>
  <path d="M490 452 L473 560 L551 560 L534 452 Z" fill="#0E1630"/>
</svg>`;

const STYLE = `
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Roboto, Arial, sans-serif;
    color: #0E1630;
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .top { background: #0E1630; color: #F4F5FA; padding: 20px 36px; }
  .top table { width: 100%; border-collapse: collapse; }
  .top td { vertical-align: middle; padding: 0; }
  .logo { width: 52px; }
  .brand { font-size: 20pt; font-weight: 800; letter-spacing: -0.5px; line-height: 1.05; }
  .brand span { color: #FFB547; }
  .by { font-size: 8.5pt; color: #B7BFDD; letter-spacing: 0.4px; }
  .tag { text-align: right; }
  .tag span {
    display: inline-block; border: 1.5px solid #FFB547; color: #FFB547; border-radius: 999px;
    padding: 4px 12px; font-size: 8pt; font-weight: 700; letter-spacing: 1.4px;
  }
  .page { padding: 26px 36px 0 36px; }
  h1 { margin: 0; font-size: 27pt; line-height: 1.1; letter-spacing: -0.8px; }
  .lead { margin: 6px 0 0 0; font-size: 11.5pt; color: #4A5272; }
  .meta { margin: 10px 0 0 0; font-size: 9pt; color: #4A5272; }
  .meta b { color: #0E1630; }

  .warn {
    margin: 18px 0 0 0; padding: 11px 14px; border-radius: 8px;
    background: #FDECEA; border-left: 6px solid #B3261E; color: #5F1410; font-size: 10pt;
  }
  .warn b { color: #B3261E; }

  .label {
    margin: 22px 0 8px 0; font-size: 8.5pt; font-weight: 800; letter-spacing: 1.6px;
    text-transform: uppercase; color: #4A5272;
  }
  .key { width: 100%; border-collapse: separate; border-spacing: 8px; margin: -8px; }
  .key td {
    width: 25%; background: #F4F5FA; border: 1.5px solid #0E1630; border-radius: 8px;
    padding: 7px 4px 9px 4px; text-align: center;
  }
  .key .n { display: block; font-size: 7.5pt; font-weight: 700; color: #4A5272; letter-spacing: 1px; }
  .key .g {
    display: block; font-family: 'DejaVu Sans Mono', 'Roboto Mono', 'Courier New', monospace;
    font-size: 21pt; font-weight: 700; letter-spacing: 3px; padding-left: 3px; line-height: 1.25;
  }
  .rule { margin: 14px 0 0 0; font-size: 9.5pt; color: #4A5272; }
  .rule b { color: #0E1630; }

  .two { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .two td { width: 50%; vertical-align: top; padding: 0; }
  .two td.l { padding-right: 18px; }
  .two td.r { padding-left: 18px; }
  ol.steps { list-style: none; margin: 0; padding: 0; }
  ol.steps li { position: relative; margin: 0 0 9px 0; padding-left: 30px; font-size: 10pt; }
  ol.steps li .c {
    position: absolute; left: 0; top: 0; width: 21px; height: 21px; border-radius: 50%;
    background: #0E1630; color: #FFB547; font-size: 9.5pt; font-weight: 800;
    text-align: center; line-height: 21px;
  }
  ul.check { list-style: none; margin: 0; padding: 0; }
  ul.check li { position: relative; margin: 0 0 8px 0; padding-left: 26px; font-size: 10pt; }
  ul.check li .b {
    position: absolute; left: 0; top: 1px; width: 15px; height: 15px;
    border: 1.5px solid #0E1630; border-radius: 3px;
  }
  .where { margin-top: 20px; font-size: 9.5pt; color: #4A5272; }
  .where .line { border-bottom: 1.5px solid #8B94B8; height: 24px; }
  .foot {
    margin: 22px 36px 0 36px; padding: 12px 0 18px 0; border-top: 1.5px solid #DDE1EE;
    font-size: 8.5pt; color: #4A5272;
  }
  .foot b { color: #0E1630; }
`;

// The page that is printed or saved as a PDF. It has no scripts and loads nothing from the
// internet, and it holds only the key and the date: no name, no account, no password.
export function buildRecoveryHtml(recoveryKey: string, createdAt: number): string {
  const groups = recoveryKey.split('-');
  if (groups.length !== RECOVERY_GROUPS) throw new RangeError('Expected 8 groups.');

  const cell = (group: string, i: number) =>
    `<td><span class="n">${i + 1}</span><span class="g">${escapeHtml(group)}</span></td>`;
  const half = RECOVERY_GROUPS / 2;
  const rows = [groups.slice(0, half), groups.slice(half)]
    .map((row, r) => `<tr>${row.map((group, i) => cell(group, r * half + i)).join('')}</tr>`)
    .join('');
  const date = escapeHtml(
    new Date(createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>KiteVault recovery key</title>
<style>${STYLE}</style>
</head>
<body>
<div class="top">
  <table><tr>
    <td class="logo">${KITE_SVG}</td>
    <td>
      <div class="brand">Kite<span>Vault</span></div>
      <div class="by">by Kitelux</div>
    </td>
    <td class="tag"><span>CONFIDENTIAL</span></td>
  </tr></table>
</div>

<div class="page">
  <h1>Recovery key</h1>
  <p class="lead">Your way back into your vault if you ever forget your master password.</p>
  <p class="meta">Created <b>${date}</b></p>

  <div class="warn"><b>Anyone who has this key can open your vault.</b>
  Keep this page offline in a safe place, such as a locked drawer or a safe. Do not photograph it,
  do not take a screenshot, and do not store it in the cloud, in email or in your password manager.</div>

  <div class="label">Your recovery key</div>
  <table class="key">${rows}</table>
  <p class="rule">Capital letters and digits only. The letters <b>I, L, O and U</b> are never used, so if
  you are unsure whether you see a letter O or a zero, it is a <b>zero</b>. The dashes, spaces and
  the numbers above each box are not part of the key.</p>

  <table class="two"><tr>
    <td class="l">
      <div class="label">How to use it</div>
      <ol class="steps">
        <li><span class="c">1</span>On the KiteVault unlock screen, tap "Forgot master password?".</li>
        <li><span class="c">2</span>Type the 8 groups above, exactly as printed.</li>
        <li><span class="c">3</span>Choose a new master password.</li>
      </ol>
    </td>
    <td class="r">
      <div class="label">Keep it safe</div>
      <ul class="check">
        <li><span class="b"></span>This paper is in a safe, offline place.</li>
        <li><span class="b"></span>There is no photo or screenshot of it.</li>
        <li><span class="b"></span>It is not in email, chat or cloud storage.</li>
        <li><span class="b"></span>Older copies have been destroyed.</li>
      </ul>
    </td>
  </tr></table>

  <div class="where">Where I keep this page (never write your master password here):
    <div class="line"></div>
  </div>
</div>

<div class="foot"><b>If you make a new recovery key in the app, this one stops working.</b>
Destroy old copies. &nbsp;·&nbsp; Generated on this phone by KiteVault, a Kitelux app.</div>
</body>
</html>`;
}
