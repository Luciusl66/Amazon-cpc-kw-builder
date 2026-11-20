'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Excel = require('exceljs');
const { LEVELS, SHEETS, normalize, tokens, run, writeAtomic } = require('./lib/project');
const { openDb, transaction } = require('./lib/db');
const { classified } = require('./lib/rule_pretagger');

const integer = '#,##0';
const decimal = '#,##0.00';
const percentage = '0.0%';
const eligible = row => ['S-核心精准', 'A-高度相关'].includes(row.relevance);
const volume = row => row.market_monthly_search_volume;
const chooseVolume = (a, b) => (volume(b) ?? -1) - (volume(a) ?? -1) ||
  a.normalized_keyword.localeCompare(b.normalized_keyword, 'en');
const period = value => ({ '30d': '近30天', history: '历史' })[value] ?? null;
const traffic = value => ({ organic: '自然', ad: '广告', mixed: '混合', unknown: '未知' })[value];
const formatList = json => JSON.parse(json).join('、');

function worksheet(workbook, name, definitions) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = definitions.map(([header, width, numFmt]) => ({ header, width, style: numFmt ? { numFmt } : {} }));
  const header = sheet.getRow(1);
  header.height = 27;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173854' } };
    cell.alignment = { vertical: 'middle' };
  });
  return sheet;
}

function strategies(row) {
  const root = row.canonical_root || row.normalized_keyword;
  switch (LEVELS.indexOf(row.level)) {
    case 1:
      if (row.direct_coverage_rate >= 0.6) return [['一级核心｜独立｜' + row.display_keyword, root, 'Exact', '新品控预算/观察']];
      return [['一级核心｜观察', root, 'Exact', '覆盖率偏低或未知，控预算/观察']];
    case 2: return [
      ['二级属性｜精准', root, 'Exact', '按标准词根分组'],
      ['二级属性｜词组', root, 'Phrase', '需挂前置否词'],
    ];
    case 3: return [['三级细分｜精准', root, 'Exact', '新品期核心出单引擎']];
    case 4:
    case 5: return [['长尾｜低竞价', row.level === LEVELS[5] ? '高意图无核' : '超级长尾', 'Exact', '低竞价捡漏']];
    default: return [];
  }
}

function writePlan(sheet, rows, profile) {
  const excluded = new Set((profile.exact_negatives ?? []).map(normalize));
  let plannedKeywords = 0;
  for (const row of rows) {
    if (!eligible(row) || row.similar_only_flag || excluded.has(row.normalized_keyword)) continue;
    const entries = strategies(row);
    if (entries.length) plannedKeywords++;
    for (const [activity, group, match, note] of entries) {
      const search = volume(row);
      const band = search === null ? '未知' : search >= 10000 ? '高' : search >= 1000 ? '中' : '低';
      sheet.addRow([profile.sku + '｜' + activity, group, row.display_keyword, match, row.level,
        row.canonical_root, row.relevance,
        row.direct_coverage_count + '/' + profile.competitors.filter(item => item.tier !== 'similar').length,
        row.direct_coverage_rate, row.organic_top30_count, search, row.cpc_suggested_bid,
        row.dominant_traffic_type, band, note]);
    }
  }
  return plannedKeywords;
}

function negatives(sheet, rows, profile) {
  const phrases = new Map();
  const exact = new Map((profile.exact_negatives ?? []).map(term => [normalize(term), { term, reason: '档案指定精准排除' }]));
  for (const row of rows) {
    if (row.relevance === 'X-属性冲突' && !exact.has(row.normalized_keyword)) {
      for (const term of JSON.parse(row.conflict_terms)) {
        if (exact.has(normalize(term))) {
          exact.set(row.normalized_keyword, { term: row.display_keyword, row, reason: '多义冲突词精准排除' });
          continue;
        }
        if (!phrases.has(term)) phrases.set(term, { total: 0, hasVolume: false, sources: [] });
        const entry = phrases.get(term);
        entry.total += volume(row) ?? 0;
        entry.hasVolume ||= volume(row) !== null;
        entry.sources.push(row.display_keyword);
      }
    }
    if (row.relevance === 'P-竞品品牌' || exact.has(row.normalized_keyword)) {
      exact.set(row.normalized_keyword, { term: row.display_keyword, row,
        reason: row.relevance === 'P-竞品品牌' ? '竞品品牌' : exact.get(row.normalized_keyword).reason });
    }
  }
  for (const [term, data] of [...phrases].sort((a, b) =>
    b[1].total - a[1].total || a[0].localeCompare(b[0], 'en'))) {
    sheet.addRow(['A', 'Negative Phrase', term, data.hasVolume ? data.total : null, data.sources.length,
      data.sources.slice(0, 5).join('、'), '属性冲突']);
  }
  for (const { term, row, reason } of [...exact.values()].sort((a, b) =>
    (volume(b.row ?? {}) ?? -1) - (volume(a.row ?? {}) ?? -1) || a.term.localeCompare(b.term, 'en'))) {
    sheet.addRow(['B', 'Negative Exact', term, volume(row ?? {}), row ? 1 : 0, row?.display_keyword, reason]);
  }
  return { 否定词组: phrases.size, 否定精准: exact.size };
}

