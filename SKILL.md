---
name: amazon-cpc-kw-builder
description: 从卖家精灵拓展流量词和关键词反查 Excel 建立或增量更新亚马逊手动商品广告的关键词库、语义级别、投放计划及前置否词。适用于按 SKU 建档和接续未完成的打标批次。
---

# 亚马逊 CPC 关键词库

在本项目根目录运行命令。使用 Codex 桌面端、Node.js 24+、内置 SQLite 和 ExcelJS。首次在项目根目录运行 `npm install`。每个 SKU 的数据库和文件独立存放。后续跑品调用已有脚本。

## 1. 建档与竞品确认

从 `workspace/_template/product_profile.json` 建立 `workspace/{SKU}/product_profile.json`。依据用户提供的产品、核心品类、限制和种子 ASIN 填写卖点、分级词典及红线。补充最多 10 个核心竞品（含种子）与 3 个相似品，逐个说明依据及主力子体。以纯文本逐行列出建议 ASIN，等待用户确认；缺证据的候选保持待确认状态。

## 2. 人工导出

提示用户在同一站点从卖家精灵导出「拓展流量词」和「关键词反查」，置于 `workspace/{SKU}/raw_exports/`。命名、周期和数据含义见 [字段映射](references/column_mapping_guide.md)。原始表与已编辑作战表用于下一轮导入。

## 3. 导入与预打标

运行 `npm run ingest -- {SKU}`。汇报总词数、规则预拦截数、已分类复用数与待打标批次数。脚本读取上次总库中 `Manual_Lock` 为 TRUE 或「是」的行，锁定后的级别、标准词根、相关性、冲突词根和备注以人工编辑为准。沿用已建立的数据库和批次编号进行增量更新。

## 4. 分批打标与断点接力

结合产品档案和 [语义分级](references/taxonomy_rules.md)，按编号读取 `pending/batch_XX.json`，每批至多 80 词，逐个判断语义并写回 `tagged/batch_XX.json`。每条结果包含 `normalized_keyword`、`zh_meaning`、`level`、`canonical_root`、`relevance`、`conflict_terms`、`reason`。严格复用原词键，数值只作为选样和背景。使用枚举及词根证据，语义不确定时标记「待复核」。格式及示例见分级文档。

超过 8 批时提醒用户可以新开会话，提供 SKU 和项目位置接续。已有合格文件会跳过待打标生成。完成后运行 `npm run validate -- {SKU}`，修复报出的批次错误，直到漏词和格式错误均为 0。对于人工锁定行，批次文件仍按既有清单验证，入库时保留人工结果。

## 5. 导出与抽检

运行 `npm run export -- {SKU}`。核对 [投放策略](references/cpc_strategy_matrix.md) 与输出的六张表。交付 `workspace/{SKU}/output/CPC_词库作战表.xlsx` 和 `keywords_snapshot.json`。汇报各级别词数、两种前置否词数量，每级抽样 5–10 个代表词，少于 5 个时展示该级现有样本。新增源表或回写人工锁定时，从阶段三重新执行。
