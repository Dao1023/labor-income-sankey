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
2. 极小节点（<¥2 或 <1.2%）不画标签，避免两行标签互相压字；其金额仍可从 tooltip 读到。
   低于 `max(20 元, 1.2% × 口径基数)` 的**落点**不单独建节点，统一并进「其他扣缴」
   （单位视角的统筹池除外——工伤 0.26% 也得看得见）。

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

## 8. 评审后修订（第 2 轮）

| # | 问题 | 处理 |
|---|------|------|
| 1 | 公式带压在标题/meta 上，像报错信息 | 移到图下方、滑杆上方：`#formulaLine`，13px、`--muted`、左对齐图区（`padding:0 26px`），单行；数字仍全部来自 `r.taxBase / r.taxRate / r.siBase / r.hfRate` 与 `LaborEngine.tables` |
| 2 | 个人视角出现统筹池节点 | 个人视角去向只保留 现金 / 公积金账户 / 养老个人账户 / 医疗个人账户 / 年金账户 / 国库 /（有值）失业统筹；养老统筹仅灵活就业自缴时出现，标签「养老统筹（自缴 12%）」；医疗统筹、工伤统筹只在单位成本视角 |
| 3 | 同列顺序不可控 | 改为颜色编码：到手 `#16a34a`、个人账户 `#0ea5e9`、统筹 `#8b5cf6`、国库 `#dc2626`、中介 `#94a3b8`；图下一行图例（按图上真实出现的颜色动态生成）；tooltip 每项加归属（归你·锁定 / 进统筹池换待遇 / 进国库 / 平台中介拿走） |
| 4 | 细节点漂浮无标签 | 阈值 1.2% 不画标签保留；低于 `max(20, 1.2%×基数)` 的落点并进「其他扣缴」，标签贴底放置，不再有裸色块 |
| 5 | 单位侧四条细流交叉 | 单位侧抽象成 3 条：`单位社保 25.8%`（养老+医疗+失业+工伤合成一条）、`单位公积金 12%`、`单位年金 8%`（有值才出）；五险明细进 tooltip。单位支干固定在底部：单位附加成本（第 1 列）→ 单位缴纳（第 2 列）→ 单位分项（第 3 列）→ 统筹池（第 4 列） |

重拍：`shots/final-personal.png`（大厂·个人）、`shots/final-gov.png`（公务员·个人）、`shots/final-cost.png`（大厂·单位成本）。
三张均为 1600×1050 私有 headless 实例静态首屏。

修订后数据校验：`node tools/check.mjs` → `检查 720 组，最大闭合误差 0.0000 元` / `✅ 全部通过`；
桥接层 360 张图（30 案例 × 6 城 × 2 视角）逐节点 in==out 最大偏差 `0.0000`，无重名节点，
个人视角无医疗/工伤统筹（自缴养老统筹除外），去向节点 100% 带归属文案。

## 9. 第二轮评审收尾（3 项）+ 重构后实机复测

收尾：

1. 「税前应发」节点在占比开启时不再显示占比行（恒为 100%，无信息量），只留名称 + 金额。
2. 个人视角里被并进来的落点，若只有失业险一项，节点直接叫「失业统筹」（紫色，共担池语义），
   不再笼统写「其他扣缴」；确实混合了多项时才叫「其他扣缴」（灰色）。
3. 图例按图上真实出现的颜色动态生成：`renderLegend(g)` 收集节点 `itemStyle.color`，
   个人视角没有平台/中介时灰色项不出现；单位成本视角出现统筹池时才显示紫色「共担池」。

实机复测（私有 headless 实例，`--user-data-dir=%TEMP%\li-shot`，端口 9333，CDP 真实事件，未碰用户浏览器）：

```
rail  6 案例点击 → 标题/hash/节点文字全部变化
  互联网大厂  → #                (60 paths)
  公务员      → #c=gov-civil     (63)
  众包骑手    → #c=rider         (28)
  劳务派遣    → #c=dispatch      (43)
  自由设计师  → #c=freelance     (35)
  日结零工    → #c=daylabor      (11)
滑杆  mousePressed + 6×mouseMoved + mouseReleased
  ¥3,500 → ¥4,250 → ¥5,000 → ¥5,750 → ¥6,500 → ¥7,250   (6 个不同值)
  松手后仍为 ¥7,250（不回弹）；.tl-dot.near = 1；.tl-dot = 21；hash #c=daylabor&g=7250
节点  DataIndex 0（基本工资）真实点击
  点击前 dimmed=0 → 点击后 dimmed=58（adjacency 生效，click 事件 dataType=node）
  点空白 dimmed=0（downplay 恢复）
导出  按钮真实点击（Browser.setDownloadBehavior 拦截）
  labor_income_daylabor_sh_7250.png  3200×2072（1600×900 @2x + 96 页眉 + 40 水印）
  labor_income_daylabor_sh_7250.svg  4,379 bytes
window.onerror 计数 = 0
```

`node tools/check.mjs` → `检查 720 组，最大闭合误差 0.0000 元` / `✅ 全部通过`；
`node tools/build.mjs` → `inlined 5 scripts`，`dist/labor-income.html` 零外链。

截图（本轮）：`shots/final-personal.png`（大厂·个人）、`shots/final-gov.png`（公务员·个人）、
`shots/final-cost.png`（大厂·单位成本）、`shots/final-pct.png`（大厂·个人·占比开启）、
`shots/final-dist.png`（单文件包首屏）。
