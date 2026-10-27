# MaimaiDIY

舞萌 DX 上屏玩家装饰区域模拟器。静态站点通过公开只读接口加载腾讯云 COS 素材，用户上传的图片仍只在浏览器本地处理。

## 功能

- 复现 PSD 的 1080 × 452 布局坐标
- 背景板、名牌、头像、Rating、称号、名称、段位、友人对战替换
- Rating、段位、友人对战可显示/隐藏；名牌、头像、称号、名称固定显示
- 实时 Canvas 合成
- 从腾讯云 COS 按分类分页选择素材，失败时回退到仓库清单和浏览器缓存
- 输入 DX Rating 数字后自动切换对应颜色框（白、蓝、绿、橙、红、紫、铜、银、金、白金、虹）
- 导出原尺寸透明度保留的 PNG
- 响应式界面和减少动态效果支持

## 本地运行

直接打开 `index.html`，或在目录运行任意静态文件服务器。

## 素材扩展

仓库只包含默认演示素材和轻量 `materials/manifest.json` 清单。约 700 MB 的完整素材保存在腾讯云 COS，网页按需加载缩略图和用户选择的原图。

当前 COS 地址在 `app.js` 的 `COS` 配置中。存储桶必须为 `https://observl.github.io` 配置 `GET/HEAD` 跨域许可，否则远程图片可浏览但 Canvas 无法导出。

## GitHub Pages

仓库包含 Pages 工作流。仓库 Settings → Pages → Source 选择 **GitHub Actions** 后，推送到 `main` 会自动部署。

