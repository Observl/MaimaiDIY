export function countExport(action) {
  window.goatcounter?.count?.({
    path: `export-${action}`,
    title: action === 'generate' ? '生成文件' : '下载文件',
    referrer: '',
    event: true,
    no_session: true,
  });
}
