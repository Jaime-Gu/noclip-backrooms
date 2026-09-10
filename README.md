# NOCLIP — 后室恐怖游戏

一个基于自研射线投射（raycaster）引擎的后室（Backrooms）恐怖生存游戏：在无限生成的黄色房间中游荡，管理理智值（Sanity），收集文件与杏仁水，找到出口。

## 内容

- `NOCLIP.html` — 单文件独立版本，浏览器直接打开即玩
- `app/` — 完整源码（React 18 + TypeScript + Vite 7 + Tailwind）

## 玩法特性

- 无限程序化生成地图（16×16 chunk，按种子生成）
- 经典 Wolfenstein 式 raycaster 渲染（480×270 内部分辨率，像素化放大）
- 理智值系统：游荡与随机事件消耗理智，杏仁水可恢复
- 程序化纹理与音效（无外部素材）
- 文档收集、出口逃脱、多周目重开（run number 参与 re-seed）
- 支持触屏操作

## 本地开发

```bash
cd app
npm install
npm run dev
```

构建：`npm run build`（使用 vite-plugin-singlefile 产出单文件版本）。

## License

MIT，详见 [LICENSE](LICENSE)。
