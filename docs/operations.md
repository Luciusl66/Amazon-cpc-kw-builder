# 安装与操作手册

**简体中文** · [English](operations.en.md)

## 1. 准备环境

需要 Node.js 24+ 和 npm。Windows PowerShell、macOS 与 Linux 都可从项目根目录运行相同的 npm 命令。使用 Codex 桌面端打开项目，建档和语义打标均按根目录的 [SKILL.md](../SKILL.md) 执行。

```bash
npm ci
npm test
```

依赖安装使用 npm 注册表。安装完成后，清洗、数据库、校验和导出脚本在本机执行。测试会重建由本项目测试脚本生成的 `workspace/_smoke_test/` 数据。

## 2. 建档并准备报表

把种子 ASIN 或 Amazon 商品链接发给 Codex 即可开始建档，也可以附上 SKU 和目标站点。Codex 会读取商品页并生成 `workspace/{SKU}/product_profile.json`。已有同站点档案时接续使用。新商品未指定 SKU 时，默认用 ASIN 命名。目录名和档案中的 `sku` 必须一致。

Codex 按[竞品筛选与核验](../references/competitor_research.md)争取确认 10 个竞品 ASIN，并写入入选项的层级、主力子体说明和理由。反查暂不可用时可先生成种子档案和待核验名单。种子商品若用于反查，可额外以 `seed` 存档。以下以指定 SKU `RING-925` 为例。

从卖家精灵手动导出同一站点的 `.xlsx` 报表，将原文件放入 `workspace/RING-925/raw_exports/`。建议在文件名中标注周期和日期。例如：

```text
workspace/RING-925/
├── product_profile.json
└── raw_exports/
    ├── extend_30d_2026-11-20.xlsx
    ├── reverse_B0TEST0001_30d_2026-11-20.xlsx
    └── reverse_B0TEST0001_history_2026-11-20.xlsx
```

`B0TEST0001` 为示例。正式运行时使用报表对应 ASIN。导出表头和空值规则见[列名映射](../references/column_mapping_guide.md)。

## 3. 导入、分批打标与校验

1. 运行 `npm run ingest -- RING-925`。在终端检查导入词数、复用数、预拦截数和待打标批次。
2. 让 Codex 结合产品档案以及[打标契约](../references/taxonomy_rules.md)，按编号读取 `pending/batch_XX.json` 并写入 `tagged/batch_XX.json`。每个输入词必须在同编号输出中出现一次。
3. 运行 `npm run validate -- RING-925`。修正文件名、漏词、多词、字段或枚举错误后复跑。一次校验通过后才提交该次分类。

跨会话继续时提供项目位置和 SKU，保留 SQLite 数据库和 `tagged/`。再次导入可识别有效批次并重建待处理清单。批次文件可根据终端提示补齐或修正。

## 4. 导出与人工回写

校验通过后运行 `npm run export -- RING-925`。终端输出投放词数、否词数、分级数量及示例。`workspace/RING-925/output/` 包含 `CPC_词库作战表.xlsx` 和 `keywords_snapshot.json`。

需要人工改级时，在 Excel 的「1-4级关键词总库」修改级别、标准词根、相关性、冲突词根或备注，并将该行 `Manual_Lock` 填为 TRUE 或「是」。保存到原输出位置，再运行导入，使修改写回 SQLite。之后依次完成校验与导出。锁定后的分类会跨批次保留。

更新词库时，把新增报表加入原 SKU 的 `raw_exports/`，沿用同一数据库运行上述流程。业务档案、来源报表、数据快照与作战表均保存在本地 SKU 目录，建议随业务数据一并备份。

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `node:sqlite` 无法加载 | 确认当前终端使用 Node.js 24+，然后重跑命令。 |
| 找不到报表或无法识别类型 | 检查 SKU 路径、`.xlsx` 格式及文件名。把「关键词」或「流量词」表头放在数据表前 35 行以内。 |
| 两份来源表的站点不一致 | 按站点独立建档并导入。 |
| 校验报缺少文件或批次外关键词 | 对照同编号清单修正文件名和原词键，检查每词只出现一次。 |
| 校验报冲突词不在原词中 | 填入原词实际包含的 1–2 个词，并核对指定冲突项。 |
| Excel 拒绝覆盖 | 保存并关闭正在使用的 Excel 文件，再运行脚本。若手改总库，先运行导入以回写锁定。 |

启动实际广告前，可按[投放策略](../references/cpc_strategy_matrix.md)复核竞价、匹配方式和前置否词。
