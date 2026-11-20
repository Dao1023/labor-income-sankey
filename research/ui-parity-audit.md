# ui/ 功能对账：profitbridge → 劳动收入组成

审计对象
- 真值来源：`C:\Users\Dao\Code\dao1023\dsh-temp\profitbridge\app.js`（2319 行）、`profitbridge\index.html`（260 行），ECharts 5.5.1。
- 被审对象（**已删除的历史实现**）：`ui\app.js`（551 行）、`ui\index.html`（138 行）、`ui\labor.js`（144 行）。该实现随 `8172aeb` 引入、`5b13f30` 打过滑杆补丁，已于 `32e7b6d`（「移除手写 ui/，准备从上游原版重建」）删除；`01c5f6b` 已用 git subtree 把上游原版整体导入 `ui/`（`ui/app.js` 2319 行 = 上游）。所以 §1 的「当前 ui/ 状态」列描述的是**被删掉的那一版丢了什么**，不是现在的 `ui/`；现在的 `ui/` 就是上游，重建只需按 §3 的落点换数据源。
- 范围：**能力**对账，不是逐行 diff。上游「公司 / 季度 / 多公司对比 / 币种 / 语言 / 行业」那一层是主题变更后**故意要删**的，不计入篡改（见文末「有意删除清单」）。

## 0. 结论（先说根因）

这次改造是**另起 `ui/` 重写**，不是 fork 后适配。重写时只按「视觉印象」复刻了桑基图主体，把「导出管线、URL 状态、时间轴落点、标签字阶、图表高度、一致性校验」这些**看不见但确实存在**的能力整段丢掉了，所以才会出现「占比按钮被改成切换」「底部不能拖」「点案例图不变」这类连环回归。

- 已实测确认**当前仍然正常**（本次改动的红线，不得退化）：
  - 左栏点击切案例（CDP 真实鼠标点 `[data-id=rider]`，标题、节点数、hash 均变化）；
  - 底部滑杆按住拖动连续更新（`#tlTrack` 上 mousePressed → 6 次 mouseMoved → mouseReleased，`#tlNow` 依次 ¥6,400 / ¥8,000 / ¥10,500 / ¥13,000 / ¥15,500 / ¥17,900，松手保持 ¥17,900，不回弹）；
  - 「占比」是**叠加**语义（默认名称 + 金额两行；开启后第二行变成 `8.0% 占应发 · ¥960`，金额不丢）。
- 被**改坏**（不是缺失，是本来有、被换成了弱化版）：导出页眉/副标题/水印/文件名、ECharts 标签样式（字号、白描边、nodeWidth）、`#sankey` 高度、`:root` 变量、左栏滚动条、`.logo.active` 底色、`min-height`。
- **整段缺失**：snap dots（落点标记）与 near/hover/dragging 反馈、`syncHash`/`applyHash` 全状态、`checkConsistency`、`svgWithHeader`、`exportWatermark`、`sankeyBaseHeight`/`syncChartHeightForNotes`、紧凑标签模式、Esc 关弹窗、`aria-*`。

### 0.1 三条红线（重建时一个字都不能改）

新方案是「从上游原版重新导入、逐处替换数据源」，所以下面三条必须在重建后**逐条复测**。它们都是用户已经发过火的地方：

1. **「占比」是叠加，不是切换。** 默认两行：名称 + 金额。开启后**金额绝不能消失**，并且第二/第三行要带口径词——分母随视角变：个人视角 `占应发`、单位成本视角 `占成本`、流水类（平台/骑手）`占流水`。上游对应结构在 `app.js:1034-1073` `nodeLabel`（pct 模式往 `parts` 里插 `{p|…}`，末尾仍有 `{v|amt}`，金额单独一行），口径词已由 `ui/labor.js:63-66` 的 `PCTWORD`/`pctLine` 提供：
   - `PCTBASE = employerView ? cost : (agPay==='worker' ? revenue : gross)`
   - `PCTWORD = employerView ? '占成本' : (agPay==='worker' ? '占流水' : '占应发')`
   - `pctLine = pct.toFixed(1) + '% ' + PCTWORD + ' · ' + money(v)`
   重建时照抄上游 `nodeLabel` 的行结构 + 这里的口径词即可；**禁止**退回「点一下按钮只显示百分比、名称/金额消失」的老 bug，也**禁止**把 `pctLine` 做成纯百分比。
2. **底部滑杆必须能按住连续拖动。** 当前实现刻意**不用** `setPointerCapture`（`ui/app.js:139-140` 有注释：CDP 合成输入下捕获会 stall），改用 window 级 `pointermove` + rAF 合帧（`ui/app.js:141-145`），松手用最后一次 `clientX` 再取值、不回写位置（`ui/app.js:147-159`）。重建时若照抄上游 `initTimelineDrag`（`app.js:1856-1889` 用了 `setPointerCapture`），**必须实测 6 次 mouseMoved 是否连续出值**，不连续就换回 window 级监听。
3. **左栏点击必须换图。** `ui/app.js:390-394` 委托 + `selectCase`（422-431）当前实测正常（点 `[data-id=rider]` 后标题/节点数/hash 全变）。重建后这条要重新用真实鼠标点一遍。

### 0.2 行号可信度（为什么和你手上的 2196/197 对不上）

