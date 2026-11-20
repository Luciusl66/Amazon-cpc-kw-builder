'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { listFiles, run } = require('./lib/project');
const { readWorkbook } = require('./lib/column_mapper');
const { openDb, transaction, syncSourceDetails, refreshMaster, writeTag } = require('./lib/db');
const { ruleTag, classified } = require('./lib/rule_pretagger');
const { manualLocks } = require('./lib/manual_lock');
const { publishPending } = require('./lib/batches');

run(async project => {
  const files = listFiles(project.raw, /^(?!~\$).*\.xlsx$/i);
  if (!files.length) throw new Error('raw_exports 中没有 .xlsx 导出文件');
  for (const directory of [project.pending, project.tagged, project.output]) fs.mkdirSync(directory, { recursive: true });
  const db = openDb(project.dbFile, true);
  try {
    const report = await transaction(db, async () => {
      const locked = await manualLocks(project.book);
      const details = [];
      for (const file of files) {
        const result = await readWorkbook(path.join(project.raw, file), project.profile);
        details.push(...result.rows);
        for (const warning of result.warnings) console.warn(warning);
      }
      if (!details.length) throw new Error('原始报表没有可导入的关键词');
      const now = new Date().toISOString();
      syncSourceDetails(db, details, files);
      refreshMaster(db, project.profile, now);
      for (const tag of locked) {
        if (!writeTag(db, tag, 'manual', now)) {
          throw new Error('锁定关键词在数据库和原始报表中均不存在：' + tag.normalized_keyword);
        }
      }

      const rows = db.prepare('SELECT * FROM keywords_master ORDER BY normalized_keyword').all();
      const unmatched = [];
      let reused = 0;
      let pretagged = 0;
      for (const row of rows) {
        if (classified(row)) {
          reused++;
          continue;
        }
        const tag = ruleTag(row.normalized_keyword, project.profile, row.display_keyword);
        if (tag) {
          writeTag(db, tag, 'rule', now);
          pretagged++;
        } else if (row.batch_number === null) {
          unmatched.push(row);
        }
      }

      const maxId = db.prepare('SELECT coalesce(max(batch_number), 0) AS id FROM keywords_master').get().id;
      const assign = db.prepare('UPDATE keywords_master SET batch_number = ? WHERE normalized_keyword = ?');
      unmatched.forEach((row, index) => assign.run(maxId + 1 + Math.floor(index / 80), row.normalized_keyword));
      const rawUnique = db.prepare('SELECT count(*) AS total FROM source_details').get().total;
      return { 总词数: rows.length, 来源去重明细数: rawUnique, 人工锁定回写数: locked.length,
        规则预拦截数: pretagged, 已分类复用数: reused, 新增待打标词数: unmatched.length };
    });
    const pending = await transaction(db, () => publishPending(project, db));
    console.log(JSON.stringify({ ...report, 剩余待打标批次数: pending.remaining, 已通过文件预检批次数: pending.ready }));
  } finally {
    db.close();
  }
});
