/* 劳动收入组成 · 数据层
   口径：2026 社保年度（2026-07 起），金额单位「元 / 月」。
   收入构成 comp = [基本工资, 绩效, 年终奖, 加班费, 津贴补贴, 股权/期权, 经营流水/其他]
   占比在引擎里归一化，不要求手工凑满 100。 */
(function (root) {
  'use strict';

  var CITIES = {
    sh: { id: 'sh', name: '上海', min: 7546, max: 37731, hfMin: 2740, hfMax: 37731, hf: 0.07,
          p: { pension: 0.08, medical: 0.02, unemp: 0.005 },
          e: { pension: 0.16, medical: 0.09, unemp: 0.005, injury: 0.0026 },
          self: { pension: 0.20, medical: 0.10 }, medicalExtra: 0 },
    bj: { id: 'bj', name: '北京', min: 7270, max: 36348, hfMin: 2540, hfMax: 36348, hf: 0.12,
          p: { pension: 0.08, medical: 0.02, unemp: 0.005 },
          e: { pension: 0.16, medical: 0.098, unemp: 0.005, injury: 0.004 },
          self: { pension: 0.20, medical: 0.09 }, medicalExtra: 3 },
    sz: { id: 'sz', name: '深圳', min: 5521, max: 27603, hfMin: 2360, hfMax: 41190, hf: 0.05,
          p: { pension: 0.08, medical: 0.02, unemp: 0.002 },
          e: { pension: 0.15, medical: 0.052, unemp: 0.008, injury: 0.002 },
          self: { pension: 0.20, medical: 0.08 }, medicalExtra: 0 },
    gz: { id: 'gz', name: '广州', min: 5521, max: 27603, hfMin: 2680, hfMax: 39579, hf: 0.05,
          p: { pension: 0.08, medical: 0.02, unemp: 0.002 },
          e: { pension: 0.16, medical: 0.0685, unemp: 0.008, injury: 0.004 },
          self: { pension: 0.20, medical: 0.085 }, medicalExtra: 0 },
    hz: { id: 'hz', name: '杭州', min: 5122, max: 25611, hfMin: 2490, hfMax: 25611, hf: 0.12,
          p: { pension: 0.08, medical: 0.02, unemp: 0.005 },
          e: { pension: 0.15, medical: 0.095, unemp: 0.005, injury: 0.0072 },
          self: { pension: 0.20, medical: 0.095 }, medicalExtra: 0 },
    cd: { id: 'cd', name: '成都', min: 4699, max: 23493, hfMin: 2100, hfMax: 29353, hf: 0.06,
          p: { pension: 0.08, medical: 0.02, unemp: 0.004 },
          e: { pension: 0.16, medical: 0.0755, unemp: 0.006, injury: 0.0016 },
          self: { pension: 0.20, medical: 0.075 }, medicalExtra: 0 }
  };

  var GROUPS = [
    { id: 'gov',    name: '体制内',   icon: '🏛️', hint: '财政发薪 · 职业年金 · 高公积金' },
    { id: 'soe',    name: '国企',     icon: '🏢', hint: '工资总额管理 · 企业年金' },
    { id: 'private',name: '民企',     icon: '🏭', hint: '合同工 / 提成 / 计件 / 非全日制' },
    { id: 'dispatch',name:'派遣与外包',icon: '🔁', hint: '劳动关系与用工单位分离' },
    { id: 'bigtech',name: '大厂金融外企', icon: '🚀', hint: '高薪 · 股权 · 封顶缴费' },
    { id: 'platform',name:'平台与灵活就业', icon: '🛵', hint: '自缴社保 · 经营所得 · 平台抽成' },
    { id: 'nonstd', name: '非标与特殊', icon: '🧰', hint: '口头协议 · 日结 · 退休 / 实习' }
  ];

  var CASES = [
    /* ───────── 体制内 ───────── */
    {
      id: 'gov-civil', group: 'gov', name: '公务员', icon: '🏛️',
      legal: '公务员法 · 非劳动合同',
      gross: 12000, lo: 8000, hi: 15000,
      comp: [30, 10, 20, 0, 30, 0, 10],
      si: { mode: 'full', fund: 0.12, annuity: { p: 4, u: 8 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '财政足额缴费',
      note: '基本工资占比很低，津补贴和年终绩效占大头；职业年金（个人 4% + 单位 8%）是编制内最容易被忽略的一块；公积金 12% 在上海 = 7% 基本 + 5% 补充。',
      caveat: '各地阳光工资标准差异大，此处取二线以上城市科员口径。'
    },
    {
      id: 'gov-teacher', group: 'gov', name: '事业编教师', icon: '📚',
      legal: '事业单位聘用合同',
      gross: 11000, lo: 8000, hi: 18000,
      comp: [32, 40, 5, 0, 18, 0, 5],
      si: { mode: 'full', fund: 0.12, annuity: { p: 4, u: 8 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '绩效占四成',
      note: '绩效工资与升学率/课时挂钩，寒暑假只发基本工资；公积金按 12% 双边缴（其中 5% 是补充公积金），实际是隐性收入。',
      caveat: '义务教育教师平均工资不低于公务员是政策目标，落地程度因地而异。'
    },
    {
      id: 'gov-doctor', group: 'gov', name: '公立医院编制医生', icon: '🩺',
      legal: '事业单位聘用合同',
      gross: 20000, lo: 15000, hi: 30000,
      comp: [25, 50, 8, 0, 12, 0, 5],
      si: { mode: 'full', fund: 0.12, annuity: { p: 4, u: 8 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '绩效占一半',
      note: '基本工资低、绩效高，夜班费和科室二次分配常以现金/绩效形式发放；编制内外同岗不同酬；公积金 12% = 7% 基本 + 5% 补充。',
      caveat: '灰色收入不在统计内，也不应计入合法劳动收入。'
    },
    {
      id: 'gov-army', group: 'gov', name: '军队文职', icon: '🎖️',
      legal: '军队聘用合同',
      gross: 14000, lo: 10000, hi: 18000,
      comp: [45, 30, 5, 0, 15, 0, 5],
      si: { mode: 'full', fund: 0.12, annuity: { p: 4, u: 8 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '军队保障',
      note: '工资结构里基本工资和军队服务津贴占比高，吃住医疗由军队保障，现金开支低；公积金按 7% + 5% 补充缴。',
      caveat: '涉密岗位补贴不公开，此处不含特殊津贴。'
    },
    {
      id: 'gov-social', group: 'gov', name: '社工 / 网格员', icon: '🧑‍💼',
      legal: '劳动合同（政府购买服务）',
      gross: 6000, lo: 5000, hi: 8000,
      comp: [75, 15, 0, 0, 10, 0, 0],
      si: { mode: 'min', fund: 0.05 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '常按最低基数缴',
      note: '财政购买服务岗位，工资由街道/第三方发放，社保常按最低基数缴，公积金 5%。',
      caveat: '各地“三岗十八级”薪酬体系不同，此处取中位数；6000 低于上海缴费下限 7546，单位按下限缴，成本倍数反而升到约 1.68×。'
    },

    /* ───────── 国企 ───────── */
    {
      id: 'soe-regular', group: 'soe', name: '国企正式工', icon: '🏢',
      legal: '劳动合同 · 工资总额管理',
      gross: 15000, lo: 10000, hi: 25000,
      comp: [55, 25, 12, 0, 8, 0, 0],
      si: { mode: 'full', fund: 0.12, annuity: { p: 4, u: 8 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '企业年金 + 12% 公积金',
      note: '工资总额受国资委管控，年终奖与效益挂钩；企业年金（个人 4% + 单位 8%）和补充医疗是隐形福利。',
      caveat: '垄断型央企与竞争型国企差距极大，此处取中位。'
    },
    {
      id: 'soe-dispatch', group: 'soe', name: '国企劳务派遣', icon: '🧷',
      legal: '派遣劳动合同',
      gross: 6500, lo: 5000, hi: 8000,
      comp: [78, 15, 0, 0, 7, 0, 0],
      si: { mode: 'min', fund: 0.05, agency: { label: '派遣管理费', pct: 0.12 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '同工不同酬',
      note: '干同样的活，工资走派遣公司、社保按最低基数，年终奖和年金基本没有；用工单位另付约 12% 管理费。',
      caveat: '派遣用工比例不得超过 10%，实操中超比例普遍；6500 接近缴费下限，按下限缴后单位成本倍数为 1.77×。'
    },

    /* ───────── 民企 ───────── */
    {
      id: 'private-regular', group: 'private', name: '民企合同工', icon: '🏭',
      legal: '劳动合同',
      gross: 10000, lo: 6000, hi: 15000,
      comp: [68, 20, 8, 0, 4, 0, 0],
      si: { mode: 'min', fund: 0.05 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '按最低基数缴社保',
      note: '最常见的一档：合同齐全，但社保按最低基数缴、公积金 5%，当期现金多、养老账户少。',
      caveat: '“按最低基数”是常见做法而非合规做法，员工可投诉补缴。'
    },
    {
      id: 'sales', group: 'private', name: '销售 / 提成制', icon: '📈',
      legal: '劳动合同 · 底薪 + 提成',
      gross: 15000, lo: 8000, hi: 30000,
      comp: [35, 55, 0, 0, 10, 0, 0],
      si: { mode: 'min', fund: 0.05 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '收入波动最大',
      note: '底薪只够最低工资，提成按月/按季发，离职时未回款提成常被扣回；社保仍按底薪基数。',
      caveat: '提成制度差异极大，此处按“底薪 35% + 提成 55%”建模；15000 取区间中位偏低（中位约 19000）。'
    },
    {
      id: 'factory', group: 'private', name: '制造业计件工', icon: '⚙️',
      legal: '劳动合同 · 底薪 + 计件',
      gross: 7500, lo: 6000, hi: 9000,
      comp: [30, 48, 0, 17, 5, 0, 0],
      si: { mode: 'min', fund: 0.05 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '加班费占 17%',
      note: '旺季靠加班把工资拉到 8k+，加班费按 1.5/2/3 倍算；社保按最低基数，工伤风险最高。',
      caveat: '“底薪+计件”常被用来压低加班费基数，属常见争议点。'
    },
    {
      id: 'parttime-hourly', group: 'private', name: '非全日制小时工', icon: '⏱️',
      legal: '非全日制劳动合同',
      gross: 4500, lo: 3000, hi: 6000,
      comp: [95, 0, 0, 0, 5, 0, 0],
      si: { mode: 'injury', fund: 0 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '单位只缴工伤',
      note: '每天不超过 4 小时、每周不超过 24 小时；单位只需缴工伤保险，养老医疗由个人以灵活就业身份自缴。',
      caveat: '超时使用即构成事实全日制，可主张补缴；图中只画单位缴工伤，个人养老医疗需以灵活就业身份自缴（未计入）。'
    },

    /* ───────── 派遣与外包 ───────── */
    {
      id: 'dispatch', group: 'dispatch', name: '劳务派遣', icon: '🔁',
      legal: '派遣劳动合同 · 用人不养人',
      gross: 7000, lo: 5000, hi: 9000,
      comp: [75, 18, 0, 0, 7, 0, 0],
      si: { mode: 'min', fund: 0.05, agency: { label: '派遣管理费', pct: 0.12 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '社保由派遣公司缴',
      note: '劳动合同跟派遣公司签、活在大厂干；社保按最低基数，甲方实际支付 = 工资 + 社保 + 约 12% 管理费。',
      caveat: '“假外包真派遣”是常见规避手法，2025 年起多地专项清理；7000 低于上海下限，按下限缴，成本倍数 1.73×。'
    },
    {
      id: 'outsource-onsite', group: 'dispatch', name: '人力外包（驻场）', icon: '🪑',
      legal: '外包公司劳动合同 · 驻场服务',
      gross: 9000, lo: 7000, hi: 12000,
      comp: [85, 10, 0, 0, 5, 0, 0],
      si: { mode: 'min', fund: 0.05, agency: { label: '外包服务费', pct: 0.20 } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '甲方成本约 1.7–2.1 倍',
      note: '你拿 9k，甲方按 1.2–1.4 万人天付给外包公司；中间差价是外包公司的毛利，不是你的社保。',
      caveat: '驻场外包与派遣的法律边界在“谁指挥管理”，实务中常混同。'
    },
    {
      id: 'outsource-biz', group: 'dispatch', name: '业务外包 / 个体户', icon: '🧾',
      legal: '承揽合同 · 个体户/个独',
      gross: 12000, lo: 8000, hi: 20000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'self', fund: 0 },
      tax: { type: 'business', mode: 'audit', costRatio: 0.20, half: true },
      tag: '经营所得 · 自缴社保',
      note: '把劳动关系转成承揽关系：没有最低工资、没有加班费、没有失业保险，社保全部自掏；但可开票、可抵扣成本。',
      caveat: '“个体户”被平台/公司用来规避社保，2025 年起多地按实质重于形式认定劳动关系。'
    },
    {
      id: 'gig-platform', group: 'dispatch', name: '灵活用工平台', icon: '📱',
      legal: '承揽 + 委托代征',
      gross: 10000, lo: 5000, hi: 15000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'none', fund: 0, agency: { label: '平台服务费', pct: 0.03, pay: 'worker' } },
      tax: { type: 'business', mode: 'deemed', deemedRate: 0.015 },
      tag: '核定征收 1.5%',
      note: '平台代发报酬并代征个税，通常按经营所得核定 1%–1.5%；平台不缴社保、个人多也不缴（合规做法是按灵活就业自缴）。',
      caveat: '核定征收政策正在收紧，部分园区已取消。'
    },

    /* ───────── 大厂 / 金融 / 外企 ───────── */
    {
      id: 'bigtech', group: 'bigtech', name: '互联网大厂', icon: '🚀',
      legal: '劳动合同 · base + 绩效 + 股票',
      gross: 40000, lo: 25000, hi: 60000,
      comp: [70, 8, 12, 0, 5, 5, 0],
      si: { mode: 'full', fund: 0.12 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '股权单独计税',
      note: '月薪只是零花钱，年终奖 3–6 个月、RSU 分四年归属；股权激励单独计税（不并入综合所得），实际税负常低于工资；公积金 12% = 7% 基本 + 5% 补充（上海）。',
      caveat: '股票按归属日公允价值计税，股价下跌也要按归属日缴税；年终奖单独计税在 3.6 万 / 14.4 万 / 30 万处有“多发一元、多缴几千”的断崖。'
    },
    {
      id: 'finance', group: 'bigtech', name: '金融机构', icon: '💹',
      legal: '劳动合同 · 高绩效占比',
      gross: 35000, lo: 20000, hi: 80000,
      comp: [45, 45, 0, 0, 10, 0, 0],
      si: { mode: 'full', fund: 0.12 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '递延奖金',
      note: '绩效占近一半，奖金常分 3 年递延发放（风险准备金），离职可能被追索；社保公积金按封顶基数缴。',
      caveat: '限薪令下高管薪酬结构差异大，此处取业务岗中位偏低（区间中位约 5 万，不含高管）。'
    },
    {
      id: 'foreign', group: 'bigtech', name: '外企', icon: '🌐',
      legal: '劳动合同 · 13 薪',
      gross: 25000, lo: 15000, hi: 40000,
      comp: [85, 0, 12, 0, 3, 0, 0],
      si: { mode: 'full', fund: 0.12 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '12% 公积金 + 商保',
      note: '结构简单：12 个月 + 13 薪，公积金按 12% 双边缴，补充商业保险覆盖家属；裁员赔偿通常按 N+1 足额。',
      caveat: '外企在华收缩时整条业务线裁撤，稳定性不如从前。'
    },
    {
      id: 'lawfirm', group: 'bigtech', name: '律所 / 会计所', icon: '⚖️',
      legal: '劳动合同或提成合伙',
      gross: 15000, lo: 8000, hi: 20000,
      comp: [80, 20, 0, 0, 0, 0, 0],
      si: { mode: 'full', fund: 0.05 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '授薪律师口径',
      note: '授薪律师拿固定工资 + 案源提成，合伙人按经营所得；助理阶段工资低、加班极多。',
      caveat: '合伙人/提成律师不适用本卡，应按经营所得建模。'
    },

    /* ───────── 平台 / 灵活就业 ───────── */
    {
      id: 'freelance', group: 'platform', name: '自由设计师', icon: '🎨',
      legal: '劳务 / 承揽 · 无单位',
      gross: 20000, lo: 8000, hi: 25000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'self', fund: 0 },
      tax: { type: 'service' },
      tag: '劳务报酬 · 预扣 20%–40%',
      note: '按次结算，付款方预扣 20%–40%，年度汇算按 80% 并入综合所得，多数人能退税；社保全部自缴。',
      caveat: '预扣税率远高于最终税负，现金流压力被低估；20000 略高于区间中位（约 16500）。'
    },
    {
      id: 'rider', group: 'platform', name: '众包骑手', icon: '🛵',
      legal: '承揽 · 无劳动关系',
      gross: 9000, lo: 7000, hi: 12000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'none', fund: 0, agency: { label: '平台服务费', pct: 0.04, pay: 'worker' } },
      tax: { type: 'business', mode: 'deemed', deemedRate: 0.015 },
      tag: '无社保 · 职业伤害保障',
      note: '按单计价，平台抽成 4% 左右并代征 1.5% 个税；2026 年起职业伤害保障全国推开，按单缴费、平台承担。',
      caveat: '“众包”不是劳动关系，没有工伤、没有最低工资、没有带薪假。'
    },
    {
      id: 'driver', group: 'platform', name: '网约车司机', icon: '🚗',
      legal: '承揽 · 带车加盟',
      gross: 15000, lo: 10000, hi: 18000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'none', fund: 0, agency: { label: '平台抽成', pct: 0.25, pay: 'worker', extra: { label: '车辆成本', pct: 0.20 } } },
      tax: { type: 'business', mode: 'audit', costRatio: 0.45, half: true },
      tag: '平台抽成 25% + 车耗',
      note: '流水 1.5 万，平台先抽 25%，油/电/保养/保险再吃掉 20%，剩下才是自己的“工资”，还要自缴社保。',
      caveat: '各地抽成 18%–30%，特惠快车抽成更高；自缴社保者需另扣约 2264 元/月（灵活就业最低基数），图中未计。'
    },
    {
      id: 'streamer', group: 'platform', name: '主播 / MCN', icon: '🎙️',
      legal: '劳动 / 合作 / 个体户',
      gross: 30000, lo: 3000, hi: 50000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'min', fund: 0, agency: { label: 'MCN 分成', pct: 0.50, pay: 'worker' } },
      tax: { type: 'wage', bonus: 'separate' },
      tag: 'MCN 抽走一半',
      note: '打赏/坑位费先被 MCN 五五分成，再按工资薪金或劳务报酬缴税；头部与尾部收入差三个数量级；此处按劳动合同签约（缴最低社保）建模，合作/承揽则无社保。',
      caveat: '签约形式决定税目，合作/个体户按经营所得，税负差异大。'
    },
    {
      id: 'nanny', group: 'platform', name: '家政 / 月嫂', icon: '🧹',
      legal: '中介制 · 无劳动合同',
      gross: 12000, lo: 6000, hi: 25000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'none', fund: 0, agency: { label: '中介费', pct: 0.08, pay: 'worker' } },
      tax: { type: 'none' },
      tag: '现金结算 · 不申报',
      note: '住家月嫂 1.2 万–2.5 万（此处取 1.2 万偏低），现金/微信结算，几乎不缴个税和社保；员工制家政公司才会缴。',
      caveat: '不申报是普遍做法但不合规，且无工伤保障；中介费通常首月一次性，图中按月摊薄处理。'
    },

    /* ───────── 非标 / 特殊 ───────── */
    {
      id: 'daylabor', group: 'nonstd', name: '口头协议 / 日结零工', icon: '🧰',
      legal: '无合同 · 口头约定',
      gross: 6000, lo: 3000, hi: 8000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'none', fund: 0 },
      tax: { type: 'none' },
      tag: '无社保 · 无个税',
      note: '工地小工、搬运、临时促销：日结 150–400 元，微信转账，无合同无社保无个税，欠薪几乎无法维权。',
      caveat: '制度上应按劳务报酬申报，实际几乎无人申报；现金结算，无合同、无社保。'
    },
    {
      id: 'construction', group: 'nonstd', name: '建筑大工 / 包工头', icon: '👷',
      legal: '劳务承揽 · 包工头带队',
      gross: 9600, lo: 6000, hi: 12000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'project', fund: 0, agency: { label: '包工头抽成', pct: 0.05, pay: 'worker' } },
      tax: { type: 'none' },
      tag: '按项目参保 · 常见未申报',
      note: '大工 400 元/天 × 24 天，包工头抽 5%；总包按项目缴工伤保险，养老医疗基本没有。',
      caveat: '实名制平台在推进，但工资专户覆盖率仍不高；按项目参保只解决工伤，个税制度上仍应代扣，图中按“普遍未申报”建模。'
    },
    {
      id: 'retired', group: 'nonstd', name: '退休返聘', icon: '🧓',
      legal: '劳务 / 特殊劳动关系',
      gross: 8000, lo: 5000, hi: 15000,
      comp: [100, 0, 0, 0, 0, 0, 0],
      si: { mode: 'none', fund: 0 },
      tax: { type: 'wage', bonus: 'separate' },
      tag: '养老金 + 返聘工资',
      note: '已领养老金，返聘不缴社保；收入按工资薪金或劳务报酬缴税，等于“双份收入、单份社保”。',
      caveat: '各地对返聘关系认定不一，工伤保障弱。'
    },
    {
      id: 'intern', group: 'nonstd', name: '实习生', icon: '🎓',
      legal: '实习协议 · 非劳动关系',
      gross: 4000, lo: 3000, hi: 6000,
      comp: [100, 0, 0, 0, 0, 0, 0],
      si: { mode: 'none', fund: 0 },
      tax: { type: 'intern' },
      tag: '劳务报酬 · 可累计预扣',
      note: '实习津贴按劳务报酬预扣，但 2020 年起可选择累计预扣法，月入 4k 基本不缴税；无社保。',
      caveat: '“实习”不能替代劳动关系，毕业前才是实习生。'
    },
    {
      id: 'sidegig', group: 'nonstd', name: '兼职 / 副业', icon: '🌙',
      legal: '劳务 · 本职之外',
      gross: 3000, lo: 1000, hi: 10000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'none', fund: 0 },
      tax: { type: 'service' },
      tag: '800 元起征是误读',
      note: '兼职收入按劳务报酬预扣：800 元以内不预扣，超过按 20% 起；年度汇算并入综合所得，多退少补。',
      caveat: '“800 元免税”是误读，800 只是预扣门槛；3000 取常见兼职水平，低于区间中位（约 5500）。'
    },
    {
      id: 'remote', group: 'nonstd', name: '跨境远程 / 数字游民', icon: '🌍',
      legal: '承揽 · 美元结算',
      gross: 25000, lo: 10000, hi: 50000,
      comp: [0, 0, 0, 0, 0, 0, 100],
      si: { mode: 'self', fund: 0 },
      tax: { type: 'business', mode: 'audit', costRatio: 0.10, half: true },
      tag: '结汇 + 经营所得',
      note: '收美元、结汇到境内账户，按劳务或经营所得申报；无单位缴社保，需自己以灵活就业身份缴。',
      caveat: '跨境收入涉外汇管理与增值税，此处只算个税与社保。'
    }
  ];

  /* 第 7 槽的语义随案例变化：不是所有「其他」都是经营所得 */
  var SLOT7 = {
    'streamer': '直播流水', 'rider': '订单流水', 'driver': '订单流水',
    'gig-platform': '平台订单流水', 'construction': '日结工资', 'daylabor': '日结工资',
    'nanny': '服务收入', 'remote': '跨境收入', 'gov-civil': '改革性补贴'
  };
  CASES.forEach(function (c) {
    var t = (c.tax && c.tax.type) || 'wage';
    var label = SLOT7[c.id] || (t === 'business' ? '经营流水'
      : t === 'service' ? '劳务收入'
        : t === 'none' ? '现金收入' : '其他收入');
    if (c.group === 'gov' && !SLOT7[c.id]) label = '其他补贴';
    c.compLabels = Object.assign({ 6: label }, c.compLabels || {});
  });

  /* 收入构成的显示名与配色 */
  var COMP_LABELS = ['基本工资', '绩效工资', '年终奖', '加班费', '津贴补贴', '股权 / 期权', '其他收入'];
  var COMP_COLORS = ['#2563eb', '#3b82c4', '#0ea5e9', '#6366f1', '#0891b2', '#7c3aed', '#d4a017'];

  root.LABOR_DATA = {
    cities: CITIES,
    groups: GROUPS,
    cases: CASES,
    compLabels: COMP_LABELS,
    compColors: COMP_COLORS,
    meta: {
      year: '2026 社保年度',
      taxYear: '2026 年度',
      updated: '2026-11-20',
      sources: [
        { label: '个税税率表 · 累计预扣法', url: 'http://www.gov.cn/gongbao/content/2019/content_5386991.htm' },
        { label: '专项附加扣除（国发〔2023〕13号）', url: 'https://www.gov.cn/zhengce/content/202308/content_6900595.htm' },
        { label: '年终奖单独计税（2023年第30号）', url: 'https://www.chinatax.gov.cn/chinatax/n810341/n810755/c5212561/content.html' },
        { label: '上海社保基数（2026 年度）', url: 'https://rsj.sh.gov.cn/tgsgg_17341/20260818/t0035_1443203.html' },
        { label: '上海公积金基数（2026-07 起）', url: 'https://www.shzfgjj.cn/html/newxxgk/zcwj/gfxwj/228478.html' },
        { label: '上海医保费率（沪医保规〔2026〕2号）', url: 'https://ybj.sh.gov.cn/gfxwj/20260313/921e047144694b61b6df8ca0c5ef2cfc.html' }
      ]
    }
  };
})(window);