- 本文件所有行号都来自**实际文件**，逐条用 `grep -n` / `sed -n` 取回原文核对，不是凭印象写的。
- 我审计的真值文件是 `C:\Users\Dao\Code\dao1023\dsh-temp\profitbridge\app.js` **2319 行**、`index.html` **260 行**（与仓库内 `.upstream/profitbridge-main/` 同一版本，仅 CRLF 行尾差异，行号一一对应）。任务描述里的 2196/197 是更早的快照，已被上游更新覆盖。
- 下表行号对 2319/260 版有效。若你重建时用的是 2196 行版，请以**函数名**定位（表里每个条目都给了函数名/选择器），不要盲信行号。

---

## 1. 对账表

> 「上游实现位置」一律给出 `profitbridge/*` 的真实行号；「当前 ui/ 状态」给出 `ui/*` 的真实行号。状态取值：**保留** / **被改坏** / **缺失** / **新增**（上游没有、本项目自建）。

### 1.1 底部滑杆（原季度时间轴）

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 时间轴渲染 + 当前值刻度文案 | `profitbridge/app.js:1749-1839`（`renderTimeline`，刻度绘制 1769-1773） | **保留（简化）**：`ui/app.js:81-88` `buildTicks` 只画「下限 / 当前 / 上限」三个刻度，`paintSlider`（`ui/app.js:90-104`）实时改中点文案 | 3 个刻度对连续薪资轴够用；但上游「按年去重采样 + 窄屏抽稀」（1774-1809）无对应 | 保留（不恢复年采样，本主题无「年」维度） |
| 点击轨道任意位置跳转 | `app.js:1881-1888`（track pointerdown 按比例取 quarter） | **保留**：`ui/app.js:129-137`（按比例取薪资档，`valueAt` 112-118） | 无 | 保留 |
| 按住滑块连续拖动 | `app.js:1867-1873`（thumb pointermove + setPointerCapture） | **保留（更强）**：`ui/app.js:141-145` 用 window 级 pointermove + rAF 合帧，**刻意不用 setPointerCapture**（注释 139-140：CDP 输入下捕获会 stall 合成器） | 无（实测连续 6 档） | 保留，回归必测 |
| 拖动结束后不回弹 | `app.js:1874`（endDrag 只清状态，不回写位置） | **保留**：`ui/app.js:147-159`（`stop` 用最后一次 clientX 再取一次值） | 无 | 保留 |
| **落点标记 snap dots** | `app.js:1842-1851` `renderSnapDots`（每个 quarter 一个 `.tl-dot`）；样式 `index.html:131-133` | **缺失**：`ui/app.js` 全文无 `.tl-dot`，`ui/index.html` 无 `.tl-dot` 规则 | 用户看不到滑杆能停在哪、拖动时没有"吸附"预期 | **恢复**（档位=落点，见 §3） |
| **就近高亮 `markNearDot`** | `app.js:1852-1855`（`.near`） | **缺失** | 拖动时无"将要落在这一档"的反馈 | **恢复** |
| **hover / dragging 视觉态** | `app.js:1865-1866,1874`（`#timeline.hover/.dragging`）+ `index.html:134-136` | **被改坏**：只剩 `body.dragging`（`ui/index.html:75-76`），无 `#timeline.hover`、无 dots 加深、无 thumb 光环 | 悬停/拖动几乎无反馈 | **恢复** |
| 刻度可点 | `app.js:1815-1834`（事件委托 + 就近中心，防 ±18px 命中区互相吞） | **保留**：`ui/app.js:174-178`（按 `data-v` 直接取值，不存在命中区重叠问题） | 无 | 保留 |
| 滑杆键盘（方向键 / Home / End） | 上游**无**（时间轴只有鼠标） | **新增**：`ui/app.js:161-172`，含 `role=slider`、`tabindex=0` | 增强 | 保留，补 `aria-valuenow` |