function rootFrequency(sheet, rows, stops) {
  const stop = new Set(stops.flatMap(tokens));
  const counts = new Map();
  for (const row of rows.filter(eligible)) {
    const words = tokens(row.display_keyword).filter(word => !stop.has(word));
    const grams = new Set([...words, ...words.slice(1).map((word, index) => words[index] + ' ' + word)]);
    for (const gram of grams) {
      if (!counts.has(gram)) counts.set(gram, { count: 0, search: 0, known: 0 });
      const item = counts.get(gram);
      item.count++;
      if (volume(row) !== null) {
        item.search += volume(row);
        item.known++;
      }
    }
  }
  for (const [gram, { count, search, known }] of [...counts].sort((a, b) =>
    b[1].count - a[1].count || b[1].search - a[1].search || a[0].localeCompare(b[0], 'en'))) {
    sheet.addRow([gram, gram.includes(' ') ? '2-gram' : '1-gram', count, known ? search : null]);
  }
}

function writeWorkbook(rows, db, profile) {
  const workbook = new Excel.Workbook();
  const plan = worksheet(workbook, SHEETS[0], [
    ['建议活动名', 48], ['建议广告组', 34], ['关键词', 43], ['匹配方式', 14], ['级别', 23], ['标准词根', 43],
    ['相关性', 20], ['直接竞品覆盖数', 19], ['直接竞品覆盖率', 19, percentage], ['自然前30竞品数', 21, integer],
    ['月搜索量', 16, integer], ['CPC 建议竞价', 19, decimal], ['流量主导类型', 18], ['搜索量档位', 17], ['投放备注', 33],
  ]);
  const negative = worksheet(workbook, SHEETS[1], [
    ['区域', 11], ['否定匹配方式', 24], ['否定词', 38], ['涉及总搜索量', 21, integer],
    ['涉及词数', 15, integer], ['来源示例词', 60], ['排除理由', 28],
  ]);
  const master = worksheet(workbook, SHEETS[2], [
    ['关键词', 44], ['中文释义', 33], ['级别', 23], ['标准词根', 44], ['相关性', 22], ['冲突词根', 28],
    ['是否仅相似品来源', 23], ['直接竞品覆盖数', 21, integer], ['直接竞品覆盖率', 21, percentage],
    ['自然前30竞品数', 20, integer], ['月搜索量', 16, integer], ['供需比', 13, decimal], ['点击集中度', 17, percentage],
    ['CPC 建议竞价', 19, decimal], ['数据周期', 14], ['最大流量占比', 18, percentage], ['流量主导类型', 19],
    ['更新状态', 17], ['Manual_Lock', 19], ['标注来源', 15], ['数据来源', 58], ['分级理由', 45], ['备注', 38],
    ['标准化关键词', 44], ['首次出现时间 (UTC)', 30], ['最后更新时间 (UTC)', 30],
  ]);
  const frequency = worksheet(workbook, SHEETS[3], [
    ['词根或修饰词', 42], ['词组长度', 19], ['出现词数', 16, integer], ['对应搜索量合计', 24, integer],
  ]);
  const rivals = worksheet(workbook, SHEETS[4], [
    ['ASIN', 17], ['竞品层级', 15], ['主力变体备注', 38], ['入选理由', 48], ['覆盖关键词总数', 23, integer],
  ]);
  const details = worksheet(workbook, SHEETS[5], [
    ['标准化关键词', 43], ['原表写法', 43], ['ASIN', 17], ['站点', 11], ['数据周期', 14], ['报表类型', 16],
    ['流量类型', 15], ['自然排名', 15, integer], ['广告排名', 15, integer], ['流量占比', 16, percentage],
    ['月搜索量', 16, integer], ['供需比', 13, decimal], ['点击集中度', 17, percentage],
    ['CPC 建议竞价', 19, decimal], ['来源文件', 58], ['来源工作表', 24], ['原表行号', 14, integer],
    ['观测日期 (UTC)', 27], ['原始字段和值（JSON）', 56],
  ]);

  const planned = writePlan(plan, rows, profile);
  const neg = negatives(negative, rows, profile);
  for (const row of rows) master.addRow([
    row.display_keyword, row.zh_meaning, row.level, row.canonical_root, row.relevance,
    formatList(row.conflict_terms), row.similar_only_flag ? '是' : '否', row.direct_coverage_count,
    row.direct_coverage_rate, row.organic_top30_count, volume(row), row.supply_demand_ratio,
    row.click_concentration, row.cpc_suggested_bid, period(row.data_period), row.max_traffic_share,
    row.dominant_traffic_type, row.change_status, row.manual_lock === 1, row.tag_source, formatList(row.sources),
    row.reason, row.notes, row.normalized_keyword, row.first_seen_at, row.last_updated_at,
  ]);
  rootFrequency(frequency, rows, profile.stop_words);
  const count = db.prepare('SELECT count(DISTINCT normalized_keyword) AS n FROM source_details WHERE asin = ?');
  for (const item of profile.competitors) rivals.addRow([
    item.asin, item.tier, item.variant_note, item.reason, count.get(item.asin).n,
  ]);
  const detailRows = db.prepare(`
    SELECT * FROM source_details ORDER BY normalized_keyword, asin, data_period, traffic_type, report_type
  `).iterate();
  for (const row of detailRows) details.addRow([
    row.normalized_keyword, row.display_keyword, row.asin || null, row.market, period(row.data_period),
    row.report_type === 'extend' ? '拓展' : '反查', traffic(row.traffic_type), row.organic_rank,
    row.ad_rank, row.traffic_share, volume(row), row.supply_demand_ratio, row.click_concentration,
    row.cpc_suggested_bid, row.source_file, row.source_sheet, row.source_row,
    new Date(row.observed_at).toISOString(), row.raw_json.length <= 32767 ? row.raw_json : '原始内容超出 Excel 单元格长度，请按文件与行号追溯',
  ]);
  for (const sheet of workbook.worksheets) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  }
  return { workbook, planned, neg };
}

