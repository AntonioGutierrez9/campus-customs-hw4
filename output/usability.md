# Campus Customs — Usability Improvements (Problem 9)

Four improvements: two on the website and two in the shopping agent.

## 1. Product filters and sorting

**What I added:** The Products page now has a filter sidebar built only from fields that really exist in `campus_customs.db`:

- **Product type:** hoodies, crewnecks, t-shirts, quarter-zips, jackets & fleece, long sleeve (grouped from `garment_type`)
- **Color:** the garment's main color (the first entry in `colors`), grouped into Navy, Gray, Cream & White, and Coral
- **In stock in size:** XS–XXL, from the `inventory` table. It only shows products that actually have that size available.
- **Price:** Under $40, $40–$60, $60–$80, $80 & up (catalogue prices run from $32 to $98)
- **Sort:** name, price low to high, price high to low

Every option shows how many products it would give with the other filters applied. Options that would give 0 are grayed out, so you can't filter yourself into an empty page by accident. Active filters show as pills you can remove one by one, and "Clear all" resets everything. The filters are kept in the URL, so the Back button from a product page returns to the same filtered list. On phones the filters open as a full-screen panel. I took out the small search box from Problem 3, since the chatbot now handles product search.

**Why it helps:** A shopper who knows they want, say, a navy hoodie in size L under $80 can get there in a few clicks (102 products → 11) instead of scrolling the whole catalogue. The size filter is the big one. Out of 612 size/stock rows, 145 are sold out, so filtering by "in stock in my size" saves people from clicking into a product only to find their size is gone. For the store, shoppers finding the right item faster means fewer people giving up.

## 2. Favorites

**What I added:** A heart button on every product card (Products, Home, Favorites, and chat results) and a "Save to favorites" button on the product page. A new **Favorites** page in the navigation (with a count badge) shows everything saved, using the same product cards, which still open the normal product page.

- **Guests** can heart products during their visit. They're kept in the browser's memory and disappear on refresh, and the Favorites page says so.
- **Logged-in shoppers'** favorites are saved in a new `favorites` table in `campus_customs.db` (`user_id`, `product_id`, `created_at`), so they're still there next time. The API (`/api/favorites`) always uses the logged-in user from the session cookie, so nobody can see someone else's list.
- If a guest hearts things and *then* logs in, those favorites are added to their account, so nothing is lost.

**Why it helps:** Lots of shoppers browse first and decide later, especially when buying gifts or comparing a few college designs. Favorites let them build a shortlist instead of trying to remember product names. For the store, a saved list is a reason to come back, and it shows which products people are interested in.

## 3. Similar-product recommendations

**What I added:** A new agent tool, `find_similar_products`, in `backend/tools.py`. It compares one product with the rest of the catalogue using its garment type, main color, rarer search tags, shared name words (sharing "Pierson" counts much more than sharing "Crewneck"), description, and price. It can also be told to only show cheaper items or only the same kind of garment. On a product page it uses the product being viewed (the page context from Problem 8), so "Show me something similar" just works. The results appear on the page as product cards, the same way chat searches do (Problem 7).

Tested on the website:

- On the Pierson College Crewneck, "Show me something similar" returned other residential college crewnecks (Saybrook, Grace Hopper, Davenport…).
- On the same page, "something like this but cheaper?" put the **Pierson Logo T-Shirt ($32)** first, and every result was under $58.
- On the Yale Dad Hoodie, "Show me another sweatshirt like this" returned the Mom, Aunt, Grandpa, and Grandma hoodies.

**Why it helps:** It's what a good store employee does: "if you like this one, you might also like…". It helps shoppers who like a style but want a different price or family member, and it helps the store suggest more products (and cheaper alternatives instead of losing the sale).

## 4. Better natural-language product search

**What I added:** The agent's catalogue search now understands how people actually type:

- **Plurals:** "hoodies" → hoodie, "sweatshirts" → sweatshirt
- **Common clothing synonyms:** tee → t-shirt, grey → gray, crew neck → crewneck, 1/4 zip / half zip → quarter-zip, zip-up → full-zip, sweater ↔ sweatshirt, dark blue → navy, mother → mom
- **Partial words:** "pier" finds Pierson (words are matched from the start, so "art" doesn't match "quarter")
- **Small typos:** "hoddies" → hoodie, "sweatshrit" → sweatshirt, "piersen" → Pierson. Typos are fixed against words that actually appear in the catalogue.
- **Combinations:** "navy hoodie" and "gray Yale sweatshirt" need every word to match, and color words only match the garment's main color.

When nothing matches, the tool also says which words don't exist anywhere in the catalogue. So for "pink hoodies" the agent says there are no pink items at all instead of offering "pink items in other styles" that don't exist. Everything still comes from `campus_customs.db`.

Tested on the website: "grey crew neck sweaters" → 15 gray crewnecks, "show me your hoddies in dark blue" → 17 navy hoodies, "any 1/4 zips?" → 12 quarter-zips, "something for my mother" → the 2 Mom items, "pink hoodies" → honestly none.

**Why it helps:** Shoppers shouldn't need to know that our catalogue says "1 4 Zip" or "Crewneck". Before this, a typo or a different word gave "we don't have that" even when we did, which loses a sale and makes the chatbot look broken.
