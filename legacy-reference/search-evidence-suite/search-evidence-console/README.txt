SEARCH EVIDENCE SUITE
by Syed.ai, sold through Website Content Strategy
(c) 2026 Syed.ai. All rights reserved.

Self-hosted build. One HTML file. Everything runs in the browser.


SIMPLE OR PRO
-------------
There is a switch in the top bar. It starts on Simple.

  Simple   ten stages, plain-English headings, and one sentence at the
           top of each stage explaining what it is for.
  Pro      all twenty-three stages and every advanced control.

Nothing is measured differently. The score in Simple mode is the same
number as the score in Pro mode, produced by the same engines from the
same files -- Simple hides stages, it does not simplify the analysis.
Switching to Pro shows more of the working, not a different answer.

The choice is remembered per project, so an agency can keep its own
audits in Pro and hand a client a project that opens in Simple.


USING YOUR OWN AI KEY (OPTIONAL)
--------------------------------
Stage 16, "AI assist", will explain a finding in plain English, read a
draft against the queries it is meant to answer, write a client summary,
or name your topic clusters.

It uses YOUR key from YOUR provider. There is no shared account and there
never will be -- a shared key would mean your drafts and your clients'
data going through somebody else's bill. Paste a key from Anthropic,
OpenAI, Google, or anything that speaks the OpenAI chat format, including
a model running on your own machine through Ollama.

  - The key is kept in this browser only. It is NOT saved inside a
    project, which matters because a project is the thing that would sync
    if you ever put the companion server in front of this -- so the key
    cannot travel by accident.
  - It is sent only to the provider you picked, and never appears in a
    report, an export, or an error message.
  - Anthropic is the one provider documented to accept a request straight
    from a browser. The others may refuse it, which a browser reports as
    a CORS block; the stage tests the connection and tells you which
    happened.

WHAT IT WILL NOT DO, EVER

Everything it writes is marked "generated" and no score, pillar, gate or
action rank can read any of it. That is enforced in the code, not just
promised: the scoring engines have no reference to the AI layer at all,
and a test fails the build if one ever appears.

The model is also told, in its own instructions, that it must use only
the numbers it is given -- no search volumes, no difficulty scores, no
traffic or ranking estimates -- and to say which measurement is missing
rather than filling the gap. A model asked about SEO will otherwise
invent a search volume, and an invented number in a client report is the
exact failure this whole tool exists to avoid.

WHAT IT COSTS

No price list ships with this tool, because prices change and a stale
one is worse than none. Type the two rates from your provider's pricing
page into the stage and it does the arithmetic on the tokens actually
used, shows a running total, and stops at a monthly figure you set. Your
provider's dashboard is still the only authority on what you were
billed.


TWO BUILDS, AND WHICH TO USE
---------------------------
  index.html + app.css + app.js
      Use these on a web host. Three files, in the same folder, all
      referenced by relative paths so a subfolder works.

  index-single-file.html
      The same application with the stylesheet and the code inside it.
      Use this one from a USB stick, an email attachment, or by
      double-clicking it -- anywhere there is no web server.

They are built from the same source and behave identically. The split
is not cosmetic: every caching and "optimisation" feature on a host or
a CDN -- LiteSpeed's CSS/JS combine, Cloudflare's minifier, Rocket
Loader -- exists to pull inline CSS and inline script out of a page and
rewrite them as separate files. When one of those rewrites lands on a
path that does not exist, which is what happens inside a subfolder, the
page renders as unstyled text with nothing working and no error
anywhere. With real files there is nothing left inline to rewrite.

If it ever does render as plain text, the page now tells you which half
failed: a red banner naming app.js means the script did not run, and a
line naming app.css means the stylesheet did not load. Open
yourdomain.com/yourfolder/app.css directly to check it is really there.


