import { COS } from './config.js';

const root = COS.baseUrl + '/materials/regions/jp-profile/';

export const jpTitleFrames = Object.freeze(Object.fromEntries(
  ['Normal', 'Bronze', 'Silver', 'Gold', 'Rainbow'].map(color =>
    [color, `${root}trophy_${color.toLowerCase()}.png`])
));

export const jpBadges = Object.freeze({
  rank: `${root}true-2.png`,
  friendBattle: `${root}b4.png`,
});

const numerals = ['初', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const rankNames = ['初心者', ...numerals.map(n => n + '段'), null,
  ...numerals.map(n => '真' + n + '段'), '真皆伝', '裏皆伝'];
const ranks = rankNames.flatMap((name, index) => {
  if (!name) return [];
  const number = String(index).padStart(2, '0');
  const suffix = index >= 21 ? 'jp' : '';
  return [{ id: 'jp-rank-' + number, name, file: root + 'UI_CMN_DaniPlate_' + number + suffix + '.png',
    group: index >= 12 ? '真段位' : '普通段位', local: true }];
});
export const isJpRankAsset = value => value === jpBadges.rank || ranks.some(item => item.file === value);
const titles = [
  ['debut', 'でびゅー', 'Normal', '默认与成就'],
  ['welcome', 'maimai でらっくすへようこそ！', 'Normal', '默认与成就'],
  ['regular', 'おとくいさマイマイマー', 'Normal', '默认与成就'],
  ['peace', 'げーせん島は今日も平和マイ', 'Normal', '默认与成就'],
  ['resident', 'げーせん島の住民票発行！', 'Normal', '默认与成就'],
  ['rating-bronze', 'Rating Achiever -BRONZE-', 'Bronze', 'RATING'],
  ['rating-silver', 'Rating Achiever -SILVER-', 'Silver', 'RATING'],
  ['rating-gold', 'Rating Achiever -GOLD-', 'Gold', 'RATING'],
  ['rating-rainbow', 'Rating Achiever -RAINBOW-', 'Rainbow', 'RATING'],
  ['battle-streak', '敗北を知りたい', 'Normal', '友人对战'],
  ['battle-wins', '勝利の味をおぼえてきた', 'Normal', '友人对战'],
];

export const jpProfileItems = Object.freeze({
  ranks,
  titles: titles.map(([id, name, color, group]) => ({ id: `jp-${id}`, name, color, group })),
});
