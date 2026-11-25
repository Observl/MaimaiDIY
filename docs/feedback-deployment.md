# 部署网站反馈

GitHub Pages 发布反馈表单。反馈服务运行在可提供 HTTPS 的 Node.js 22.13+ 主机上，负责审核和邮件投递。

## 腾讯云云托管

1. 在云开发环境的云托管中创建容器型服务 `maimaidiy-feedback`。用仓库根目录作为构建目录，Dockerfile 选择 `Dockerfile.feedback`，端口设为 `8080`。先使用默认公网 HTTPS 地址联调，健康检查可使用 `/healthz`。
2. 在同地域准备 CFS 和对应的 VPC、子网。把专用于反馈的读写目录挂载到 `/mnt/feedback`，确保容器内的 `node` 用户（UID 1000）可写，把最大副本数设为 1。SQLite 使用这个目录跨容器重启保存额度。CFS 单独计费。
3. 在云托管的服务环境变量中填写下表。只有必填项齐全后才开放提交。保留同一个主密钥，否则既有访客额度会失去关联。

| 变量 | 值 |
| --- | --- |
| `FEEDBACK_SILICONFLOW_API_KEY` | 硅基流动密钥 |
| `RESEND_API_KEY` | Resend 密钥 |
| `FEEDBACK_MASTER_KEY` | 随机 32 字节的 Base64 编码，例如用 `node -p "require('node:crypto').randomBytes(32).toString('base64')"` 生成 |
| `FEEDBACK_FROM` | 联调时填 `MaimaiDIY <onboarding@resend.dev>` |
| `FEEDBACK_TO` | 收件邮箱。用测试发件地址时填对应的 Resend 账号邮箱 |
| `FEEDBACK_ORIGIN` | 实际访问网站的源，例如 `https://observl.github.io` |
| `FEEDBACK_DATABASE` | `/mnt/feedback/feedback.sqlite` |

4. 确认云托管入口为本服务唯一的外部入口，它在 `X-Forwarded-For` 末尾提供客户端地址。联调时检查来源和限频，再将默认 HTTPS 地址加 `/api/feedback` 填入 GitHub 的 Actions 变量 `FEEDBACK_ENDPOINT`，运行 Pages 发布流程并测试收件。默认域名有平台的测试使用限制。

## 自建 Node.js 服务器

1. 在主机的私密环境变量中设置 `FEEDBACK_SILICONFLOW_API_KEY`、`RESEND_API_KEY`、`FEEDBACK_MASTER_KEY`（随机 32 字节的 Base64 编码）、`FEEDBACK_FROM` 和 `FEEDBACK_TO`。服务启动时会将硅基流动密钥加密写入数据库。用 Resend 测试地址时，收件人填写对应的 Resend 账号邮箱。
2. 将 `FEEDBACK_DATABASE` 指向持久存储上的 SQLite 文件，将 `FEEDBACK_ORIGIN` 设为 GitHub Pages 网站的源，例如 `https://observl.github.io`。省略 `FEEDBACK_ADMIN_PORT`。执行 `npm ci`、`npm run build` 和 `node tools/serve.mjs dist`，再通过同一主机上的 HTTPS 反向代理开放 `/api/feedback`。服务监听 `127.0.0.1:50772`，可通过 `PORT` 调整。
3. 在 GitHub 仓库的 Actions 变量中设置 `FEEDBACK_ENDPOINT` 为完整的 HTTPS 反馈接口地址，并运行 Pages 发布流程。该变量是公开接口地址。

## 代理后的访客限频

让直接面对访客的代理覆盖 `X-MaimaiDIY-Client-IP`，填入访客的单个 IP，再为后端设置 `FEEDBACK_TRUST_LOCAL_PROXY=1`。后端只接受来自本机代理的有效 IP，并按该地址实行七天五条的限制。使用 Nginx 时，可在已有 HTTPS 站点中配置以下路由。

```nginx
location = /api/feedback {
    proxy_set_header X-MaimaiDIY-Client-IP $remote_addr;
    proxy_pass http://127.0.0.1:50772;
}
```

如果 Nginx 前面还有 CDN，先按平台说明配置可信代理地址，让 `$remote_addr` 反映真实访客 IP。访客提供的请求头不能直接用于限频。
