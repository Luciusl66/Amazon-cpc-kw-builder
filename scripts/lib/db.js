'use strict';

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const marketFields = ['market_monthly_search_volume', 'supply_demand_ratio', 'click_concentration', 'cpc_suggested_bid'];
const sourceFields = [
  'normalized_keyword', 'asin', 'data_period', 'traffic_type', 'report_type', 'display_keyword', 'market',
  ...marketFields, 'organic_rank', 'ad_rank', 'traffic_share', 'observed_at',
  'source_file', 'source_sheet', 'source_row', 'raw_json',
];
const aggregates = [
  'display_keyword', ...marketFields, 'data_period', 'market_sources', 'direct_coverage_count', 'direct_coverage_rate',
  'similar_only_flag', 'organic_top30_count', 'max_traffic_share', 'dominant_traffic_type', 'sources',
];

function openDb(file, create = false) {
  if (!create && !fs.existsSync(file)) throw new Error('找不到关键词数据库，请先执行导入');
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS keywords_master (
        normalized_keyword TEXT PRIMARY KEY NOT NULL, display_keyword TEXT NOT NULL,
        market_monthly_search_volume REAL, supply_demand_ratio REAL, click_concentration REAL,
        cpc_suggested_bid REAL, data_period TEXT, market_sources TEXT NOT NULL,
        direct_coverage_count INTEGER NOT NULL, direct_coverage_rate REAL,
        similar_only_flag INTEGER NOT NULL, organic_top30_count INTEGER NOT NULL,
        max_traffic_share REAL, dominant_traffic_type TEXT, sources TEXT NOT NULL,
        zh_meaning TEXT, level TEXT, canonical_root TEXT, relevance TEXT,
        conflict_terms TEXT NOT NULL DEFAULT '[]', reason TEXT, notes TEXT,
        tag_source TEXT, manual_lock INTEGER NOT NULL DEFAULT 0, batch_number INTEGER,
        change_status TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS batch_number_idx ON keywords_master(batch_number);
      CREATE TABLE IF NOT EXISTS source_details (
        normalized_keyword TEXT NOT NULL, asin TEXT NOT NULL, data_period TEXT,
        traffic_type TEXT NOT NULL, report_type TEXT NOT NULL, display_keyword TEXT NOT NULL, market TEXT,
        market_monthly_search_volume REAL, supply_demand_ratio REAL, click_concentration REAL,
        cpc_suggested_bid REAL, organic_rank INTEGER, ad_rank INTEGER, traffic_share REAL,
        observed_at REAL NOT NULL, source_file TEXT NOT NULL, source_sheet TEXT NOT NULL,
        source_row INTEGER NOT NULL, raw_json TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS source_details_key
        ON source_details(normalized_keyword, asin, coalesce(data_period, ''), traffic_type, report_type);
      CREATE TABLE IF NOT EXISTS source_spellings (
        source_file TEXT NOT NULL, source_sheet TEXT NOT NULL, source_row INTEGER NOT NULL,
        normalized_keyword TEXT NOT NULL, display_keyword TEXT NOT NULL,
        PRIMARY KEY (source_file, source_sheet, source_row)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS batch_runs (
        batch_number INTEGER PRIMARY KEY, validated_at TEXT NOT NULL, content_hash TEXT NOT NULL
      ) STRICT;

    `);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

async function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function syncSourceDetails(db, rows, files) {
  const knownMarkets = db.prepare('SELECT DISTINCT market FROM source_details WHERE market IS NOT NULL').all()
    .map(row => row.market);
  const markets = new Set([...knownMarkets, ...rows.map(row => row.market).filter(Boolean)]);
  if (markets.size > 1) throw new Error('同一 SKU 的报表包含多个站点，请拆分工作目录');
  const duplicateQuality = [...marketFields, 'organic_rank', 'ad_rank', 'traffic_share']
    .map(field => '(' + field + ' IS NOT NULL)').join(' + ');
  const excludedQuality = duplicateQuality.replace(/\b\w+(?= IS)/g, 'excluded.$&');
  const upsert = db.prepare(`
    INSERT INTO source_details (${sourceFields.join(', ')}) VALUES (${sourceFields.map(() => '?').join(', ')})
    ON CONFLICT DO UPDATE SET ${sourceFields.slice(5).map(field => field + ' = excluded.' + field).join(', ')}
    WHERE excluded.observed_at > source_details.observed_at
      OR (excluded.observed_at = source_details.observed_at AND (
        ${excludedQuality} > ${duplicateQuality}
        OR (${excludedQuality} = ${duplicateQuality} AND
          (excluded.source_file, excluded.source_sheet, -excluded.source_row) >
          (source_details.source_file, source_details.source_sheet, -source_details.source_row))
        OR (excluded.source_file = source_details.source_file AND excluded.source_sheet = source_details.source_sheet
          AND excluded.source_row = source_details.source_row AND excluded.raw_json <> source_details.raw_json)
      ))
  `);
  const resetSpellings = db.prepare('DELETE FROM source_spellings WHERE source_file = ?');
  for (const file of files) resetSpellings.run(file);
  const spelling = db.prepare('INSERT OR IGNORE INTO source_spellings VALUES (?, ?, ?, ?, ?)');
  for (const row of rows) {
    spelling.run(row.source_file, row.source_sheet, row.source_row, row.normalized_keyword, row.display_keyword);
    upsert.run(...sourceFields.map(field => row[field]));
  }

}

const periodScore = { '30d': 2, history: 0 };

function authority(a, b) {
  return (periodScore[b.data_period] ?? 1) - (periodScore[a.data_period] ?? 1) ||
    b.observed_at - a.observed_at ||
    Number(b.report_type === 'reverse') - Number(a.report_type === 'reverse') ||
    a.source_file.localeCompare(b.source_file, 'en') ||
    a.source_sheet.localeCompare(b.source_sheet, 'en') || a.source_row - b.source_row;
}

function sourceIdentity(row) {
  return JSON.stringify([row.source_file, row.source_sheet, row.source_row]);
}

function groupBy(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[field];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function calculate(rows, tiers, coreTotal, display) {
  const ordered = [...rows].sort(authority);
  const marketRows = ordered.filter(row => marketFields.some(field => row[field] !== null));
  const marketPeriod = (marketRows[0] ?? ordered[0]).data_period;
  const provenance = {};
  const marketValues = marketFields.map(field => {
    const source = marketRows.find(row => row.data_period === marketPeriod && row[field] !== null);
    if (source) provenance[field] = [source.source_file, source.source_sheet, source.source_row, source.asin || null];
    return [field, source?.[field] ?? null];
  });
  const coverage = new Set(rows.map(row => row.asin).filter(Boolean));
  const attributed = new Set(rows.filter(row => row.asin).map(sourceIdentity));
  const unresolved = rows.some(row => !row.asin && !attributed.has(sourceIdentity(row)));
  const core = new Set([...coverage].filter(asin => ['seed', 'direct'].includes(tiers.get(asin))));
  const active = [...groupBy(ordered, 'asin').values()].flatMap(group =>
    group.filter(row => row.data_period === group[0].data_period));
  const organicTop = new Set(active
    .filter(row => core.has(row.asin) && row.organic_rank !== null && row.organic_rank <= 30)
    .map(row => row.asin));
  const shares = active.map(row => row.traffic_share).filter(value => value !== null);
  const typed = ['organic', 'ad'].map(type => {
    const values = active.filter(row => row.traffic_type === type && row.traffic_share !== null)
      .map(row => row.traffic_share);
    return values.length ? Math.max(...values) : null;
  });
  let dominant = null;
  if (typed[0] !== null || typed[1] !== null) {
    dominant = typed[0] === typed[1] ? '并列' : (typed[0] ?? -1) > (typed[1] ?? -1) ? '自然主导' : '广告主导';
  } else {
    const types = new Set(active.map(row => row.traffic_type).filter(type => type !== 'unknown'));
    if (types.size === 1 && types.has('organic')) dominant = '自然主导';
    if (types.size === 1 && types.has('ad')) dominant = '广告主导';
  }
  return {
    display_keyword: display ?? ordered[0].display_keyword,
    ...Object.fromEntries(marketValues),
    data_period: marketPeriod, market_sources: JSON.stringify(provenance),
    direct_coverage_count: core.size, direct_coverage_rate: coreTotal ? core.size / coreTotal : null,
    similar_only_flag: Number(!unresolved && coverage.size > 0 &&
      [...coverage].every(asin => tiers.get(asin) === 'similar')),
    organic_top30_count: organicTop.size,
    max_traffic_share: shares.length ? Math.max(...shares) : null, dominant_traffic_type: dominant,
    sources: JSON.stringify([...new Set(rows.map(row => row.source_file))].sort()),
  };
}

function status(previous, next) {
  if (!previous) return 'NEW';
  const oldVolume = previous.market_monthly_search_volume;
  const current = next.market_monthly_search_volume;
  if (previous.data_period === next.data_period && oldVolume !== null && current !== null) {
    if (current > oldVolume && (oldVolume === 0 || current >= oldVolume * 1.2)) return 'TREND_UP';
    if (current < oldVolume && current <= oldVolume * 0.8) return 'TREND_DOWN';
  }
  return 'EXISTING';
}

function refreshMaster(db, profile, now) {
  const tiers = new Map(profile.competitors.map(item => [item.asin, item.tier]));
  const coreTotal = profile.competitors.filter(item => item.tier !== 'similar').length;
  const previousRows = new Map(db.prepare('SELECT * FROM keywords_master').all().map(row => [row.normalized_keyword, row]));
  const aliases = db.prepare(
    'SELECT normalized_keyword, display_keyword, count(*) AS n FROM source_spellings ' +
    'GROUP BY normalized_keyword, display_keyword ORDER BY normalized_keyword, n, display_keyword COLLATE BINARY DESC'
  ).all();
  const spellings = new Map(aliases.map(row => [row.normalized_keyword, row.display_keyword]));
  const rows = db.prepare('SELECT * FROM source_details ORDER BY normalized_keyword').iterate();
  const write = db.prepare(`
    INSERT INTO keywords_master (normalized_keyword, ${aggregates.join(', ')}, change_status, first_seen_at, last_updated_at)
    VALUES (${Array.from({ length: aggregates.length + 4 }, () => '?').join(', ')})
    ON CONFLICT(normalized_keyword) DO UPDATE SET
      ${aggregates.map(field => field + ' = excluded.' + field).join(', ')},
      change_status = excluded.change_status, last_updated_at = excluded.last_updated_at
  `);
  function refresh(key, batch) {
    const next = calculate(batch, tiers, coreTotal, spellings.get(key));
    const prev = previousRows.get(key);
    if (prev && aggregates.every(field => prev[field] === next[field])) return;
    write.run(key, ...aggregates.map(field => next[field]), status(prev, next), prev?.first_seen_at ?? now, now);
  }
  let key;
  let batch = [];
  for (const row of rows) {
    if (batch.length && key !== row.normalized_keyword) {
      refresh(key, batch);
      batch = [];
    }
    key = row.normalized_keyword;
    batch.push(row);
  }
  if (batch.length) refresh(key, batch);
}

function writeTag(db, tag, source, now) {
  const locked = source === 'manual';
  const clause = locked ? '' : 'AND manual_lock = 0';
  return db.prepare(`
    UPDATE keywords_master SET zh_meaning = coalesce(?, zh_meaning), level = ?, canonical_root = ?,
      relevance = ?, conflict_terms = ?, reason = coalesce(?, reason),
      notes = CASE WHEN ? THEN ? ELSE notes END, tag_source = ?, manual_lock = ?, last_updated_at = ?
    WHERE normalized_keyword = ? ${clause}
  `).run(
    tag.zh_meaning ?? null, tag.level, tag.canonical_root, tag.relevance, JSON.stringify(tag.conflict_terms),
    tag.reason ?? null, Number(locked), tag.notes ?? null, source, Number(locked), now, tag.normalized_keyword,
  ).changes;
}

module.exports = { openDb, transaction, syncSourceDetails, refreshMaster, writeTag };