run(async project => {
  const db = openDb(project.dbFile);
  try {
    const summary = await transaction(db, async () => {
      const rows = db.prepare('SELECT * FROM keywords_master').all().sort(chooseVolume);
      if (!rows.length) throw new Error('数据库还没有可导出的关键词');
      const missing = rows.filter(row => !classified(row)).length;
      if (missing) throw new Error('还有 ' + missing + ' 个词未完成分类，请先运行校验');
      const { workbook, planned, neg } = writeWorkbook(rows, db, project.profile);
      const breakdown = Object.fromEntries([...LEVELS, '未分级'].map(level => {
        const items = rows.filter(row => (row.level ?? '未分级') === level);
        return [level, { 词数: items.length, 示例: items.slice(0, 8).map(row => row.display_keyword) }];
      }));
      const report = { SKU: project.profile.sku, 总词数: rows.length, 建议投放词数: planned, ...neg, 分级: breakdown };
      fs.mkdirSync(project.output, { recursive: true });
      const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
      writeAtomic(path.join(project.output, 'keywords_snapshot.json'), JSON.stringify({
        exported_at: new Date().toISOString(), summary: report, keywords: rows.map(row => ({
          ...row, conflict_terms: JSON.parse(row.conflict_terms),
          sources: JSON.parse(row.sources), market_sources: JSON.parse(row.market_sources),
        })),
      }, null, 2) + '\n');
      writeAtomic(project.book, xlsx);
      return report;
    });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.close();
  }
});
