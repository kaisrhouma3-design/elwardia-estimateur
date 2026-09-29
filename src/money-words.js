const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const tens = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

function underHundred(value, terminal = true) {
  if (value < 10) return units[value];
  if (value < 17) return teens[value - 10];
  if (value < 20) return `dix-${units[value - 10]}`;
  if (value < 70) {
    const ten = Math.floor(value / 10);
    const rest = value % 10;
    if (!rest) return tens[ten];
    if (rest === 1) return `${tens[ten]} et un`;
    return `${tens[ten]}-${units[rest]}`;
  }
  if (value < 80) {
    const rest = value - 60;
    return rest === 11 ? 'soixante et onze' : `soixante-${underHundred(rest)}`;
  }
  if (value === 80) return terminal ? 'quatre-vingts' : 'quatre-vingt';
  return `quatre-vingt-${underHundred(value - 80)}`;
}

function underThousand(value, terminal = true) {
  if (value < 100) return underHundred(value, terminal);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  let result = hundreds === 1 ? 'cent' : `${units[hundreds]} cent`;
  if (!rest && terminal && hundreds > 1) result += 's';
  return rest ? `${result} ${underHundred(rest, terminal)}` : result;
}

function integerInWords(value) {
  if (value === 0) return 'zéro';
  let remaining = value;
  const parts = [];
  const scales = [
    { value: 1_000_000_000, word: 'milliard' },
    { value: 1_000_000, word: 'million' },
    { value: 1_000, word: 'mille' }
  ];
  for (const scale of scales) {
    const group = Math.floor(remaining / scale.value);
    if (!group) continue;
    if (scale.word === 'mille') {
      parts.push(group === 1 ? 'mille' : `${underThousand(group, false)} mille`);
    } else {
      parts.push(`${underThousand(group)} ${scale.word}${group > 1 ? 's' : ''}`);
    }
    remaining %= scale.value;
  }
  if (remaining) parts.push(underThousand(remaining));
  return parts.join(' ');
}

export function amountInWords(amount) {
  const numericAmount = Number(amount);
  const isNegative = Number.isFinite(numericAmount) && numericAmount < 0;
  const absoluteAmount = Number.isFinite(numericAmount) ? Math.abs(numericAmount) : 0;
  const totalMillimes = Math.round((absoluteAmount + Number.EPSILON) * 1000);
  const dinars = Math.floor(totalMillimes / 1000);
  const millimes = totalMillimes % 1000;
  const dinarLabel = dinars <= 1 ? 'dinar tunisien' : 'dinars tunisiens';
  const currencyLink = dinars >= 1_000_000 && dinars % 1_000_000 === 0 ? ' de ' : ' ';
  let result = `${integerInWords(dinars)}${currencyLink}${dinarLabel}`;
  if (millimes) {
    result += ` et ${integerInWords(millimes)} ${millimes === 1 ? 'millime' : 'millimes'}`;
  }
  if (isNegative) result = `moins ${result}`;
  return result.charAt(0).toLocaleUpperCase('fr-FR') + result.slice(1);
}
