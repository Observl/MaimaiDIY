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
  const regionBeta = document.querySelector('#region-beta');
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
  function paintFields() {
    companions.replaceChildren();
    for (let index = 0; index < 5; index++) {
      const member = state.companions[index];
      const item = catalog && getRegionCatalogItem(catalog.region, 'charas', member?.id);
      const row = document.createElement('article'); row.className = 'control-row';
      const main = document.createElement('div'); main.className = 'control-main';
      const icon = document.createElement('span'); icon.className = 'control-icon';
      if (item) { const image = new Image(); image.src = item.image; image.alt = ''; icon.append(image); }
      const description = document.createElement('div');
      const heading = document.createElement('h3'); heading.className = 'control-label'; heading.textContent = `旅行伙伴 ${index + 1}`;
      const text = document.createElement('p'); text.className = 'control-file'; text.textContent = item?.name || '未选择';
      description.append(heading, text); main.append(icon, description);
      const actions = document.createElement('div'); actions.className = 'control-actions';
      const level = document.createElement('input'); level.className = 'companion-level'; level.type = 'number'; level.min = '1'; level.max = '999'; level.value = String(member?.level || 1); level.disabled = !member; level.setAttribute('aria-label', `旅行伙伴 ${index + 1} 等级`);
      level.addEventListener('change', () => {
        if (!state.companions[index]) return;
        recordHistory(); state.companions[index].level = Math.min(999, Math.max(1, Math.trunc(Number(level.value)) || 1));
        level.value = String(state.companions[index].level); render();
      });
      const pick = document.createElement('button'); pick.className = 'library-button'; pick.type = 'button'; pick.textContent = '素材库'; pick.disabled = catalog?.category !== 'charas' || !catalog.items.length;
      pick.addEventListener('click', () => picker.open({ id: `companion-${index}`, label: `旅行伙伴 ${index + 1}`, category: 'charas', select(selected) {
        // Fill slots in order, preserving a compact, independently saved party.
        const slot = Math.min(index, state.companions.length);
        const existing = state.companions.findIndex(member => member.id === selected.id);
        if (existing >= 0 && existing !== slot) {
          if (state.companions[slot]) [state.companions[existing], state.companions[slot]] = [state.companions[slot], state.companions[existing]];
          return;
        }
        state.companions[slot] = { id: selected.id, level: state.companions[slot]?.level || 1 };
      } }));
      const clear = document.createElement('button'); clear.className = 'library-button'; clear.type = 'button'; clear.textContent = '移除'; clear.disabled = !member;
      clear.addEventListener('click', () => { recordHistory(); state.companions.splice(index, 1); paintFields(); render(); });
      actions.append(level, pick, clear); row.append(main, actions); companions.append(row);
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
    regionBeta.hidden = state.region !== 'jp';
    regionSelect.value = state.region;
    for (const option of modeOptions) option.checked = option.value === state.screenMode;
    panel.hidden = state.screenMode === 'collection';
    companions.hidden = state.screenMode !== 'companions'; songs.hidden = state.screenMode !== 'achievement';
    title.textContent = state.screenMode === 'achievement' ? '歌曲达成率' : '旅行伙伴';
    const ui = state.region === 'jp' ? 'MAGiCAL' : 'CiRCLE';
    status.textContent = `${state.region === 'jp' ? '日服' : '国服'} · ${ui} 网页背景`;
    note.textContent = state.screenMode === 'companions'
      ? (state.region === 'cn' ? '国服 CN1.55 原版素材包尚未取得，旅行伙伴暂不可选。' : '旅行伙伴可保存到模板。') : '';
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
    const local = catalog?.sourceStatus?.local;
    if (source && state.region === 'jp') {
      showAssetStatus('is-online', materialStatus('日服', catalog.generatedAt));
    }
    if (source) status.textContent += source === 'v1-fallback'
      ? ' 当前使用兼容索引，COS 新索引暂不可用。'
      : source === 'v2-cache' ? ' 当前使用已校验的本版本缓存索引。'
      : local ? ' 已加载经校验的本地 COS v2 索引。' : ' 已加载 COS v2 分类索引。';
    paintFields();
  }
  return { sync, openSongPicker, applySongSettings };
}
