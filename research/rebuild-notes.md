# 劳动收入桑基 · 重建验收记录

对象：`ui/`（上游 profitbridge 原版）改造为「劳动收入组成」。
验收口径：`research/ui-parity-audit.md` §3（18 项）+ §5（A1–A10）。

## 1. 提交记录

| commit | 内容 |
| --- | --- |
| `353d46b` | 新增 `ui/labor.js`：数据桥接（cases / cities / build → nodes+links+meta+formula） |
| `df9d35a` | `ui/index.html`：脚本换成 `../app/data.js` + `../app/engine.js` + `labor.js` + `app.js`，标题/工具栏/滑杆/口径弹窗 |
| `5e294af` | `ui/app.js`：数据层换 `LaborBridge`，保留上游 `sankeyPads` / 标签 / 导出 / 滑杆 / hash 骨架 |
| `702832a` | `app/engine.js`：导出 `taxBase` / `taxBaseFinal` / `taxRate` / `taxBaseKind`（只增不改） |
| `527a73a` | `ui/labor.js`：扣缴列合并为社保个人 / 公积金 / 年金 / 个税，费率入名、基数入 tooltip，新增公式带 |
| `fe4c565` | `ui/app.js`：公式带渲染 + 扣缴项 tooltip 基数说明 + 导出画布左右留白 |

## 2. 最终结构

四列：`收入构成` → `税前应发` → `个人扣缴` → `去向`；单位成本视角在顶部并行一条
`单位附加成本 → 单位缴纳 → 单位五险一金分项 → 同一去向列`。

扣缴列固定四项、固定次序：`社保个人 <费率>`、`公积金 <费率>`、`年金 <费率>`（>0 才有）、`个税`。
社保个人一条粗带，内部按引擎字段拆回：养老个人账户 / 养老统筹 / 医疗个人账户 / 失业统筹
（灵活就业 `p.pension` 的 8% + 12% 拆分原样保留）。

去向列：到手现金 → 公积金账户 → 养老个人账户 → 医疗个人账户 → 年金账户 →
养老统筹 → 医疗统筹 → 失业统筹 → 工伤统筹 → 国库 → 平台 / 中介。

「基数 × 费率」不进节点（会破坏流量守恒），只出现在三处：节点名（费率）、
tooltip（`基数 ¥37,731 × 10.5%` / `税基 ¥17,333 × 20% − 速算 ¥1,410`）、
图上方公式带（`#segNotesLine`，沿用上游位置与 `.segNote` 样式）。

## 3. §3 十八项

