# Client template (KIT-0)

`create-site` copies this folder to `clients/<slug>/` and replaces `icst`, `International Cooling Solutions (Thailand)`, `International Cooling Solutions (Thailand) Co., Ltd.`, `ICST`, `icsthailand.co.th` and `ICST`.

The offices, phones, senders and seed content here are the synthetic client's obviously fake values on purpose: **replace every one of them**. They are on the `example-industrial` blocklist, so a build that still carries any of them fails the no-client-strings lint.

Then write the client's own `blocklist.json` (its names, domains, phones, addresses, persona, bucket names) and fill `review.allowedOverlap` only with strings the owner has said the client shares with another client.
