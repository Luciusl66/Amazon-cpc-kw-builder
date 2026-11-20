'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Excel = require('exceljs');
const { openDb } = require('./lib/db');
const { BOOK, LEVELS, SHEETS, listFiles, readJson } = require('./lib/project');

const sku = '_smoke_test';
const project = path.resolve(__dirname, '..');
const workspace = path.join(project, 'workspace', sku);
const marker = path.join(workspace, '.generated-smoke-fixture');
const raw = path.join(workspace, 'raw_exports');
const pending = path.join(workspace, 'pending');
const tagged = path.join(workspace, 'tagged');
const output = path.join(workspace, 'output');
const dbFile = path.join(workspace, 'keywords.sqlite');
const book = path.join(output, BOOK);
const seed = 'B0TEST0001';
const direct = 'B0TEST0002';
const similar = 'B0TEST0003';
const similar2 = 'B0TEST0004';

const stageScripts = ['01_ingest_and_clean.js', '02_validate_batches.js', '03_export_cpc_pack.js'];

function resetFixture() {
  if (fs.existsSync(workspace)) {
    if (!fs.existsSync(marker)) throw new Error('已有 _smoke_test 目录缺少测试标识，保留现有数据');
    for (const directory of [pending, tagged]) {
      for (const file of listFiles(directory, /^batch_\d{2,}\.json$/)) fs.unlinkSync(path.join(directory, file));
    }
    for (const file of [book, path.join(output, 'keywords_snapshot.json'), dbFile, dbFile + '-wal', dbFile + '-shm']) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(marker, '本目录由 npm test 生成。\n');
}

function stage(index, expected = 0) {
  const result = spawnSync(process.execPath,
    ['--disable-warning=ExperimentalWarning', path.join(__dirname, stageScripts[index]), sku],
    { cwd: project, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, expected, result.stdout + result.stderr);
  return expected ? result.stderr : JSON.parse(result.stdout);
}

function inspect(sql, ...parameters) {
  const db = openDb(dbFile);
  try {
    return db.prepare(sql).all(...parameters);
  } finally {
    db.close();
  }
}

function counts() {
  return { master: inspect('SELECT count(*) AS n FROM keywords_master')[0].n,
    details: inspect('SELECT count(*) AS n FROM source_details')[0].n };
}

async function makeSources() {
  const profile = readJson(path.join(project, 'workspace', '_template', 'product_profile.json'));
  Object.assign(profile, {
    sku,
    product_info: {
      marketplace: 'US', product_type: '女士 925 纯银镶锆石戒指', selling_points: ['叠戴', '低调细圈'],
      material: '925 sterling silver', craft: '爪镶', specifications: { sizes: [5, 6, 7, 8, 9] },
      target_audience: ['women'],
    },
    positive_attributes: {
      material: ['925 sterling silver', 'sterling silver'], audience: ['women'], style: ['stackable', 'dainty'],
      occasion: ['anniversary', 'gift for her'], feature: ['cubic zirconia'],
    },
    conflict_redlines: { material: ['14k', 'gold', 'stainless steel'], compliance: ['kids'] },
    competitor_brands: ['LunaNova'],
    exact_negatives: ['engagement jewelry'],
    competitors: [
      { asin: seed, tier: 'seed', variant_note: '主力子体 size 7', reason: '同材质同款式' },
      { asin: direct, tier: 'direct', variant_note: '主力子体 size 6', reason: '同价位叠戴戒指' },
      { asin: similar, tier: 'similar', variant_note: '保留作场景词发现', reason: '不同宝石镶嵌样式' },
      { asin: similar2, tier: 'similar', variant_note: '主力子体 size 8', reason: '异材质宝石戒指' },
    ],
  });
  fs.writeFileSync(path.join(workspace, 'product_profile.json'), JSON.stringify(profile, null, 2) + '\n');

  const extend = new Excel.Workbook();
  const wide = extend.addWorksheet('拓展流量词');
  wide.addRow(['亚马逊美国站拓展流量词导出']);
  wide.addRow(['流量词', '月搜索量', 'CPC 建议竞价', '相关 ASIN', seed + ' 流量占比',
    seed + ' 自然排名', '自然排名 (' + direct + ')', '供需比', '点击集中度', '流量占比']);
  wide.addRows([
    ['Ring', '17,150', '$0.82', seed + ', ' + direct, '13.5%', 9, 22, 4.4, '48%'],
    [' ring  ', '17,150', '$0.82', seed + ', ' + direct, '13.5%', 9, 22, 4.4, '48%'],
    ['rings', 19500, 0.83, seed + ' ' + direct, '10%', 14, 42, 4.2, '43%'],
    ['sterling silver ring', 5200, 0.76, seed + ', ' + direct, '7.2%', 17, 23, 3.6, '38.2%'],
    ['sterling silver rings for women', 4800, 0.79, seed, '6%', 12, null, 3.1, '39%'],
    ['dainty sterling silver stackable ring', 570, '0.48', seed, '1.1%', 44],
    ['gift for her', 900, 0.29, seed, '1.3%', 47],
    ['jewelry', 50200, 1.21, direct, null, null, 62],
    ['14k gold-plated ring', 1300, 1.12, seed, '0.6%', 70],
    ['LunaNova stacking ring', 640, 0.9, seed, '0.8%', 66],
    ['opal stackable ring', 650, 0.4, similar + ' ' + similar2, null, null, null, null, null, '0.7%'],
    ['engagement jewelry', 3700, 0.7, similar],
    ['B0TEST3001', 0, null, seed],
    ['#@@#', null, null, seed],
    ['silver band', 420, 0.35, null, '0.4%', 49],
  ]);
  for (const [index, modifier] of ['dainty', 'minimalist', 'polished', 'delicate', 'slim', 'little',
    'simple', 'petite', 'thin', 'classic', 'stackable', 'round'].entries()) {
    for (let size = 5; size <= 11; size++) {
      wide.addRow([modifier + ' sterling silver ring size ' + size, 800 - index * 21 - size * 6, 0.44, seed, '0.3%', 56]);
    }
  }
  await extend.xlsx.writeFile(path.join(raw, 'extend_30d_2026-11-20.xlsx'));

  const reverse = new Excel.Workbook();
  const sheet = reverse.addWorksheet('Reverse Keywords');
  sheet.addRow(['Keyword', 'Period', 'Market', 'Monthly Search Volume', 'Suggested Bid',
    'Organic Rank', 'Ad Rank', 'Organic Traffic Share', 'Ad Traffic Share', 'Click Concentration', 'Supply Demand Ratio']);
  sheet.addRows([
    ['Ring', 'history', 'US', 35000, 1.65, 5, 9, '19%', '8%', '56%', 6.8],
    ['Ring', '30d', 'US', 18000, 0.9, 8, 26, 0.16, '4%', '51%', 4.5],
    ['sterling silver ring', '30d', 'US', 5400, 0.74, 13, 18, '8.2%', '33%', '40%', 3.4],
    ['silver plated promise ring', null, 'US', 110, 0.38, 69, 50, '0.1%', '0.3%', null, null],
  ]);
  sheet.getCell('H3').numFmt = '0.0%';
  await reverse.xlsx.writeFile(path.join(raw, 'reverse_' + seed + '_2026-11-20.xlsx'));
}

function syntheticTags(batch) {
  const tags = {
    ring: [1, 'ring', 'S-核心精准', '戒指'],
    rings: [1, 'ring', 'S-核心精准', '戒指'],
    'sterling silver ring': [2, 'sterling silver ring', 'S-核心精准', '纯银戒指'],
    'sterling silver rings for women': [3, 'sterling silver ring for women', 'S-核心精准', '女士纯银戒指'],
    'gift for her': [5, 'gift for her', 'A-高度相关', '送给她的礼物'],
    jewelry: [0, 'jewelry', 'B-弱相关扩展', '首饰'],
    'opal stackable ring': [3, 'opal stackable ring', 'A-高度相关', '蛋白石叠戴戒指'],
    'engagement jewelry': [0, 'engagement jewelry', 'B-弱相关扩展', '订婚首饰'],
    'silver band': [2, 'silver band', 'A-高度相关', '银质指环'],
    'silver plated promise ring': [3, 'silver plated promise ring', 'X-属性冲突', '镀银承诺戒指', ['silver plated']],
  };
  return batch.map(({ normalized_keyword: key }) => {
    const [level, root, relevance, meaning, conflict = []] = tags[key] ??
      [4, key, 'A-高度相关', '纯银长尾戒指'];
    return { normalized_keyword: key, zh_meaning: meaning, level: LEVELS[level], canonical_root: root,
      relevance, conflict_terms: conflict, reason: '模拟打标，仅用于验证链路' };
  });
}

function cells(sheet) {
  const keys = sheet.getRow(1).values.slice(1);
  return sheet.getRows(2, sheet.rowCount - 1)?.map(row =>
    Object.fromEntries(keys.map((key, index) => [key, row.getCell(index + 1).value]))) ?? [];
}

async function verifyWorkbook() {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(book);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), SHEETS);
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.views[0].state, 'frozen', sheet.name);
    assert.equal(sheet.views[0].ySplit, 1, sheet.name);
    assert.ok(sheet.autoFilter, sheet.name);
    assert.ok(sheet.getColumn(1).width >= 9, sheet.name);
  }
  const plan = workbook.getWorksheet(SHEETS[0]);
  assert.equal(plan.getCell('K2').numFmt, '#,##0');
  assert.equal(plan.getCell('I2').numFmt, '0.0%');
  assert.equal(plan.getCell('L1').value, 'CPC 建议竞价');
  assert.equal(plan.getCell('L2').numFmt, '#,##0.00');
  assert.equal(typeof plan.getCell('L2').value, 'number');
  assert.ok(!cells(plan).some(row => row['关键词'] === 'opal stackable ring'));
  const neg = cells(workbook.getWorksheet(SHEETS[1]));
  assert.ok(neg.some(row => row['否定词'] === 'gold' && row['否定匹配方式'] === 'Negative Phrase'));
  assert.ok(neg.some(row => row['否定词'] === 'LunaNova stacking ring' && row['否定匹配方式'] === 'Negative Exact'));
  assert.ok(cells(workbook.getWorksheet(SHEETS[3])).some(row => row['词根或修饰词'] === 'sterling silver'));
  assert.ok(cells(workbook.getWorksheet(SHEETS[4])).every(row => row['覆盖关键词总数'] > 0));
  assert.ok(cells(workbook.getWorksheet(SHEETS[5])).some(row => row['流量类型'] === '广告'));
  return workbook;
}

