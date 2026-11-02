/*
 * Site header: mobile menu panel, Moves / Service Areas dropdowns, and the
 * shadow once the page scrolls. Desktop dropdowns also open on hover (CSS);
 * this script handles taps, keyboard and closing.
 */
(function () {
  "use strict";

  var header = document.getElementById("site-header");
  if (!header) return;

  var burger = header.querySelector(".sh-burger");
  var subs = header.querySelectorAll(".sh-has-sub");
  var mobile = window.matchMedia("(max-width: 1099px)");

  function closeSubs(except) {
    Array.prototype.forEach.call(subs, function (li) {
      if (li === except) return;
      li.classList.remove("is-open");
      li.querySelector(".sh-link").setAttribute("aria-expanded", "false");
    });
  }

  function setMenu(open) {
    header.classList.toggle("sh-open", open);
    document.documentElement.classList.toggle("sh-lock", open && mobile.matches);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (!open) closeSubs();
  }

  burger.addEventListener("click", function () {
    setMenu(!header.classList.contains("sh-open"));
  });

  Array.prototype.forEach.call(subs, function (li) {
    var btn = li.querySelector(".sh-link");
    btn.addEventListener("click", function () {
      var open = !li.classList.contains("is-open");
      closeSubs(li);
      li.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  // Close on a tap outside, on Escape, and when a link inside is followed
  // (so "Free Estimate" on the homepage scrolls with the menu out of the way).
  document.addEventListener("click", function (e) {
    if (!header.contains(e.target)) {
      closeSubs();
      if (header.classList.contains("sh-open")) setMenu(false);
    } else if (e.target.closest("a[href]")) {
      setMenu(false);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openSub = header.querySelector(".sh-has-sub.is-open .sh-link");
    closeSubs();
    if (header.classList.contains("sh-open")) {
      setMenu(false);
      burger.focus();
    } else if (openSub) {
      openSub.focus();
    }
  });

  // Leaving the mobile layout with the panel open would leave the page locked.
  var onChange = function () { if (!mobile.matches) setMenu(false); };
  if (mobile.addEventListener) mobile.addEventListener("change", onChange);
  else if (mobile.addListener) mobile.addListener(onChange);

  var ticking = false;
  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();
})();

/*
 * OpenAI Ads matching. Every visitor gets a stable random ID (kept in
 * localStorage, with a cookie as backup) that the pixel sends as its external
 * ID, so calls and form leads can be matched to ad clicks. When a form is
 * sent, HerculesAds.identify() adds the email, phone and name the customer
 * typed. The pixel hashes them (SHA-256) in the browser before sending.
 */
(function () {
  "use strict";

  var KEY = "hercules_vid";

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function visitorId() {
    var id = "";
    try { id = localStorage.getItem(KEY) || ""; } catch (err) {}
    if (!id) {
      var fromCookie = new RegExp("(?:^|;\\s*)" + KEY + "=([^;]+)").exec(document.cookie);
      id = fromCookie ? decodeURIComponent(fromCookie[1]) : newId();
    }
    try { localStorage.setItem(KEY, id); } catch (err) {}
    document.cookie = KEY + "=" + encodeURIComponent(id) + ";path=/;max-age=" + 60 * 60 * 24 * 400 + ";SameSite=Lax";
    return id;
  }

  // US numbers in E.164 (+1 and 10 digits), the format the pixel expects.
  function e164(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    return d.length === 10 ? "+1" + d : "";
  }

  var vid = visitorId();

  function identify(contact) {
    if (typeof oaiq !== "function") return;
    contact = contact || {};
    var user = { external_id_sha256: vid };
    var email = String(contact.email || "").trim().toLowerCase();
    if (email.indexOf("@") > 0) user.email_sha256 = email;
    var phone = e164(contact.phone);
    if (phone) user.phone_number_sha256 = phone;
    if (contact.firstName) user.first_name_sha256 = String(contact.firstName).trim();
    if (contact.lastName) user.last_name_sha256 = String(contact.lastName).trim();
    oaiq("init", { user: user });
  }

  window.HerculesAds = { identify: identify, visitorId: vid };
  identify();
})();

/*
 * Phone taps count as leads. ChatGPT ad visitors often call instead of using
 * the form, so every tel: link reports to Google Analytics (phone_call_click)
 * and to the OpenAI Ads pixel (lead_created), which lets Ads Manager credit
 * the ads that produce calls. OpenAI credits the last ad clicked (its
 * ?oppref= click id, kept in the __oppref cookie), so the pixel gets one call
 * per ad click: repeat taps don't inflate it, and a tap after clicking a
 * different ad still counts for that ad.
 */
(function () {
  "use strict";

  function adClickId() {
    var fromUrl = /[?&]oppref=([^&#]+)/.exec(location.search);
    if (fromUrl) return decodeURIComponent(fromUrl[1]);
    var fromCookie = /(?:^|;\s*)__oppref=([^;]+)/.exec(document.cookie);
    return fromCookie ? decodeURIComponent(fromCookie[1]) : "";
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!link) return;
    var where = link.className || (link.closest("header") ? "header" : link.closest(".footer") ? "footer" : "page");
    if (typeof gtag === "function") {
      gtag("event", "phone_call_click", { link_location: String(where).slice(0, 40), page_path: location.pathname });
    }
    var clickId = adClickId();
    var key = "hercules_call_tracked:" + (clickId || "organic");
    var already = false;
    try { already = sessionStorage.getItem(key) === "1"; sessionStorage.setItem(key, "1"); } catch (err) {}
    if (!already && typeof oaiq === "function") {
      // A stable id per ad click lets OpenAI drop duplicates on its side too.
      var eventId = clickId ? "call-" + clickId.slice(0, 60) : "call-" + Date.now();
      oaiq("measure", "lead_created", { type: "customer_action" }, { event_id: eventId });
    }
  }, true);
})();
