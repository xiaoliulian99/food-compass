# 美食指南针

这是一个纯前端 PWA。店铺、设置与用餐记录保存在当前手机浏览器中，因此现阶段不需要购买服务器或数据库。

## 本地运行

```bash
npm install
npm run dev
```

## 发布到手机

执行 `npm run build` 后，将 `dist` 目录部署到任意支持 HTTPS 的静态托管平台。Cloudflare Pages、Vercel、Netlify 均可免费托管；构建命令填写 `npm run build`，输出目录填写 `dist`。

- Android：用 Chrome 打开发布网址，点击页面中的“安装”。
- iPhone：用 Safari 打开发布网址，点击“安装”，再按“分享 → 添加到主屏幕 → 添加”。

必须使用稳定的 HTTPS 地址。电脑的 `localhost` 只能用于本机测试，手机不能把电脑的 `localhost` 当作应用地址。

## 数据边界

当前数据只保存在安装该应用的手机上。若未来需要多手机同步、账号登录或云端共享菜单，再增加后端服务即可。
