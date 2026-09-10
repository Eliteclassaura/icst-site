#!/bin/bash
# Double-click this to preview the site properly on your Mac.
#
# Why it is needed: every path in the site is root-absolute — /geo-pricing/,
# /assets/css/site.css — which is correct for a real domain and meaningless in
# a folder. Opened straight from Downloads, the browser reads /geo-pricing/ as
# the root of your hard disk, so the link fails and the sub-pages load with no
# stylesheet. That is not a fault in the site; it is what file:// does with
# absolute paths.
#
# This serves the folder over http instead, so those paths resolve the way they
# will on Hostinger.
#
# One thing it cannot do: PHP. The contact form, the roadmap and diagnose.php
# need a PHP server, so locally the form will not send. Everything else — every
# page, every link, the chat widget, the scorecard — behaves exactly as it will
# live.

cd "$(dirname "$0")/.." || exit 1
PORT=8080
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT + 1)); done

echo "Serving $(pwd)"
echo "Opening http://localhost:$PORT/"
echo "Press Ctrl-C in this window when you are finished."
echo

( sleep 1; open "http://localhost:$PORT/" ) &
exec python3 -m http.server "$PORT"