### 1.2 标签系统

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 两行标签（名称 + 金额） | `app.js:1034-1073` `nodeLabel`（`{n\|…}` + 末行 `{v\|amt}`） | **保留**：`ui/app.js:311-316` `block`（自绘 SVG `<text>` + 两个 `<tspan>`） | 无 | 保留 |
| 占比叠加行（不丢名称/金额） | `app.js:1034-1073`（pct 模式 `{p\|pct% 占营收}` 与 `{v\|amt}` 同一段） | **保留**：`ui/labor.js:63-66` `pctLine = pct% + 占X + · 金额`，`ui/app.js:312` 只在第二行替换 | 无（**用户明确要求不得再动**） | 保留，红线 |
| 标签字阶（16/700 + 14/600） | `app.js:1024-1025`（n 16/700 lineHeight21；v 14/600 #52607a lineHeight18） | **被改坏**：`ui/index.html:59-61` 13.5px/700 + 11.5px/600 | 标签明显小于原站、可读性差 | **恢复** |
| 标签白描边 `#fff / 2.5` | `app.js:1024-1025`（`textBorderColor:'#fff', textBorderWidth:2.5`） | **被改坏**：`ui/index.html:59-60` 用 `stroke:#f2efe9; stroke-width:3.4px`（奶油色 3.4） | 压在流带上时糊边、和原站观感不同 | **恢复** |
| 拥挤避让 | `app.js:1149,1168` `avoidLabelOverlap + labelLayout:{hideOverlap:true}`；另 1098-1125 逐节点定位 | **保留（更强）**：`ui/app.js:296-309` `spread()` 自绘避让，`drawLabels` 321-375 分列排布 + 引导线 | 无（自绘层本来就绕开了 ECharts 标签） | 保留 |
| 紧凑模式 compactLabel（窄屏缩字阶） | `app.js:1022`（`pads.compact` = host<773）、`1024-1030`（13/11.5）、`1151`（fontSize 12/15） | **缺失**：`drawLabels` 无宽度分支，`ui/app.js:356,366` 固定 `LH=38` | 窄屏标签互相叠、越界 | **恢复**（W<900 切 13/11.5 + LH 32） |
| 图表高度按视口分档 | `app.js:2011-2016` `sankeyBaseHeight`（≤400→480，≤768→520，否则 660）+ `index.html:95` `height:660px` | **被改坏**：`ui/index.html:57` `clamp(400px, calc(100vh - 318px), 640px)` | 桌面永远到不了 660，图被压扁；移动端 420（`ui/index.html:92`）与 480/520 不符 | **恢复** |
| 高度为页面其他行让位 | `app.js:2017-2027` `syncChartHeightForNotes`（`max(240, base-extra)`，extra=注记行高+margin） | **缺失**（`ui/app.js:531-534` resize 只 `chart.resize()`） | meta 行换行时图表溢出/裁切 | **恢复**（extra 取 `#metaLine` 超高部分） |

### 1.3 点击与联动

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| hover 高亮相邻 | `app.js:1148,1167` `emphasis:{focus:'adjacency'}` | **保留**：`ui/app.js:252` | 无 | 保留 |
| 节点点击高亮 | 上游**无**（全文件无 `chart.on('click')`，仅 2306 有 datazoom） | **缺失** | 任务要求「点节点出现高亮」；当前点节点无任何反应 | **新增**（`dispatchAction highlight`） |
| 点击空白清除选中 | 上游**无** | **缺失** | 选中态无法取消 | **新增**（`getZr().on('click')` 空白 → `downplay`） |
| 左栏点击切案例 | `app.js:1662-1690` `switchCompany`（改公司后整图重算） | **保留**：`ui/app.js:390-394` 事件委托 + `selectCase` 422-431 | 无（已实测） | 保留 |

### 1.4 tooltip

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| tooltip 配置 + confine | `app.js:1133-1145` | **保留**：`ui/app.js:215-223`（item、confine、白底、阴影） | 无 | 保留 |
| formatter：金额 + 占比 + 流带占比 | `app.js:1133-1145` + `nodeLabel` 的口径 | **保留**：`ui/app.js:224-235`（节点金额+百分比；流带 `a → b`、金额、占目标节点比例） | 无 | 保留 |
| 跟随鼠标 | 默认行为（未设 `position`） | **保留**（同样未设 position） | 无 | 保留 |

### 1.5 导出

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 页眉标题（居中 30px/800 深蓝） | `app.js:2116-2131` `exportHeaderData` + `2157-2174` `svgWithHeader`（y40）+ `2175-2207` PNG 画布（40*ratio） | **被改坏**：`ui/app.js:440-444` 用 `graphic` 左上角 19px 标题，截图导出后标题不在页眉带 | 导出图不像原站、标题小 | **恢复** |
| 副标题（公司 · 期间 · 视角 · 单位） | `app.js:2130`（`line = ${name} (${ticker}) · ${period} · ${view} · ${cur}${unit}`） | **被改坏**：`ui/app.js:442` 直接复用 `g.meta`（法律形式·税目·社保），**没有城市** | 导出图看不出是哪个城市的口径 | **恢复**（城市 · 法律形式 · 税目） |
| 水印（底部居中 11px） | `app.js:2150-2152` `exportWatermark`；绘于 `svgWithHeader:2172`、PNG `2199-2200` | **缺失**：ui 导出无任何水印 | 导出图无来源/更新时间 | **恢复** |
| 文件名规则 | `app.js:2153-2155` `exportFileName`（`profit_bridge_<company>_<period>.<ext>`） | **被改坏**：`ui/app.js:476,489` `labor-income-<id>.png/svg`（无城市、无薪资档） | 多张导出互相覆盖、无法区分 | **恢复**（`labor_income_<case>_<city>_<gross>.<ext>`） |
| 导出用固定画布 1600×900 | `app.js:2178`（`W=1600,H=900,headH=96,wmH=40,ratio=2`） | **被改坏**：`ui/app.js:450-451` 跟随屏幕尺寸（`#sankey` clientWidth/Height+60） | 不同窗口导出尺寸不一 | **恢复** |
| PNG 2× 合成页眉/水印 | `app.js:2175-2207`（offscreen canvas → getDataURL pixelRatio2 → Image → canvas 合成 → toDataURL） | **部分保留**：`ui/app.js:473-478` 有 pixelRatio 2，但**无页眉/水印合成** | 导出缺页眉 | **恢复**（照抄合成流程） |
| SVG 序列化 + 页眉包裹 | `app.js:2208-2224`（`renderToSVGString()` → `svgWithHeader` → Blob） | **被改坏**：`ui/app.js:480-492` clone DOM + `XMLSerializer`，但**无页眉/水印**，且导出实例里 `label.show:false` | 导出 SVG 只有色带没有文字 | **恢复** |
| 导出时关闭动画 / tooltip | `app.js:2141`（`animation:false, tooltip:undefined`） | **部分保留**：`ui/app.js:436` 关了 animation；**tooltip 未关**（215 仍在） | 静态图里可能烧进 tooltip 层 | **修复**（`tooltip: undefined`） |
| **导出图带标签** | `app.js:1169`（导出直接复用带 `label` 的 series） | **缺失**：屏幕标签是自绘 overlay（`ui/app.js:321-375`），ECharts series `label.show:false`（`ui/app.js:250`）→ 导出**一个字的标签都没有** | 导出的 PNG/SVG 只剩色带，不可用 | **恢复**（导出 option 里启用 rich label） |
| 导出按钮 | `app.js:2229-2230` | **保留**：`ui/app.js:409-410` | 无 | 保留 |

