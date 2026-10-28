# CiRCLE 背景（国际官网，当前使用）

来源：https://maimai.sega.com/ ，获取日期 2026-10-29。

当前使用国际官网真实 HTML 背景组件、assets/css/style.css 中从 .bg 到 .header 之前的完整背景样式，以及 assets/img/circle/bg/ 下的全部 22 张图片。图片保存在 live-assets/，background.css 仅修改相对资源路径，没有缺图替代。

原 HTML、CSS 和公共脚本分别保存在 sega-com.html、com-style.css、com-project.js。背景动画完全由 CSS 驱动，不需要加载官网脚本。preview.css 仅做本站层级及卡片外观适配。

保留原站 769、1100、1400px 响应式断点及图层结构。背景不参与 PNG 导出。原图片版权归原权利人所有。

以下为此前存档网站的取样记录，source.html、source-site.css、source-site.js 与 assets/ 不再由页面引用。

## 历史取样记录

指定快照：https://web.archive.org/web/20251225095519/https://maimai.sega.jp/

页面引用 20251209 版本的 site.css / site.js。background.css 提取其中 maiDecorationBg 组件，保留原始尺寸、定位、动画和手机适配，仅将图片路径改为本目录 assets。source-site.css、source-site.js 和 source.html 为追溯用原文件，不由本地页面加载。

动画包括：背景纹理 500 秒旋转；彩色圆环 100 秒反向旋转；白色圆环 110 秒反向旋转；立体装饰整体 70 秒旋转，各装饰再按 15～28 秒周期旋转；星形和长条按 6～15 秒周期上升并淡入淡出。实际图层顺序来自原组件模板。

preview.css 负责与 MaimaiDIY 页面适配，并支持系统的减少动态效果偏好。背景不参与 PNG 导出。原图片版权归原权利人所有。

共保存 22 张图片。`3d_star.png` 在指定存档和现官网均不可用，存档索引也没有成功记录；该图层暂使用同套的 `3d_star_small.png`，保持原位置、尺寸和旋转周期。其余图片已下载。部分存档请求失败的图片通过官网同名路径补取。
