/* ── syed.ai · the chat brief ───────────────────────────────────────────────
 *
 * One copy of the chat, loaded by every page: the homepage and the four
 * reference pages. It used to live inside site.js, which meant the reference
 * pages had no chat at all — they load none of the homepage's single-page
 * machinery, and site.js reaches for 61 element ids that exist only there, so
 * loading it on a static page throws on the first line that runs.
 *
 * Splitting it out rather than duplicating it is the point. Two copies of a
 * nine-question form drift within a week, and drift is what makes a site feel
 * buggy — which is exactly the complaint that prompted this.
 *
 * The panel's markup is injected rather than pasted into five files, for the
 * same reason.
 *
 * Public API, for site.js on the homepage:
 *   SyedChat.open(triggerEl?)  SyedChat.close()  SyedChat.toggle()  SyedChat.tease()
 */
(function () {
  "use strict";

  var $  = function (id) { return document.getElementById(id); };
  var RM = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var FORM_ENDPOINT = "/send.php";
  var formLoadedAt  = Math.floor(Date.now() / 1000);

  var esc = function (t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  /* Navigate to a homepage section from wherever we are. On the homepage a bare
     hash is right, because the router listens for it. On /glossary/ a bare hash
     scrolls to nothing, so it has to become a real URL. */
  var onHome = /\/(index\.html)?$/.test(location.pathname);
  function go(hash) {
    if (onHome) { location.hash = hash; return; }
    location.href = "/" + hash;
  }

  /* The homepage tracks which view you are on and the path you took through it,
     and that context is genuinely useful in the email. site.js publishes it when
     it is there; off the homepage the URL is the honest answer. */
  function pageCtx() {
    var utm = [];
    try {
      new URLSearchParams(location.search).forEach(function (v, k) {
        if (/^utm_|^gclid$|^fbclid$/.test(k)) { utm.push(k + "=" + v); }
      });
    } catch (e) {}
    var P = window.SyedPage || {};
    return {
      page:    (P.view    && P.view())    || location.pathname,
      journey: (P.journey && P.journey()) || location.pathname,
      dwell:   String(Math.round((Date.now() - arrivedAt) / 1000)),
      score:   window.__score ? window.__score + "/100 (" + window.__band + ")" : "",
      ref:     document.referrer || "",
      utm:     utm.join(" "),
      screen:  innerWidth + "×" + innerHeight + (devicePixelRatio > 1 ? " @" + devicePixelRatio + "x" : ""),
      lang:    navigator.language || "",
      tz:      (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })()
    };
  }
  var arrivedAt = Date.now();

  function addCtx(fd) {
    var c = pageCtx();
    Object.keys(c).forEach(function (k) { fd.set(k, c[k]); });
    fd.set("ua", navigator.userAgent.slice(0, 200));
    fd.set("t", String(formLoadedAt));
    return fd;
  }

  /* ── markup ──────────────────────────────────────────────────────────────
     Built here so a page only has to load the script. The homepage already
     ships this markup inline, so it is left alone when it is found. */
  var MONOGRAM = '<svg viewBox="0 0 40 40" focusable="false" aria-hidden="true">'
    + '<path d="M27.4 11.6c-2.7-2.3-6.7-2.7-9.4-1-3.1 2-3 5.8.4 7.4 2.2 1.1 5.5 1.4 7.5 2.7 3.1 2.1 2.7 6.2-.7 8-3.1 1.7-7.4 1-10-1.4"'
    + ' fill="none" stroke="var(--c-gold)" stroke-width="1.7" stroke-linecap="round"/>'
    + '<circle cx="30.6" cy="29.2" r="1.9" fill="var(--c-gold-light)"/></svg>';

  function mount() {
    if ($("chatFab")) { return true; }              // homepage: already in the HTML
    if (!document.body) { return false; }

    var frag = document.createElement("div");
    frag.innerHTML =
      '<div class="chat-teaser" id="chatTeaser" hidden>'
    +   '<p>Want a read on your AI visibility? Ninety seconds, nine questions.</p>'
    +   '<button type="button" data-chat-open>Start</button>'
    +   '<button type="button" id="teaserX" aria-label="Dismiss">&times;</button>'
    + '</div>'
    + '<button class="chat-fab" id="chatFab" type="button" aria-haspopup="dialog"'
    +       ' aria-expanded="false" aria-controls="chatPanel">'
    +   '<span class="chat-fab__ic" aria-hidden="true">'
    +     '<svg class="chat-fab__chat" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    +        ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    +       '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.7 9.7 0 0 1-2.9-.4L3 21l1.6-4.6A8.2 8.2 0 0 1 3.5 11.5 8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z"/></svg>'
    +     '<svg class="chat-fab__x" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    +        ' stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
    +   '</span><span class="chat-fab__txt">Start a brief</span>'
    + '</button>'
    + '<section class="chat" id="chatPanel" role="dialog" aria-labelledby="chatWho"'
    +         ' aria-describedby="chatSub" hidden>'
    +   '<header class="chat__h">'
    +     '<span class="monogram monogram--sm" aria-hidden="true">' + MONOGRAM + '</span>'
    +     '<span class="chat__id">'
    +       '<span class="chat__who" id="chatWho">Syed Abdul</span>'
    +       '<span class="chat__sub" id="chatSub"><i aria-hidden="true"></i>Replies within one business day</span>'
    +     '</span>'
    +     '<button class="chat__x" id="chatClose" type="button" aria-label="Close the chat">'
    +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"'
    +          ' stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
    +     '</button>'
    +   '</header>'
    +   '<div class="chat__prog" role="presentation"><i id="chatBar"></i></div>'
    +   '<div class="chat__log" id="chatLog" role="log" aria-live="polite" aria-relevant="additions text"></div>'
    +   '<div class="chat__foot" id="chatFoot"></div>'
    +   '<p class="chat__legal">Sent straight to my inbox over an encrypted connection. '
    +     'Nothing is stored on this server and nothing is shared.</p>'
    + '</section>';
    while (frag.firstChild) { document.body.appendChild(frag.firstChild); }
    return true;
  }

  if (!mount()) {
    document.addEventListener("DOMContentLoaded", function () { if (mount()) { init(); } });
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else { init(); }
  }

  function init() {
    if (window.SyedChat) { return; }        // never wire twice
    build();
  }

  function build() {
    /* ══ Chat brief ══════════════════════════════════════════════════════
       A conversational front end to the same payload the contact form posts.
       One question at a time, chips where the answer is a set, free text where
       it is not. Every answer is editable with Back before it is sent, and
       nothing leaves the browser until the visitor presses Send it.        */
    var CHAT_STEPS = [
      { k: "name", t: "text", req: true, ph: "First name is fine",
        q: ["Before anything else \u2014 who am I speaking to?"] },
      { k: "focus", t: "chips",
        q: ["Good to meet you, {name}.", "What is the thing you actually want fixed?"],
        opts: ["We're invisible in AI answers", "Rankings are fine, traffic is not",
               "Email is underperforming", "Outbound has stopped working", "Not sure — diagnose it"] },
      { k: "company", t: "text", ph: "Company name", skip: "Just me",
        q: ["Noted. What is the company called?"] },
      { k: "site", t: "text", ph: "example.com", skip: "No site yet",
        q: ["And the site? I will run your category through four assistants before we speak."] },
      { k: "revenue", t: "chips",
        q: ["Roughly what is the business doing a month? It sets how much a citation is worth, so it changes the advice."],
        opts: ["Under $50K", "$50K – $250K", "$250K – $1M", "$1M+", "Rather not say"] },
      { k: "budget", t: "chips",
        q: ["And what is the budget you are working with?"],
        opts: ["Under $5,000/mo", "$5,000 – $10,000/mo", "$10,000 – $25,000/mo", "$25,000+/mo", "Not sure yet"] },
      { k: "timeline", t: "chips",
        q: ["When would you want to start?"],
        opts: ["Now", "Next 30 days", "This quarter", "Just researching"] },
      { k: "brief", t: "area", req: true, min: 10,
        ph: "We rank top-3 for our category but ChatGPT recommends two competitors and never us.",
        q: ["Last real question — what is the gap, in your own words?",
            "Specifics help. A competitor being named instead of you is the most useful thing you can tell me."] },
      { k: "email", t: "email", req: true, ph: "you@company.com",
        q: ["That is everything I need, {name}.", "Where should I send the read?"] }
    ];

    /* The short flow. Asks only what the generator needs, because the payoff is
       immediate and every extra question costs completions. */
    var CHAT_ROADMAP = [
      { k: "site", t: "text", req: true, ph: "example.com",
        q: ["I can run an automated read of your site and email you the plan \u2014 usually inside a minute.",
            "What is the domain?"] },
      { k: "focus", t: "chips",
        q: ["What should I weight it towards?"],
        opts: ["AI answer visibility", "Rankings and traffic", "Email and conversion", "All of it"] },
      { k: "name", t: "text", req: true, ph: "First name is fine",
        q: ["And who am I addressing it to?"] },
      { k: "email", t: "email", req: true, ph: "you@company.com",
        q: ["Where do I send it, {name}?"] }
    ];

    /* Opening lines by section. Someone who has just read the pricing is in a
       different conversation from someone who landed on the overview. */
    var CHAT_GREET = {
      services:  ["You have been through the pricing.", "Want me to size one of those against your actual setup?"],
      scorecard: ["You have the score \u2014 the useful part is what to do about it.", "Want me to shape that into a plan?"],
      roi:       ["Those projections are only as good as the inputs.", "Tell me the real numbers and I will sanity-check them."],
      work:      ["Those are modelled scenarios, calibrated against the cited research \u2014 not client reports.", "Which one is closest to your situation?"],
      building:  ["Happy to talk about any of those builds.", "What are you trying to make work?"],
      newsletter:["The teardown queue is open.", "Want me to look at yours?"]
    };

    var chat = {
      open: false, i: 0, a: {}, busy: false, started: false, mode: "brief",
      topic: "", note: "", shownTopic: "", teased: false, done: false, tries: 0
    };
    function chatSteps() { return chat.mode === "roadmap" ? CHAT_ROADMAP : CHAT_STEPS; }

    function chatEl(id) { return $(id); }
    function chatScroll() {
      var log = $("chatLog");
      log.scrollTop = log.scrollHeight;
    }
    function chatSay(html, cls) {
      var d = document.createElement("div");
      d.className = "msg " + (cls || "msg--bot");
      d.innerHTML = html;
      $("chatLog").appendChild(d);
      chatScroll();
      return d;
    }
    function chatTyping() {
      var d = document.createElement("div");
      d.className = "typing";
      d.innerHTML = "<i></i><i></i><i></i>";
      $("chatLog").appendChild(d); chatScroll();
      return d;
    }
    /* Bot lines arrive one after another with a short pause, which is what makes
       it read as a conversation rather than a form with rounded corners. */
    function chatBotLines(lines, done) {
      var n = 0;
      (function next() {
        if (n >= lines.length) { done && done(); return; }
        var line = lines[n++];
        if (RM) { chatSay(line); next(); return; }
        var t = chatTyping();
        setTimeout(function () {
          t.remove(); chatSay(line);
          setTimeout(next, 160);
        }, n === 1 ? 380 : 520);
      })();
    }
    function chatFill(str) {
      return str.replace(/\{(\w+)\}/g, function (_, k) { return esc(chat.a[k] || "there"); });
    }
    function chatProgress() {
      $("chatBar").style.width = Math.round(chat.i / chatSteps().length * 100) + "%";
    }

    function chatAsk() {
      chatProgress();
      if (chat.i >= chatSteps().length) { chatSummary(); return; }
      var st = chatSteps()[chat.i];
      $("chatFoot").innerHTML = "";
      chatBotLines(st.q.map(chatFill), function () { chatControls(st); });
    }

    function chatControls(st) {
      var foot = $("chatFoot");
      foot.innerHTML = "";
      if (chat.i > 0) {
        var back = document.createElement("button");
        back.type = "button"; back.className = "chat__back";
        back.innerHTML = "&larr; Back";
        back.addEventListener("click", function () {
          chat.i = Math.max(0, chat.i - 1);
          delete chat.a[chatSteps()[chat.i].k];
          var log = $("chatLog");
          // drop the last exchange so the transcript stays truthful
          while (log.lastElementChild && !log.lastElementChild.classList.contains("msg--me")) {
            log.removeChild(log.lastElementChild);
          }
          if (log.lastElementChild) { log.removeChild(log.lastElementChild); }
          while (log.lastElementChild && log.lastElementChild.classList.contains("msg--bot")) {
            log.removeChild(log.lastElementChild);
          }
          chatAsk();
        });
        foot.appendChild(back);
      }

      if (st.t === "chips") {
        var wrap = document.createElement("div");
        wrap.className = "chat__opts";
        st.opts.forEach(function (o) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "chat__opt"; b.textContent = o;
          b.addEventListener("click", function () { chatAnswer(st, o); });
          wrap.appendChild(b);
        });
        foot.appendChild(wrap);
        var first = wrap.querySelector("button"); if (first) { first.focus(); }
        return;
      }

      var row = document.createElement("div");
      row.className = "chat__row";
      var input = document.createElement(st.t === "area" ? "textarea" : "input");
      if (st.t !== "area") { input.type = st.t === "email" ? "email" : "text"; }
      if (st.t === "email") { input.autocomplete = "email"; input.inputMode = "email"; }
      if (st.k === "name") { input.autocomplete = "given-name"; }
      if (st.k === "company") { input.autocomplete = "organization"; }
      input.placeholder = st.ph || "";
      input.setAttribute("aria-label", st.q[st.q.length - 1].replace(/<[^>]+>/g, ""));
      var go = document.createElement("button");
      go.type = "button"; go.className = "chat__go"; go.setAttribute("aria-label", "Send answer");
      go.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7"/></svg>';
      var submit = function () { chatAnswer(st, input.value.trim(), input); };
      go.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (st.t !== "area" || !e.shiftKey)) { e.preventDefault(); submit(); }
      });
      row.appendChild(input); row.appendChild(go);
      foot.appendChild(row);

      if (st.skip) {
        var sk = document.createElement("div");
        sk.className = "chat__opts";
        var sb = document.createElement("button");
        sb.type = "button"; sb.className = "chat__opt chat__opt--skip"; sb.textContent = st.skip;
        sb.addEventListener("click", function () { chatAnswer(st, "", null, st.skip); });
        sk.appendChild(sb); foot.appendChild(sk);
      }
      input.focus();
    }

    function chatErr(msg) {
      var e = document.createElement("div");
      e.className = "msg msg--err"; e.textContent = msg;
      $("chatLog").appendChild(e); chatScroll();
      setTimeout(function () { e.remove(); }, 4200);
    }

    function chatAnswer(st, value, input, shownAs) {
      if (st.req && !value) { chatErr("I do need this one."); if (input) { input.focus(); } return; }
      if (st.t === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        chatErr("That address does not look right — check it for me?");
        if (input) { input.focus(); } return;
      }
      if (st.min && value.length < st.min) {
        chatErr("A sentence or two is plenty, but I need a little more than that.");
        if (input) { input.focus(); } return;
      }
      chat.a[st.k] = value;
      chatSay(esc(shownAs || value), "msg--me");
      $("chatFoot").innerHTML = "";
      chat.i++;
      setTimeout(chatAsk, RM ? 0 : 260);
    }

    function chatSummary() {
      $("chatBar").style.width = "100%";
      var rows = chat.mode === "roadmap"
        ? [["Site", chat.a.site], ["Weighted towards", chat.a.focus], ["Name", chat.a.name], ["Email", chat.a.email]]
        : [["Name", chat.a.name], ["Company", chat.a.company || "\u2014"], ["Site", chat.a.site || "\u2014"],
           ["Focus", chat.a.focus], ["Revenue", chat.a.revenue], ["Budget", chat.a.budget],
           ["Timeline", chat.a.timeline], ["Email", chat.a.email]];
      chatBotLines([chat.mode === "roadmap"
        ? "That is everything. I will read the site and have the plan in your inbox in about a minute."
        : "Here is what I have. Anything wrong, hit Back \u2014 otherwise send it over."], function () {
        var box = document.createElement("dl");
        box.className = "msg chat__sum";
        box.innerHTML = "<h4>" + (chat.mode === "roadmap" ? "Your roadmap request" : "Your brief") + "</h4>" + rows.map(function (r) {
          return "<div><dt>" + r[0] + "</dt><dd>" + esc(r[1] || "—") + "</dd></div>";
        }).join("");
        $("chatLog").appendChild(box); chatScroll();

        var foot = $("chatFoot");
        foot.innerHTML = "";
        var back = document.createElement("button");
        back.type = "button"; back.className = "chat__back"; back.innerHTML = "&larr; Change an answer";
        back.addEventListener("click", function () {
          chat.i = chatSteps().length - 1;
          delete chat.a[chatSteps()[chat.i].k];
          box.remove();
          var log = $("chatLog");
          while (log.lastElementChild && !log.lastElementChild.classList.contains("msg--me")) {
            log.removeChild(log.lastElementChild);
          }
          if (log.lastElementChild) { log.removeChild(log.lastElementChild); }
          chatAsk();
        });
        var send = document.createElement("button");
        send.type = "button"; send.className = "btn btn--solid btn--sm";
        send.textContent = chat.mode === "roadmap" ? "Build my roadmap" : "Send it";
        send.addEventListener("click", function () { chatSend(send); });
        var row = document.createElement("div");
        row.className = "chat__opts"; row.appendChild(send);
        foot.appendChild(back); foot.appendChild(row);
        send.focus();
      });
    }

    function chatSend(btn) {
      if (chat.busy) { return; }
      chat.busy = true; btn.disabled = true; btn.textContent = "Sending…";
      var fd = new FormData();
      fd.set("name", chat.a.name);
      fd.set("email", chat.a.email);
      fd.set("company", chat.a.company || "");
      fd.set("site", chat.a.site || "");
      fd.set("revenue", chat.a.revenue || "");
      fd.set("budget", chat.a.budget || "");
      fd.set("timeline", chat.a.timeline || "");
      fd.set("focus", (chat.a.focus || "") + (chat.topic ? " · " + chat.topic : ""));
      fd.set("brief", chat.a.brief + (chat.note ? "\n\n— context carried in —\n" + chat.note : ""));
      fd.set("source", "chat");
      fd.set("website_url", "");                 // honeypot, empty as a human leaves it
      fd.set("mode", chat.mode === "roadmap" ? "roadmap" : "brief");
      addCtx(fd);

      var finish = function (ok, msg) {
        chat.busy = false;
        $("chatFoot").innerHTML = "";
        if (ok) {
          chat.done = true;
          chatBotLines([msg || "Got it. I will read it properly and come back within one business day.",
                        "In the meantime the <b>Visibility Scorecard</b> takes two minutes and tells you most of what I would say first."],
            function () {
              var foot = $("chatFoot"), wrap = document.createElement("div");
              wrap.className = "chat__opts";
              var a = document.createElement("button");
              a.type = "button"; a.className = "chat__opt"; a.textContent = "Take the scorecard";
              a.addEventListener("click", function () { chatClose(); go("#scorecard"); });
              var b = document.createElement("button");
              b.type = "button"; b.className = "chat__opt chat__opt--skip"; b.textContent = "Close";
              b.addEventListener("click", chatClose);
              wrap.appendChild(a); wrap.appendChild(b); foot.appendChild(wrap);
            });
        } else {
          /* One error bubble, never a stack. Re-sending used to append a fresh
             red line each time, so a relay that was down for a minute left the
             transcript reading like four separate failures — which is what makes
             a working form look broken. Clear the last one first. */
          var log = $("chatLog"), stale = log.querySelectorAll(".msg--err");
          for (var si = 0; si < stale.length; si++) { stale[si].remove(); }

          var foot = $("chatFoot"), wrap = document.createElement("div");
          wrap.className = "chat__opts";
          chat.tries = (chat.tries || 0) + 1;

          if (chat.tries >= 2) {
            /* Twice is enough to know that retrying is not the answer. Offering
               the button a third time just walks the visitor into the same wall.
               Stop, and hand over a route that does not depend on this server. */
            chatSay("That still did not go through — the fault is at my end, not yours. " +
                    "Your answers are saved and I do see them. If you would rather not wait, " +
                    "<a href=\"https://www.linkedin.com/in/syed\" target=\"_blank\" rel=\"noopener\">message me on LinkedIn</a>.",
                    "msg--err");
            chat.done = true;
            var c = document.createElement("button");
            c.type = "button"; c.className = "chat__opt chat__opt--skip"; c.textContent = "Close";
            c.addEventListener("click", chatClose);
            wrap.appendChild(c); foot.appendChild(wrap);
            return;
          }

          chatSay(msg, "msg--err");
          var r = document.createElement("button");
          r.type = "button"; r.className = "chat__opt"; r.textContent = "Try again";
          r.addEventListener("click", function () { chatSummary(); });
          wrap.appendChild(r); foot.appendChild(wrap);
        }
      };

      if (FORM_ENDPOINT === "demo") {
        setTimeout(function () { finish(true, "Got it — though this is a preview, so nothing actually sent."); }, 700);
        return;
      }
      fetch(FORM_ENDPOINT, { method: "POST", body: fd, credentials: "omit",
                             headers: { "Accept": "application/json" } })
        .then(function (r) {
          return r.text().then(function (raw) {
            try { return JSON.parse(raw); }
            catch (err) {
              return { ok: false,
                       message: "The server replied with something unreadable (HTTP " + r.status + "). " +
                                raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) };
            }
          });
        })
        .then(function (j) {
          finish(!!j.ok, j.message
            ? j.message + (j.detail ? "  \u2192  " + j.detail : "")
            : (j.ok ? "" : "That did not send \u2014 the server gave no reason. Check diagnose.php."));
        })
        .catch(function () { finish(false, "I could not reach the server. Try again in a moment, or DM me on Instagram."); });
    }

    function chatNoteTopic() {
      if (!chat.topic || chat.topic === chat.shownTopic) { return; }
      chat.shownTopic = chat.topic;
      chatSay("About: <b>" + esc(chat.topic) + "</b>", "msg--note");
    }
    function chatStart() {
      // A finished conversation starts over rather than showing a stale transcript.
      if (chat.started && !chat.done) { chatNoteTopic(); return; }
      chat.started = true; chat.done = false;
      chat.i = 0; chat.a = {}; chat.shownTopic = ""; chat.tries = 0;
      $("chatLog").innerHTML = "";
      chatNoteTopic();
      var key = (location.hash || "#overview").replace(/^#/, "");
      var greet = chat.mode === "roadmap" ? null
        : (CHAT_GREET[key] || (key.indexOf("case/") === 0 ? CHAT_GREET.work : ["Hi \u2014 Syed here."]));
      if (greet) { chatBotLines(greet, chatAsk); } else { chatAsk(); }
    }
    function chatOpen(trigger) {
      if (trigger) {
        var m = trigger.getAttribute("data-chat-mode");
        if (m && m !== chat.mode) { chat.mode = m; chat.started = false; }
        chat.topic = trigger.getAttribute("data-chat-topic") || chat.topic;
        chat.note  = trigger.getAttribute("data-chat-note")  || chat.note;
      }
      chat.open = true;
      $("chatPanel").hidden = false;
      $("chatFab").setAttribute("aria-expanded", "true");
      document.body.classList.add("chat-on");
      chatTeaseHide();
      chatStart();
      chatScroll();
    }
    function chatClose() {
      chat.open = false;
      $("chatPanel").hidden = true;
      $("chatFab").setAttribute("aria-expanded", "false");
      document.body.classList.remove("chat-on");
      $("chatFab").focus();
    }
    function chatToggle() { chat.open ? chatClose() : chatOpen(); }

    function chatTeaseHide() {
      var t = $("chatTeaser"); if (t) { t.hidden = true; }
    }
    function chatTease() {
      if (chat.teased || chat.open) { return; }
      chat.teased = true;
      var t = $("chatTeaser");
      t.hidden = false;
      setTimeout(function () { if (!chat.open) { chatTeaseHide(); } }, 11000);
    }

    $("chatFab").addEventListener("click", chatToggle);
    $("chatClose").addEventListener("click", chatClose);
    $("teaserX").addEventListener("click", function () { chatTeaseHide(); });
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-chat-open]");
      if (t) { e.preventDefault(); chatOpen(t); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && chat.open) { chatClose(); }
    });

  
    window.SyedChat = {
      open:  function (t) { chatOpen(t); },
      close: function ()  { chatClose(); },
      toggle:function ()  { chatToggle(); },
      tease: function ()  { chatTease(); }
    };
  }
})();