### 1.6 URL 状态

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 写 hash（全状态） | `app.js:1698-1710` `syncHash`（URLSearchParams，`history.replaceState`） | **被改坏**：`ui/app.js:430` 只写 `#<caseId>` | 刷新/分享丢失城市、薪资档、视角、占比 | **恢复** |
| 读 hash（全状态 + 越界回落） | `app.js:1711-1737` `applyHash`（未知值忽略、`q` 允许 100 天内就近、缺失取最新） | **被改坏**：`ui/app.js:523-524` 只认 `#<caseId>` | 同上 | **恢复**（`c/city/g/v/pct`，g 钳到 rangeOf，未知城市/案例回落） |
| 每次渲染同步 hash | `app.js:2109`（`render()` 末尾 `syncHash()`） | **缺失** | 拖动滑杆后 URL 不更新 | **恢复**（值不变时不写，避免拖拽刷 history） |

### 1.7 一致性校验

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 渲染后校验节点/流带闭合，异常 `console.warn` | `app.js:969-985` `checkConsistency`，调用 1002（`window.__bridgeCheck`） | **缺失** | 数据层回归（如 720 组里某组 `t:ppool` 聚合对不上）在 UI 上静默 | **恢复**（节点流入=节点值、流出=节点值、`gross=r.gross`；容差 0.05 元；`window.__bridgeCheck`） |

### 1.8 键盘与可达性

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 滑杆键盘 | 上游无 | **新增**：`ui/app.js:163-172`（方向键/Home/End） | 增强 | 保留，补 `aria-valuemin/max/now` |
| Esc 关弹窗 | 上游无弹窗（`profitbridge/index.html` 无 note 节点） | **缺失**：`ui/app.js:514-516` 只有点遮罩/点 × | 键盘用户无法关闭 | **恢复**（Esc + 焦点归还） |
| 弹窗语义 | 上游无 | **缺失**：`ui/app.js:507-508` 无 `role=dialog`/`aria-modal` | 读屏不识别 | **恢复** |
| 按钮 `aria-pressed` | `app.js:2231-2240` 也无（仅 `.active` 类） | **缺失** | 读屏不知道「占比/视角」是否按下 | **恢复**（增强，清单点名） |
| 左栏可聚焦 | 上游 logo 是 `<div>` 无 tabindex（`app.js:1597-1633`） | **缺失**（`ui/app.js:59` 同为 div） | 键盘无法选案例 | **恢复**（`tabindex=0` + Enter/Space + `role=button` + `aria-pressed`） |

