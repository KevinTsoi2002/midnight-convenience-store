# 凌晨 2:17 的便利店

一款约 3～5 分钟的叙事微游戏。你是深夜便利店的店员，根据三位顾客的台词和状态，从货架上挑选三件商品，为他们装袋。

## 试玩

[在线试玩](https://kevintsoi2002.github.io/midnight-convenience-store/midnight-convenience-store.html)

也可以下载 `midnight-convenience-store.html`，用浏览器打开。游戏支持离线运行，无需安装依赖或启动服务。

## 作品内容

- 三位顾客、九件商品、三种结局。
- 顾客反馈、灯光变化和夜班小票随选择变化。
- 内嵌 SVG 场景与商品插画，使用 Web Audio API 合成音效。
- 支持桌面和移动端，以及键盘操作、减少动态效果和音频不可用时的降级。

游戏的 HTML、CSS、JavaScript、插画和音效逻辑均保存在一个 HTML 文件中。运行时不依赖 CDN、外部字体、图片、后端或远程 API。

## 开发与验证

测试依赖 Node.js 20 或更新版本，以及已安装的 Microsoft Edge。Playwright 只用于开发验证，不参与游戏运行。

```sh
npm ci
npm test
```

测试覆盖商品选择限制、顾客流程、三种结局、重玩、音频降级、键盘焦点、离线运行，以及 320～1440px 的响应式布局。测试截图写入 `output/playwright/`，不提交到仓库。

- 游戏文件：[`midnight-convenience-store.html`](midnight-convenience-store.html)
- 回归测试：[`tests/midnight-convenience-store.spec.mjs`](tests/midnight-convenience-store.spec.mjs)
- 设计规格：[`docs/superpowers/specs/2026-10-08-midnight-convenience-store-design.md`](docs/superpowers/specs/2026-10-08-midnight-convenience-store-design.md)
- 实现计划与记录：[`docs/superpowers/plans/2026-10-08-midnight-convenience-store.md`](docs/superpowers/plans/2026-10-08-midnight-convenience-store.md)
