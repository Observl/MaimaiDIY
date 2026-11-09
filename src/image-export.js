// iPadOS can advertise a desktop Mac user agent. Do not use screen size: it
// would miss large iPads and change the desktop download flow on small windows.
export function isIosSafari(device = globalThis.navigator) {
  const agent = device?.userAgent || '';
  const mobile = /iPad|iPhone|iPod/.test(agent) ||
    (device?.platform === 'MacIntel' && device?.maxTouchPoints > 1);
  return mobile && /Version\//.test(agent) && /Safari\//.test(agent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|YaBrowser|YxiOS|UCBrowser|MicroMessenger|MQQBrowser/.test(agent);
}

function snapshotCanvas(renderCanvas, width, height) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  try {
    const context = output.getContext('2d');
    if (!context) throw new Error('无法创建图片画布');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    // Copy synchronously, so later edits cannot change this export's snapshot.
    context.drawImage(renderCanvas, 0, 0, width, height);
    return output;
  } catch (error) {
    output.width = output.height = 0;
    throw error;
  }
}

export function createPngBlob(renderCanvas, width, height) {
  const output = snapshotCanvas(renderCanvas, width, height);
  return new Promise((resolve, reject) => {
    try {
      output.toBlob(blob => {
        if (blob?.size && blob.type === 'image/png') resolve(blob);
        else reject(new Error('PNG 编码失败'));
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  }).finally(() => {
    // Release the temporary bitmap, especially on memory-constrained iPhones.
    output.width = 0;
    output.height = 0;
  });
}

function downloadPng(renderCanvas, width, height, filename) {
  // Preserve Android/desktop's existing synchronous, one-click data URL path.
  // No async encoding, file-sharing prompt, or extra confirmation is added.
  const output = snapshotCanvas(renderCanvas, width, height);
  const link = document.createElement('a');
  try {
    link.href = output.toDataURL('image/png');
    if (!link.href.startsWith('data:image/png')) throw new Error('PNG 编码失败');
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    output.width = output.height = 0;
  }
}

export function exportErrorMessage(error) {
  return error?.name === 'SecurityError'
    ? '图片导出失败：素材的跨域设置不允许读取图片。请刷新页面后重试。'
    : '图片生成失败，请关闭其他预览后重试；如仍失败，请刷新页面。';
}

export function initializeImageExport({
  renderCanvas, width, height, preferPreview = isIosSafari(), isReady = () => true,
}) {
  const get = id => document.querySelector(`#${id}`);
  const button = get('export');
  const dialog = get('image-export-dialog');
  const image = get('image-export-preview');
  const status = get('image-export-status');
  const actions = get('image-export-actions');
  const share = get('image-export-share');
  const download = get('image-export-download');
  if (preferPreview) {
    button.textContent = '保存到相册';
    get('image-export-title').textContent = '保存到相册';
  }
  share.textContent = preferPreview ? '保存到相册' : '保存 / 分享图片';
  download.textContent = preferPreview ? '保存到文件' : '下载 PNG';
  let generation = 0;
  let busy = false;
  let current = null;
  let sharing = false;

  function release(url) {
    // Never revoke at image.onload or immediately after a click. Safari/system
    // save menus may still be reading the URL after the dialog is dismissed.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function updateAvailability() {
    button.disabled = busy || dialog.open || !isReady();
  }
  function reset() {
    generation++;
    busy = false;
    updateAvailability();
    image.hidden = true;
    image.removeAttribute('src');
    download.removeAttribute('href');
    actions.hidden = true;
    share.hidden = true;
    if (current) release(current.url);
    current = null;
  }
  function close() {
    reset();
    dialog.close();
    updateAvailability();
    if (!button.disabled) button.focus();
  }
  get('image-export-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) reset();
  });

  function showPreview() {
    image.src = current.url;
    image.hidden = false;
    download.href = current.url;
    download.download = current.filename;
    share.hidden = !current.file;
    share.disabled = sharing;
    actions.hidden = false;
    status.textContent = '图片已生成。长按下方图片可保存。' +
      (current.file ? '点击“保存到相册”，在系统菜单中选择“存储图像”。' : '') +
      '如需 PNG 文件，可选择“保存到文件”。';
    if (!dialog.open) dialog.showModal();
  }

  button.addEventListener('click', async () => {
    if (busy || dialog.open || !isReady()) return;
    reset();
    busy = true;
    button.disabled = true;
    const version = generation;
    status.textContent = '正在生成高清图片…';
    const filename = `maimai-diy-${width}x${height}-${Date.now()}.png`;
    if (!preferPreview) {
      try {
        downloadPng(renderCanvas, width, height, filename);
      } catch (error) {
        status.textContent = exportErrorMessage(error);
        dialog.showModal();
      } finally {
        busy = false;
        updateAvailability();
      }
      return;
    }
    dialog.showModal();
    try {
      const blob = await createPngBlob(renderCanvas, width, height);
      if (version !== generation) return;
      current = { url: URL.createObjectURL(blob), filename, file: null };
      // File sharing is optional. Unsupported/throwing canShare must not prevent
      // the image preview or ordinary download from working.
      try {
        const file = new window.File([blob], filename, { type: 'image/png' });
        if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }))
          current.file = file;
      } catch { /* Use the preview and download fallback. */ }
      showPreview();
    } catch (error) {
      if (version !== generation) return;
      status.textContent = exportErrorMessage(error);
      if (!dialog.open) dialog.showModal();
    } finally {
      if (version === generation) {
        busy = false;
        updateAvailability();
      }
    }
  });

  // The file is ready before this second, explicit tap. Do not await encoding,
  // fetch, or a popup before navigator.share: Safari requires user activation.
  share.addEventListener('click', async () => {
    if (!current?.file || sharing) return;
    const snapshot = current;
    sharing = true;
    share.disabled = true;
    try {
      await navigator.share({ files: [snapshot.file] });
      if (current === snapshot)
        status.textContent = '系统操作已结束。若尚未保存，可再次点击“保存到相册”或长按图片。';
    } catch (error) {
      if (current === snapshot) status.textContent = error?.name === 'AbortError'
        ? '已取消保存。图片仍在，可再次点击“保存到相册”或长按图片。'
        : '系统保存暂不可用，请长按下方图片保存到相册，或选择“保存到文件”。';
    } finally {
      sharing = false;
      share.disabled = false;
    }
  });
  updateAvailability();
  return { updateAvailability };
}
