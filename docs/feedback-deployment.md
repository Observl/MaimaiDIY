# 部署网站反馈

GitHub Pages 发布反馈表单。反馈服务运行在可提供 HTTPS 的 Node.js 22.13+ 主机上，负责审核和邮件投递。

1. 在主机的私密环境变量中设置 `FEEDBACK_SILICONFLOW_API_KEY`、`RESEND_API_KEY`、`FEEDBACK_MASTER_KEY`（随机 32 字节的 Base64 编码）、`FEEDBACK_FROM` 和 `FEEDBACK_TO`。服务启动时会将硅基流动密钥加密写入数据库。用 Resend 测试地址时，收件人填写对应的 Resend 账号邮箱。
2. 将 `FEEDBACK_DATABASE` 指向持久存储上的 SQLite 文件，将 `FEEDBACK_ORIGIN` 设为 GitHub Pages 网站的源，例如 `https://observl.github.io`。省略 `FEEDBACK_ADMIN_PORT`。执行 `npm ci`、`npm run build` 和 `node tools/serve.mjs dist`，再通过同一主机上的 HTTPS 反向代理开放 `/api/feedback`。服务监听 `127.0.0.1:4173`，可通过 `PORT` 调整。
3. 在 GitHub 仓库的 Actions 变量中设置 `FEEDBACK_ENDPOINT` 为完整的 HTTPS 反馈接口地址，并运行 Pages 发布流程。该变量是公开接口地址。

## 代理后的访客限频

让直接面对访客的代理覆盖 `X-MaimaiDIY-Client-IP`，填入访客的单个 IP，再为后端设置 `FEEDBACK_TRUST_LOCAL_PROXY=1`。后端只接受来自本机代理的有效 IP，并按该地址实行七天五条的限制。使用 Nginx 时，可在已有 HTTPS 站点中配置以下路由。

```nginx
location = /api/feedback {
    proxy_set_header X-MaimaiDIY-Client-IP $remote_addr;
    proxy_pass http://127.0.0.1:4173;
}
```

如果 Nginx 前面还有 CDN，先按平台说明配置可信代理地址，让 `$remote_addr` 反映真实访客 IP。访客提供的请求头不能直接用于限频。
