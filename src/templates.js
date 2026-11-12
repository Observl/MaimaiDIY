import { templateStorageKey } from './region-profile.js';
import {
  TEMPLATE_STORAGE_KEY,
  TEMPLATE_FILE_FORMAT,
  TEMPLATE_FILE_VERSION,
  TEMPLATE_FILE_MAX_BYTES,
} from './config.js';
import { safeTemplateName, sanitizeImportedState as sanitize } from './model.js';
import { loadImage } from './assets.js';
export function readStoredTemplates(storage, region = 'cn', screenMode = 'collection') {
  const read = (key, legacy = false) => {
    try {
      const values = JSON.parse(storage.getItem(key) || '[]');
      if (!Array.isArray(values)) return [];
      return values
        .filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            item.state &&
            typeof item.state === 'object' &&
            !Array.isArray(item.state) &&
            (item.state.region ?? 'cn') === region &&
            (item.state.screenMode ?? 'collection') === screenMode
        )
        .map((item) =>
          legacy ? { ...item, id: `legacy:${item.id}`, legacy: true } : { ...item, legacy: false }
        );
    } catch {
      return [];
    }
  };
  const current = read(templateStorageKey(region, screenMode));
  return region === 'cn' && screenMode === 'collection'
    ? [...current, ...read(TEMPLATE_STORAGE_KEY, true)]
    : current;
}