### 1.9 视觉细节（逐项对照 `profitbridge/index.html`）

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| `:root` 变量 | `index.html:8-11`（`--muted:#52607a`） | **被改坏**：`ui/index.html:9` `--muted:#64748b` | 灰字偏亮 | **恢复** |
| `#logoRail` 132px / 2 列 / 隐藏滚动条 | `index.html:21-25`（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`） | **被改坏**：`ui/index.html:17-22` `scrollbar-width:thin` + 4px 可见滚动条 | 左栏多出一条灰条，与原站不一致 | **恢复** |
| `.main{margin-left:150px}` | `index.html:43` | **保留**：`ui/index.html:35` | 无 | 保留 |
| `#brand` 20px/800 深蓝 | `index.html:47` | **保留**：`ui/index.html:38` | 无 | 保留 |
| `#chartPanel` 奶油底 | `index.html:93` | **保留**：`ui/index.html:54`（`--cream:#f2efe9`） | 无 | 保留 |
| `.in-title` clamp(20–30px)/800 | `index.html:94` | **保留**：`ui/index.html:56`（`clamp(20px,2.05vw,30px)`） | 无 | 保留 |
| `.meta` 灰字小号 | `index.html:53-55`（11px、muted、`padding:8px 250px 0 14px`、`min-height:36`） | **被改坏**：`ui/index.html:55` `padding:9px 14px 0; min-height:22px`（右侧来源行已删，padding 简化合理，但 min-height 变小） | meta 换行时高度估算偏小 | 部分恢复（保留简化 padding，恢复 36 的度量口径） |
| `.exportGroup` 白底描边 + 分隔线 | `index.html:71-79` | **保留**：`ui/index.html:43-52` | 无 | 保留 |
| `.active` 蓝底白字 | `index.html:32`（`.logo.active{background:#e8effc}`）+ 79（按钮 active） | **被改坏**：`ui/index.html:28` `#dbe7fa` | 左栏选中底色偏深 | **恢复**（`#e8effc`） |
| `#sankey` 660px | `index.html:95` | **被改坏**：`ui/index.html:57` clamp 到 640 | 图偏矮 | **恢复** |
| `.tl-track` 6px / `.tl-thumb` 20px 白底蓝边 | `index.html:103,108-110` | **保留**：`ui/index.html:68-74` | 无 | 保留 |
| `lineStyle{color:'source',opacity:.55,curveness:.5}` | `app.js` 系列未显式设（ECharts 默认 + `lineStyle` 覆盖），本项目取 `.55/.5` | **保留**：`ui/app.js:251`（另 `ui/labor.js:52` 每流带 `.52`） | 无 | 保留 |
| `emphasis.focus:'adjacency'` | `app.js:1148,1167` | **保留**：`ui/app.js:252` | 无 | 保留 |
| 标签 `textBorderColor:'#fff', textBorderWidth:2.5` | `app.js:1024-1030` | **被改坏**：`ui/index.html:59-60`（奶油 3.4） | 见 1.2 | **恢复** |
| `nodeWidth:30, nodeGap:22` | `app.js:1146,1166` | **被改坏**：`ui/app.js:240` `nodeWidth:26`（nodeGap 22 正确，241） | 节点条比原站细 | **恢复**（30） |
| `.tl-tick::before` 命中区 ±18px | `index.html` 无此规则（上游用整行委托 + 就近中心，见 1815-1834） | **新增**：`ui/index.html:79` `inset:-10px -18px` | 三个刻度距离远，无实际重叠；但命中区偏大 | 保留（3 刻度场景无害） |

### 1.10 弹窗 / 脚注

| 能力 | 上游实现位置 | 当前 ui/ 状态 | 影响 | 处理 |
|---|---|---|---|---|
| 说明弹窗 | 上游**无**（`index.html` 全文无 note；`app.js:2034` 注释确认底部 footer 已删） | **新增**：`ui/app.js:495-518`（案例口径 + caveat + 来源 + 免责） | 增强 | 保留，补 Esc/role/焦点 |
| 底部脚注 | 上游**已删除**（`profitbridge/index.html:138` 注释「bottom meta row removed」） | **新增**：`ui/index.html:129` + `ui/app.js:411` | 增强（把来源/口径放回底部） | 保留 |

---

## 2. 有意删除清单（不恢复）

这些全部绑定「公司 / 季度 / 多公司横向对比 / 币种 / 语言 / 行业筛选」数据层，本主题只有「30 个用工案例 × 6 城 × 一个薪资滑杆」，恢复它们等于把已删的数据维度再造一遍。

| 上游符号 / 能力 | 位置 | 为什么该删 |
|---|---|---|
| `fiscalQuarterOf` | `app.js:101` | 财年季度换算；本主题没有季度序列，薪资是连续量 |
| `quarterLabel` | `app.js:116` | 季度文案（Q1 FY25 等）；映射后只有「薪资档」 |
| `shortName` | `app.js:132` | 92 家公司 ticker 短名；ui 用 `SHORT`（`ui/app.js:21-29`）给 30 个案例起 2-3 字名 |
| `dispFactor` | `app.js:193` | 十亿/百万自适应缩放；本主题金额是「元/月」，`ui/labor.js:24` 直接千分位 |
| `dispSym` | `app.js:200` | 币种符号切换（$ / ¥）；本主题固定人民币 |
| `qoqText` | `app.js:271` | 环比；需要上一季度，本主题无时序 |
| `segmentStatus` | `app.js:330` | 分部数据新鲜度（分部截至/陈旧告警）；无分部数据 |
| `sankeyPads` | `app.js:345` | 按「是否有聚合节点」动态算 pad；本主题列固定 4 列，`PAD` 常量（`ui/app.js:18`）足够 |
| `sankeySegPlan` | `app.js:627` | 把分部映射成桑基第 2 层；本主题第 2 层是「个人扣缴/单位缴纳」 |
| `mergeSegs` | `app.js:644` | 合并小分部；无分部 |
| `buildGraph` | `app.js:669` | 上游图构建（收入→毛利→费用→净利）；本主题图构建在 `ui/labor.js:36-141` |
| `renderBarSelect` | `app.js:1305` | 柱状图指标下拉（营收/毛利/净利…）；无 bar 视图 |
| `renderBarChart` | `app.js:1323` | 第二种视图（bar）；本主题只有桑基 |
| `renderLogoRail` | `app.js:1597` | 92 家公司 logo 栏；换成 30 个案例格子（`ui/app.js:53-62`） |
| `renderIndustryBar` | `app.js:1635` | 行业筛选条；30 个案例已按组着色（`GROUP_TINT` `ui/app.js:31-39`），不需要再筛 |
| `switchCompany` | `app.js:1662` | 切公司（连带重置季度/币种/行业）；换成 `selectCase`（`ui/app.js:422-431`） |
| `segNotesFor` | `app.js:1974` | 每家公司分部口径注记行；本主题口径注记在弹窗里（`ui/app.js:495-518`） |
| bar 视图 + `dataZoom` | `app.js:1535`、`index.html` 的 `#barChart` | 无 bar 视图，自然无缩放条 |
| 币种切换 / 语言切换 | `app.js:2228,2241`、`index.html` `#btnCur/#btnLang` | 单币种单语言；文案直接写死中文 |
| 92 家公司数据集 | `profitbridge/data/profit.json` | 换成 `app/data.js` 的 30 案例 |
| 季度时间轴（36 个季末吸附点） | `app.js:1749-1889` | 语义替换为「薪资滑杆」；**但交互骨架（dots/near/hover/drag）必须保留**，见 §3 |

