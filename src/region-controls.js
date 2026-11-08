import { applyRegionBackground } from './region-background.js';
import { loadRegionCatalog } from './region-catalog.js';
import { getRegionCatalogItem } from './region-profile.js';
const difficultyNames = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];
export function initializeRegionControls({ state, recordHistory, render, changeRegion, picker }) {
  const regionSelect = document.querySelector('#region-select');
  const modeSelect = document.querySelector('#screen-mode');
  const panel = document.querySelector('#region-content');
  const title = document.querySelector('#region-content-title');
  const note = document.querySelector('#region-content-note');
  const companions = document.querySelector('#companion-controls');
  const songs = document.querySelector('#song-controls');
  const difficulty = document.querySelector('#song-difficulty');
  const achievement = document.querySelector('#song-achievement');
  const status = document.querySelector('#region-status');
  let requestVersion = 0;
  let catalog;
  let readyRegion = '';
  regionSelect.addEventListener('change', async () => {
    picker.close();
    regionSelect.disabled = true;
    try { await changeRegion(regionSelect.value); }
    catch (error) { status.textContent = `切换失败：${error.message}，已保留原搭配。`; }
    finally { regionSelect.disabled = false; regionSelect.value = state.region; }
  });
  modeSelect.addEventListener('change', () => {
    recordHistory(); state.screenMode = modeSelect.value; sync(); render();
  });
  document.querySelector('#song-pick').addEventListener('click', () => picker.open({
    id: 'region-song', label: '歌曲', category: 'songs', select(item) {
      state.song = { ...state.song, id: item.id, difficulty: item.charts[0]?.difficulty ?? 0 };
    },
  }));
  difficulty.addEventListener('change', () => { recordHistory(); state.song.difficulty = Number(difficulty.value); render(); });
  achievement.addEventListener('change', () => {
    recordHistory(); const value = Number(achievement.value);
    state.song.achievement = Math.min(101, Math.max(0, Number.isFinite(value) ? value : 0)).toFixed(4);
    achievement.value = state.song.achievement; render();
  });
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
      const pick = document.createElement('button'); pick.className = 'library-button'; pick.type = 'button'; pick.textContent = '素材库'; pick.disabled = !catalog?.charas.length;
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
    difficulty.replaceChildren();
    (song?.charts || []).forEach(chart => difficulty.add(new Option(`${difficultyNames[chart.difficulty]} · ${chart.level}`, String(chart.difficulty))));
    difficulty.value = String(state.song.difficulty); difficulty.disabled = !song;
    achievement.value = state.song.achievement;
  }
  async function sync() {
    const version = ++requestVersion;
    applyRegionBackground(state.region);
    regionSelect.value = state.region; modeSelect.value = state.screenMode;
    panel.hidden = state.screenMode === 'collection';
    companions.hidden = state.screenMode !== 'companions'; songs.hidden = state.screenMode !== 'achievement';
    title.textContent = state.screenMode === 'achievement' ? '歌曲达成率' : '旅行伙伴';
    const ui = state.region === 'jp' ? 'MAGiCAL' : 'CiRCLE';
    status.textContent = `${state.region === 'jp' ? '日服' : '国服'} · ${ui} 网页背景。上屏设计背景独立选择，切区恢复各自搭配。${state.region === 'jp' ? '素材分类按来源地区、类型或名称匹配；2026-06 快照未覆盖项单列，非 MAGiCAL 全量。' : ''}`;
    note.textContent = '可先选择并保存内容；新版上屏 UI 核对完成前，旅行伙伴与成绩不会套用自制框进入预览或 PNG。';
    if (readyRegion !== state.region) {
      catalog = undefined; paintFields();
      try { const next = await loadRegionCatalog(state.region); if (version !== requestVersion) return; catalog = next; readyRegion = state.region; }
      catch (error) { if (version === requestVersion) note.textContent = `地区曲库加载失败：${error.message}`; return; }
    }
    const source = catalog?.sourceStatus?.kind;
    if (source) status.textContent += source === 'v1-fallback'
      ? ' 当前使用兼容索引，COS 新索引暂不可用。'
      : source === 'v2-cache' ? ' 当前使用已校验的本版本离线索引。' : ' 已加载 COS v2 分类索引。';
    if (state.region === 'cn' && state.screenMode === 'companions') note.textContent = '国服 CN1.55 原版素材包尚未取得，旅行伙伴暂不可选。不会混用日服素材。';
    paintFields();
  }
  return { sync };
}
