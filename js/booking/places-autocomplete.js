window.HerculesBooking = window.HerculesBooking || {};

/**
 * Address suggestions rendered into the page's own markup.
 *
 * Google's PlaceAutocompleteElement puts its dropdown in the browser top layer
 * and positions it against the viewport. On phones the on-screen keyboard
 * shifts the viewport coordinate grid, so that dropdown lands at the top of the
 * screen and can run off the edge. Fetching predictions directly and rendering
 * them as an absolutely positioned list inside the field keeps the suggestions
 * under the input, because normal flow needs no viewport math at all.
 */
(function () {
  var MIN_CHARS = 3;
  var DEBOUNCE_MS = 180;
  var FIELDS = ["addressComponents", "formattedAddress"];

  function attach(input, options) {
    options = options || {};
    if (!input || input.dataset.hbPlacesBound) return;
    if (!window.google || !google.maps || !google.maps.importLibrary) return;
    input.dataset.hbPlacesBound = "1";

    var anchor = input.parentNode;
    if (!anchor) return;
    anchor.classList.add("hb-ac-anchor");

    var list = document.createElement("ul");
    list.className = "hb-ac-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    anchor.appendChild(list);

    var suggestions = [];
    var activeIndex = -1;
    var token = null;
    var newestRequest = 0;
    var timer = null;

    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    input.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(request, DEBOUNCE_MS);
    });

    input.addEventListener("keydown", function (evt) {
      if (list.hidden) return;
      if (evt.key === "ArrowDown") {
        evt.preventDefault();
        move(1);
      } else if (evt.key === "ArrowUp") {
        evt.preventDefault();
        move(-1);
      } else if (evt.key === "Enter") {
        if (activeIndex >= 0) {
          evt.preventDefault();
          choose(activeIndex);
        }
      } else if (evt.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", function () {
      // A pointer press on a row cancels itself before blur runs, so anything
      // reaching here is a real exit from the field.
      close();
    });

    function request() {
      var value = String(input.value || "").trim();
      if (value.length < MIN_CHARS) {
        close();
        return;
      }
      var requestId = ++newestRequest;

      google.maps
        .importLibrary("places")
        .then(function (lib) {
          if (!lib.AutocompleteSuggestion) throw new Error("Autocomplete Data API unavailable.");
          if (!token && lib.AutocompleteSessionToken) token = new lib.AutocompleteSessionToken();
          return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: value,
            includedRegionCodes: ["us"],
            sessionToken: token || undefined
          });
        })
        .then(function (result) {
          if (requestId !== newestRequest) return;
          render((result && result.suggestions) || []);
        })
        .catch(function (err) {
          // Typing a city or ZIP by hand still produces an estimate, so a
          // lookup failure stays silent for the customer.
          console.error("Address suggestions unavailable", err);
          close();
        });
    }

    function render(results) {
      suggestions = results.filter(function (s) {
        return s && s.placePrediction;
      });
      activeIndex = -1;
      list.innerHTML = "";

      if (!suggestions.length) {
        close();
        return;
      }

      suggestions.forEach(function (suggestion, index) {
        var prediction = suggestion.placePrediction;
        var item = document.createElement("li");
        item.className = "hb-ac-item";
        item.setAttribute("role", "option");

        var main = document.createElement("span");
        main.className = "hb-ac-main";
        main.textContent = text(prediction.mainText) || text(prediction.text);
        item.appendChild(main);

        var secondaryText = text(prediction.secondaryText);
        if (secondaryText) {
          var secondary = document.createElement("span");
          secondary.className = "hb-ac-secondary";
          secondary.textContent = secondaryText;
          item.appendChild(secondary);
        }

        // Selecting on pointerdown and cancelling the event keeps focus in the
        // input, so blur can't close the list before the tap is handled.
        item.addEventListener("pointerdown", function (evt) {
          evt.preventDefault();
          choose(index);
        });
        item.addEventListener("pointerenter", function () {
          highlight(index);
        });

        list.appendChild(item);
      });

      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function move(delta) {
      if (!suggestions.length) return;
      var next = activeIndex + delta;
      if (next < 0) next = suggestions.length - 1;
      if (next >= suggestions.length) next = 0;
      highlight(next);
    }

    function highlight(index) {
      activeIndex = index;
      Array.prototype.forEach.call(list.children, function (item, i) {
        if (i === index) item.classList.add("active");
        else item.classList.remove("active");
      });
    }

    function choose(index) {
      var suggestion = suggestions[index];
      if (!suggestion || !suggestion.placePrediction) return;
      var prediction = suggestion.placePrediction;
      var place = prediction.toPlace();

      close();
      input.value = text(prediction.text) || input.value;

      place
        .fetchFields({ fields: FIELDS })
        .then(function () {
          // The session ends with the details lookup, so the next keystroke
          // starts a fresh one.
          token = null;
          if (options.onSelect) options.onSelect(place);
        })
        .catch(function (err) {
          console.error("Unable to read selected place", err);
        });
    }

    function close() {
      list.hidden = true;
      list.innerHTML = "";
      suggestions = [];
      activeIndex = -1;
      input.setAttribute("aria-expanded", "false");
    }
  }

  function text(value) {
    if (!value) return "";
    return typeof value === "string" ? value : String(value.text || value.toString() || "");
  }

  window.HerculesBooking.attachPlacesAutocomplete = attach;
})();
