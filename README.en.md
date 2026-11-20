# Amazon CPC Keyword Builder

[简体中文](README.md) · **English**

Build a keyword plan for manual Amazon Sponsored Products campaigns from SellerSprite Excel exports. The project cleans and deduplicates keyword data, summarizes competitor coverage and reported rankings, and uses Codex to classify keywords by how closely they match your product. It exports an Excel campaign plan, a list of negative keywords, and a keyword inventory with source references.

## Getting started

You’ll need Node.js 24 or later, the Codex desktop app, and access to SellerSprite exports. From the repository root, install the dependencies and run the smoke test.

```bash
npm ci
npm test
```

The smoke test uses sample data and writes an example workbook and JSON snapshot to `workspace/_smoke_test/output/`.

## Build a keyword plan for one SKU

1. **Start with a product.** Open this repository in Codex and give it a seed ASIN or Amazon product link. You can also specify your SKU and marketplace. Codex reads the listing, builds a local product profile, and researches competitors on the same marketplace using the project skill. [Codex skill](SKILL.md)
2. **Export your keyword data.** In SellerSprite, export keyword expansion and reverse ASIN lookup reports for the same marketplace. Save the `.xlsx` files in `workspace/{SKU}/raw_exports/`. The importer supports English and Chinese column headers. [Supported columns](references/column_mapping_guide.md)
3. **Import and classify.** Run `npm run ingest -- YOUR-SKU`. Ask Codex to classify the batches under `pending/` and save the results under `tagged/`. Replace `YOUR-SKU` with the folder name created in step 1.
4. **Validate and export.** Run `npm run validate -- YOUR-SKU`, then `npm run export -- YOUR-SKU`. The Excel workbook and `keywords_snapshot.json` are saved in `workspace/{SKU}/output/`.

You can re-import new reports for the same SKU and keep classifications marked as manually locked in Excel. Each SKU’s profile, raw reports, SQLite database, and exports are stored locally. Workbook tabs and the detailed project guides are in Simplified Chinese.

## Reference guides

- [Operations guide](docs/operations.md) covers setup, file naming, and resuming a run.
- [Competitor research](references/competitor_research.md) explains how to verify ASINs and evaluate shared search traffic.
- [CPC strategy](references/cpc_strategy_matrix.md) covers campaign structure, match types, and negative keywords.

## License

Released under the [MIT License](LICENSE).