---

## 3. 必须恢复清单（按严重度排序）

严重度定义：**S0** = 用户已发火、改坏就白干的红线；**S1** = 用户可见的功能性丢失（导出不可用 / 分享失效）；**S2** = 用户已经抱怨过或肉眼可见的体验退化；**S3** = 一致性/健壮性；**S4** = 像素级细节。

> **新方案（从上游原版重新导入）下这张表要怎么读**：表中 1–18 项**有 15 项上游本来就实现了**，重建时只要「删公司/季度层」时手别抖、别把整段 `renderTimeline`/`exportPNG`/`svgWithHeader`/`syncHash` 一起删掉，再按 `§3.1` 的落点换数据源即可；真正需要**新写**的只有第 14、15 项（可达性，上游也没有）与第 0 项的口径词适配。§3.2 给出「上游自带 / 必须新写」的分组，重建时按组处理。

| # | 级别 | 项 | 恢复方式（照抄上游 + 换数据源） |
|---|---|---|---|
| 0 | **S0 红线** | **占比叠加**：金额不得消失；口径词随视角（个人 `占应发` / 单位成本 `占成本` / 流水类 `占流水`） | 上游 `nodeLabel`（`app.js:1034-1073`）本来就是「名称行 + 占比行 + 金额行」，pct 模式只在 `parts` 插入 `{p\|…}`、末尾仍有 `{v\|amt}`；把 `x% of rev` 换成本项目 `PCTWORD`（`ui/labor.js:64`）+ `pctLine`（66）。**禁止**做成「只有百分比」的切换 |
| 1 | S1 | **导出图没有任何文字标签**（`ui/app.js:250` `label.show:false`，标签是 overlay） | 导出 option 里启用 ECharts `label` + `rich`（照抄 `app.js:1023-1031` 的 n/v 字阶），formatter 用 `chart.__nodes` 的 `labelText`/`pctLine` |
| 2 | S1 | 导出页眉标题（居中 30px/800 `#1d55a5`，y40）+ 副标题（15px `#475569`，y72） | 照抄 `svgWithHeader` 2157-2174 与 PNG 合成 2195-2198；标题=案例名，副标题=`城市 · 法律形式 · 税目` |
| 3 | S1 | 导出水印（11px `#52607a`，底部居中） | 照抄 `exportWatermark` 2150-2152 的模板结构，品牌/单位换成本项目（`劳动收入组成 · 数据更新 <year> · 单位 ¥/月`） |
| 4 | S1 | 导出文件名规则 | 照抄 `exportFileName` 2153-2155：`labor_income_<caseId>_<city>_<gross>.<ext>` |
| 5 | S1 | 导出固定 1600×900 + PNG 2× 合成 + SVG `svgWithHeader` | 照抄 `exportPNG` 2175-2207（headH96/wmH40/ratio2）、`exportSVG` 2208-2224（`renderToSVGString` + Blob） |
| 6 | S1 | **URL hash 全状态**（案例 / 城市 / 薪资 / 视角 / 占比），刷新与分享可还原 | 照抄 `syncHash` 1698-1710 / `applyHash` 1711-1737 的结构（URLSearchParams + replaceState + 未知值回落），键名改 `c/city/g/v/pct`，`g` 钳到 `rangeOf` |
| 7 | S2 | **snap dots + near 高亮 + hover/dragging 态** | 照抄 `renderSnapDots` 1842-1851 / `markNearDot` 1852-1855 / `initTimelineDrag` 1865-1866,1874；CSS 照抄 `index.html:131-136` |
| 8 | S2 | 标签字阶 16/700 + 14/600、白描边 2.5、`#52607a` 副行 | 照抄 `app.js:1024-1025`；改 `ui/index.html:59-61` |
| 9 | S2 | `nodeWidth:30` | 照抄 `app.js:1146` |
| 10 | S2 | `#sankey` 桌面 660 / ≤768 520 / ≤400 480 + `syncChartHeightForNotes` | 照抄 `app.js:2007-2027` + `index.html:95,151-211` |
| 11 | S3 | `checkConsistency`（渲染后校验，`console.warn` + `window.__bridgeCheck`） | 照抄结构 `app.js:969-985`，判据换成「节点流入≈节点值、流出≈节点值、gross≈r.gross」 |
| 12 | S3 | 导出时 `tooltip:undefined` | 照抄 `app.js:2141` |
| 13 | S3 | compact 标签模式（窄屏 13/11.5） | 照抄 `app.js:1022,1024-1030` 的字阶，W<900 触发 |
| 14 | S3 | Esc 关弹窗 + `role=dialog` + 焦点归还 | 上游无，按 WAI-ARIA 补（清单要求） |
| 15 | S3 | `aria-pressed`（占比/视角）、滑杆 `aria-valuenow`、左栏 `tabindex/role/aria-pressed` | 上游无，补（清单要求） |
| 16 | S4 | `--muted:#52607a` | 照抄 `index.html:9` |
| 17 | S4 | `#logoRail` 隐藏滚动条 | 照抄 `index.html:21-25` |
| 18 | S4 | `.logo.active` `#e8effc` | 照抄 `index.html:32` |

