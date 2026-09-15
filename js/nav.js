(function ($) {
  $(function () {
    var $panel = $("#myNavbar");
    var $toggle = $(".navbar-toggle");

    if (!$panel.length || !$toggle.length) return;

    function closeMenu() {
      // Above the collapse breakpoint the links are always visible, so there is
      // nothing to fold away.
      if (!$toggle.is(":visible") || !$panel.hasClass("in")) return;
      $panel.find(".dropdown.open").removeClass("open");
      $panel.collapse("hide");
    }

    // iOS Safari only bubbles click from interactive elements, so a tap on plain
    // page content needs touchstart to be seen here as well.
    $(document).on("click touchstart", function (event) {
      if (!$(event.target).closest(".navbar").length) closeMenu();
    });
  });
}(window.jQuery));
