/*
 * "How your move day works" animation for the website.
 *
 * A vanilla port of the CRM's JobTimelinePreview (Hercules CRM,
 * components/move/job-timeline-preview.tsx + components/fun/hercules-fun.tsx)
 * so customers see the same cartoon here that they later get with their
 * contract: Hercules acts out each step, a truck drives along a road with every
 * step as a stop, and the step cards slide underneath.
 *
 * Usage: <div data-move-day></div> and <script src="/js/move-day.js" defer></script>
 */
(function () {
  "use strict";

  var STEP_MS = 3200;

  var STEPS = [
    { emoji: "🚚", label: "Crew driving", pose: "truck",
      detail: "On the way to your pickup. Snacks packed, muscles warmed up.",
      quip: "Vroom vroom! The truck is humming the Hercules theme song. 🎵" },
    { emoji: "📍", label: "Arrived", pose: "wave",
      detail: "Knock knock! The job clock starts here, not before.",
      quip: "Knock knock. Who's there? Your couch's new best friends! 👋" },
    { emoji: "💵", label: "Base payment", pose: "flex",
      detail: "Quick payment, then the heavy lifting begins.",
      quip: "Paperwork done. Biceps: activated. 💪" },
    { emoji: "📦", label: "Loading", pose: "lift",
      detail: "Furniture wrapped, boxes stacked like Tetris, level: expert.",
      quip: "That fridge? Light as a feather. A very heavy feather. 🪶" },
    { emoji: "🚚", label: "To destination", pose: "truck",
      detail: "Driving to your new home. Extra smooth, the lamp insisted.",
      quip: "Your stuff is riding first class today. 🛋️✈️" },
    { emoji: "💳", label: "Balance paid", pose: "flex",
      detail: "Settle up before unloading. Hercules does a tiny happy dance.",
      quip: "Cha-ching! Now back to lifting things. 🕺" },
    { emoji: "📤", label: "Unloading", pose: "lift",
      detail: "Every box finds its new home. You point, it goes there.",
      quip: "Where do you want the couch? Here? There? On the moon? 🌙" },
    { emoji: "👋", label: "All done", pose: "flex",
      detail: "High fives all around! Thanks for moving with Hercules.",
      quip: "Move complete! Victory flex activated. 🏆" }
  ];

  var CSS = [
    "@keyframes hx-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}",
    "@keyframes hx-press{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}",
    "@keyframes hx-flex-l{0%,100%{transform:rotate(0)}50%{transform:rotate(-12deg)}}",
    "@keyframes hx-flex-r{0%,100%{transform:rotate(0)}50%{transform:rotate(12deg)}}",
    "@keyframes hx-bicep{0%,100%{transform:scale(1)}50%{transform:scale(1.28)}}",
    "@keyframes hx-wave{0%,100%{transform:rotate(0)}25%{transform:rotate(-24deg)}75%{transform:rotate(16deg)}}",
    "@keyframes hx-wink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}",
    "@keyframes hx-sweat{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(18px)}}",
    "@keyframes hx-drive{0%{transform:translateX(-6px)}50%{transform:translateX(6px)}100%{transform:translateX(-6px)}}",
    "@keyframes hx-bump{0%,100%{transform:translateY(0)}30%{transform:translateY(-3px)}60%{transform:translateY(1px)}}",
    "@keyframes hx-wobble{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(7deg)}}",
    "@keyframes hx-speed{0%{opacity:0;transform:translateX(10px)}40%{opacity:1}100%{opacity:0;transform:translateX(-26px)}}",
    "@keyframes hx-wheel{to{transform:rotate(360deg)}}",
    "@keyframes hx-dance{0%,100%{transform:rotate(0) translateY(0)}25%{transform:rotate(-8deg) translateY(-4px)}75%{transform:rotate(8deg) translateY(-4px)}}",
    "@keyframes hx-confetti{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--rot))}}",
    "@keyframes md-bubble{0%{opacity:0;transform:scale(.6) translateY(8px)}60%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:none}}",
    "@keyframes md-arrive{0%{transform:translateY(0)}50%{transform:translateY(-3px)}100%{transform:none}}",
    "@keyframes md-dash{to{background-position:-24px 0}}",
    "@keyframes md-puff{0%{opacity:.8;transform:translate(0,0) scale(.6)}100%{opacity:0;transform:translate(-16px,-8px) scale(1.4)}}",
    ".hx-bob{animation:hx-bob 1.8s ease-in-out infinite}",
    ".hx-dance{animation:hx-dance .9s ease-in-out infinite;transform-origin:50% 90%}",
    ".hx-press{animation:hx-press 1.6s ease-in-out infinite}",
    ".hx-flex-l{animation:hx-flex-l 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:100% 100%}",
    ".hx-flex-r{animation:hx-flex-r 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 100%}",
    ".hx-bicep{animation:hx-bicep 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}",
    ".hx-wave{animation:hx-wave 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 100%}",
    ".hx-wink{animation:hx-wink 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}",
    ".hx-sweat{animation:hx-sweat 1.6s ease-in infinite}",
    ".hx-drive{animation:hx-drive 2.4s ease-in-out infinite}",
    ".hx-bump{animation:hx-bump .5s ease-in-out infinite}",
    ".hx-wobble{animation:hx-wobble .8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}",
    ".hx-speed{animation:hx-speed .9s linear infinite}",
    ".hx-wheel{animation:hx-wheel .6s linear infinite;transform-box:fill-box;transform-origin:center}",

    ".md-wrap{max-width:980px;margin:0 auto;padding:56px 16px}",
    ".md-head{text-align:center;margin-bottom:22px}",
    ".md-eyebrow{display:inline-block;padding:6px 14px;border-radius:999px;background:#fff1e4;color:#e85d00;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}",
    ".md-head h2{margin:12px 0 8px;font-size:clamp(28px,3vw,38px);font-weight:800;color:#0f172a;letter-spacing:-.02em}",
    ".md-head p{margin:0 auto;max-width:620px;font-size:17px;line-height:1.6;color:#334155}",
    ".md-card{position:relative;overflow:hidden;border:4px solid #fff;border-radius:28px;padding:20px 20px 18px;",
    "background:linear-gradient(135deg,#e0f2fe 0%,#ede9fe 45%,#fce7f3 100%);box-shadow:0 6px 0 rgba(15,23,42,.10),0 18px 40px rgba(15,23,42,.14)}",
    ".md-stage{position:relative;display:flex;align-items:center;gap:14px;min-height:112px}",
    ".md-mascot{flex:none;display:flex;align-items:center;justify-content:center;width:130px;height:104px}",
    ".md-mascot svg{width:100%;height:100%;overflow:visible}",
    ".md-bubble{position:relative;flex:1;min-width:0;border:2px solid #ddd6fe;background:#fff;border-radius:18px;padding:12px 16px;",
    "font-size:16px;font-weight:700;line-height:1.45;color:#4c1d95;box-shadow:0 2px 6px rgba(76,29,149,.08);animation:md-bubble .45s cubic-bezier(.2,.9,.3,1.3) both}",
    ".md-bubble:before{content:'';position:absolute;left:-8px;top:50%;width:12px;height:12px;margin-top:-6px;transform:rotate(45deg);background:#fff;border-left:2px solid #ddd6fe;border-bottom:2px solid #ddd6fe}",
    ".md-road-box{margin-top:16px;border-radius:20px;background:rgba(255,255,255,.78);padding:30px 10px 12px;box-shadow:inset 0 0 0 1px #fff}",
    ".md-road{position:relative;margin:0 18px}",
    ".md-road-line{position:absolute;left:0;right:0;top:15px;height:3px;border-radius:3px;background-image:linear-gradient(90deg,#94a3b8 50%,transparent 50%);background-size:24px 3px;background-repeat:repeat-x;animation:md-dash .6s linear infinite}",
    ".md-road-fill{position:absolute;left:0;top:15px;height:3px;border-radius:3px;background:linear-gradient(90deg,#8b5cf6,#ff7a00);transition:width .7s ease-out}",
    ".md-truck{position:absolute;top:-24px;font-size:22px;line-height:1;transform:translateX(-50%);transition:left .7s ease-in-out}",
    ".md-truck-in{position:relative;display:inline-block;animation:md-arrive .6s ease-out .5s both}",
    ".md-truck-face{display:inline-block;transform:scaleX(-1)}",
    ".md-puff{position:absolute;left:-10px;top:8px;font-size:11px;animation:md-puff .8s ease-out infinite}",
    ".md-stops{position:relative;display:flex;justify-content:space-between;margin:0;padding:0;list-style:none}",
    ".md-stops li{width:0;display:flex;flex-direction:column;align-items:center}",
    ".md-stop{position:relative;flex:none;width:34px;height:34px;border:0;border-radius:50%;background:#fff;font-size:16px;line-height:34px;padding:0;cursor:pointer;",
    "box-shadow:0 0 0 2px #e2e8f0,0 2px 4px rgba(15,23,42,.08);transition:transform .4s,box-shadow .3s,background .3s}",
    ".md-stop.done{background:#ede9fe;box-shadow:0 0 0 2px #c4b5fd}",
    ".md-stop.on{z-index:1;background:#fff3e0;transform:scale(1.16);box-shadow:0 0 0 3px #ff7a00,0 6px 14px rgba(255,122,0,.35)}",
    ".md-stop .md-check{position:absolute;right:-7px;top:-7px;font-size:11px}",
    ".md-num{margin-top:5px;font-size:11px;font-weight:800;color:#94a3b8}",
    ".md-num.on{color:#6d28d9}",
    ".md-strip-box{position:relative;overflow:hidden;margin-top:14px}",
    ".md-strip{display:flex;align-items:stretch;transition:transform .7s ease-in-out}",
    ".md-strip button{flex:none;padding:0 3px;border:0;background:none;text-align:left;cursor:pointer}",
    ".md-strip button>span{display:block;height:100%;border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.6);opacity:.5;box-shadow:inset 0 0 0 1px #fff;transition:all .5s}",
    ".md-strip button.near>span{background:rgba(255,255,255,.85);opacity:.85}",
    ".md-strip button.on>span{background:#fff;opacity:1;box-shadow:0 0 0 2px #ff7a00,0 6px 16px rgba(15,23,42,.10)}",
    ".md-strip b{display:block;font-size:14px;font-weight:800;line-height:1.25;color:#334155}",
    ".md-strip button.on b{color:#4c1d95}",
    ".md-strip small{display:block;margin-top:4px;font-size:13px;line-height:1.4;color:#64748b}",
    ".md-strip button.on small{color:#334155;font-weight:600}",
    ".md-note{margin:14px 0 0;text-align:center;font-size:13.5px;font-weight:600;color:#475569}",
    ".md-cta{text-align:center;margin-top:22px}",
    ".md-confetti{position:absolute;top:40%;left:70px;width:8px;height:12px;border-radius:2px;pointer-events:none;animation:hx-confetti 1.6s cubic-bezier(.2,.7,.3,1) forwards}",
    "@media (max-width:767px){.md-wrap{padding:40px 12px}.md-card{padding:14px 12px;border-radius:22px}.md-mascot{width:96px;height:84px}",
    ".md-bubble{font-size:14px;padding:10px 12px}.md-road{margin:0 12px}.md-stop{width:28px;height:28px;font-size:13px;line-height:28px}",
    ".md-num{font-size:10px}.md-strip b{font-size:13px}.md-strip small{font-size:12.5px}}",
    "@media (prefers-reduced-motion:reduce){.md-card *{animation:none!important;transition:none!important}.md-confetti{display:none}}"
  ].join("");

  /* ---------------------------------------------------------- the mascot */

  var SKIN = "#f6c9a0", SKIN_DARK = "#e9ac7c", VIOLET = "#7c3aed", VIOLET_DARK = "#5b21b6", GOLD = "#fbbf24";

  var FACE =
    '<g><path d="M58 52 q-6 -10 2 -20" stroke="#16a34a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M102 52 q6 -10 -2 -20" stroke="#16a34a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="58" cy="40" rx="4" ry="7" fill="#22c55e" transform="rotate(-30 58 40)"/>' +
    '<ellipse cx="102" cy="40" rx="4" ry="7" fill="#22c55e" transform="rotate(30 102 40)"/>' +
    '<circle cx="80" cy="56" r="24" fill="' + SKIN + '" stroke="' + SKIN_DARK + '" stroke-width="2"/>' +
    '<path d="M58 48 q4 -18 22 -20 q18 2 22 20 q-6 -8 -11 -6 q-5 -8 -11 -2 q-6 -6 -11 2 q-6 -2 -11 6z" fill="#3f2a1d"/>' +
    '<path d="M68 49 q5 -4 9 0" stroke="#3f2a1d" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M83 49 q5 -4 9 0" stroke="#3f2a1d" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="72" cy="56" rx="3" ry="3.6" fill="#1f2937"/>' +
    '<ellipse class="hx-wink" cx="88" cy="56" rx="3" ry="3.6" fill="#1f2937"/>' +
    '<circle cx="66" cy="64" r="4" fill="#fb7185" opacity=".45"/><circle cx="94" cy="64" r="4" fill="#fb7185" opacity=".45"/>' +
    '<path d="M69 64 q11 12 22 0 q-11 5 -22 0z" fill="#7f1d1d"/><path d="M71 65 q9 4 18 0" stroke="#fff" stroke-width="2" fill="none"/></g>';

  var TORSO =
    '<g><rect x="74" y="78" width="12" height="8" fill="' + SKIN + '"/>' +
    '<path d="M56 86 q24 -8 48 0 l-4 46 q-20 6 -40 0z" fill="' + VIOLET + '" stroke="' + VIOLET_DARK + '" stroke-width="2"/>' +
    '<text x="80" y="118" text-anchor="middle" font-size="20" font-weight="900" fill="' + GOLD + '" font-family="Arial, sans-serif">H</text>' +
    '<path d="M60 130 h40 l2 14 h-18 l-4 -6 l-4 6 h-18z" fill="' + VIOLET_DARK + '"/>' +
    '<rect x="64" y="144" width="10" height="16" rx="4" fill="' + SKIN + '"/><rect x="86" y="144" width="10" height="16" rx="4" fill="' + SKIN + '"/>' +
    '<ellipse cx="68" cy="162" rx="9" ry="5" fill="#1f2937"/><ellipse cx="92" cy="162" rx="9" ry="5" fill="#1f2937"/></g>';

  function arm(d, bicep, cls) {
    return '<g' + (cls ? ' class="' + cls + '"' : "") + '>' +
      '<path d="' + d + '" stroke="' + SKIN_DARK + '" stroke-width="15" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" stroke="' + SKIN + '" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      (bicep ? '<circle class="hx-bicep" cx="' + bicep[0] + '" cy="' + bicep[1] + '" r="8" fill="' + SKIN + '" stroke="' + SKIN_DARK + '" stroke-width="2"/>' : "") +
      "</g>";
  }

  var SOFA =
    '<g><rect x="24" y="2" width="112" height="24" rx="7" fill="#f97316" stroke="#c2410c" stroke-width="2"/>' +
    '<rect x="30" y="6" width="32" height="12" rx="4" fill="#fdba74"/><rect x="64" y="6" width="32" height="12" rx="4" fill="#fdba74"/>' +
    '<rect x="98" y="6" width="32" height="12" rx="4" fill="#fdba74"/>' +
    '<rect x="30" y="26" width="5" height="6" rx="1" fill="#7c2d12"/><rect x="125" y="26" width="5" height="6" rx="1" fill="#7c2d12"/></g>';

  var TRUCK =
    '<svg viewBox="0 0 170 120" aria-hidden="true">' +
    '<g class="hx-speed" stroke="#a78bfa" stroke-width="4" stroke-linecap="round"><line x1="6" y1="58" x2="24" y2="58"/><line x1="2" y1="74" x2="18" y2="74"/><line x1="8" y1="90" x2="26" y2="90"/></g>' +
    '<g class="hx-drive"><g class="hx-bump"><g class="hx-wobble">' +
    '<rect x="52" y="14" width="34" height="26" rx="3" fill="#d4a373" stroke="#92400e" stroke-width="2"/><path d="M52 22 h34" stroke="#92400e" stroke-width="2"/>' +
    '<text x="69" y="35" text-anchor="middle" font-size="6.5" font-weight="800" fill="#92400e" font-family="Arial, sans-serif">FRAGILE</text></g>' +
    '<rect x="30" y="40" width="88" height="52" rx="6" fill="#fff" stroke="' + VIOLET_DARK + '" stroke-width="3"/>' +
    '<text x="74" y="71" text-anchor="middle" font-size="13" font-weight="900" fill="' + VIOLET + '" font-family="Arial, sans-serif">HERCULES</text>' +
    '<path d="M118 52 h22 l14 18 v22 h-36z" fill="' + VIOLET + '" stroke="' + VIOLET_DARK + '" stroke-width="3"/><path d="M124 57 h14 l9 12 h-23z" fill="#c4b5fd"/>' +
    '<circle cx="133" cy="64" r="6" fill="' + SKIN + '"/><path d="M130 66 q3 3 6 0" stroke="#7f1d1d" stroke-width="1.6" fill="none"/></g>' +
    '<g class="hx-wheel"><circle cx="55" cy="96" r="11" fill="#1f2937"/><circle cx="55" cy="96" r="4" fill="#d1d5db"/><rect x="54" y="86" width="2" height="6" fill="#d1d5db"/></g>' +
    '<g class="hx-wheel"><circle cx="132" cy="96" r="11" fill="#1f2937"/><circle cx="132" cy="96" r="4" fill="#d1d5db"/><rect x="131" y="86" width="2" height="6" fill="#d1d5db"/></g></g>' +
    '<line x1="0" y1="108" x2="170" y2="108" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="10 8"/></svg>';

  function mascot(pose, dance) {
    if (pose === "truck") return TRUCK;
    var body;
    if (pose === "lift") {
      body = '<g class="hx-press">' + SOFA + arm("M60 92 L42 62 L46 30") + arm("M100 92 L118 62 L114 30") + "</g>" +
        '<ellipse class="hx-sweat" cx="106" cy="44" rx="3" ry="4.5" fill="#38bdf8"/>';
    } else if (pose === "wave") {
      body = arm("M60 92 L46 116 L52 134") + arm("M100 92 L120 72 L126 44", null, "hx-wave");
    } else {
      body = arm("M60 92 L34 92 L36 66", [44, 84], "hx-flex-l") + arm("M100 92 L126 92 L124 66", [116, 84], "hx-flex-r");
    }
    return '<svg viewBox="0 -10 160 180" class="' + (dance ? "hx-dance" : "hx-bob") + '" aria-hidden="true">' + body + TORSO + FACE + "</svg>";
  }

  /* ------------------------------------------------------------ the widget */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function build(root) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var last = STEPS.length - 1;

    root.innerHTML =
      '<section class="md-wrap" aria-labelledby="md-title">' +
      '<div class="md-head"><span class="md-eyebrow">What to expect</span>' +
      '<h2 id="md-title">How your move day works</h2>' +
      '<p>From the knock on your door to the last box in place, here is exactly what happens on move day.</p></div>' +
      '<div class="md-card">' +
      '<div class="md-stage"><span class="md-mascot"></span><div class="md-bubble" aria-live="polite"></div></div>' +
      '<div class="md-road-box"><div class="md-road"><div class="md-road-line"></div><div class="md-road-fill"></div>' +
      '<span class="md-truck" aria-hidden="true"></span><ol class="md-stops">' +
      STEPS.map(function (s, i) {
        return '<li><button type="button" class="md-stop" data-i="' + i + '" aria-label="' + (i + 1) + ". " + esc(s.label) + '">' + s.emoji + "</button>" +
          '<span class="md-num">' + (i + 1) + "</span></li>";
      }).join("") +
      "</ol></div></div>" +
      '<div class="md-strip-box"><div class="md-strip">' +
      STEPS.map(function (s, i) {
        return '<button type="button" data-i="' + i + '"><span><b>' + s.emoji + " " + (i + 1) + ". " + esc(s.label) + "</b><small>" + esc(s.detail) + "</small></span></button>";
      }).join("") +
      "</div></div>" +
      '<p class="md-note">The drive to your first address is not billed. The job clock starts when the crew arrives.</p>' +
      "</div>" +
      '<div class="md-cta"><a class="button" href="/#estimate">Get My Free Estimate</a></div>' +
      "</section>";

    var card = root.querySelector(".md-card");
    var mascotEl = root.querySelector(".md-mascot");
    var bubble = root.querySelector(".md-bubble");
    var fill = root.querySelector(".md-road-fill");
    var truck = root.querySelector(".md-truck");
    var stops = root.querySelectorAll(".md-stop");
    var nums = root.querySelectorAll(".md-num");
    var strip = root.querySelector(".md-strip");
    var cards = strip.querySelectorAll("button");
    var active = 0, timer = null, paused = false, visible = true;

    function cardPct() {
      return window.matchMedia("(max-width: 767px)").matches ? 62 : 26;
    }

    function confetti() {
      var colors = ["#7c3aed", "#fbbf24", "#22c55e", "#f97316", "#38bdf8", "#f43f5e"];
      var stage = root.querySelector(".md-stage");
      for (var i = 0; i < 22; i++) {
        var a = (i / 22) * Math.PI * 2, d = 70 + ((i * 37) % 60);
        var p = document.createElement("span");
        p.className = "md-confetti";
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (i % 6) * 40 + "ms";
        p.style.setProperty("--dx", Math.round(Math.cos(a) * d * 1.4) + "px");
        p.style.setProperty("--dy", Math.round(Math.sin(a) * d + 40) + "px");
        p.style.setProperty("--rot", ((i * 47) % 360) + "deg");
        stage.appendChild(p);
        setTimeout(p.remove.bind(p), 1800);
      }
    }

    function render() {
      var s = STEPS[active], pct = (active / last) * 100, w = cardPct();
      mascotEl.innerHTML = mascot(s.pose, active === last);
      bubble.textContent = s.quip;
      bubble.style.animation = "none"; void bubble.offsetWidth; bubble.style.animation = "";
      fill.style.width = pct + "%";
      truck.style.left = pct + "%";
      truck.innerHTML = '<span class="md-truck-in"><span class="md-puff">💨</span><span class="md-truck-face">🚚</span></span>';
      for (var i = 0; i < STEPS.length; i++) {
        stops[i].className = "md-stop" + (i === active ? " on" : i < active ? " done" : "");
        stops[i].innerHTML = STEPS[i].emoji + (i < active ? '<span class="md-check" aria-hidden="true">✅</span>' : "");
        stops[i].setAttribute("aria-current", i === active ? "step" : "false");
        nums[i].className = "md-num" + (i === active ? " on" : "");
        cards[i].style.width = w + "%";
        cards[i].className = i === active ? "on" : Math.abs(i - active) === 1 ? "near" : "";
      }
      strip.style.transform = "translateX(" + (50 - (active + 0.5) * w) + "%)";
      if (active === last && !reduce) confetti();
    }

    function go(i) { active = (i + STEPS.length) % STEPS.length; render(); }
    function tick() { if (!paused && visible) go(active + 1); }
    function start() { if (!reduce && !timer) timer = setInterval(tick, STEP_MS); }

    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-i]");
      if (!b) return;
      go(Number(b.getAttribute("data-i")));
      paused = true; // let people read the step they picked
      clearTimeout(root._resume);
      root._resume = setTimeout(function () { paused = false; }, STEP_MS * 3);
    });
    card.addEventListener("mouseenter", function () { paused = true; });
    card.addEventListener("mouseleave", function () { paused = false; });
    card.addEventListener("focusin", function () { paused = true; });
    card.addEventListener("focusout", function () { paused = false; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }, { threshold: 0.25 }).observe(card);
    }
    window.addEventListener("resize", render);

    render();
    start();
  }

  function init() {
    var roots = document.querySelectorAll("[data-move-day]");
    if (!roots.length) return;
    if (!document.getElementById("md-styles")) {
      var st = document.createElement("style");
      st.id = "md-styles";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    Array.prototype.forEach.call(roots, build);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
