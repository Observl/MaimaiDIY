# CloudBase 后端迁移

环境：`maimai-diy-d8go3owr74a7e260d`，国内站上海，现有 PostgreSQL 17。
本次只迁移后端，不上传静态页面，不切换 GitHub Pages，不搬迁或修改原 COS 公共素材。

## 数据与认证

继续使用项目现有用户名密码体系，由服务端校验 scrypt 派生值。账号在 `commerce_users`；这不是把用户直接注册到 CloudBase 内置身份认证用户列表。后续若更换原生认证，需要单独做账号兼容迁移。

表：`commerce_users`、`commerce_sessions`、`commerce_orders`、`commerce_order_items`、`commerce_throttle`、`commerce_legacy_batches`。数据库表开启 RLS，匿名和普通 CloudBase 客户端角色无任何直接读写权限；仅服务端 API Key 对应的 service_role 可以访问。API 逐次校验自有会话及订单归属，不信任请求体中的 userId。

跨站 API 使用短期 Bearer 会话，服务端只存 token 哈希，7 天到期。前端接入代码仅将会话放在标签页 sessionStorage，不依赖第三方 cookie，不把密钥或密码保存进浏览器。退出会销毁会话，改密会使其他会话失效。部署密钥只保存在平台环境变量和忽略的 `output/` 私有配置，不得上传 GitHub 或静态托管。

本地正式目录 `output/commerce-data` 中 0 个账号、4 笔匿名模拟订单、5 条商品明细已导入。旧模拟单为 archived，不会出现在普通用户查单中，也不能通过猜订单号认领。未迁移 `commerce-test*` 浏览器测试数据库，原 SQLite 保留。

## 接口

云函数：`commerce-api`（Event Function / Nodejs20.19）。
HTTP 路由前缀：`/commerce-api`，开启子路径透传，网关上限 30 QPS、单 IP 5 QPS。函数自身还有限速、来源校验及 CSRF 校验。公开 HTTP 路由关闭平台鉴权以接收登录请求，业务接口使用自有会话鉴权，不开放数据库。

默认网关地址见 `src/cloudbase-config.js`。源代码已准备 GitHub Pages 跨域接入；当前未发布前端。默认域名仅用于开发测试，正式销售应配置自有 API 域名，并确认套餐、备案和证书要求。本机公网 HTTPS 探测曾连接超时，不能把函数调用成功等同于默认域名公网连通已验收。

- `GET /api/health`：固定能力信息，不包含环境密钥、请求头或用户信息。
- `POST /api/auth/register`、`POST /api/auth/login`：用户名密码，成功返回 user/token/csrf。
- `GET /api/auth/session`：Bearer token，返回本人会话。
- `POST /api/auth/logout`、`POST /api/auth/password`：Bearer + X-CSRF-Token，校验 Origin。
- `GET /api/orders?offset=0`：仅本人，100 条一页，返回 nextOffset。
- `POST /api/orders`：服务端重新核价、校验设计和地址、按账号+requestId 幂等创建。订单与商品明细同一 PG 事务。
- `GET /api/orders/:id`、`GET /api/orders/:id/pack`：仅本人，越权统一404。
- `POST /api/orders/:id/actions`：取消未付款订单或已发货后确认收货；状态转换锁行。

微信、支付宝商户未开通，因此没有生产支付回调或模拟付款入口，pay 请求返回503，订单不会因此进入生产。完整退款、运营审核发货、独立凑批后台的数据同步与厂家交付仍需后续接入，不要把本地演示运营后台当作云端运营端。

## 构建、迁移、部署

1. `node tools/build-cloudbase.mjs`，只生成后端包到 output/cloudbase-release，不含静态页面或素材。
2. 核对环境及表结构，查看 `cloudbase/migrations`；先 `tcb db pg migration up --dry-run`，再执行 migration up。迁移版本与远端历史一一对应，不重复推送已应用版本。
3. 服务密钥由 `tcb env apikey create` 创建；保存到 output/cloudbase-api-key.private.json 后由 prepare-cloudbase-release.mjs 生成私密部署配置。
4. 在 output/cloudbase-release 运行 `tcb fn deploy commerce-api --path /commerce-api --install-dependency false`。更新必须带 --force。不要运行 hosting deploy。
5. `tools/import-cloudbase.mjs` 只导入正式本地目录，重复 ID 不覆盖远端；核对导入数量。
6. `tools/verify-cloudbase-backend.mjs` 通过 CLI 调用验证注册、会话、事务建单、核价、跨账号隔离、取消和退出；只清理本轮生成的临时账号订单，不删除迁移数据。脚本不会打印会话 token。

本次已通过上述云函数调用验收。浏览器及 GitHub Pages 的线上检查未执行。
