// Types an expiry as MM/YY the way card forms elsewhere do: "9" becomes "09/", "12" becomes "12/",
// "13" becomes "01/3", and pasting "0928" or "9/28" gives "09/28".
// `previous` is the text before this keystroke, so deleting can be told from typing.
export function formatExpiry(previous: string, next: string): string {
  let digits = next.replace(/\D/g, '').slice(0, 4);
  const deleting = next.length < previous.length;

  if (deleting) {
    // Backspacing over the slash also removes the month's last digit, or the slash would return.
    if (previous.endsWith('/') && digits.length === 2) digits = digits.slice(0, 1);
  } else {
    // A first digit of 2-9 can only be a month 02-09.
    if (digits[0] && digits[0] > '1') digits = `0${digits}`.slice(0, 4);
    const month = digits.slice(0, 2);
    if (month === '00') digits = '0';
    // "13" to "19" cannot be a month: the 1 becomes 01 and the digit starts the year.
    else if (month.length === 2 && month > '12') digits = `0${digits}`.slice(0, 4);
  }

  return digits.length >= 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
