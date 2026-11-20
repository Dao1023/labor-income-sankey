# profitbridge 桑基图渲染核心解剖

> 目标读者：要在新项目里复刻「左侧输入 → 中间汇总 → 右侧输出」四层劳动收入桑基图的人。
> 所有行号基于 `profitbridge/app.js`（2196 行）与 `profitbridge/index.html`（197 行），2026-11-20 快照。

## 0. 先纠正一个前提

任务描述说原项目是「手写 SVG 桑基图」——**不是**。实际情况：

- `index.html:191` 引入 `vendor/echarts.min.js`（5.5.1），`index.html:182` 是空的 `<div id="sankey">`。
- `app.js:2182` `echarts.init(document.getElementById('sankey'), null, { renderer: 'svg' })`。
- 图表本体是 `series: [{ type: 'sankey', layout: 'none', nodeAlign: 'justify' }]`（`app.js:1116-1131`）。

所以项目里**没有**自写的贝塞尔路径函数、没有自写的垂直堆叠、没有自写 tooltip：这些全部由 ECharts 内部完成。项目自己写的只有三件事：

1. **图数据构造**（把财报数字变成 nodes/links + 每节点手工 `depth`）——`buildGraph()`；
2. **标签内容与摆放策略**（per-node `label.position` 手工避让 + rich text）——`renderChart()` 内；
3. **导出**（离屏重渲染 + 字符串包壳 / canvas 合成）——`exportSVG()` / `exportPNG()`。

因此本笔记把「ECharts 替我们做的事」也补上了算法说明（第 4/5 节），并给出一个**不依赖 ECharts 的等价最小实现**（`sankey-demo.html`）。

---

## 1. 函数地图（名字 + 行号 + 输入输出）

| 函数 | 行号 | 输入 | 输出 / 作用 |
|---|---|---|---|
| `buildGraph(qv, segList)` | `app.js:652-913` | `qv`=单期财务行 `{revenue, gross, opInc, netInc, rd, sga, end, periodType, ...}`（单位：百万，本币）；`segList`=`[{name, value, children?}]` | `{nodes:[{name,value,depth,itemStyle:{color},neg?}], links:[{source,target,value,lineStyle:{color,opacity,curveness}}]}`，值单位 $B |
| `linkColor(l)` | `app.js:914-920` | 单条 link | 颜色字符串：源节点是 `seg:` → 蓝；nonop → 金；目标是 gross/op/net → 绿；其余 → 红 |
| `mergeSegs(list)` | `app.js:627-647` | 原始分部列表 | 同名兄弟合并（ECharts 重名节点会让拓扑排序崩：`Cannot set properties of undefined`，见 624-626 注释） |
| `sankeySegPlan(ticker, qvRaw)` | `app.js:610-621` | ticker + 原始季度 | `{cum, segList, status}`：决定用年度累计口径还是单季口径 |
| `amtText(v)` | `app.js:931-934` | $B 数值 | `>=1` → `12.3B`；否则 `58.9M`（防止 0.0589 被印成 `0.1B`） |
| `labelName(n)` | `app.js:944-949` | 节点 | 画布用短名（>12 全角字符才换短名，tooltip 仍用全名） |
| `fwCols(s)` | `app.js:938` | 字符串 | 全角列宽（CJK=2，ASCII=1） |
| `checkConsistency(qv, g)` | `app.js:952-968` | 图 | 自检：叶子流入和 == revenue？gross+cogs==revenue？op+rd+sga+opex==gross？ |
| `renderChart()` | `app.js:970-1145` | 全局 state | 组装 option 并 `chart.setOption(opt, true)` |
| ├ `nodeLabel(p)` | `app.js:1014-1053` | ECharts 回调参数 | rich text：名称 / 金额 / 占比 / QoQ 四模式 |
| ├ `residualLabel(p)` | `app.js:1058-1075` | 同上 | 超长残差块名手工按 9(zh)/17(en) 字符折行 |
| ├ `data = g.nodes.map(...)` | `app.js:1078-1098` | 节点 | **逐节点选 `label.position`**（见 §7） |
| ├ `sankeyTop` | `app.js:1102` | degraded? | 96 / 60（顶部留白，避开警告横幅） |
| └ `chart.setOption` / `window.__lastOption` | `app.js:1104-1132` / `1133-1144` | — | 后者是导出用的「无 tooltip 静态版 option」 |
| `syncChartHeightForNotes()` | `app.js:1894-1904` | DOM | 画布高 = `SANKEE_BASE_H(660)` − 备注行高度，保面板总高不变 |
| `exportOption()` | `app.js:2015-2026` | 当前 option | 去 tooltip / 去 animation / 去 dataZoom slider |
| `exportWatermark()` | `app.js:2027-2029` | — | 页脚水印文字 |
| `svgWithHeader(rawSvg)` | `app.js:2034-2051` | ECharts 导出的 svg 字符串 | 正则取出开标签与 width/height，挖出 inner，外面包一层 96px 标题带 + 40px 水印带 |
| `exportPNG()` | `app.js:2052-2084` | — | 离屏 canvas 实例 1600×900 @2x → `getDataURL` → 再画到 2D canvas 上与标题/水印合成 |
| `exportSVG()` | `app.js:2085-2101` | — | 离屏 svg 实例 → `renderToSVGString()` → `svgWithHeader` → Blob 下载 |
| 初始化 / 响应式 | `app.js:2182` / `2193` | — | `renderer:'svg'`；`resize` → 重算高度 + `renderChart()` + `chart.resize()` |