async function main() {
  resetFixture();
  await makeSources();
  const first = stage(0);
  assert.equal(first['规则预拦截数'], 4);
  assert.equal(first['剩余待打标批次数'], 2);
  const original = counts();
  const [ring] = inspect('SELECT * FROM keywords_master WHERE normalized_keyword = ?', 'ring');
  assert.equal(ring.display_keyword, 'Ring');
  assert.equal(ring.market_monthly_search_volume, 18000);
  assert.equal(ring.cpc_suggested_bid, 0.9);
  assert.equal(ring.data_period, '30d');
  assert.equal(ring.direct_coverage_count, 2);
  assert.equal(ring.organic_top30_count, 2);
  assert.equal(ring.max_traffic_share, 0.16);
  const [recentConflicting] = inspect('SELECT dominant_traffic_type FROM keywords_master WHERE normalized_keyword = ?', 'sterling silver ring');
  assert.equal(recentConflicting.dominant_traffic_type, '广告主导');
  const [similarResult] = inspect('SELECT similar_only_flag FROM keywords_master WHERE normalized_keyword = ?', 'opal stackable ring');
  assert.equal(similarResult.similar_only_flag, 1);

  const batches = listFiles(pending, /^batch_\d{2,}\.json$/);
  const batchesToWrite = batches.map(name => [name, syntheticTags(readJson(path.join(pending, name)))]);
  assert.equal(batchesToWrite[0][1].length, 80);
  const [firstBatch, firstTags] = batchesToWrite[0];
  const firstTagFile = path.join(tagged, firstBatch);
  fs.writeFileSync(firstTagFile, JSON.stringify([...firstTags.slice(1), { ...firstTags[1], normalized_keyword: 'nonexistent test keyword' }]));
  assert.match(stage(1, 1), /批次外.*[\s\S]*缺少/);
  assert.equal(inspect("SELECT count(*) AS n FROM keywords_master WHERE tag_source = 'ai'")[0].n, 0);

  for (const [name, records] of batchesToWrite) {
    fs.writeFileSync(path.join(tagged, name), JSON.stringify(records, null, 2) + '\n');
  }
  const resumed = stage(0);
  assert.equal(resumed['已通过文件预检批次数'], 2);
  assert.equal(resumed['剩余待打标批次数'], 0);
  assert.deepEqual(stage(1), { 本次批次校验数: 2, 已入库分类数: original.master - 4, 漏词数: 0, 格式错误数: 0 });
  const firstExport = stage(2);
  const workbook = await verifyWorkbook();
  const master = workbook.getWorksheet(SHEETS[2]);
  const edited = master.getRows(2, master.rowCount - 1).find(row => row.getCell(24).value === 'ring');
  edited.getCell(5).value = 'B-弱相关扩展';
  edited.getCell(19).value = true;
  edited.getCell(23).value = '人工锁定冒烟验证';
  await workbook.xlsx.writeFile(book);

  const repeated = stage(0);
  assert.equal(repeated['人工锁定回写数'], 1);
  // A changed batch forces the validator to attempt a fresh write for every item.
  firstTags.find(item => item.normalized_keyword === 'ring').reason += '；模拟复核更新';
  fs.writeFileSync(firstTagFile, JSON.stringify(firstTags, null, 2) + '\n');
  const secondValidation = stage(1);
  assert.ok(secondValidation['已入库分类数'] > 0);
  const secondExport = stage(2);
  assert.deepEqual(counts(), original);
  const last = await verifyWorkbook();
  const locked = cells(last.getWorksheet(SHEETS[2])).find(row => row['标准化关键词'] === 'ring');
  assert.equal(locked['相关性'], 'B-弱相关扩展');
  assert.equal(locked.Manual_Lock, true);
  assert.equal(locked['备注'], '人工锁定冒烟验证');
  assert.equal(locked['标注来源'], 'manual');
  assert.ok(!cells(last.getWorksheet(SHEETS[0])).some(row => row['关键词'] === locked['关键词']));
  assert.equal(firstExport['建议投放词数'] - secondExport['建议投放词数'], 1);
  assert.equal(readJson(path.join(output, 'keywords_snapshot.json')).keywords.length, original.master);

  console.log(JSON.stringify({
    结果: '通过', 去重后主表记录数: original.master, 去重来源明细记录数: original.details, 每批上限: 80,
    已验证批次: batchesToWrite.map(([, records]) => records.length),
    漏词和批次外关键词: '被拒绝且事务未写入', 两轮统计一致: true,
    市场口径: 'ring 近30天 18,000，建议竞价 0.90，覆盖 2/2',
    人工锁定复跑验证: locked['相关性'], 工作表: SHEETS, 否定词组: secondExport['否定词组'],
    否定精准: secondExport['否定精准'],
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
