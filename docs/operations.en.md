# Setup and operations

[简体中文](operations.md) · **English**

## 1. Install and test

Use Node.js 24 or later and npm. The same commands work from the repository root in Windows PowerShell, macOS, and Linux. Open the project in the Codex desktop app and use the project skill to set up products and classify keywords. [Codex skill (Simplified Chinese)](../SKILL.md)

```bash
npm ci
npm test
```

Dependencies come from the npm registry. Once installed, the import, database, validation, and export steps run locally. The smoke test rebuilds the generated sample data under `workspace/_smoke_test/`.

## 2. Set up a product and prepare the reports

Give Codex a seed ASIN or an Amazon product link. You can include a SKU and marketplace. Codex reads the listing and creates `workspace/{SKU}/product_profile.json`. It reuses an existing profile for the same product and marketplace. For a new product with no SKU specified, the ASIN is the default. The folder name and the profile’s `sku` value must match.

Codex aims to verify 10 competitor ASINs and records each selected listing’s tier, variant, and reason for inclusion. If reverse lookup data is unavailable, Codex can save the product profile and a list of candidates for later verification. If you also run reverse lookup on the seed product, it can be recorded under the `seed` tier. [Competitor research](../references/competitor_research.en.md)

Export both SellerSprite reports for the same marketplace and save the original `.xlsx` files under `workspace/{SKU}/raw_exports/`. Include the reporting period and date in the filename when possible. This example uses `RING-925` as the SKU and `B0TEST0001` as a sample ASIN. Use the ASIN represented in each live report. [SellerSprite field mapping](../references/column_mapping_guide.en.md)

```text
workspace/RING-925/
├── product_profile.json
└── raw_exports/
    ├── extend_30d_2026-11-20.xlsx
    ├── reverse_B0TEST0001_30d_2026-11-20.xlsx
    └── reverse_B0TEST0001_history_2026-11-20.xlsx
```

## 3. Import, classify, and validate

1. Run `npm run ingest -- RING-925`. Check the terminal for the keyword count, reused classifications, terms flagged by rules, and batches awaiting classification.
2. Have Codex review the product profile and classify each `pending/batch_XX.json` file. Save the results to `tagged/batch_XX.json` using the same batch number. Each input keyword must appear exactly once in its output batch. [Keyword classification and tagging](../references/taxonomy_rules.en.md)
3. Run `npm run validate -- RING-925`. Resolve any filename, missing or extra keyword, field, or allowed-value errors and rerun validation.

To resume in a new session, give Codex the project location and SKU. Keep the SQLite database and the `tagged/` folder. Re-importing recognizes valid batches and rebuilds the list of outstanding work. Use the terminal messages to identify files to complete or fix.

## 4. Export and preserve manual edits

After validation passes, run `npm run export -- RING-925`. The terminal summarizes campaign keywords, negative keywords, and classification counts. The `workspace/RING-925/output/` folder contains `CPC_词库作战表.xlsx` and `keywords_snapshot.json`.

To edit a classification manually, open `1-4级关键词总库` (Keyword inventory, levels 1–4). Edit the level, canonical root, relevance, conflict terms, or notes, then set the row’s `Manual_Lock` field to `TRUE` or `是`. Save the workbook at its original path and rerun import to write the locked edits to SQLite. Then validate and export again. Locked classifications carry over to future runs.

To refresh a SKU, add the new reports to its `raw_exports/` folder and use the same database. Back up the local SKU directory with its profile, source reports, snapshots, and workbook.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `node:sqlite` fails to load | Check that the current terminal uses Node.js 24 or later, then rerun the command. |
| Reports are missing or their type is unknown | Check the SKU path, `.xlsx` format, and filenames. Put a recognized keyword header such as `Keyword`, `Search Term`, `关键词`, or `流量词` within the first 35 rows. |
| Reports use different marketplaces | Keep a separate SKU profile and import for each marketplace. |
| Validation reports a missing file or a keyword outside the batch | Compare the matching batch files, restore the original keyword keys, and check that each appears exactly once. |
| Validation reports a conflict term missing from the query | Use a one- or two-word term that appears in the keyword and reflects the specified conflict. |
| Excel prevents the workbook from being overwritten | Save and close the workbook, then rerun the command. Import manual edits before re-exporting to preserve locked rows. |

Before launching campaigns, review bids, match types, and negative keywords. [CPC strategy](../references/cpc_strategy_matrix.en.md)
