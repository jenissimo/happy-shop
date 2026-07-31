export type GoogleFontSubset = string

export const CURATED_SCRIPT_CHIPS = [
  ['latin', 'Latin'],
  ['cyrillic', 'Cyrillic'],
  ['greek', 'Greek'],
  ['arabic', 'Arabic'],
  ['hebrew', 'Hebrew'],
  ['devanagari', 'Devanagari'],
  ['thai', 'Thai'],
  ['japanese', 'Japanese'],
  ['korean', 'Korean'],
  ['chinese-simplified', 'Chinese (Simplified)'],
  ['chinese-traditional', 'Chinese (Traditional)'],
] as const

export const SCRIPT_SAMPLES: Record<string, string> = {
  latin: 'The quick brown fox jumps',
  cyrillic: 'Съешь же ещё этих мягких булок',
  greek: 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία',
  arabic: 'نص حكيم له سر قاطع',
  hebrew: 'דג סקרן שט בים',
  devanagari: 'किसी को उसके अच्छे कर्मों',
  thai: 'ไก่จิกเด็กตายบนปากโอ่ง',
  japanese: 'いろはにほへと ちりぬるを',
  korean: '다람쥐 헌 쳇바퀴에 타고파',
  'chinese-simplified': '中文字体预览',
  'chinese-traditional': '中文字體預覽',
}