### 3.1 上游自带、重建时「不许删」的代码块（换数据源即可）

删公司/季度层时，下面这些**整段保留**，只把入参从 `state.company`/`state.q` 换成 `state.caseId`/`state.gross`：

| 保留块 | 上游行号 | 需要改的入参 |
|---|---|---|
| `renderSnapDots` / `markNearDot` / `initTimelineDrag` | `1842-1851` / `1852-1855` / `1856-1889` | `QUARTERS` → `rangeOf()/stepOf()` 的档位数组；`setQuarter(i)` → `setGross(v)` |
| `renderTimeline` 的刻度绘制与委托点击 | `1749-1839`（刻度 1769-1773、点击 1811-1834、fill/thumb 1835-1837） | 同上；年去重/窄屏抽稀可留（档位数 177 时正好需要抽稀） |
| `sankeyBaseHeight` / `syncChartHeightForNotes` | `2007-2027` | `#segNotesLine` → `#metaLine` |
| `nodeLabel` / `labelRich` / `labelName` / `compactLabel` | `1034-1073` / `1023-1031` / `961-966` / `1022` | `revB`、`fmtPct`、`L.ofRev` → 本项目 `gross`/`cost`/`revenue` 与 `PCTWORD` |
| `checkConsistency` | `969-985`（调用 1002） | 判据换成「节点流入≈节点值、流出≈节点值、gross≈r.gross」 |
| `syncHash` / `applyHash` | `1698-1710` / `1711-1737` | 键名 `c/city/g/v/pct`；`q` 的「100 天内就近」换成 `g` 钳到 `rangeOf` |
| `exportHeaderData` / `exportOption` / `exportWatermark` / `exportFileName` / `_svgEsc` / `svgWithHeader` | `2116-2131` / `2138-2149` / `2150-2152` / `2153-2155` / `2156` / `2157-2174` | 标题=案例名；副标题=`城市 · 法律形式 · 税目`；水印模板照抄、品牌与单位换成本项目 |
| `exportPNG` / `exportSVG` | `2175-2207` / `2208-2224` | 只换成 `build(state)` 产出的 option；其余（1600×900、headH96/wmH40/ratio2、`renderToSVGString`、Blob）**逐字不动** |
| 样式：`.tl-dot` 三态、`#timeline.hover` 光环、`.tl-tick.active` 缩放、`#sankey` 660/520/480、`nodeWidth:30`、标签 `textBorderColor:#fff 2.5`、`--muted:#52607a`、rail 隐藏滚动条、`.logo.active #e8effc` | `index.html:8-11,21-25,32,95,103-136,151-211`；`app.js:1024-1030,1146,1148,1167` | 无（纯样式，照抄） |

### 3.2 上游没有、必须新写

| 能力 | 上游证据 | 新写要求 |
|---|---|---|
| 节点点击高亮 | 全文件无 `chart.on('click')`；`chart.on` 只有 `2306` 的 datazoom | `chart.on('click', p => p.dataType==='node' && chart.dispatchAction({type:'highlight', seriesIndex:0, name:p.name}))` |
| 点击空白清除选中 | 无 | `chart.getZr().on('click', e => e.target \|\| chart.dispatchAction({type:'downplay', seriesIndex:0}))` |
| Esc 关弹窗 / `role=dialog` / 焦点归还 | 上游无弹窗（`index.html` 无 note 节点） | 打开时 `lastFocus=document.activeElement`、聚焦 `.noteX`；`keydown` Esc 关闭并 `lastFocus.focus()` |
| `aria-pressed` / 滑杆 `aria-valuenow` / 左栏 `tabindex=0 role=button` | 上游按钮只有 `.active` 类（`2226-2246`），logo 是 `<div>`（`1597-1633`） | 状态变化时同步 `aria-pressed`；滑杆 `aria-valuemin/max/now/valuetext`；左栏 `Enter`/`Space` 触发 `selectCase` |

---

## 4. 验证记录

### 4.1 静态检查

```
$ node tools/check.mjs
检查 720 组，最大闭合误差 0.0000 元
✅ 全部通过
```
（30 案例 × 6 城 × 4 档 = 720 组；`tools/check.mjs` 只校验 `app/data.js` + `app/engine.js`，不涉 UI，所以本阶段「不改代码」不影响的它。）

### 4.2 环境

- Windows，Node v24；`browser-use` 默认 daemon + Chrome。
- 被测页：`file:///C:/Users/Dao/Code/dao1023/dsh-temp/2026-11-20-labor-income-sankey/ui/index.html`
- 截图前先 `Emulation.setEmulatedMedia` 注入 `prefers-reduced-motion: reduce`，再 `Page.captureScreenshot`，base64 写盘。
- 鼠标事件一律 `Input.dispatchMouseEvent`（`mousePressed`/`mouseMoved`/`mouseReleased`，`button=left`），不用 `el.click()`。

