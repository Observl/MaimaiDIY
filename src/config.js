export const CANVAS = { width: 1080, height: 452 };
export const DISPLAY_FONT = '"SEGA Maru Gothic DB"';
export const RENDER_SCALE = 4;
export const OUTPUT = { width: 2160, height: 904 };
export const DEFAULT_BACKGROUND = 'assets/default-background.png';
export const COS = {
  baseUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com',
  manifestUrl:
    'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/manifest.json',
  fallbackManifestUrl: 'materials/manifest.json',
  titleManifestUrl: 'materials/titles.json',
  badgeManifestUrl: 'materials/badges.json',
  cacheKey: 'maimai-diy-manifest-v2',
  pageSize: 18,
  timeout: 12000,
  retries: 2,
};

export const RATING_BANDS = [
  { min: 0, asset: 'UI_CMN_DXRating_S_01.png', label: '白' },
  { min: 1000, asset: 'UI_CMN_DXRating_S_02.png', label: '蓝' },
  { min: 2000, asset: 'UI_CMN_DXRating_S_03.png', label: '绿' },
  { min: 4000, asset: 'UI_CMN_DXRating_S_04.png', label: '橙' },
  { min: 7000, asset: 'UI_CMN_DXRating_S_05.png', label: '红' },
  { min: 10000, asset: 'UI_CMN_DXRating_S_06.png', label: '紫' },
  { min: 12000, asset: 'UI_CMN_DXRating_S_07.png', label: '铜' },
  { min: 13000, asset: 'UI_CMN_DXRating_S_08.png', label: '银' },
  { min: 14000, asset: 'UI_CMN_DXRating_S_09.png', label: '金' },
  { min: 14500, asset: 'UI_CMN_DXRating_S_10.png', label: '白金' },
  { min: 15000, asset: 'UI_CMN_DXRating_S_11.png', label: '虹' },
];

export const slots = {
  background: { asset: 'assets/background.png', x: 0, y: 0, width: 1080, height: 452, z: 0 },
  nameplate: { asset: 'assets/nameplate.png', x: 32, y: 26, width: 717, height: 116, z: 20 },
  ratingFrame: { asset: 'assets/ratingFrame.png', x: 138, y: 30, width: 173, height: 36, z: 21 },
  ratingDigits: { asset: 'assets/ratingDigits.png', x: 227, y: 42, width: 69, height: 14, z: 22 },
  titleBase: {
    asset: 'assets/titles/UI_CMN_Shougou_Normal.png',
    x: 141,
    y: 111,
    width: 268,
    height: 25,
    z: 23,
  },
  titleText: { asset: 'assets/titleText.png', x: 247, y: 115, width: 51, height: 12, z: 24 },
  rank: { asset: 'assets/rank.png', x: 326, y: 69, width: 80, height: 35, z: 90 },
  friendBattle: { asset: 'assets/friendBattle.png', x: 312, y: 7, width: 108, height: 67, z: 100 },
  nameBase: { asset: 'assets/nameBase.png', x: 142, y: 67, width: 267, height: 40, z: 27 },
  playerName: {
    asset: 'assets/playerName.png',
    x: 150.93611859870788,
    y: 78.05231089799081,
    width: 174.57249,
    height: 18,
    z: 28,
  },
  avatar: { asset: 'assets/avatar.png', x: 37, y: 33, width: 100, height: 99, z: 30 },
};

export const controls = [
  {
    id: 'background',
    label: '背景板',
    slotIds: ['background'],
    target: 'background',
    category: 'backgrounds',
    canHide: false,
    hasUpload: false,
  },
  {
    id: 'nameplate',
    label: '姓名框',
    slotIds: ['nameplate'],
    target: 'nameplate',
    category: 'nameplates',
    canHide: false,
    hasUpload: false,
  },
  {
    id: 'avatar',
    label: '头像',
    slotIds: ['avatar'],
    target: 'avatar',
    category: 'avatars',
    canHide: false,
    hasUpload: true,
  },
  {
    id: 'rating',
    label: 'Rating',
    slotIds: ['ratingFrame', 'ratingDigits'],
    target: 'ratingFrame',
    category: 'ratings',
    canHide: true,
    hasLibrary: false,
    hasUpload: false,
  },
  {
    id: 'title',
    label: '称号',
    slotIds: ['titleBase', 'titleText'],
    target: 'titleBase',
    category: 'titles',
    canHide: false,
    hasUpload: false,
  },
  {
    id: 'playerName',
    label: '名称',
    slotIds: ['nameBase', 'playerName'],
    target: 'nameBase',
    category: 'name-bases',
    canHide: false,
    hasLibrary: false,
    hasUpload: false,
  },
  {
    id: 'rank',
    label: '段位',
    slotIds: ['rank'],
    target: 'rank',
    category: 'ranks',
    canHide: true,
    hasUpload: false,
  },
  {
    id: 'friendBattle',
    label: '友人对战',
    slotIds: ['friendBattle'],
    target: 'friendBattle',
    category: 'friend-battles',
    canHide: true,
    hasUpload: false,
  },
];

export const TEMPLATE_STORAGE_KEY = 'maimai-diy-templates-v1';
export const TEMPLATE_FILE_FORMAT = 'MaimaiDIY-template';
export const TEMPLATE_FILE_VERSION = 1;
export const TEMPLATE_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const HISTORY_LIMIT = 5;
export const DEFAULT_PRESET = {
  ratingValue: 16411,
  playerName: 'Observ.L',
  titleName: 'チエルカ／エソテリカ',
  titleColor: 'Gold',
  files: {
    background: DEFAULT_BACKGROUND,
    nameplate: `${COS.baseUrl}/materials/nameplates/UI_Plate_006150.png`,
    avatar: `${COS.baseUrl}/materials/avatars/UI_Icon_559504.png`,
    titleBase: 'assets/titles/UI_CMN_Shougou_Gold.png',
    rank: 'assets/ranks/18.png',
    friendBattle: 'assets/friend-battles/21.png',
  },
  labels: {
    background: '7sRefちほー おまけ',
    nameplate: '舞将',
    avatar: 'KALEIDXSCOPE -旧き世界-',
    title: 'チエルカ／エソテリカ',
    rank: '真七段',
    friendBattle: 'SSS4',
  },
};
export const TITLE_COLOR_NAMES = {
  Normal: '普通',
  Bronze: '铜',
  Silver: '银',
  Gold: '金',
  Rainbow: '彩虹',
};