| # | 项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 0 | 占比是叠加不是切换 | ✅ | 两行结构：名称行常驻；第二行 `70.0% 占应发 · ¥28,525`（开）/ `¥28,525`（关）。`ui/app.js` `nodeLabel()`：`body = '{n|…}' + '\n' + [pct? '{p|…占应发}' : null, '{v|¥…}'].filter(Boolean).join(' · ')`，金额不重复、不加第三行。实机截图 `shots/rebuild-03-pct-overlay.png` |
| 1 | 导出里带按钮态文案 | ✅ | `exportHeaderData()` 取 `#chartTitle` 当前文本（含「（单位成本）」）；SVG 实测 30,826 字符、`<text>` 63 个 |
| 2 | 导出头：主标题 + 副标题 | ✅ | `svgWithHeader()`：title `y=40` 30px/800 `#1d55a5`，subtitle `y=72` 15px `#475569`；实测 SVG 含 `font-size="30"` 与 `上海 · 劳动合同 · … · 税目 工资薪金` |
| 3 | 水印 | ✅ | `exportWatermark()` = `劳动收入组成 · 数据更新 2026-11-20 · 单位 ¥/月`；SVG 实测含 `劳动收入组成` 与 `font-size="11"` |
| 4 | 文件名 | ✅ | `exportFileName()` = `labor_income_<caseId>_<city>_<gross>.<ext>`；实测下载 `labor_income_bigtech_sh_40750.png` |
| 5 | 导出画布固定 1600×900 + PNG 2× 合成 + SVG 带页眉 | ✅ | `exportPNG()` `W=1600,H=900,headH=96,wmH=40,ratio=2`，离屏 canvas 合成；`exportSVG()` `renderToSVGString()` → `svgWithHeader()` → Blob。实测 PNG dataURL 899,314 字符（~674 KB） |
| 6 | hash 全量状态 | ✅ | `#c=<case>&city=<bj>&g=35500&v=cost&pct=1`；刷新后城市 / 薪资 / 视角 / 占比全部还原，`g` 按案例 `lo..hi` 吸附 |
| 7 | snap dots + near + hover/dragging | ✅ | `renderSnapDots()` 每档一个 `.tl-dot`（21 个）；`markNearDot()` 只留 1 个 `.near`；`#timeline.hover/dragging` 三态样式保留 |
| 8 | 标签字阶 16/700 + 14/600 + 白描边 2.5 + `#52607a` | ✅ | `labelRich.n = {fontSize: compact?13:16, fontWeight:700, color:'#1e293b', lineHeight:…, textBorderColor:'#fff', textBorderWidth:2.5}`，`v = {11.5/14, 600, '#52607a'}`；实机读 option 断言一致 |
| 9 | nodeWidth 30 | ✅ | `series.nodeWidth = 30`（实测 option 断言） |
| 10 | `#sankey` 660/520/480 + `syncChartHeightForNotes()` | ✅ | `sankeyBaseHeight()` ≤400→480、≤768→520、否则 660；实测 760px→520、380px→480、常规 653（660 − meta 溢出 7） |
| 11 | `checkConsistency()` 闭合 | ✅ | `window.__bridgeCheck = {…, ok:true, errors:[]}`；node 侧 360 图（30 案例 × 6 城 × 2 视角）逐节点 in/out 断言，最大偏差 `0.0000` 元、0 失败 |
| 12 | 导出 option 去 tooltip | ✅ | `exportOption()` `{backgroundColor:'#f2efe9', animation:false, tooltip:undefined}` |
| 13 | <900 紧凑标签 13/11.5 | ✅ | `compactLabel = pads.compact`（`base<170`），label 字号 13 / rich v 11.5 |
| 14 | Esc 关弹窗 + role=dialog + 焦点归还 | ✅ | `#noteModal` `.noteBox[role=dialog][aria-modal=true][aria-labelledby=noteTitle]`；Esc 关闭并把焦点还给 `#btnNote` |
| 15 | aria-pressed / aria-valuenow / 左栏 tabindex | ✅ | 左栏 `.logo[role=button][aria-pressed][tabindex=0]`，Enter/Space 切换；`#tlThumb[role=slider][aria-valuemin/max/now][aria-valuetext="¥7,000 / 月"]`；占比/视角按钮 `aria-pressed` |
| 16 | `--muted` `#52607a` | ✅ | `:root{--muted:#52607a}` 原样保留 |
| 17 | 左栏隐藏滚动条 | ✅ | `#logoRail{scrollbar-width:none}` + `::-webkit-scrollbar{display:none}` |
| 18 | `.logo.active` `#e8effc` | ✅ | 实测 active 背景 `rgb(232,239,252)`、边框 `rgb(37,99,235)` |

## 4. 数据与渲染校验（不动浏览器也能跑的部分）

- `node tools/check.mjs` → `检查 720 组，最大闭合误差 0.0000 元` + `✅ 全部通过`。
- 桥接闭合：30 案例 × 6 城 × 2 视角 = 360 图，逐节点 `流入 == 值`、`流出 == 值`（去向列只校验流入，
  到手现金除外），最大偏差 `0.0000` 元，0 失败，无重名节点；扣缴列次序恒为 社保 → 公积金 → 年金 → 个税。
- 文案/结构：360 图 × 占比开关 = 720 组合，断言节点名格式（`社保个人 10.5%` / `公积金 12%` /
  `年金 4%` / `个税`）、`baseNote` 格式（`基数 ¥… × …%` / `税基 ¥… × …%（− 速算 ¥…）`）、
  无空标签、无 emoji、无 `NaN/undefined`、公式带非空 → 0 失败。