WHERE TO PUT IT
--------------
Anywhere that serves files. There is no install, no database, no build
step and no runtime.

  Shared hosting     Upload the whole folder by FTP or the file manager,
                     into public_html or a subfolder of it. A subfolder is
                     fine -- nothing here assumes it is at the root.
  Your own machine   Double-click index.html. It works from the disk.
  A VPS              See RUNNING IT AS A WEB APP, below.

Three things worth doing on shared hosting, in order of how much they
matter:

  1. Switch on SSL. Almost every host now includes a free certificate.
     Do it because Search Console will not accept an http:// origin, so
     the connector in stage 3 cannot work without it. The supplied
     .htaccess has a commented block that forces https once you have it.
  2. Password-protect the folder. This page holds your own Search Console
     data in your browser and is not meant to be public. .htaccess has
     the four lines, commented, and the host's control panel usually has
     a "directory privacy" tool that does the same thing.
  3. Upload proxy.php only if you want the built-in crawler. It needs PHP
     with cURL, and it refuses every request until you list your domains
     in it. See CRAWLING.txt. Without it, stages that need a crawl accept
     a Screaming Frog export instead and everything downstream works.

The supplied .htaccess handles MIME types, caching and security headers on
Apache and LiteSpeed, which is what Hostinger and most shared hosting run.
On nginx it is ignored and nothing breaks -- the one thing worth setting by
hand there is that index.html should not be cached hard, because it carries
all of the code.


PUTTING IT IN A SUBFOLDER
-------------------------
Supported, and nothing needs changing. Upload the folder inside
public_html and the app runs at, for example:

  https://yourdomain.com/seo/

Every path the app uses is relative -- the tab icon is inline, the
crawler looks for proxy.php beside index.html, and the manifest and
social image resolve against the folder. There is no base URL to set
and no build step to re-run.

Two things to know:

  - Search Console asks for an "Authorised JavaScript origin", and an
    origin is a scheme and a host with NO path. So enter
    https://yourdomain.com even though the app sits in a subfolder.
    Adding the folder to that field is the usual reason the connector
    refuses to open.
  - If you want link previews to work on every platform, edit the two
    og:image and twitter:image lines near the top of index.html to the
    full address, https://yourdomain.com/seo/share.png. Relative ones
    work on most scrapers and not all of them.


BEHIND CLOUDFLARE
-----------------
It works, with two settings to get right.

  1. Turn Rocket Loader OFF for this page. Rocket Loader rewrites and
     defers inline scripts, and this whole app IS one inline script.
     The script tag already carries data-cfasync="false", which is
     Cloudflare's documented opt-out and should be enough on its own --
     but if the page ever loads to a blank sheet behind Cloudflare,
     Rocket Loader is the first thing to check.
  2. Do NOT switch on "Cache Everything" for the HTML. index.html
     carries all of the code, so a cached copy at the edge means your
     next update does not reach anyone until the cache expires. Leave
     Cloudflare's default, which is not to cache HTML.

Everything else is fine to leave on. Brotli, HTTP/3, Always Use HTTPS
and the WAF cause no trouble.

One note on the crawl proxy: behind Cloudflare every request arrives
from a Cloudflare address, so a per-visitor rate limit keyed on the
connecting address would put the whole world in one bucket. proxy.php
reads CF-Connecting-IP when it is present, which is the real caller.


RUNNING IT AS A WEB APP (OPTIONAL)
----------------------------------
This file works on its own: open it, or drop it on any web host. Nothing
below is needed to use the tool.

If you want it on a URL with sign-in, project sync between devices, and
Semrush pulled in rather than exported by hand, there is a companion
server -- sec-server, one static binary, no runtime to install. It runs on
a small VPS behind Caddy, which handles HTTPS certificates for you. See
DEPLOY.md in the server bundle.

What that server does, and only this:
  - holds the Semrush API key, which never reaches a browser, because
    Semrush authenticates by putting the key in the URL
  - keeps accounts and sign-in
  - stores each project as an opaque blob it never reads, so what the tool
    measures still happens entirely in your browser
  - fetches pages for the crawler, replacing proxy.php, with protection
    against being aimed back at your own network

