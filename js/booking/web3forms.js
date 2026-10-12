window.HerculesBooking = window.HerculesBooking || {};

/**
 * Backup lead delivery through Web3Forms, used when FormSubmit can't be
 * reached or refuses a submission. Some phones (content blockers, carrier
 * filters, DNS filtering) can't resolve formsubmit.co at all, and without a
 * second route those customers' requests would be lost.
 *
 * Takes the same FormSubmit-style field object the forms already build, so
 * both services produce the same email. FormSubmit-only options (_template,
 * _captcha, _cc, _next...) are dropped; Web3Forms' free plan has no CC, so the
 * customer copy only goes out when FormSubmit delivers.
 *
 * The access key is public by design (Web3Forms keys are meant for client-side
 * code) and routes to herculesmoversfl@gmail.com.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://api.web3forms.com/submit";
  var ACCESS_KEY = "9217f2d5-775a-46c6-b8c8-a2ced148082f";

  window.HerculesBooking.sendBackup = function (fields) {
    var body = { access_key: ACCESS_KEY, from_name: "Hercules Movers website" };
    Object.keys(fields || {}).forEach(function (key) {
      var value = fields[key];
      if (value == null || value === "") return;
      if (key === "_subject") body.subject = String(value);
      else if (key === "_replyto") body.replyto = String(value);
      else if (key.charAt(0) !== "_") body[key] = String(value);
    });
    body["Delivered via"] = "Web3Forms backup (FormSubmit unavailable)";

    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok || !data || data.success !== true) {
            throw new Error("Web3Forms: " + ((data && data.message) || "HTTP " + res.status));
          }
          return data;
        });
    });
  };

  /**
   * Last resort when neither service is reachable: an sms: link that opens the
   * customer's Messages app with their request already typed out.
   */
  window.HerculesBooking.textUsHref = function (lines) {
    var cfg = window.HerculesBooking.config;
    var tel = (cfg && cfg.phoneTel) || "+17543542008";
    var text = (lines || []).filter(Boolean).join("\n");
    return "sms:" + tel + "?body=" + encodeURIComponent(text);
  };
})();