export function initializeTemplates({
  state,
  snapshotState,
  recordHistory,
  syncControlsFromState,
  render,
  getCatalog,
}) {
  let requestVersion = 0;
  const scope = () => `${state.region || 'cn'}:${state.screenMode || 'collection'}`;
  let listedScope = scope();
  const beginRequest = () => ({
    version: ++requestVersion,
    scope: scope(),
    base: structuredClone(state),
  });
  const isCurrent = (request) => request.version === requestVersion && request.scope === scope();
  const sanitizeImportedState = async (value, base) =>
    sanitize(value, base, getCatalog ? await getCatalog(value?.region ?? 'cn') : undefined);
  const readTemplates = () =>
    readStoredTemplates(localStorage, state.region || 'cn', state.screenMode || 'collection');
  const writableTemplates = () => readTemplates().filter((item) => !item.legacy);
  const storageKey = (value = state) =>
    templateStorageKey(value.region || 'cn', value.screenMode || 'collection');

  function refreshTemplateList(selectedId) {
    const list = document.querySelector('#template-list');
    const sameScope = listedScope === scope();
    if (!sameScope) {
      requestVersion += 1;
      listedScope = scope();
    }
    selectedId ??= sameScope ? list.value : '';
    const templates = readTemplates();
    list.replaceChildren();
    if (!templates.length) list.add(new Option('暂无模板', ''));
    templates.forEach((template) => list.add(new Option(template.name, template.id)));
    if (selectedId && templates.some((template) => template.id === selectedId))
      list.value = selectedId;
  }

  function saveTemplate() {
    requestVersion += 1;
    const nameInput = document.querySelector('#template-name');
    const status = document.querySelector('#template-status');
    const name = nameInput.value.trim();
    if (!name) {
      status.textContent = '请先输入模板名称。';
      nameInput.focus();
      return;
    }
    let cleanState;
    try {
      cleanState = sanitize(state);
    } catch (error) {
      status.textContent = `保存失败：${error.message || '模板内容无效'}`;
      return;
    }
    const templates = writableTemplates();
    const existing = templates.find((item) => item.name === name);
    const template = {
      id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      state: cleanState,
    };
    const next = existing
      ? templates.map((item) => (item.id === existing.id ? template : item))
      : [...templates, template];
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
      refreshTemplateList(template.id);
      status.textContent = existing ? `已更新“${name}”。` : `已保存“${name}”。`;
    } catch (error) {
      status.textContent = '保存失败：浏览器本地空间不足，请换用体积更小的头像。';
    }
  }

  function selectedTemplateName() {
    const selectedId = document.querySelector('#template-list').value;
    return readTemplates().find((item) => item.id === selectedId)?.name;
  }

  function exportTemplateFile() {
    try {
      const name = safeTemplateName(
        document.querySelector('#template-name').value || selectedTemplateName()
      );
      const payload = {
        format: TEMPLATE_FILE_FORMAT,
        version: TEMPLATE_FILE_VERSION,
        name,
        exportedAt: new Date().toISOString(),
        region: state.region || 'cn',
        screenMode: state.screenMode || 'collection',
        state: sanitize(snapshotState()),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const safeName = name
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
      const url = URL.createObjectURL(blob);
      link.download = `${safeName || 'MaimaiDIY-template'}.maimai.json`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      document.querySelector('#template-status').textContent = `已导出“${name}”。`;
    } catch (error) {
      document.querySelector('#template-status').textContent =
        `导出失败：${error.message || '模板内容无效'}`;
    }
  }

  async function importTemplateFile(event) {
    const request = beginRequest();
    const input = event.currentTarget;
    const file = input.files?.[0];
    const status = document.querySelector('#template-status');
    input.value = '';
    if (!file) return;
    if (file.size > TEMPLATE_FILE_MAX_BYTES) {
      status.textContent = '导入失败：JSON 文件不能超过 10 MB。';
      return;
    }
    try {
      const text = await file.text();
      if (!isCurrent(request)) return;
      const payload = JSON.parse(text);
      if (
        !payload ||
        payload.format !== TEMPLATE_FILE_FORMAT ||
        payload.version !== TEMPLATE_FILE_VERSION
      ) {
        throw new Error('不是受支持的 MaimaiDIY 模板文件');
      }
      const name = safeTemplateName(payload.name);
      if (
        (payload.region !== undefined && payload.region !== payload.state?.region) ||
        (payload.screenMode !== undefined && payload.screenMode !== payload.state?.screenMode)
      )
        throw new Error('模板地区或模式不一致');
      const importedState = await sanitizeImportedState(payload.state, request.base);
      if (!isCurrent(request)) return;
      if (importedState.region !== (state.region || 'cn'))
        throw new Error('请先切换到模板对应地区，再导入');
      if (importedState.files.avatar.startsWith('data:')) {
        const avatar = await loadImage(importedState.files.avatar);
        if (!isCurrent(request)) return;
        if (avatar.naturalWidth !== avatar.naturalHeight || avatar.naturalWidth > 720)
          throw new Error('头像必须为 1:1，最大 720 × 720 像素');
      }
      const templates = readStoredTemplates(
        localStorage,
        importedState.region,
        importedState.screenMode
      ).filter((item) => !item.legacy);
      const existing = templates.find((item) => item.name === name);
      const template = {
        id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        savedAt: new Date().toISOString(),
        state: importedState,
      };
      const next = existing
        ? templates.map((item) => (item.id === existing.id ? template : item))
        : [...templates, template];
      if (!isCurrent(request)) return;
      localStorage.setItem(storageKey(importedState), JSON.stringify(next));
      recordHistory(null, importedState.region);
      Object.assign(state, importedState);
      request.scope = scope();
      listedScope = scope();
      syncControlsFromState();
      refreshTemplateList(template.id);
      document.querySelector('#template-name').value = name;
      status.textContent = existing ? `已导入并更新“${name}”。` : `已导入并保存“${name}”。`;
      await render();
    } catch (error) {
      if (isCurrent(request)) status.textContent = `导入失败：${error.message || '文件内容无效'}`;
    }
  }

  async function loadTemplate() {
    const request = beginRequest();
    const id = document.querySelector('#template-list').value;
    const template = readTemplates().find((item) => item.id === id);
    if (!template) return;
    try {
      const next = await sanitizeImportedState(template.state, request.base);
      if (!isCurrent(request)) return;
      recordHistory();
      Object.assign(state, next);
      syncControlsFromState();
      document.querySelector('#template-name').value = template.name;
      document.querySelector('#template-status').textContent = `已载入“${template.name}”。`;
      await render();
    } catch (error) {
      if (isCurrent(request))
        document.querySelector('#template-status').textContent = `载入失败：${error.message}`;
    }
  }

  function deleteTemplate() {
    requestVersion += 1;
    const list = document.querySelector('#template-list');
    const template = readTemplates().find((item) => item.id === list.value);
    if (!template) return;
    if (template.legacy) {
      document.querySelector('#template-status').textContent =
        '旧版模板保留原样；可另存到当前地区后管理。';
      return;
    }
    try {
      localStorage.setItem(
        storageKey(),
        JSON.stringify(writableTemplates().filter((item) => item.id !== template.id))
      );
      refreshTemplateList();
      document.querySelector('#template-status').textContent = `已删除“${template.name}”。`;
    } catch {
      document.querySelector('#template-status').textContent = '删除失败：浏览器存储不可用。';
    }
  }

  document.querySelector('#template-save').addEventListener('click', saveTemplate);
  document.querySelector('#template-load').addEventListener('click', loadTemplate);
  document.querySelector('#template-delete').addEventListener('click', deleteTemplate);
  document.querySelector('#template-export').addEventListener('click', exportTemplateFile);
  document.querySelector('#template-import').addEventListener('change', importTemplateFile);

  refreshTemplateList();
  return { refresh: refreshTemplateList };
}
