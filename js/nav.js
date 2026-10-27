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
