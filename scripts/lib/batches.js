'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { LEVELS, RELEVANCES, FIELDS, tokens, hasPhrase, listFiles, writeAtomic } = require('./project');

const PATTERN = /^batch_\d{2,}\.json$/;
const keys = ['normalized_keyword', ...FIELDS].sort();
const batchName = id => 'batch_' + String(id).padStart(2, '0') + '.json';

function conflictTerms(keyword, raw, allowWholePhrase = false) {
  if (!Array.isArray(raw) || raw.some(term => typeof term !== 'string')) throw new Error('conflict_terms 必须是字符串数组');
  const terms = raw.map(term => tokens(term).join(' '));
  if (terms.some(term => !term || tokens(term).length > 2 || !hasPhrase(keyword, term) ||
      (!allowWholePhrase && tokens(keyword).length > 1 && tokens(keyword).join(' ') === term))) {
    throw new Error('冲突词根须原样出现在关键词中、含 1–2 个词，且不能复制整条词组');
  }
  if (new Set(terms).size !== terms.length) throw new Error('冲突词根重复');
  return terms;
}

function manifests(db) {
  const rows = db.prepare(`
    SELECT normalized_keyword, display_keyword, market_monthly_search_volume,
      direct_coverage_count, direct_coverage_rate, similar_only_flag, batch_number, manual_lock
    FROM keywords_master WHERE batch_number IS NOT NULL ORDER BY batch_number, normalized_keyword
  `).all();
  const groups = new Map();
  for (const { batch_number, ...row } of rows) {
    const name = batchName(batch_number);
    if (!groups.has(name)) groups.set(name, { id: batch_number, rows: [] });
    groups.get(name).rows.push(row);
  }
  return groups;
}

function validateFile(file, manifest) {
  const raw = fs.readFileSync(file, 'utf8');
  const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(input)) throw new Error('批次内容必须为 JSON 数组');
  const expected = new Set(manifest.rows.map(row => row.normalized_keyword));
  const errors = [];
  const tags = [];
  for (const [index, item] of input.entries()) {
    try {
      if (!item || Array.isArray(item) || Object.keys(item).sort().join('\0') !== keys.join('\0')) {
        throw new Error('字段必须与打标契约完全一致');
      }
      const keyword = item.normalized_keyword;
      if (!expected.delete(keyword)) throw new Error('批次外或重复关键词：' + keyword);
      for (const key of ['zh_meaning', 'canonical_root', 'reason']) {
        if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(key + ' 必须是非空文本');
      }
      if (!LEVELS.includes(item.level) || !RELEVANCES.includes(item.relevance)) throw new Error('级别或相关性不在枚举中');
      item.conflict_terms = conflictTerms(keyword, item.conflict_terms);
      if ((item.relevance === 'X-属性冲突') !== Boolean(item.conflict_terms.length)) {
        throw new Error('仅 X-属性冲突应包含冲突词根，且至少一个');
      }
      tags.push(item);
    } catch (error) {
      errors.push('第 ' + (index + 1) + ' 项：' + error.message);
    }
  }
  if (expected.size) errors.push('缺少 ' + expected.size + ' 个词：' + [...expected].slice(0, 8).join('、'));
  if (errors.length) throw new Error(errors.join('\n'));
  return { tags, hash: createHash('sha256').update(raw).digest('hex') };
}

function publishPending(project, db) {
  const validated = new Set(db.prepare('SELECT batch_number FROM batch_runs').all().map(row => row.batch_number));
  const tagged = new Set(listFiles(project.tagged, PATTERN));
  let remaining = 0;
  let ready = 0;
  const wanted = new Set();
  for (const [name, manifest] of manifests(db)) {
    if (tagged.has(name)) {
      try {
        validateFile(path.join(project.tagged, name), manifest);
        ready++;
        continue;
      } catch (error) {
        console.warn(name + ' 未通过批次预检，可用 pending 重做：' + error.message);
      }
    } else if (validated.has(manifest.id) || manifest.rows.every(row => row.manual_lock)) {
      continue;
    }
    const rows = manifest.rows.map(({ manual_lock, ...row }) => row);
    writeAtomic(path.join(project.pending, name), JSON.stringify(rows, null, 2) + '\n');
    wanted.add(name);
    remaining++;
  }
  for (const stale of listFiles(project.pending, PATTERN)) {
    if (!wanted.has(stale)) fs.unlinkSync(path.join(project.pending, stale));
  }
  return { remaining, ready };
}

module.exports = { PATTERN, conflictTerms, manifests, validateFile, publishPending };
