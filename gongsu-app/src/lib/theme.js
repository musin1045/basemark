import { Dimensions } from 'react-native';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const FONT_BUMP = SCREEN_WIDTH >= 430 ? 2 : SCREEN_WIDTH >= 390 ? 1 : 0;

export const COLORS = {
  primary: '#0C447C',
  primarySoft: '#165EAA',
  accent: '#2A74C9',
  background: '#E6EEF7',
  surface: '#FDFEFF',
  surfaceMuted: '#DCE7F3',
  border: '#B7C9DC',
  text: '#102033',
  textMuted: '#4F6279',
  textSoft: '#72839A',
  holidayBg: '#F6DDE6',
  holidayText: '#8A2946',
  holidayBorder: '#E5A4BC',
  settled: '#27500A',
  settledBg: '#DCEBCF',
  unsettled: '#854F0B',
  unsettledBg: '#FCE8CF',
  danger: '#B9382A',
  success: '#2F855A',
  today: '#125AB0',
};

export const FONT = {
  tiny: clamp(8 + FONT_BUMP * 0.35, 8, 9),
  tinyStrong: clamp(8.5 + FONT_BUMP * 0.35, 8.5, 9.5),
  xs: clamp(11 + FONT_BUMP, 11, 13),
  sm: clamp(12 + FONT_BUMP, 12, 14),
  body: clamp(13 + FONT_BUMP, 13, 15),
  bodyLarge: clamp(14 + FONT_BUMP, 14, 16),
  button: clamp(15 + FONT_BUMP, 15, 17),
  title: clamp(16 + FONT_BUMP, 16, 18),
  titleLarge: clamp(17 + FONT_BUMP, 17, 19),
  heading: clamp(18 + FONT_BUMP, 18, 20),
  hero: clamp(20 + FONT_BUMP, 20, 23),
  pageTitle: clamp(24 + FONT_BUMP, 24, 27),
  pageTitleLarge: clamp(26 + FONT_BUMP, 26, 29),
  display: clamp(34 + FONT_BUMP, 34, 37),
  tab: clamp(20 + FONT_BUMP, 20, 23),
};

export const SITE_COLORS = [
  '#185FA5',
  '#0C447C',
  '#378ADD',
  '#27500A',
  '#854F0B',
  '#8A2946',
  '#7C3AED',
  '#1B6B4A',
];

export const GONGSU_PALETTE = {
  0: {
    background: '#E6EDF4',
    border: '#C6D1DC',
    text: '#596A7E',
  },
  0.5: {
    background: '#DDEBFF',
    border: '#A8CAFA',
    text: '#145AAE',
  },
  1: {
    background: '#C9E0FF',
    border: '#88B8F5',
    text: '#0D56AD',
  },
  1.5: {
    background: '#5B9BE6',
    border: '#3F7CC3',
    text: '#FFFFFF',
  },
  2: {
    background: '#0C447C',
    border: '#0C447C',
    text: '#FFFFFF',
  },
};