常量：`MB = 1e3`（`app.js:177`，百万→十亿）；`BLUE '#3b82c4' GRAY '#4b5563' GREEN '#16a34a' RED '#dc2626' GOLD '#d4a017'`（`app.js:302`）；`FLOW_OPACITY = 0.55`、`curveness: 0.5`（`app.js:309, 911`）。

---

## 2. 数据模型

### 2.1 节点

```js
{
  name: 'gross',            // 唯一标识；分部统一加 'seg:' 前缀防止与计算节点撞名 (app.js:660)
  value: 12.34,             // 区块厚度（$B）。ECharts 实际按 max(value, 入流和, 出流和) 定尺寸
  depth: 3,                 // 列号，layout:'none' 时必填
  itemStyle: { color: '#16a34a' },
  neg: true                 // 仅亏损节点：value 存绝对值，标签要显示负号
}
```

### 2.2 连线

```js
{
  source: 'revenue', target: 'gross', value: 40.1,
  lineStyle: { color: '#16a34a', opacity: 0.55, curveness: 0.5 }
}
```

约束（`app.js:651` 注释、`910` 过滤）：所有 value 非负；`source !== target`；每个节点出流之和 ≤ 自身 value；脚本允许「入流和 < 节点值」（亏损块的悬垂部分就是亏损本身，不是插值）。**唯一的硬约束是拓扑无环**——ECharts 要对图做拓扑排序。

### 2.3 原项目的列（4~6 列，随数据形态变化）

`app.js:650` 注释给出列序：
`[分部(+子分部) 0] [分部聚合父节点 1] [revenue] [gross/cogs] [rd/sga/opex/op] [net/taxOther]`。
`revDepth = hasChildren ? 2 : (segList ? 1 : 0)`，后续列全部基于 `revDepth + n` 递推——所以列号是**数据驱动**的，不是写死 0..5。

---

## 3. 比例尺：px per unit (ky)

ECharts 内部算法（等价伪码，demo 按此实现）：

```
ky = min over 每一列 [ (plotH - nodeGap*(n_i - 1)) / sum(value of column i) ]
nodeHeight = value * ky
nodeY      = 列内从 top 起累加：y += nodeHeight + nodeGap
```

要点：

- **全局唯一 ky**（不是每列一个），取所有列里最挤的那一列为准，因此任何一列都不会溢出画布；
- 列高不足时顶部对齐（ECharts 行为），剩余空白留在列底部；
- 原项目 `nodeGap: 22`、`nodeWidth: 30`、绘图区 `left: 170|210, right: 170, top: 60|96, bottom: 40`（`app.js:1120-1121`）。