Search Console does not need it. That connector talks to Google directly
from the browser and always will.


WHAT IS IN IT
-------------
Twenty-two stages, in three groups.

SET UP
  Project              domain, brand, market, the filters your exports used
  Getting the data     exact click paths for every export it reads
  Load exports         drop CSV, TSV, XLSX, ZIP, JSON, ndjson or .gz
  Connect Search Console   pull the data instead of exporting it (below)
  Crawl and sitemap    the built-in crawler, or import a crawler export
  Data gate            what is loaded, what is missing, what that costs you

ANALYSE
  Scorecard            five weighted pillars; unmeasured ones say so
  Search findings      where the impressions sit, what moved, what is close
  Topics and pages     query clusters, and which page owns each one
  Internal links       specific links to add, ranked by what they would move
  Technical            around thirty checks against the crawl
  Media and markup     images, schema, hreflang
  SERP features        what is being suppressed and by what
  AI Search            visibility, readiness, fan-out, citations, the recorder
  Backlinks            your own profile: anchors, follow ratio, velocity
  Page link profiles   your page against the pages outranking it, side by side
  Action queue         everything above, ranked, with the evidence attached

DELIVER
  Content briefs       one per topic, from measured queries and the live page
  Live editor          write or paste a draft and score it as you type
  AI assist            your own AI key, for the writing only (below)
  Prompt pack          22 chained prompts, pre-filled with your own numbers
  Report and history   a shareable report, and every run kept for comparison
  Coverage map         what each stage needs before it can say anything
  Method               how every number is produced


THE LIVE EDITOR
---------------
The stage most people end up living in. Write or paste a draft, pick the
topic it should cover, and it is scored live by the same readiness engine
that scores your crawled pages -- not a second one, so the editor and the
audit can never disagree about the same page.

  - Import an existing page by URL, or paste its source. Only text comes
    across: no scripts, no styles, no iframes, no forms, and no images.
  - A per-query checklist ticks as you write, so you can see which of the
    topic's queries the draft actually covers.
  - Eligibility and internal links are left unscored, because nothing links
    to a page that does not exist yet. They read "n/a", never zero.
  - Drafts autosave into the project and are listed per project.

IMAGES AND THE EXPORT BUNDLE
  Add images to a draft and each one is resized to 480/960/1440 wide where
  the original allows -- never upscaled -- re-encoded to WebP, and named
  from the draft title and your alt text. Export bundle downloads a zip
  containing draft.md, every image at every width, and a manifest with
  paste-ready <img> tags carrying srcset, dimensions and lazy loading.

  Alt text is never invented. An image without it exports with an empty alt
  attribute and is flagged in the manifest, because a made-up description is
  worse than an obvious gap.

  Re-encoding is also what makes an upload safe to publish: the export
  contains pixels this browser drew, so EXIF, location data and anything
  hidden in the original container do not survive.


CONNECT SEARCH CONSOLE
----------------------
You can pull queries, pages, pages-and-queries, dates, countries, devices
and search appearance straight from the API instead of exporting by hand.
It needs a Google OAuth client ID of your own -- ten minutes, once. Full
instructions in CONNECT-SEARCH-CONSOLE.txt.

Nothing is proxied and no token is stored. Google issues a short-lived,
read-only token inside the page and the data goes from Google to that tab.


UPLOADING
---------
1. Upload the contents of this folder to any folder your web server serves.
   Example: public_html/seo/  ->  https://yourdomain.com/seo/
2. Open the URL. That is the whole installation.

index.html is one self-contained file: markup, styles, the CSV/XLSX/ZIP
parsers, the clustering engine, the crawler, the scoring model, the editor
and the Search Console connector are all inside it. No build step, no
database, no Node. Any host that serves a static file will run it.

