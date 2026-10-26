const CANVAS = { width: 1080, height: 452 };

const slots = {
  background: { asset: 'assets/background.png', x: 0, y: 0, width: 1080, height: 452, z: 0 },
  nameplate: { asset: 'assets/nameplate.png', x: 32, y: 26, width: 717, height: 116, z: 20 },
  ratingFrame: { asset: 'assets/ratingFrame.png', x: 138, y: 30, width: 173, height: 36, z: 21 },
  ratingDigits: { asset: 'assets/ratingDigits.png', x: 227, y: 42, width: 69, height: 14, z: 22 },
  titleBase: { asset: 'assets/titleBase.png', x: 141, y: 111, width: 268, height: 25, z: 23 },
  titleText: { asset: 'assets/titleText.png', x: 247, y: 115, width: 51, height: 12, z: 24 },
  rank: { asset: 'assets/rank.png', x: 326, y: 69, width: 80, height: 35, z: 25 },
  friendBattle: { asset: 'assets/friendBattle.png', x: 312, y: 7, width: 108, height: 67, z: 26 },
  nameBase: { asset: 'assets/nameBase.png', x: 142, y: 67, width: 267, height: 40, z: 27 },
  playerName: { asset: 'assets/playerName.png', x: 152, y: 78, width: 102, height: 18, z: 28 },
  avatar: { asset: 'assets/avatar.png', x: 37, y: 33, width: 100, height: 99, z: 30 }
};

const controls = [
  { id: 'background', label: '背景板', short: '景', slotIds: ['background'], canHide: false },
  { id: 'nameplate', label: '名牌', short: '牌', slotIds: ['nameplate'], canHide: false },
  { id: 'avatar', label: '头像', short: '像', slotIds: ['avatar'], canHide: false },
  { id: 'rating', label: 'Rating', short: 'R', slotIds: ['ratingFrame', 'ratingDigits'], canHide: true },
  { id: 'title', label: '称号', short: '称', slotIds: ['titleBase', 'titleText'], canHide: false },
  { id: 'playerName', label: '名称', short: '名', slotIds: ['nameBase', 'playerName'], canHide: false },
  { id: 'rank', label: '段位', short: '段', slotIds: ['rank'], canHide: true },
  { id: 'friendBattle', label: '友人对战', short: '战', slotIds: ['friendBattle'], canHide: true }
];

const canvas = document.querySelector('#preview');
const ctx = canvas.getContext('2d');
const loading = document.querySelector('#loading');
const state = { files: {}, visible: {} };

function resetState() {
  Object.entries(slots).forEach(([id, slot]) => {
    state.files[id] = slot.asset;
    state.visible[id] = true;
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function render() {
  loading.hidden = false;
  ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
  const ordered = Object.entries(slots).sort((a, b) => a[1].z - b[1].z);
  try {
    for (const [id, slot] of ordered) {
      if (!state.visible[id]) continue;
      const image = await loadImage(state.files[id]);
      ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
    }
  } finally {
    loading.hidden = true;
  }
}

function buildControls() {
  const root = document.querySelector('#controls');
  const template = document.querySelector('#control-template');
  controls.forEach((control) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.control-row');
    const icon = fragment.querySelector('.control-icon');
    const label = fragment.querySelector('.control-label');
    const fileLabel = fragment.querySelector('.control-file');
    const switchWrap = fragment.querySelector('.switch-wrap');
    const checkbox = fragment.querySelector('.visibility');
    const input = fragment.querySelector('.file-input');
    icon.textContent = control.short;
    label.textContent = control.label;
    row.dataset.control = control.id;
    if (!control.canHide) switchWrap.hidden = true;

    checkbox.addEventListener('change', () => {
      control.slotIds.forEach((slotId) => { state.visible[slotId] = checkbox.checked; });
      render();
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      control.slotIds.forEach((slotId, index) => {
        if (index === 0) state.files[slotId] = objectUrl;
        else state.visible[slotId] = false;
      });
      fileLabel.textContent = file.name;
      render();
    });
    root.appendChild(fragment);
  });
}

document.querySelector('#reset').addEventListener('click', () => {
  resetState();
  document.querySelectorAll('.visibility').forEach((input) => { input.checked = true; });
  document.querySelectorAll('.control-file').forEach((item) => { item.textContent = '默认素材'; });
  render();
});

document.querySelector('#export').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `maimai-diy-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

resetState();
buildControls();
render();
