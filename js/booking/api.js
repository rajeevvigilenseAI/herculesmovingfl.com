window.HerculesBooking = window.HerculesBooking || {};

window.HerculesBooking.api = {
  endpoint: function (name) {
    var cfg = window.HerculesBooking.config;
    if (!cfg.supabaseUrl) {
      // Estimates are computed in the browser, so this only ever surfaces on
      // the reserve step, before Supabase has been deployed.
      throw new Error(
        "Online reservations aren't switched on yet. Please call Hercules Movers at " +
          cfg.phoneDisplay +
          " to lock in this estimate."
      );
    }
    return cfg.supabaseUrl.replace(/\/$/, "") + "/functions/v1/" + name;
  },

  post: function (name, payload) {
    var cfg = window.HerculesBooking.config;
    var url;
    try {
      // endpoint() throws synchronously when Supabase isn't configured yet;
      // route that through the returned promise instead of letting it escape
      // as an uncaught exception (which would skip .catch()/.then() cleanup
      // in callers and leave "Calculating..." buttons stuck forever).
      url = this.endpoint(name);
    } catch (err) {
      return Promise.reject(err);
    }
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.supabaseAnonKey || "",
        Authorization: "Bearer " + (cfg.supabaseAnonKey || "")
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.error || "Something went wrong. Please try again.");
        }
        return data;
      });
    }).catch(function (err) {
      if (err instanceof TypeError) {
        // fetch() itself rejects with a generic TypeError on network failure/CORS.
        throw new Error("Unable to reach the booking server. Please check your connection and try again.");
      }
      throw err;
    });
  },

  estimate: function (payload) {
    return this.post("estimate", payload);
  },

  book: function (payload) {
    var cfg = window.HerculesBooking.config;
    // Until Supabase is deployed, email the request to the office instead of
    // dropping it. Deliberately not a retry-on-failure path: if Supabase is
    // configured but errors, the customer retries rather than risking a
    // reservation that exists in an inbox but not in the database.
    if (!cfg.supabaseUrl && window.HerculesBooking.fallbackBook) {
      return window.HerculesBooking.fallbackBook(payload);
    }
    return this.post("book", payload);
  }
};