proxy.php is OPTIONAL and does one job: fetch pages for the crawler, which
a browser is not allowed to do across domains. It ships switched off. See
CRAWLING.txt. Everything except live crawling works without it -- including
the Search Console connector, which does not use it.


REQUIREMENTS
------------
Server:  static file serving. PHP 7.4+ with cURL only if you want the
         crawler to reach other domains.
Browser: a current Chrome, Edge, Firefox or Safari. ZIP and .gz reading use
         DecompressionStream, project storage uses IndexedDB, and the image
         kit uses canvas encoding. All are in every browser from 2023 on.
HTTPS:   required in practice. Google will not issue a token to an insecure
         origin, clipboard writes are blocked on plain HTTP in some
         browsers, and this page copies prompts constantly.


PRIVACY, WHICH IS THE POINT
---------------------------
Your Search Console and Semrush data is parsed by JavaScript in the
visitor's own browser. Nothing is uploaded, posted or logged. Projects,
including every parsed row, every draft and every run, live in that
browser's IndexedDB. The server never sees your data.

Three deliberate exceptions, all of them visible:

  1. If you enable proxy.php, the pages the CRAWLER fetches pass through
     your server. That is target-site HTML, not your Search Console data,
     and nothing is written to disk.
  2. The Search Console connector talks to Google directly from the
     browser. Your data goes Google -> that tab. No server sees it, and the
     access token is held in a variable that dies with the page.
  3. Importing a page into the editor fetches that page -- through
     proxy.php if you configured it, otherwise not at all. Paste HTML
     instead if you would rather fetch nothing.

The page's only unprompted outbound request is to fonts.googleapis.com for
three webfonts. Delete the font <link> near the top of index.html for zero
external requests; the fallbacks are Georgia and the system sans.

robots.txt and a noindex meta tag are included so search engines leave it
alone. Delete both if the tool is meant to be public.


PROJECTS AND PERSISTENCE
------------------------
Everything lives in IndexedDB, in that browser, on that machine: project
settings, every parsed export, crawl results, saved drafts and the history
of every run. Closing the tab, restarting the browser and rebooting all
leave it intact. Clearing site data removes it.

Use Export on the Project stage to write a whole project -- data included --
to one JSON file. That is the backup, and the way to move a project to
another machine or hand it to a colleague.


LICENSING
---------
An annual licence per installation. Enter your key from the sidebar; an
unlicensed copy shows a marker there and works in full.

To be plain about it: the licence check runs on your machine and is not
enforcement. It is a compliance marker, so that an unlicensed deployment is
visible to the staff and clients who open it. Nothing is disabled, nothing
phones home, and no feature is held back. See LICENCE.txt.


UPDATING
--------
Replace index.html. Projects are untouched: they live in the visitor's
browser, not in the file. Your licence key is likewise stored in the
browser and survives the replacement.


FILES
-----
index.html                  the tool. Open this one.
app.css                     its stylesheet
app.js                      its code
index-single-file.html      the same tool as ONE file, for offline use
proxy.php                   optional crawler fetcher, disabled until configured
favicon.svg                 tab icon
apple-touch-icon.png        icon for an iOS home screen
icon-192.png                icon, small
icon-512.png                icon, large
share.png                   the image a link preview shows
site.webmanifest            lets it install as an app
robots.txt                  keeps it out of search results
.htaccess                   Apache MIME types, caching, headers, optional auth
README.txt                  this file
CONNECT-SEARCH-CONSOLE.txt  the Google OAuth client, step by step
CRAWLING.txt                how to switch the crawler on safely
EXTRACTING-DATA.txt         exact click paths for every export it reads
EXPORT-AND-COMPARE.txt      snapshots, the Excel workbook, the PDF report
LICENCE.txt                 licence terms, and what the marker is


LICENCE
-------
(c) 2026 Syed.ai. All rights reserved.
Licensed for use by the purchaser and their clients. Not for resale or
redistribution as a product of your own.
