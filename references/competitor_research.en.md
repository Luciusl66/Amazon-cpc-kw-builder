# Research and verify Amazon competitors

[简体中文](competitor_research.md) · **English**

Competitors draw from the same search or related-product traffic and can win the same purchase. Use material, design, and price to judge whether shoppers would compare the products. Use search results and reverse lookup data to verify that they compete for the same traffic.

## 1. Profile the product and choose seed keywords

- Start with an ASIN or an Amazon product link. Extract the ASIN from the `/dp/` or `/gp/product/` segment and check it against `^[A-Z0-9]{10}$`. Use the specified marketplace first, then the marketplace in the link, then the existing SKU profile. If none is known, use the US marketplace and state that assumption. Open the listing and verify the product and selected variant. If access and available evidence are insufficient, state what information is missing.
- Record the English product category, primary materials or functional specifications, audience and use cases, target price and its approximate ±20–30% range, and distinguishing features. Use the planned selling price when provided, otherwise use the verified listing price. Combine the product category with defining attributes to create two or three English seed keywords.

## 2. Collect about 30–50 candidates in the same marketplace

1. **Keyword search.** When available, use a clean browser session and record the target city’s postal code. Check the first two or three pages for each seed keyword. Record organic placements, ad placements, and ASINs that appear across multiple searches.
2. **Category rankings.** Identify the narrowest relevant category node. Use Best Sellers to find established competitors and benchmarks, and New Releases to find products that have started gaining traction in the past three months. Record the category and the date you checked each list.
3. **Image search and related listings.** Use Amazon image search when available to find similar designs. Open the three most relevant listings and collect ASINs that appear repeatedly in placements such as related sponsored products and Customers also viewed. Record the source and purchase context.
4. **Opportunity and keyword tools.** Where available, use Product Opportunity Explorer to find listings with high click share and emerging products in the same niche. SellerSprite or Helium 10 can help expand the list through keywords and related products.

Extract each full ASIN from its product link, remove duplicates, and exclude the seed ASIN from the candidate list. If an identifier is truncated or transcribed incorrectly, go back to the original link. Record the seed keywords, sources, and marketplace. If a source is unavailable, use the sources you can access and report what you covered.

## 3. Screen for fit and verify each listing

- Check the product’s main function, positioning, and purchase context. Treat a single ad impression as a lead. Products well outside the target price range may still qualify as benchmarks or substitutes if the purchase context supports it. Exclude listings with evidence of prolonged stockouts, abnormal merges of old reviews, or temporary promotion-driven rank spikes. For a single stockout observation, record the date and availability status.
- Open the clean `/dp/<ASIN>` link for each candidate in the target marketplace. Verify the final URL, title, and selected variant against the ASIN in the product details or page metadata. If the link redirects to another ASIN, check that the resulting variant fits, then rebuild the link with the verified ASIN, reopen it, and deduplicate. Use search snippets, recommendation cards, third-party indexes, and successful HTTP responses as discovery leads. Exclude missing products, challenge and error pages, redirects to other marketplaces or unrelated products, and variants you cannot verify.
- For listings with multiple variants, use available sales signals, keyword traffic, or category performance to identify the leading child ASIN for the purchase context. If the variant is verified but its sales position is unknown, record the exact variant and the evidence gap. Usually retain one representative child ASIN per parent listing. Shortlist about 10–15 ASINs for reverse lookup.

## 4. Confirm traffic overlap with reverse lookup and search results

- Run reverse lookup on the seed ASIN and shortlisted competitors using data from the same marketplace and period. Review highly relevant organic and ad keywords, plus sales data when available. Record shared keywords, rankings, traffic share, source, and reporting period. Label a keyword as generating orders only when the tool provides sales evidence for it.
- Normalize capitalization, spacing, and punctuation before deduplicating keywords. Report `shared highly relevant core keywords / comparable highly relevant core keywords for the seed ASIN` and give representative examples. Exclude branded queries, unrelated use cases, and overly broad category terms from the overlap measure. Review their traffic shares separately. Check the first screen of search results for shared terms to confirm shoppers can compare the products side by side. Repeated related placements and a shared purchase context can support a substitute classification.
- If comparable traffic shares are available, downgrade or exclude a candidate when roughly 80% of its traffic comes from branded searches or unrelated use cases. If you only have keyword counts, report counts. When the seed ASIN has too little reverse lookup data, use appearances alongside it for seed keywords to build a shortlist and record the missing traffic baseline.
- If reverse lookup is unavailable, provide a list of candidates with verified product pages and copyable ASINs. State which marketplace, period, or report is missing. Reuse existing exports when possible. Exclude any ASIN that you know cannot be found in reverse lookup for the target marketplace. Confirm direct competitors after verifying the traffic evidence.

## 5. Build a list of 10 competitor ASINs

| Type | Evidence to look for | How to use it |
| --- | --- | --- |
| Direct competitor | Same narrow category, similar core function or purchase purpose, price typically within about 20–30% of the target, overlap with most comparable core keywords, and search results that support a side-by-side comparison | Benchmark price, main image, and selling points. Find precise keywords and ASIN targets. |
| Category benchmark | Same niche, typically in the top 10–20 by Best Sellers Rank (BSR), substantial review count, and a history of stable organic placement and sales performance | Identify broad category keywords, review listing structure, and gauge the category’s potential. |
| Emerging competitor | Typically listed within the past three to six months, with relatively few reviews and a sustained rise in the same category across multiple observations. Prioritize products at a similar stage and with comparable review counts. | Study launch performance using available price, promotion, and rank history. |
| Potential substitute | Same purchase motivation or problem, with evidence of shared use-case keywords or related traffic. Form, material, or price may differ. | Find long-tail use-case keywords, assess related placements, and identify cross-category competition. |

Start with four direct competitors, two category benchmarks, two emerging competitors, and two potential substitutes. Adjust the mix based on evidence. Aim for 10 unique competitor ASINs and record the seed ASIN separately. Assign a listing to its primary research purpose. If fewer than 10 qualify, report the verified count and what evidence is missing.

For each listing, report its ASIN, link, title, variant, price, type, purchase context, and traffic evidence. For rank trends, include dates and the category. For keyword overlap, include representative keywords and the reverse lookup period. State the marketplace and verification date, and provide a plain-text list with one verified ASIN per line. Track price, promotions, ranking, and traffic mix on the same marketplace and update the list as evidence changes.

Write entries in `product_profile.json` under `competitors` using `asin`, `tier`, `variant_note`, and `reason`. Use `direct` when direct competition is verified and `similar` for other competitors kept for reference. Include the research type and evidence in `reason`. Record the child variant and verification details in `variant_note`. The seed product can use `seed` if you also run reverse lookup on it. Import reverse lookup reports for the seed and selected competitors into the keyword workflow. Keep mixed reports that include rejected candidates in the research folder and export data for the selected ASINs before adding reports to `raw_exports/`.
