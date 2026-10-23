# ICST cookie inventory

`inventory.json` is the single source of the cookie notice (`/cookie-notice/` renders it as a table through the `cookieInventory` block). Fill `cookies` with every cookie and browser-storage item the live site really sets (check the browser, the form, any analytics, fonts or embeds), each with `name`, `provider`, `purpose`, `category` (essential, functional, analytics, marketing), `duration`, `firstParty`. Then set `status` to `APPROVED` and `reviewedOn` to the date counsel or the owner approved the list.

Status `APPROVED` (owner, 23 Oct 2026, reviewedOn 2026-10-23): the page shows the table. While `status` is `PENDING_REAL_LIST` or `PENDING_OWNER_COUNSEL_REVIEW` the page says the list is being confirmed, and under the production policy (`H2O_INDEXING_POLICY=production`) the page refuses to render (COPY_PENDING_APPROVAL): an empty or guessed list must not be published.