### 4.3 基线实测（对账阶段的现状，供重建后逐条复现）

| # | 断言 | 基线结果 |
|---|---|---|
| 1 | 首屏渲染 | 标题「互联网大厂 · 劳动收入组成」；`#sankey path` 33 条；overlay `<text>` 13 个；`.tl-tick` 3 个；`.tl-dot` **0** 个（缺失）；`#logoRail .logo` 30 个；hash 为空 |
| 2 | 左栏点击换图 | 真实鼠标点 `.logo[data-id="rider"]`（box 39,629.5,45.5,45.5）→ 标题变「众包骑手」、标签 13→7、`location.hash` 变 `#rider` ✅ |
| 3 | 滑杆连续拖动 | `#tlTrack` box [235,622,1046,6]；15% 处 `mousePressed` → 6 次 `mouseMoved`（25/40/55/70/85%）→ `mouseReleased`；`#tlNow` 依次 `¥6,400 / ¥8,000 / ¥10,500 / ¥13,000 / ¥15,500 / ¥17,900`，**松手保持 ¥17,900 不回弹** ✅ |
| 4 | 占比叠加 | 按钮开启后标签金额不消失，第二行变 `8.0% 占应发 · ¥960` 形态；切「单位成本」视角口径词变 `占成本` ✅ |
| 5 | 导出 PNG/SVG | 能下载，但**图内无任何标签、无页眉、无水印**，文件名 `labor-income-bigtech.png/svg` ❌（见 §1.5） |
| 6 | hash 还原 | 只有 `#<caseId>` 能被识别；带城市/薪资/视角的 URL 刷新后丢失 ❌（见 §1.6） |

基线截图：`shots/parity-baseline.png`（3104×1714）。

## 5. 重建后必须复现的断言（本阶段未改代码，以下待重建后执行并回填）

> 说明：本阶段按上级指令「只动文档、不动 ui/ 代码」，因此 §5 是**待执行的验收脚本**，不是已通过的结果。每组给的是基线期望值；重建后若数值不同，必须在同一台机器、同一窗口尺寸（3104×1714 视口）下复测再判定。

| # | 操作（真实 CDP 事件） | 期望 |
|---|---|---|
| A1 | `node tools/check.mjs` | `检查 720 组，最大闭合误差 0.0000 元` + `✅ 全部通过` |
| A2 | 打开页面、注入 reduced-motion、截图 | 标题非空；`#sankey path > 20`；`.tl-tick ≥ 3`；`.tl-dot ≥ 3`（恢复后）；overlay 标签 `≥ 5` |
| A3 | 点 `.logo[data-id="rider"]`（mousePressed/Released） | `#chartTitle` 含「众包骑手」；`location.hash` 含 `c=rider`；`#sankey path` 数量或 overlay 文本发生变化 |
| A4 | 滑杆 6 次 `mouseMoved`（15→25→40→55→70→85%） | 至少 5 个**互不相同**的 `#tlNow` 值；`mouseReleased` 后值不再变化（不回弹）；`.tl-dot.near` 恰好 1 个 |
| A5 | 点任意节点 | 该节点及其相邻流带进入高亮（`dispatchAction highlight`），再点空白处取消 |
| A6 | 点「导出 PNG」 | 捕获 `Page.downloadWillBegin` 或返回 dataURL 长度 `> 200000`；文件名 `labor_income_<case>_<city>_<gross>.png`；图内可见标题/副标题/水印/标签 |
| A7 | 点「导出 SVG」 | 下载成功；SVG 文本含 `<g transform="translate(0,96)">`、`font-size="30"`、`font-size="11"`（水印），且 `<text>` 数 ≥ 节点数 |
| A8 | 改城市 / 拖滑杆 / 切视角 / 开占比 → 读 hash → 刷新 | 刷新后案例、城市、薪资、视角、占比全部还原；`#tlNow` 与刷新前一致 |
| A9 | 键盘：Tab 到左栏格子按 Enter；Tab 到滑杆按 →/Home/End；打开说明弹窗按 Esc | 都能生效；`aria-pressed`/`aria-valuenow` 随状态更新；`role=dialog` 存在 |
| A10 | 窄窗口（<768px）截图 | `#sankey` 高 520（<400px 时 480）；标签切到 13/11.5 紧凑字阶，不重叠 |

## 6. 本阶段交付边界

- 本阶段**只产出本文档**：`git show --stat b208ece` 显示新增 `research/ui-parity-audit.md`（另含此前未跟踪的 `.upstream/profitbridge-main/` 上游快照，与本文行号一一对应，便于复核）。
- 我本人**没有改过** `ui/app.js`、`ui/index.html`、`ui/labor.js`；期间误改过一行 `--muted` 已用 edit 改回（`git checkout --` 被沙箱策略拒绝，见提交历史无 ui 变更）。
- `ui/` 当前内容由上级代理用 `git subtree add` 导入（`01c5f6b` / `ad88ac8`），是上游原版，**不是**本文审计的那版手写实现。
