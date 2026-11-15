# 部署网站反馈

GitHub Pages 发布反馈表单。反馈服务运行在可提供 HTTPS 的 Node.js 22.13+ 主机上，负责审核和邮件投递。

1. 在主机的私密环境变量中设置 `FEEDBACK_SILICONFLOW_API_KEY`、`RESEND_API_KEY`、`FEEDBACK_MASTER_KEY`（随机 32 字节的 Base64 编码）、`FEEDBACK_FROM` 和 `FEEDBACK_TO`。服务启动时会将硅基流动密钥加密写入数据库。用 Resend 测试地址时，收件人填写对应的 Resend 账号邮箱。
2. 将 `FEEDBACK_DATABASE` 指向持久存储上的 SQLite 文件，将 `FEEDBACK_ORIGIN` 设为 GitHub Pages 网站的源，例如 `https://observl.github.io`。省略 `FEEDBACK_ADMIN_PORT`。执行 `npm ci`、`npm run build` 和 `node tools/serve.mjs dist`，再以 HTTPS 反向代理开放 `/api/feedback`。当前服务按连接 IP 限频。反向代理部署默认共享代理连接的额度，按访客限频需要在可信代理层执行。
3. 在 GitHub 仓库的 Actions 变量中设置 `FEEDBACK_ENDPOINT` 为完整的 HTTPS 反馈接口地址，并运行 Pages 发布流程。该变量是公开接口地址。
