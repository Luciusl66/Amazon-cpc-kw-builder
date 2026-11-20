# Amazon CPC 关键词库

**简体中文** · [English](README.en.md)

面向亚马逊手动商品广告的本地关键词工具链。将卖家精灵的「拓展流量词」和「关键词反查」报表清洗去重，按竞品 ASIN 汇总覆盖和排名。脚本先排除无效词、竞品品牌和已知冲突。其余词分批交给 Codex 做语义分级，最终导出投放计划、前置否词和可追溯的关键词总库。

- 每个 SKU 独立保存档案、SQLite 数据库和 Excel。
- 市场搜索量与建议竞价按来源和周期取值。竞品覆盖按 ASIN 去重。
- 待打标任务每批最多 80 个词。支持断点续跑和 Excel 人工锁定回写。
- 脚本使用 Node.js 内置 SQLite 和 ExcelJS。无需 Codex CLI、外部付费 API 或本地 C++ 编译。

## 安装和验证

从 GitHub 的 **Code** 菜单克隆或下载项目。安装 Node.js 24 或更高版本，在项目根目录执行：

```bash
node --version
npm ci
npm test
```

测试用模拟数据跑两轮全流程，在 `workspace/_smoke_test/output/` 生成示例 Excel 和 JSON 快照。实际运营请为每个产品创建独立 SKU 目录。

## 处理一个 SKU

1. 在 Codex 中按 [Skill](SKILL.md) 提供种子 ASIN 或 Amazon 商品链接。Codex 会读取商品页、自动生成 `workspace/{SKU}/product_profile.json`，并继续筛选竞品。可附自己的 SKU 和目标站点。以下命令以 `RING-925` 为例。
2. 从卖家精灵导出两类 `.xlsx` 报表，放入 `workspace/RING-925/raw_exports/`。
3. 运行导入，在 Codex 桌面端按 [Skill](SKILL.md) 处理 `pending/`，将结果写入 `tagged/` 同编号的 JSON。
4. 执行校验和导出。校验报错时先修正批次文件。

```bash
npm run ingest -- RING-925
npm run validate -- RING-925
npm run export -- RING-925
```

工作簿的六张表为 CPC_投放计划表、前置否词清单、1-4级关键词总库、词根词频统计、竞品清单和来源明细。交付文件位于 `workspace/RING-925/output/`。

## 文档

- [操作手册](docs/operations.md)覆盖建档、报表命名、Codex 续跑、人工锁定和常见错误。
- [列名映射](references/column_mapping_guide.md)说明字段、周期和市场数据取值。
- [分级与打标契约](references/taxonomy_rules.md)说明语义分级、相关性和冲突词证据。
- [CPC 投放策略](references/cpc_strategy_matrix.md)说明广告结构、匹配方式及阈值。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
