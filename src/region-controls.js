import { prepareRegionalDisplay } from './regional-display.js';
import { companionIdLabel } from './region-profile.js';
import { SONG_CHART_TYPES, songChartType, songIdentity, groupSongCharts, songSelection } from './song-chart-types.js';
import { applyRegionBackground } from './region-background.js';
import { loadRegionMetadata, loadRegionCategoryIndex } from './region-catalog.js';
import { getRegionCatalogItem } from './region-profile.js';
import { loadManifest } from './assets.js';
const materialDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
function materialStatus(region, updatedAt) {
  const date = Date.parse(updatedAt);
  return region + '素材 · ' + (Number.isFinite(date) ? materialDate.format(date) + ' 更新' : '更新时间未知');
}
const difficultyNames = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];
export function initializeRegionControls({ state, recordHistory, render, changeRegion, picker }) {
  const regionSelect = document.querySelector('#region-select');
  const regionToggle = document.querySelector('#region-toggle');
  const modeSelect = document.querySelector('#screen-mode');
  const modeOptions = modeSelect.querySelectorAll('input');
  const panel = document.querySelector('#region-content');
  const title = document.querySelector('#region-content-title');
  const note = document.querySelector('#region-content-note');
  const companions = document.querySelector('#companion-controls');
  const songs = document.querySelector('#song-controls');
  const difficulty = document.querySelector('#song-difficulty');
  const chartType = document.querySelector('#song-chart-type');
  const achievement = document.querySelector('#song-achievement');
  const status = document.querySelector('#region-status');
  const indicator = document.querySelector('#asset-status');
  let requestVersion = 0;
  let catalog;
  let readyRegion = '';
  let indicatorRegion = '';
  let indicatorVersion = 0;
  function showAssetStatus(mode, text) {
    if (indicator.classList.contains(mode) && indicator.textContent.trim() === text) return;
    indicator.className = 'status ' + mode;
    indicator.replaceChildren(document.createElement('i'), document.createTextNode(' ' + text));
  }
  regionSelect.addEventListener('change', async () => {
    const next = regionSelect.value;
    if (next === state.region || regionSelect.disabled) return;
    picker.close();
    regionSelect.disabled = regionToggle.disabled = true;
    status.textContent = next === 'jp' ? '正在切换至日服展示板…' : '正在切换至国服展示板…';
    try { await changeRegion(next); }
    catch {
      const region = next === 'jp' ? '日服' : '国服';
      status.textContent = `暂时无法载入${region}素材。当前搭配已保留，请再次点击区服按钮重试。`;
    }
    finally { regionSelect.disabled = regionToggle.disabled = false; regionSelect.value = state.region; }
  });
  regionToggle.addEventListener('click', () => {
    regionSelect.value = state.region === 'jp' ? 'cn' : 'jp';
    regionSelect.dispatchEvent(new window.Event('change'));
  });
  modeSelect.addEventListener('change', event => {
    if (!event.target.checked || event.target.value === state.screenMode) return;
    recordHistory(); state.screenMode = event.target.value; sync(); render();
  });
  const songPick = document.querySelector('#song-pick');
  const openSongPicker = (trigger, afterSelect) => picker.open({
    id: 'region-song', label: '歌曲', category: 'songs',
    selectedAssetId: () => {
      const selected = getRegionCatalogItem(state.region, 'songs', state.song.id);
      return songGroups().find(item => songIdentity(item) === songIdentity(selected))?.id || state.song.id;
    },
    select(item) {
      state.song = songSelection(item.songVariants || [item], state.song);
    },
    afterSelect,
  }, trigger);
  songPick.addEventListener('click', () => openSongPicker(songPick));
  let groupedCatalog;
  let groupedSongs = [];
  function songGroups() {
    if (groupedCatalog !== catalog) {
      groupedCatalog = catalog;
      groupedSongs = catalog?.category === 'songs' ? groupSongCharts(catalog.items) : [];
    }
    return groupedSongs;
  }
  function currentVariants() {
    const selected = getRegionCatalogItem(state.region, 'songs', state.song.id);
    return songGroups().find(item => songIdentity(item) === songIdentity(selected))?.songVariants || [];
  }
  chartType.addEventListener('change', () => {
    const selected = currentVariants().find(item => songChartType(item) === chartType.value);
    if (!selected || selected.id === state.song.id) return;
    recordHistory();
    state.song = songSelection([selected], state.song);
    paintFields();
    render();
  });
  function applySongSettings(chart, value) {
    const nextChart = [...difficulty.options].some(option => Number(option.value) === chart)
      ? chart : state.song.difficulty;
    const next = Number.isFinite(value)
      ? Math.min(101, Math.max(0, value)).toFixed(4)
      : state.song.achievement;
    achievement.value = next;
    difficulty.value = String(nextChart);
    if (next === state.song.achievement && nextChart === state.song.difficulty) return;
    recordHistory();
    state.song.achievement = next;
    state.song.difficulty = nextChart;
    render();
  }
  difficulty.addEventListener('change', () => applySongSettings(Number(difficulty.value), achievement.valueAsNumber));
  achievement.addEventListener('change', () => applySongSettings(state.song.difficulty, achievement.valueAsNumber));
  const companionDialog = document.createElement('dialog');
  companionDialog.className = 'companion-editor';
  companionDialog.setAttribute('aria-labelledby', 'companion-editor-title');
  companionDialog.innerHTML = `<div class="section-head"><h2 id="companion-editor-title">设置旅行伙伴</h2><button type="button" class="library-button" aria-label="关闭旅行伙伴设置">×</button></div><div class="companion-editor-body"><div class="companion-editor-preview"><h3></h3><img alt="所选旅行伙伴"><canvas width="432" height="560" aria-label="旅行伙伴实时渲染预览"></canvas><p role="status"></p></div><div class="companion-editor-fields"></div></div>`;
  document.body.append(companionDialog);
  companionDialog.querySelector('button').addEventListener('click', () => companionDialog.close());
  let editingCompanion = 0;
  let companionPreviewVersion = 0;
  async function updateCompanionPreview() {
    if (!companionDialog.open) return;
    const version = ++companionPreviewVersion;
    const member = state.companions[editingCompanion];
    const item = getRegionCatalogItem(state.region, 'charas', member.id);
    companionDialog.querySelector('h3').textContent = item.name;
    companionDialog.querySelector('img').src = item.image;
    const message = companionDialog.querySelector('[role=status]');
    message.textContent = '';
    try {
      const display = await prepareRegionalDisplay(structuredClone(state));
      if (version !== companionPreviewVersion || !companionDialog.open) return;
      const full = document.createElement('canvas'); full.width = 2160; full.height = 904;
      const context = full.getContext('2d'); context.scale(2, 2); display.draw(context);
      const [x, y, w, h] = display.bounds[editingCompanion];
      const canvas = companionDialog.querySelector('canvas');
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min((canvas.width - 32) / w, (canvas.height - 32) / h);
      ctx.drawImage(full, x * 2, y * 2, w * 2, h * 2, (canvas.width - w * scale) / 2, (canvas.height - h * scale) / 2, w * scale, h * scale);
    } catch (error) {
      if (version === companionPreviewVersion) message.textContent = `预览加载失败：${error.message}`;
    }
  }
  function openCompanionSettings(index) {
    picker.close();
    editingCompanion = index;
    companionDialog.querySelector('.companion-editor-fields').replaceChildren(companionSettings(index));
    companionDialog.showModal();
    updateCompanionPreview();
  }
  function companionSettings(index) {
    const member = state.companions[index];
    const actions = document.createElement('div'); actions.className = 'control-actions companion-settings';
    const level = document.createElement('input'); level.className = 'companion-level'; level.type = 'number'; level.min = '1'; level.max = '9999'; level.value = String(member?.level || 1); level.disabled = !member; level.setAttribute('aria-label', `旅行伙伴 ${index + 1} 等级`);
    const levelField = document.createElement('label'); levelField.className = 'companion-level-field';
    const levelCaption = document.createElement('span'); levelCaption.textContent = '等级';
    levelField.append(levelCaption, level);
    level.addEventListener('change', () => {
      if (!member) return;
      const value = level.valueAsNumber;
      const next = Number.isFinite(value) ? Math.min(9999, Math.max(1, Math.trunc(value))) : member.level;
      level.value = String(next);
      if (next === member.level) return;
      recordHistory();
      member.level = next;
      updateCompanionPreview();
      paintFields();
      render();
    });
    const awakening = document.createElement('label');
    awakening.className = 'companion-awakening';
    const awake = document.createElement('input');
    awake.type = 'checkbox';
    awake.checked = Boolean(member?.awakened);
    awake.disabled = !member;
    awake.setAttribute('aria-label', `旅行伙伴 ${index + 1} 超觉醒`);
    awake.addEventListener('change', () => {
      if (!member) return;
      recordHistory();
      if (awake.checked) member.awakened = true;
      else delete member.awakened;
      updateCompanionPreview();
      paintFields();
      render();
    });
    awakening.append(awake, '超觉醒');
    actions.append(levelField, awakening);
    return actions;
  }
  function openCompanionPicker(index, trigger) {
    const triggerIndex = index;
    // Every visible empty slot opens the picker; append without creating holes.
    index = Math.min(index, state.companions.length);
    return picker.open({ id: `companion-${index}`, label: `旅行伙伴 ${index + 1}`, category: 'charas', afterSelect: () => openCompanionSettings(index),
        selectedAssetId: () => state.companions[index]?.id,
        selectionError(selected) {
          if (selected.companionColorKnown === false)
            return '此角色图片已收录，边框配色尚未核实，暂不能加入展示。';
          if (!state.companions[index] && state.companions.some(member => String(member.id) === String(selected.id)))
            return '这位伙伴已在队伍中，请为此位置选择另一位伙伴。';
        },
        select(selected) {
          const existing = state.companions.findIndex(member => String(member.id) === String(selected.id));
          if (existing >= 0 && existing !== index) {
            [state.companions[existing], state.companions[index]] = [state.companions[index], state.companions[existing]];
          } else if (existing === -1) {
            state.companions[index] = { ...state.companions[index], id: selected.id, level: state.companions[index]?.level || 1 };
          }
        },
      }, trigger || (() => companions.querySelector(`[data-companion-picker="${triggerIndex}"]`)));
  }
  function paintFields() {
    companions.replaceChildren();
    for (let index = 0; index < 5; index++) {
      const member = state.companions[index];
      const item = member && getRegionCatalogItem(state.region, 'charas', member.id);
      const row = document.createElement('article'); row.className = 'control-row companion-row';
      row.dataset.empty = String(!member);
      const main = document.createElement('div'); main.className = 'control-main';
      const icon = document.createElement('span'); icon.className = 'control-icon';
      if (!member) { icon.textContent = '+'; icon.setAttribute('aria-hidden', 'true'); }
      if (item) {
        const image = new Image();
        image.src = item.image;
        image.alt = '';
        icon.append(image);
      }
      const description = document.createElement('div');
      const heading = document.createElement('h3'); heading.className = 'control-label'; heading.textContent = index ? `队员 ${index}` : '队长';
      const text = document.createElement('p'); text.className = 'control-file';
      text.textContent = member ? item?.name || companionIdLabel(member.id) : '选择旅行伙伴';
      text.title = member ? [item?.name, companionIdLabel(member.id)].filter(Boolean).join(' · ') : text.textContent;
      description.append(heading, text); main.append(icon, description);
      const actions = companionSettings(index);
      const pick = document.createElement('button'); pick.className = 'library-button'; pick.type = 'button'; pick.textContent = member ? '更换素材' : '选择素材'; pick.disabled = catalog?.category !== 'charas' || !catalog.items.length;
      pick.setAttribute('aria-label', `选择${heading.textContent}素材`);
      pick.dataset.companionPicker = String(index);
      pick.addEventListener('click', () => openCompanionPicker(index));
      const clear = document.createElement('button'); clear.className = 'library-button companion-remove'; clear.type = 'button'; clear.textContent = '×'; clear.disabled = !member;
      clear.setAttribute('aria-label', `移除${heading.textContent}`);
      clear.title = `移除${heading.textContent}`;
      clear.addEventListener('click', () => {
        recordHistory();
        state.companions.splice(index, 1);
        paintFields();
        companions.querySelector(`[data-companion-picker="${index}"]`)?.focus({ preventScroll: true });
        render();
      });
      actions.append(clear); row.append(main, pick, actions); companions.append(row);
    }
    const song = catalog && getRegionCatalogItem(catalog.region, 'songs', state.song.id);
    document.querySelector('#song-label').textContent = song ? `${song.name} · ${song.id.endsWith(':dx') ? 'DX' : '标准'}` : '未选择歌曲';
    const cover = document.querySelector('#song-cover'); cover.replaceChildren();
    if (song) { const image = new Image(); image.src = song.image; image.alt = ''; cover.append(image); }
    chartType.replaceChildren();
    for (const variant of currentVariants()) chartType.add(new Option(SONG_CHART_TYPES[songChartType(variant)], songChartType(variant)));
    chartType.value = songChartType(song);
    chartType.disabled = chartType.options.length < 2;
    difficulty.replaceChildren();
    for (const chart of song?.charts || []) {
      const option = new Option(difficultyNames[chart.difficulty], String(chart.difficulty));
      option.dataset.level = chart.level;
      difficulty.add(option);
    }
    difficulty.value = String(state.song.difficulty); difficulty.disabled = !song;
    achievement.value = state.song.achievement;
  }
  async function sync() {
    const version = ++requestVersion;
    if (indicatorRegion !== state.region) {
      indicatorRegion = state.region;
      const stamp = ++indicatorVersion;
      showAssetStatus('is-loading', state.region === 'jp' ? '正在读取日服素材索引' : '正在读取国服素材索引');
      if (state.region === 'cn') {
        loadManifest().then(data => {
          if (stamp !== indicatorVersion) return;
          showAssetStatus('is-online', materialStatus('国服', data.generatedAt));
        }).catch(() => {
          if (stamp === indicatorVersion) showAssetStatus('is-offline', '国服素材索引暂不可用，部分云端图片可能无法加载');
        });
      }
    }
    applyRegionBackground(state.region);
    regionToggle.textContent = state.region === 'jp' ? '日服展示板' : '国服展示板';
    regionSelect.value = state.region;
    for (const option of modeOptions) option.checked = option.value === state.screenMode;
    panel.hidden = state.screenMode === 'collection';
    companions.hidden = state.screenMode !== 'companions'; songs.hidden = state.screenMode !== 'achievement';
    title.textContent = state.screenMode === 'achievement' ? '歌曲达成率' : '旅行伙伴';
    status.textContent = '';
    note.textContent = state.screenMode === 'companions'
      ? '边框使用已确认的本地素材；9999 级保留五颗普通星，超觉醒独立切换。' : '';
    const category = state.screenMode === 'companions' ? 'charas' : state.screenMode === 'achievement' ? 'songs' : null;
    const readyKey = `${state.region}:${category || 'metadata'}`;
    if (readyRegion !== readyKey) {
      catalog = undefined; readyRegion = ''; paintFields();
      try {
        const next = category ? await loadRegionCategoryIndex(state.region, category) : await loadRegionMetadata(state.region);
        if (version !== requestVersion) return;
        catalog = next; readyRegion = readyKey;
      }
      catch (error) {
        if (version === requestVersion) {
          note.textContent = `地区曲库加载失败：${error.message}`;
          if (state.region === 'jp') showAssetStatus('is-offline', '日服素材索引暂不可用');
        }
        return;
      }
    }
    const source = catalog?.sourceStatus?.kind;
    if (source && state.region === 'jp') {
      showAssetStatus('is-online', materialStatus('日服', catalog.generatedAt));
    }
    if (source === 'v1-fallback') status.textContent = '素材索引暂不可用，已切换至兼容版本。';
    paintFields();
  }
  return { sync, openSongPicker, applySongSettings, openCompanionPicker };
}