demo 的两处偏离（都已注释）：`nodeGap 16`、列内改为**垂直居中**（视觉更稳），并允许 `value` 缺省时自动取 `max(入流和, 出流和)`。

---

## 4. 节点排序与垂直堆叠

原项目**不做**同列排序：`buildGraph()` 按业务顺序 push，ECharts 的 sankey 只在列内按插入序堆叠（`layout:'none'` 时不做交叉最小化的多次迭代）。

所以「排序」实际发生在两层：

1. **列内顺序 = 数据声明顺序**。作者把大块写在前面（revenue 先 push，`app.js:681`），让大色块落在上方；
2. **连线的接入顺序**由 ECharts 按对端节点的 y 排序，以减少交叉。

demo 把第 2 点显式实现（这是复用时最容易漏的一步）：

```
出流按 target.cy 升序排 → 依次分配 y 偏移
入流按 source.cy 升序排 → 依次分配 y 偏移
```

若不排序，同一节点的多条带子会互相穿插。

---

## 5. 连线厚度与端点（贝塞尔）

ECharts sankey 的带子是**四次三次贝塞尔围成的闭合带**（上边一条 C，下边一条反向 C）：

```
x0 = 源节点右边缘 = n.x + nodeWidth
x1 = 目标节点左边缘 = m.x
k  = (x1 - x0) * 0.5            // curveness 0.5 → 控制点各占一半水平距离

M x0,y0
C x0+k,y0  x1-k,y1  x1,y1        // 上边
L x1,y1+w                         // 右端竖直收口
C x1-k,y1+w  x0+k,y0+w  x0,y0+w   // 下边（反向）
Z
```

- 带宽 `w = value * ky`；两端同宽（桑基守恒，不做渐细）；
- `y0` 是源节点上该出流的累计偏移，`y1` 是目标节点上该入流的累计偏移；
- `curveness` 只影响 k 的比例：0.5 即 `k = dx/2`，原项目用 0.5；
- 若节点出流和 < 节点 value，ECharts 自顶向下铺，底部留空；demo 同样处理。

---

## 6. 颜色与透明度

| 规则 | 位置 |
|---|---|
| 节点色按语义固定 5 色：蓝=收入侧、灰=汇总、绿=利润/正向、红=成本/亏损、金=营业外 | `app.js:302` |
| 连线色**继承语义而非继承源节点**：`linkColor()` 按 `source/target` 名字判定，保证「收入→毛利」永远是绿带 | `app.js:914-920` |
| 连线统一 `opacity 0.55`，`curveness 0.5` | `app.js:911` |
| 标签白描边 2.5px 做 halo，压在色带上仍可读 | `app.js:1127` |
| hover 用 `emphasis: { focus: 'adjacency' }`，非邻接元素由 ECharts 淡化 | `app.js:1122` |

demo 用「连线继承源节点色 + fill-opacity .42」这一更通用的规则（四层劳动收入图没有利润/成本语义），hover 淡化自己实现（邻接集合 = 自身 + 直接相连节点/连线）。

---

## 7. 标签放置策略（原项目最值得抄的部分）

ECharts 的自动标签只会压在一起，原项目是**逐节点手选 `label.position`**（`app.js:1078-1098`）：

| 条件 | position | 理由（源码注释） |
|---|---|---|
| `undisclosedCost` 巨块 | `right, distance 8` + 手工折行 | 名字长、块大，放右侧空白并 9/17 字符断行，避免与同列小 net 标签打架 |
| degraded 视图的 `net` | `top, distance 6` | 小块，标签抬到块上方，让开右侧的残差标签 |
| `revenue` | `top, distance 6` | 落在顶部留白里 |
| `depth === 0` 且无聚合列 | `right, distance 6` | 左列右侧就是空白 |
| 末列（`depth >= revDepth+3`） | `right, distance 8` | 右侧是页边距，最安全 |
| 其余（中间列） | `top, distance 5` | 中间列左右都是带子，只能向上借位 |

另外两条工程经验：

- 长名在画布上用短名（`labelName`），tooltip 保留全名；
- 名称/金额/占比用 `rich` 分样式（`app.js:1003-1011`），行高写死（21/18/17px）保证多行标签不错位。