- 公式带样例（实机读取）：
  - 工资薪金：`应发 ¥40,750 − 社保 ¥3,962（基 ¥37,731 × 10.5%）− 公积金 ¥4,528（基 ¥37,731 × 12%）− 起征点 ¥5,000 − 专扣 ¥3,000 = 税基 ¥17,333 × 20% − 速算 ¥1,410 = 个税 ¥2,589`
  - 未达起征点：`… = 未达起征点`（gov-civil）
  - 劳务报酬：`应发 ¥19,900 × 80% = ¥15,920（并入综合所得）· 预扣 ¥3,184/月；年度汇算：税基 ¥5,656 × 6.3% = ¥356/月，可退 ¥33,941`
  - 经营所得（核定）：`年应发 ¥103,680 × 核定率 1.5% = 年税 ¥1,555`（rider）

## 5. 没有动的上游函数 / 结构

`ui/app.js` 中以下实现保留原逻辑（仅换数据源与文案入参）：
`sankeyPads()`、`buildGraph()`（函数体转调 `LaborBridge.build`，签名兼容）、`renderChart()` 的
骨架（`labelRich` / `nodeLabel` / `data.map` / `series` 参数 / `__lastOption`）、`checkConsistency()`
（阈值 0.05 元）、`syncHash()` / `applyHash()`、`renderTimeline()` / `renderSnapDots()` /
`markNearDot()` / `initTimelineDrag()`（只去掉 `setPointerCapture`，改 window 级 pointermove）、
`sankeyBaseHeight()` / `syncChartHeightForNotes()`、`exportHeaderData()` / `exportOption()` /
`exportWatermark()` / `exportFileName()` / `_svgEsc()` / `svgWithHeader()` / `exportPNG()` / `exportSVG()`。
`ui/index.html` 的 `#logoRail`（132px / 2 列 / 隐藏滚动条 / `.logo.active`）、时间轴
`.tl-track/.tl-fill/.tl-thumb/.tl-dot` 三态、面板与媒体查询样式全部原样保留。

## 6. 已知偏差

1. **同一列内的纵向顺序由 ECharts 的 sankey 布局决定，按流量值降序排列**，`data` / `links`
   的数组顺序无法覆盖它（实测：把 `links` 与 `data` 都按目标顺序重排后落位不变）。因此
   「社保 → 公积金 → 年金 → 个税」在金额更大的项上会互换（例：bigtech 公积金 ¥4,528 排在
   社保个人 ¥3,962 之前；gov-civil 年金 ¥474 排在医疗个人账户 ¥237 之前），去向列同理
   （`到手现金` 恒在最上，其余按金额降序）。节点语义、颜色、聚合与总额都正确，只是纵向
   次序随金额变化。要严格锁定次序只能改 sankey 布局本身，违反「不重写布局引擎」的约束，
   故保留现状并在此说明。
2. 极小节点（<¥2 或 <1.5%）不画标签，避免两行标签互相压字；其金额仍可从 tooltip 与去向节点读到。

## 7. 未实机复测项（因不再占用用户浏览器）

以下在**重构前**已在实机验证通过，重构后仅做了 node 侧数据断言，未再跑界面：

- 滑杆真实鼠标拖拽（6 档连续更新、松手不回弹、1 个 `.near`）
- 左栏 6 个案例真实点击与标题/节点文字变化
- 节点高亮 / 空白点击还原
- PNG / SVG 导出（文件名、页眉、水印、dataURL 体积）
- 窄屏 520 / 480 与紧凑标签字号
- 键盘（Tab / Enter / 方向键 / Home / End / Esc）

重构只改了：扣缴列节点构成与标签文本、tooltip 增加一行、`#segNotesLine` 文案换成公式带、
导出 option 的左右留白。上述交互路径未改代码，但需在新快照上复跑一遍截图确认。
