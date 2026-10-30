import {
  TEMPLATE_STORAGE_KEY,
  TEMPLATE_FILE_FORMAT,
  TEMPLATE_FILE_VERSION,
  TEMPLATE_FILE_MAX_BYTES,
} from './config.js';
import { safeTemplateName, sanitizeImportedState as sanitize } from './model.js';
import { loadImage } from './assets.js';
export function initializeTemplates({
  state,
  snapshotState,
  recordHistory,
  syncControlsFromState,
  render,
}) {
  const sanitizeImportedState = (value) => sanitize(value, state);
  function readTemplates() {
    try {
      const value = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              typeof item.name === 'string' &&
              item.state &&
              typeof item.state === 'object'
          )
        : [];
    } catch (error) {
      return [];
    }
  }

  function refreshTemplateList(selectedId = '') {
    const list = document.querySelector('#template-list');
    const templates = readTemplates();
    list.replaceChildren();
    if (!templates.length) list.add(new Option('暂无模板', ''));
    templates.forEach((template) => list.add(new Option(template.name, template.id)));
    if (selectedId) list.value = selectedId;
  }

  function saveTemplate() {
    const nameInput = document.querySelector('#template-name');
    const status = document.querySelector('#template-status');
    const name = nameInput.value.trim();
    if (!name) {
      status.textContent = '请先输入模板名称。';
      nameInput.focus();
      return;
    }
    const templates = readTemplates();
    const existing = templates.find((item) => item.name === name);
    const template = {
      id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(state)),
    };
    const next = existing
      ? templates.map((item) => (item.id === existing.id ? template : item))
      : [...templates, template];
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
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
    const name = safeTemplateName(
      document.querySelector('#template-name').value || selectedTemplateName()
    );
    const payload = {
      format: TEMPLATE_FILE_FORMAT,
      version: TEMPLATE_FILE_VERSION,
      name,
      exportedAt: new Date().toISOString(),
      state: snapshotState(),
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
  }

  async function importTemplateFile(event) {
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
      const payload = JSON.parse(await file.text());
      if (
        !payload ||
        payload.format !== TEMPLATE_FILE_FORMAT ||
        payload.version !== TEMPLATE_FILE_VERSION
      ) {
        throw new Error('不是受支持的 MaimaiDIY 模板文件');
      }
      const name = safeTemplateName(payload.name);
      const importedState = sanitizeImportedState(payload.state);
      if (importedState.files.avatar.startsWith('data:')) {
        const avatar = await loadImage(importedState.files.avatar);
        if (avatar.naturalWidth !== avatar.naturalHeight || avatar.naturalWidth > 720)
          throw new Error('头像必须为 1:1，最大 720 × 720 像素');
      }
      const templates = readTemplates();
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
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
      recordHistory();
      Object.assign(state, importedState);
      syncControlsFromState();
      refreshTemplateList(template.id);
      document.querySelector('#template-name').value = name;
      status.textContent = existing ? `已导入并更新“${name}”。` : `已导入并保存“${name}”。`;
      await render();
    } catch (error) {
      status.textContent = `导入失败：${error.message || '文件内容无效'}`;
    }
  }

  async function loadTemplate() {
    const id = document.querySelector('#template-list').value;
    const template = readTemplates().find((item) => item.id === id);
    if (!template) return;
    try {
      const next = sanitizeImportedState(template.state);
      recordHistory();
      Object.assign(state, next);
      syncControlsFromState();
      document.querySelector('#template-name').value = template.name;
      document.querySelector('#template-status').textContent = `已载入“${template.name}”。`;
      await render();
    } catch (error) {
      document.querySelector('#template-status').textContent = `载入失败：${error.message}`;
    }
  }

  function deleteTemplate() {
    const list = document.querySelector('#template-list');
    const template = readTemplates().find((item) => item.id === list.value);
    if (!template) return;
    try {
      localStorage.setItem(
        TEMPLATE_STORAGE_KEY,
        JSON.stringify(readTemplates().filter((item) => item.id !== template.id))
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