**demo 的做法更强一点**（原项目靠手写规则，新数据一换就崩）：先算每个标签的期望位置，再对同列标签做**一维去重叠**（前向推挤 + 后向回夹），偏移超过 3px 就画引导线。算法 12 行，见 `sankey-demo.html` 的 `placeLabels()`。

---

## 8. 动画

原项目**没有写动画代码**，全靠 ECharts 默认的入场动画（`animation` 默认 true）与 `setOption(opt, true)` 的整体替换。导出时显式 `animation: false`（`app.js:2018`）。

demo 用 CSS 入场（`.enter` 类 + `animation ... both`，700ms 后由 JS 移除该类）。**坑**：`animation-fill-mode: both` 的 0% 帧若是 `opacity:0`，把带动画的 SVG 直接序列化去转 PNG，会得到一张空白图。所以导出前必须从 clone 上摘掉 `.enter`，并让基础样式本身就是终态。

---

## 9. 导出实现

### 9.1 SVG（`app.js:2034-2101`）

1. 新建离屏 `echarts.init(div, null, {renderer:'svg', width:1600, height:900})`；
2. `setOption(exportOption())`（无 tooltip / 无动画 / 无 slider）；
3. `off.renderToSVGString()` 拿到 `<svg ...>...</svg>`；
4. `svgWithHeader()` 用正则切出开标签与 `width/height`，取出 inner；
5. 重新拼一个更高的根 svg：背景 rect + 标题(30px, #1d55a5) + 副标题(15px) + `<g transform="translate(0,96)">inner</g>` + 水印(11px)；
6. `Blob` + `URL.createObjectURL` + 临时 `<a download>` 点击，最后 revoke。

关键点：**必须换一个新实例重渲染**，不能直接序列化屏幕上的实例——屏幕上还挂着 dataZoom slider 和 tooltip 层。

### 9.2 PNG（`app.js:2052-2084`）

SVG renderer 不能栅格化，所以：canvas renderer 离屏实例 → `getDataURL({pixelRatio:2})` → `new Image()` 载入 → 画到 1600×900 的 2D canvas 上 → 用 `ctx.fillText` 画标题带和水印 → `canvas.toDataURL('image/png')` → 下载。尺寸：图 1600×900 + 头 96 + 脚 40，@2x。

### 9.3 demo 的做法（浏览器原生，零依赖）

- 所有样式写进 `<svg>` **内部**的 `<style>`（不是页面 head），这样序列化出去样式不丢；
- `cloneNode(true)` → 去掉 `.enter` / `.dim` / `.on` → 补 `xmlns`、`width`、`height`、`viewBox` → `XMLSerializer`；
- PNG：`Blob(svg+xml)` → `Image` → `canvas` @2x → `toBlob`。因为 SVG 内无外链图片/字体，canvas 不会被 taint；
- 下载统一走 `URL.createObjectURL` + `<a download>` + `setTimeout(revoke, 1000)`。

---

## 10. 响应式

- `index.html:95` `#sankey { width:100%; height:660px; display:block }`；
- `app.js:2193` 监听 `resize`：先 `syncChartHeightForNotes()` 重算 CSS 高度（保住面板等高），再 `renderChart()`，最后 `chart.resize()`；
- 断点只影响外围布局：`index.html:145-149` `@media (max-width:900px)` 把左侧 logo 栏从绝对定位改成横向网格，图表本身仍吃满宽度；
- **ECharts 的 resize 是重排而非缩放**，所以每次都要 `resize()`，不能只改 CSS。

demo：`ResizeObserver`（回退 `window.resize`）+ `requestAnimationFrame` 去抖，宽度变化就整图重算（`W` 参与 layout），最小宽度 640。

---

## 11. 复用到「劳动收入桑基图」的清单

1. 数据模型照抄 `{nodes:[{id,label,layer,value?,color}], links:[{source,target,value}]}`，比 ECharts 的 `name/depth` 更好读；
2. 层号：4 层写死 `layer: 0..3`；或将 `layer` 留空，用 Kahn 最长路径自动分层（demo 内置）；
3. 比例尺：全局 `ky = min((plotH - gap*(n-1))/colSum)`；
4. 连线端点必须**按对端 y 排序后再累加偏移**，否则带子打结；
5. 标签：先给期望位置，再做一维去重叠 + 引导线；白 halo 必备；
6. 颜色：节点语义色，连线继承源色 + 0.42 透明度；
7. 导出：样式内联在 `<svg><style>` 里，导出前清掉动画/高亮类；
8. 不需要 ECharts —— 上面的算法 200 行原生 SVG 足够，且体积从 ~1MB 降到 ~10KB。

---

## 12. demo 自检（怎么验证的）

**环境限制**：本机 DSH 沙箱不允许启动浏览器进程，所以没能在真 Chrome 里点开验证。实测三种路径全部失败：

| 尝试 | 现象 |
| --- | --- |
| bash 起 Chrome / Edge `--headless=new --dump-dom` | `crashpad_client_win.cc:431 OpenProcess: Access is denied. (0x5)` → `mojo\public\cpp\platform\platform_channel.cc:187 Check failed: . : Access is denied.` → 无 stdout 输出，exit 3/127 |
| node `child_process.spawn(chrome)` | `Error: spawn EPERM`（errno -4048） |
| `npm i jsdom` | 策略拦截：`Fetching packages of type "remote" have been disabled`；`--offline` 则 `ENOTCACHED` |

**替代方案**：`verify-demo.mjs` 自己实现了一个 ~200 行的最小 DOM 垫片（`createElementNS / setAttribute / classList / dataset / appendChild / textContent / innerHTML / querySelectorAll / closest / cloneNode / XMLSerializer / Blob / URL / Image / ResizeObserver / requestAnimationFrame`），把 `sankey-demo.html` 里**同一份内联脚本**用 `new Function` 跑起来，再对结果做断言。

```bash
cd research && node verify-demo.mjs      # PASS 35 / FAIL 0，退出码 0
```

覆盖的 35 项断言（摘要）：

- 拓扑：15 节点 / 14 连线；已绘 `path.link` = 14；节点组 15；无 `NaN/undefined/null` 路径；`d` 结构必须是 `M…C…C…Z`；所有带宽 > 0。
- 布局：`ky` 有限且 > 0（1200px 宽时 = 0.001574）；最高节点 466px ≤ 绘图区 546px；同一列内相邻节点间隙 ≥ 16（不重叠）；节点全部落在画布内。
- 标签：`labelOverlaps === 0`（1200px 与 700px 两种宽度都验）；15 个标签全部生成。
- 交互：`pointermove` 落在流带上 → tooltip 加 `.show` 且文案含 `→`；落在节点上 → 文案含「占总收入」；移到空白 → tooltip 收起、`focusing` 清空；邻接高亮元素 ≥ 3。
- 导出 SVG：以 `<?xml version="1.0" encoding="UTF-8"?>` 开头、含 `xmlns` 与 `viewBox="0 0 1200 640"`、内联 `<style>`、14 条 `class="link"`、无 `NaN/undefined`、无 `.enter/.focusing` 残留、标签开闭平衡。
- 导出 PNG：`pngBlob(2)` 返回 `type === 'image/png'`；离屏 canvas 尺寸 = 2400×1280；`drawImage` 被调用一次。
- 响应式：容器改 700px → 触发 ResizeObserver → rAF 后 `stats().width === 700`，且仍无重叠 / 无坏路径；恢复 1200px 正常。

**仍然只能人工确认的一点**：真浏览器里的视觉观感（字体渲染、`@keyframes` 入场、PNG 位图是否与 SVG 一致）。导出产物 `shots/sankey-export.svg` 是自检脚本实际生成的独立 SVG（9.3KB，20 个元素带），可直接双击打开对照。

**实现变更备注**：`render()` 由「拼 HTML 字符串 + `svgEl.innerHTML=`」改成「`document.createElementNS` 建节点 + `appendChild`」——转义由 DOM 负责，单节点挂事件更容易，也让上面的 DOM 垫片能跑到与浏览器完全相同的代码路径。`stats()` 不再调用 `getBBox()`（改用渲染时记录的 `labelBoxes`），避免依赖 SVG 布局引擎。
