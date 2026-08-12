/**
 * Single source of truth for Hercules estimate math: the authoritative price
 * lookup, the static coordinate tables, and the distance approximation.
 *
 * Loaded three ways with no build step, so the browser and the Edge Functions
 * can never drift apart:
 *   - browser: plain <script src="js/booking/quote-core.js">
 *   - Deno / Node: side-effect `import` of this file, then read
 *     globalThis.HerculesQuoteCore (see supabase/functions/_shared/pricing.js
 *     and _shared/distance.js)
 *
 * Keep this file free of module syntax (no import/export) and ES5-only so all
 * three environments can load the exact same bytes.
 */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- pricing */

  // Never compute price as hours * hourly rate. Price always comes from here.
  var HOUR_PRICE = { 2: 260, 3: 390, 4: 490, 5: 649, 6: 790, 7: 890, 8: 990 };

  var LOCAL_MILE_LIMIT = 50;

  // Size 5 is "just a few items", added after 0-4 so the numbers already in
  // the database keep their meaning. Display order comes from HOME_SIZE_ORDER.
  var LOCAL_HOURS = { 0: 2, 1: 2, 2: 3, 3: 4, 4: 4, 5: 2 };

  var LOADING_HOURS = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 1 };

  var HOME_SIZE_LABELS = {
    0: "Studio",
    1: "1 Bedroom",
    2: "2 Bedrooms",
    3: "3 Bedrooms",
    4: "4+ Bedrooms",
    5: "Just a Few Items"
  };

  var MAX_HOME_SIZE = 5;

  // Smallest job first, so the dropdown reads the way a customer thinks.
  var HOME_SIZE_ORDER = [5, 0, 1, 2, 3, 4];

  /**
   * Customer-selectable distance ranges. `miles` is the representative mileage
   * used for pricing: the midpoint of each range, so a customer who picks a
   * range is priced as an average trip within it rather than the worst case.
   * The open-ended top range has no midpoint; anything past ~400 miles already
   * hits the 8-hour cap, so its exact value doesn't move the price.
   */
  var DISTANCE_BANDS = [
    { key: "0-50", label: "Less than 50 miles (local)", min: 0, max: 50, miles: 25 },
    { key: "50-100", label: "50 to 100 miles", min: 50, max: 100, miles: 75 },
    { key: "100-150", label: "100 to 150 miles", min: 100, max: 150, miles: 125 },
    { key: "150-250", label: "150 to 250 miles", min: 150, max: 250, miles: 200 },
    { key: "250-500", label: "250 to 500 miles", min: 250, max: 500, miles: 375 },
    { key: "500-plus", label: "500+ miles", min: 500, max: Infinity, miles: 600 }
  ];

  // Specialty items an operator must look at before the move is finalized.
  // The reservation still goes through; it is only flagged.
  var REVIEW_SPECIALTY_ITEMS = [
    "piano",
    "safe",
    "pool_table",
    "oversized_furniture",
    "packing_needed",
    "storage_stop",
    "additional_stop",
    "other_specialty"
  ];

  function shouldFlagNeedsReview(specialtyItems) {
    var items = Array.isArray(specialtyItems) ? specialtyItems : [];
    for (var i = 0; i < items.length; i++) {
      if (REVIEW_SPECIALTY_ITEMS.indexOf(items[i]) >= 0) return true;
    }
    return false;
  }

  /* --------------------------------------------------------------- distance */

  // Real roads are longer than a straight line between two points.
  var ROAD_DISTANCE_FACTOR = 1.17;

  // Keyed by state so same-name cities in different states can coexist
  // (Hollywood FL vs Hollywood CA, Naples FL vs Naples NY, and so on).
  var CITY_COORDS = {
    FL: {
      "miami": [25.7617, -80.1918],
      "miami beach": [25.7907, -80.13],
      "south beach": [25.7826, -80.134],
      "miami gardens": [25.942, -80.2456],
      "miami lakes": [25.9087, -80.3086],
      "miami springs": [25.822, -80.2892],
      "north miami": [25.8901, -80.1867],
      "north miami beach": [25.9331, -80.1625],
      "aventura": [25.9565, -80.1393],
      "sunny isles beach": [25.929, -80.1226],
      "bal harbour": [25.8917, -80.1264],
      "hialeah": [25.8576, -80.2781],
      "hialeah gardens": [25.8873, -80.3247],
      "opa locka": [25.902, -80.2504],
      "doral": [25.8195, -80.3553],
      "sweetwater": [25.7634, -80.373],
      "kendall": [25.6795, -80.3173],
      "coral gables": [25.7215, -80.2684],
      "coconut grove": [25.728, -80.2437],
      "south miami": [25.7079, -80.2939],
      "pinecrest": [25.6673, -80.3045],
      "palmetto bay": [25.622, -80.3247],
      "cutler bay": [25.5808, -80.3468],
      "homestead": [25.4687, -80.4776],
      "florida city": [25.4479, -80.4794],
      "key biscayne": [25.6931, -80.1626],
      "key largo": [25.0865, -80.4473],
      "islamorada": [24.9243, -80.6279],
      "tavernier": [25.0084, -80.5164],
      "marathon": [24.7137, -81.0905],
      "big pine key": [24.6696, -81.354],
      "key west": [24.5551, -81.78],
      "hollywood": [26.0112, -80.1495],
      "hallandale beach": [25.9812, -80.1484],
      "hallandale": [25.9812, -80.1484],
      "dania beach": [26.0532, -80.1439],
      "fort lauderdale": [26.1224, -80.1373],
      "ft lauderdale": [26.1224, -80.1373],
      "oakland park": [26.1723, -80.1319],
      "wilton manors": [26.1595, -80.1394],
      "lauderhill": [26.1403, -80.2134],
      "lauderdale lakes": [26.1656, -80.1998],
      "lauderdale by the sea": [26.1934, -80.0956],
      "north lauderdale": [26.217, -80.2259],
      "tamarac": [26.2129, -80.2497],
      "sunrise": [26.167, -80.2564],
      "plantation": [26.1275, -80.2331],
      "davie": [26.0765, -80.2521],
      "cooper city": [26.0575, -80.2717],
      "southwest ranches": [26.0578, -80.3325],
      "weston": [26.1004, -80.3997],
      "miramar": [25.9861, -80.3035],
      "west park": [25.9845, -80.1989],
      "pembroke pines": [26.0078, -80.2963],
      "coral springs": [26.2712, -80.2706],
      "parkland": [26.3101, -80.2373],
      "margate": [26.2445, -80.2064],
      "coconut creek": [26.2515, -80.1789],
      "pompano beach": [26.2379, -80.1248],
      "deerfield beach": [26.3184, -80.0998],
      "boca raton": [26.3683, -80.1289],
      "highland beach": [26.3998, -80.0656],
      "delray beach": [26.4615, -80.0728],
      "boynton beach": [26.5318, -80.0905],
      "lake worth": [26.6168, -80.0684],
      "greenacres": [26.6276, -80.1256],
      "west palm beach": [26.7153, -80.0534],
      "palm beach": [26.7056, -80.0364],
      "palm beach gardens": [26.8234, -80.1387],
      "north palm beach": [26.8175, -80.0578],
      "riviera beach": [26.7753, -80.0581],
      "jupiter": [26.9342, -80.0942],
      "tequesta": [26.9673, -80.1259],
      "lake park": [26.8003, -80.0664],
      "wellington": [26.6618, -80.2683],
      "loxahatchee": [26.6845, -80.2798],
      "royal palm beach": [26.7087, -80.2306],
      "belle glade": [26.6845, -80.6675],
      "stuart": [27.1973, -80.2528],
      "palm city": [27.1642, -80.2669],
      "jensen beach": [27.2523, -80.2298],
      "port st lucie": [27.273, -80.3582],
      "port saint lucie": [27.273, -80.3582],
      "fort pierce": [27.4467, -80.3256],
      "ft pierce": [27.4467, -80.3256],
      "vero beach": [27.6386, -80.3973],
      "sebastian": [27.8164, -80.4706],
      "palm bay": [28.0345, -80.5887],
      "melbourne": [28.0836, -80.6081],
      "melbourne beach": [28.0683, -80.5603],
      "satellite beach": [28.176, -80.5901],
      "cocoa": [28.3861, -80.742],
      "cocoa beach": [28.3201, -80.6076],
      "cape canaveral": [28.4058, -80.6048],
      "merritt island": [28.5392, -80.672],
      "titusville": [28.6122, -80.8075],
      "daytona beach": [29.2108, -81.0228],
      "port orange": [29.1383, -80.9956],
      "new smyrna beach": [29.0258, -80.927],
      "ormond beach": [29.2858, -81.0559],
      "deland": [29.0283, -81.3031],
      "deltona": [28.9005, -81.2637],
      "palm coast": [29.585, -81.2076],
      "st augustine": [29.9012, -81.3124],
      "saint augustine": [29.9012, -81.3124],
      "jacksonville": [30.3322, -81.6557],
      "jacksonville beach": [30.2947, -81.3931],
      "orange park": [30.1661, -81.7065],
      "st johns": [30.0364, -81.5334],
      "fleming island": [30.0938, -81.7134],
      "fernandina beach": [30.6697, -81.4626],
      "amelia island": [30.6155, -81.4487],
      "lake city": [30.1897, -82.6393],
      "gainesville": [29.6516, -82.3248],
      "alachua": [29.7936, -82.4834],
      "ocala": [29.1872, -82.1401],
      "the villages": [28.9005, -81.9598],
      "leesburg": [28.8109, -81.8776],
      "mount dora": [28.8025, -81.6448],
      "eustis": [28.8528, -81.6853],
      "clermont": [28.5494, -81.7729],
      "winter garden": [28.5653, -81.5862],
      "ocoee": [28.5692, -81.5343],
      "apopka": [28.6934, -81.5322],
      "orlando": [28.5383, -81.3792],
      "winter park": [28.6, -81.3392],
      "maitland": [28.6278, -81.3631],
      "altamonte springs": [28.6612, -81.3656],
      "casselberry": [28.6778, -81.3278],
      "longwood": [28.7031, -81.3384],
      "sanford": [28.8003, -81.2731],
      "lake mary": [28.7589, -81.3178],
      "oviedo": [28.67, -81.2081],
      "winter springs": [28.6989, -81.3081],
      "kissimmee": [28.292, -81.4076],
      "celebration": [28.3255, -81.5334],
      "st cloud": [28.2489, -81.2812],
      "saint cloud": [28.2489, -81.2812],
      "davenport": [28.1614, -81.6017],
      "haines city": [28.1145, -81.62],
      "lakeland": [28.0395, -81.9498],
      "winter haven": [28.0222, -81.7329],
      "plant city": [28.0189, -82.1129],
      "brandon": [27.9378, -82.2859],
      "riverview": [27.8661, -82.3265],
      "valrico": [27.9387, -82.2362],
      "tampa": [27.9506, -82.4572],
      "temple terrace": [28.0353, -82.3893],
      "wesley chapel": [28.2397, -82.3277],
      "lutz": [28.1511, -82.4615],
      "land o lakes": [28.2189, -82.4589],
      "zephyrhills": [28.2336, -82.1812],
      "dade city": [28.3647, -82.1959],
      "new port richey": [28.2442, -82.7192],
      "port richey": [28.2717, -82.7196],
      "hudson": [28.3644, -82.6934],
      "spring hill": [28.4769, -82.523],
      "brooksville": [28.5553, -82.3878],
      "clearwater": [27.9659, -82.8001],
      "dunedin": [28.0198, -82.7717],
      "palm harbor": [28.0781, -82.7637],
      "tarpon springs": [28.1461, -82.7568],
      "largo": [27.9095, -82.7873],
      "seminole": [27.8398, -82.7912],
      "pinellas park": [27.8428, -82.6995],
      "st petersburg": [27.7676, -82.6403],
      "saint petersburg": [27.7676, -82.6403],
      "st pete beach": [27.7253, -82.7423],
      "bradenton": [27.4989, -82.5748],
      "palmetto": [27.5214, -82.5723],
      "lakewood ranch": [27.4184, -82.4351],
      "sarasota": [27.3364, -82.5307],
      "siesta key": [27.2664, -82.5464],
      "osprey": [27.1959, -82.4901],
      "venice": [27.0998, -82.4543],
      "north port": [27.0442, -82.2359],
      "port charlotte": [26.9762, -82.0906],
      "punta gorda": [26.9298, -82.0454],
      "cape coral": [26.5629, -81.9495],
      "fort myers": [26.6406, -81.8723],
      "ft myers": [26.6406, -81.8723],
      "fort myers beach": [26.4523, -81.9481],
      "lehigh acres": [26.6120, -81.6248],
      "estero": [26.4381, -81.8067],
      "bonita springs": [26.3398, -81.7787],
      "naples": [26.142, -81.7948],
      "marco island": [25.9412, -81.7187],
      "immokalee": [26.4187, -81.4173],
      "clewiston": [26.7534, -80.9337],
      "sebring": [27.4956, -81.4409],
      "arcadia": [27.2159, -81.8584],
      "tallahassee": [30.4383, -84.2807],
      "panama city": [30.1588, -85.6602],
      "panama city beach": [30.1766, -85.8055],
      "destin": [30.3935, -86.4958],
      "santa rosa beach": [30.3835, -86.2405],
      "fort walton beach": [30.4058, -86.6188],
      "navarre": [30.4019, -86.863],
      "pensacola": [30.4213, -87.2169],
      "gulf breeze": [30.3572, -87.1636],
      "crestview": [30.7621, -86.5706],
      "brickell": [25.7601, -80.1937],
      "wynwood": [25.801, -80.199],
      "north beach": [25.8465, -80.1203],
      "westchester": [25.7481, -80.3587],
      "kendall west": [25.7065, -80.438],
      "south miami heights": [25.5977, -80.3806],
      "tamiami": [25.7562, -80.4014]
    },
    GA: {
      "atlanta": [33.749, -84.388],
      "marietta": [33.9526, -84.5499],
      "alpharetta": [34.0754, -84.2941],
      "roswell": [34.0232, -84.3616],
      "sandy springs": [33.9304, -84.3733],
      "decatur": [33.7748, -84.2963],
      "duluth": [34.0029, -84.1446],
      "lawrenceville": [33.9562, -83.988],
      "athens": [33.9519, -83.3576],
      "augusta": [33.4735, -82.0105],
      "macon": [32.8407, -83.6324],
      "columbus": [32.461, -84.9877],
      "savannah": [32.0809, -81.0912],
      "valdosta": [30.8327, -83.2785],
      "brunswick": [31.1499, -81.4915],
      "st simons island": [31.1502, -81.3915]
    },
    AL: {
      "birmingham": [33.5186, -86.8104],
      "montgomery": [32.3668, -86.3],
      "mobile": [30.6954, -88.0399],
      "huntsville": [34.7304, -86.5861],
      "tuscaloosa": [33.2098, -87.5692],
      "dothan": [31.2232, -85.3905],
      "auburn": [32.6099, -85.4808]
    },
    SC: {
      "charleston": [32.7765, -79.9311],
      "columbia": [34.0007, -81.0348],
      "greenville": [34.8526, -82.394],
      "myrtle beach": [33.6891, -78.8867],
      "hilton head island": [32.2163, -80.7526],
      "bluffton": [32.2371, -80.8604],
      "spartanburg": [34.9496, -81.932],
      "rock hill": [34.9249, -81.0251]
    },
    NC: {
      "charlotte": [35.2271, -80.8431],
      "raleigh": [35.7796, -78.6382],
      "durham": [35.994, -78.8986],
      "chapel hill": [35.9132, -79.0558],
      "greensboro": [36.0726, -79.792],
      "winston salem": [36.0999, -80.2442],
      "asheville": [35.5951, -82.5515],
      "wilmington": [34.2257, -77.9447],
      "fayetteville": [35.0527, -78.8784],
      "cary": [35.7915, -78.7811],
      "concord": [35.4088, -80.5795]
    },
    VA: {
      "richmond": [37.5407, -77.436],
      "virginia beach": [36.8529, -75.978],
      "norfolk": [36.8508, -76.2859],
      "chesapeake": [36.7682, -76.2875],
      "alexandria": [38.8048, -77.0469],
      "arlington": [38.8816, -77.091],
      "fairfax": [38.8462, -77.3064],
      "roanoke": [37.271, -79.9414],
      "charlottesville": [38.0293, -78.4767]
    },
    MD: {
      "baltimore": [39.2904, -76.6122],
      "annapolis": [38.9784, -76.4922],
      "rockville": [39.084, -77.1528],
      "silver spring": [38.9907, -77.0261],
      "bethesda": [38.9847, -77.0947],
      "frederick": [39.4143, -77.4105],
      "ocean city": [38.3365, -75.0849]
    },
    DC: { "washington": [38.9072, -77.0369] },
    DE: { "wilmington": [39.7391, -75.5398], "dover": [39.1582, -75.5244], "rehoboth beach": [38.7209, -75.076] },
    PA: {
      "philadelphia": [39.9526, -75.1652],
      "pittsburgh": [40.4406, -79.9959],
      "allentown": [40.6084, -75.4902],
      "harrisburg": [40.2732, -76.8867],
      "scranton": [41.4090, -75.6624],
      "erie": [42.1292, -80.0851]
    },
    NJ: {
      "newark": [40.7357, -74.1724],
      "jersey city": [40.7178, -74.0431],
      "hoboken": [40.744, -74.0324],
      "trenton": [40.2171, -74.7429],
      "princeton": [40.3573, -74.6672],
      "atlantic city": [39.3643, -74.4229],
      "cherry hill": [39.9348, -75.0307],
      "edison": [40.5187, -74.4121]
    },
    NY: {
      "new york": [40.7128, -74.006],
      "manhattan": [40.7831, -73.9712],
      "brooklyn": [40.6782, -73.9442],
      "queens": [40.7282, -73.7949],
      "bronx": [40.8448, -73.8648],
      "staten island": [40.5795, -74.1502],
      "yonkers": [40.9312, -73.8988],
      "white plains": [41.034, -73.7629],
      "albany": [42.6526, -73.7562],
      "buffalo": [42.8864, -78.8784],
      "rochester": [43.1566, -77.6088],
      "syracuse": [43.0481, -76.1474],
      "long island": [40.7891, -73.135]
    },
    CT: {
      "hartford": [41.7658, -72.6734],
      "new haven": [41.3083, -72.9279],
      "stamford": [41.0534, -73.5387],
      "bridgeport": [41.1792, -73.1894],
      "norwalk": [41.1177, -73.4082]
    },
    RI: { "providence": [41.824, -71.4128], "newport": [41.4901, -71.3128] },
    MA: {
      "boston": [42.3601, -71.0589],
      "cambridge": [42.3736, -71.1097],
      "worcester": [42.2626, -71.8023],
      "springfield": [42.1015, -72.5898],
      "quincy": [42.2529, -71.0023],
      "lowell": [42.6334, -71.3162]
    },
    NH: { "manchester": [42.9956, -71.4548], "nashua": [42.7654, -71.4676], "portsmouth": [43.0718, -70.7626] },
    VT: { "burlington": [44.4759, -73.2121], "montpelier": [44.2601, -72.5754] },
    ME: { "portland": [43.6591, -70.2568], "bangor": [44.8016, -68.7712], "augusta": [44.3106, -69.7795] },
    OH: {
      "columbus": [39.9612, -82.9988],
      "cleveland": [41.4993, -81.6944],
      "cincinnati": [39.1031, -84.512],
      "dayton": [39.7589, -84.1916],
      "toledo": [41.6528, -83.5379],
      "akron": [41.0814, -81.519]
    },
    MI: {
      "detroit": [42.3314, -83.0458],
      "ann arbor": [42.2808, -83.743],
      "grand rapids": [42.9634, -85.6681],
      "lansing": [42.7325, -84.5555],
      "traverse city": [44.7631, -85.6206]
    },
    IN: {
      "indianapolis": [39.7684, -86.1581],
      "fort wayne": [41.0793, -85.1394],
      "bloomington": [39.1653, -86.5264],
      "south bend": [41.6764, -86.252]
    },
    IL: {
      "chicago": [41.8781, -87.6298],
      "naperville": [41.7508, -88.1535],
      "springfield": [39.7817, -89.6501],
      "peoria": [40.6936, -89.589],
      "rockford": [42.2711, -89.094]
    },
    WI: { "milwaukee": [43.0389, -87.9065], "madison": [43.0731, -89.4012], "green bay": [44.5133, -88.0133] },
    MN: { "minneapolis": [44.9778, -93.265], "st paul": [44.9537, -93.09], "saint paul": [44.9537, -93.09], "rochester": [44.0121, -92.4802], "duluth": [46.7867, -92.1005] },
    IA: { "des moines": [41.5868, -93.625], "cedar rapids": [41.9779, -91.6656], "davenport": [41.5236, -90.5776] },
    MO: { "kansas city": [39.0997, -94.5786], "st louis": [38.627, -90.1994], "saint louis": [38.627, -90.1994], "springfield": [37.209, -93.2923], "columbia": [38.9517, -92.3341], "branson": [36.6437, -93.2185] },
    KS: { "wichita": [37.6872, -97.3301], "overland park": [38.9822, -94.6708], "topeka": [39.0473, -95.6752] },
    NE: { "omaha": [41.2565, -95.9345], "lincoln": [40.8136, -96.7026] },
    KY: { "louisville": [38.2527, -85.7585], "lexington": [38.0406, -84.5037], "bowling green": [36.9685, -86.4808] },
    TN: {
      "nashville": [36.1627, -86.7816],
      "memphis": [35.1495, -90.049],
      "knoxville": [35.9606, -83.9207],
      "chattanooga": [35.0456, -85.3097],
      "franklin": [35.9251, -86.8689],
      "gatlinburg": [35.7143, -83.5102]
    },
    WV: { "charleston": [38.3498, -81.6326], "morgantown": [39.6295, -79.9559] },
    AR: { "little rock": [34.7465, -92.2896], "fayetteville": [36.0626, -94.1574], "bentonville": [36.3729, -94.2088] },
    LA: {
      "new orleans": [29.9511, -90.0715],
      "baton rouge": [30.4515, -91.1871],
      "shreveport": [32.5252, -93.7502],
      "lafayette": [30.2241, -92.0198],
      "metairie": [29.9841, -90.1529]
    },
    MS: { "jackson": [32.2988, -90.1848], "gulfport": [30.3674, -89.0928], "biloxi": [30.396, -88.8853], "hattiesburg": [31.3271, -89.2903] },
    TX: {
      "houston": [29.7601, -95.3698],
      "dallas": [32.7767, -96.797],
      "fort worth": [32.7555, -97.3308],
      "plano": [33.0198, -96.6989],
      "arlington": [32.7357, -97.1081],
      "austin": [30.2672, -97.7431],
      "san antonio": [29.4241, -98.4936],
      "el paso": [31.7619, -106.485],
      "corpus christi": [27.8006, -97.3964],
      "lubbock": [33.5779, -101.8552],
      "amarillo": [35.222, -101.8313],
      "mcallen": [26.2034, -98.23],
      "the woodlands": [30.1658, -95.4613],
      "katy": [29.7858, -95.8245],
      "sugar land": [29.6197, -95.6349]
    },
    OK: { "oklahoma city": [35.4676, -97.5164], "tulsa": [36.154, -95.9928], "norman": [35.2226, -97.4395] },
    CO: {
      "denver": [39.7392, -104.9903],
      "colorado springs": [38.8339, -104.8214],
      "boulder": [40.015, -105.2705],
      "fort collins": [40.5853, -105.0844],
      "aurora": [39.7294, -104.8319],
      "vail": [39.6403, -106.3742]
    },
    NM: { "albuquerque": [35.0844, -106.6504], "santa fe": [35.687, -105.9378], "las cruces": [32.3199, -106.7637] },
    AZ: {
      "phoenix": [33.4484, -112.074],
      "tucson": [32.2226, -110.9747],
      "mesa": [33.4152, -111.8315],
      "scottsdale": [33.4942, -111.9261],
      "chandler": [33.3062, -111.8413],
      "gilbert": [33.3528, -111.789],
      "tempe": [33.4255, -111.94],
      "flagstaff": [35.1983, -111.6513],
      "sedona": [34.8697, -111.761]
    },
    NV: { "las vegas": [36.1699, -115.1398], "henderson": [36.0395, -114.9817], "reno": [39.5296, -119.8138] },
    UT: { "salt lake city": [40.7608, -111.891], "provo": [40.2338, -111.6585], "park city": [40.6461, -111.498], "st george": [37.0965, -113.5684] },
    ID: { "boise": [43.615, -116.2023], "idaho falls": [43.4917, -112.0339], "coeur d alene": [47.6777, -116.7805] },
    MT: { "billings": [45.7833, -108.5007], "missoula": [46.8721, -113.994], "bozeman": [45.6795, -111.0374] },
    WY: { "cheyenne": [41.14, -104.8202], "jackson": [43.4799, -110.7624], "casper": [42.8666, -106.3131] },
    ND: { "fargo": [46.8772, -96.7898], "bismarck": [46.8083, -100.7837] },
    SD: { "sioux falls": [43.5446, -96.7311], "rapid city": [44.0805, -103.231] },
    CA: {
      "los angeles": [34.0522, -118.2437],
      "hollywood": [34.0928, -118.3287],
      "long beach": [33.7701, -118.1937],
      "pasadena": [34.1478, -118.1445],
      "santa monica": [34.0195, -118.4912],
      "burbank": [34.1808, -118.309],
      "glendale": [34.1425, -118.2551],
      "anaheim": [33.8366, -117.9143],
      "irvine": [33.6846, -117.8265],
      "santa ana": [33.7455, -117.8677],
      "riverside": [33.9533, -117.3962],
      "san bernardino": [34.1083, -117.2898],
      "san diego": [32.7157, -117.1611],
      "chula vista": [32.6401, -117.0842],
      "bakersfield": [35.3733, -119.0187],
      "fresno": [36.7378, -119.7871],
      "san jose": [37.3382, -121.8863],
      "san francisco": [37.7749, -122.4194],
      "oakland": [37.8044, -122.2712],
      "berkeley": [37.8715, -122.273],
      "palo alto": [37.4419, -122.143],
      "sacramento": [38.5816, -121.4944],
      "santa barbara": [34.4208, -119.6982],
      "san luis obispo": [35.2828, -120.6596],
      "santa cruz": [36.9741, -122.0308],
      "modesto": [37.6391, -120.9969],
      "stockton": [37.9577, -121.2908],
      "palm springs": [33.8303, -116.5453],
      "temecula": [33.4936, -117.1484]
    },
    OR: { "portland": [45.5152, -122.6784], "eugene": [44.0521, -123.0868], "salem": [44.9429, -123.0351], "bend": [44.0582, -121.3153] },
    WA: {
      "seattle": [47.6062, -122.3321],
      "bellevue": [47.6101, -122.2015],
      "tacoma": [47.2529, -122.4443],
      "spokane": [47.6588, -117.426],
      "vancouver": [45.6387, -122.6615],
      "olympia": [47.0379, -122.9007]
    },
    HI: { "honolulu": [21.3099, -157.8581], "kailua kona": [19.6397, -155.9969], "lahaina": [20.8783, -156.6825] },
    AK: { "anchorage": [61.2181, -149.9003], "fairbanks": [64.8378, -147.7164], "juneau": [58.3019, -134.4197] }
  };

  // First 3 ZIP digits -> approximate regional center. Used when the city name
  // can't be matched. Florida is covered prefix by prefix; the rest of the
  // country covers the metros customers most often move to.
  var ZIP3_COORDS = {
    "320": CITY_COORDS.FL["jacksonville"],
    "321": CITY_COORDS.FL["daytona beach"],
    "322": CITY_COORDS.FL["jacksonville"],
    "323": CITY_COORDS.FL["tallahassee"],
    "324": CITY_COORDS.FL["panama city"],
    "325": CITY_COORDS.FL["pensacola"],
    "326": CITY_COORDS.FL["gainesville"],
    "327": CITY_COORDS.FL["orlando"],
    "328": CITY_COORDS.FL["orlando"],
    "329": CITY_COORDS.FL["melbourne"],
    "330": CITY_COORDS.FL["fort lauderdale"],
    "331": CITY_COORDS.FL["miami"],
    "332": CITY_COORDS.FL["miami"],
    "333": CITY_COORDS.FL["fort lauderdale"],
    "334": CITY_COORDS.FL["west palm beach"],
    "335": CITY_COORDS.FL["tampa"],
    "336": CITY_COORDS.FL["tampa"],
    "337": CITY_COORDS.FL["st petersburg"],
    "338": CITY_COORDS.FL["lakeland"],
    "339": CITY_COORDS.FL["fort myers"],
    "341": CITY_COORDS.FL["naples"],
    "342": CITY_COORDS.FL["sarasota"],
    "344": CITY_COORDS.FL["gainesville"],
    "346": CITY_COORDS.FL["spring hill"],
    "347": CITY_COORDS.FL["kissimmee"],
    "349": CITY_COORDS.FL["port st lucie"],
    "300": CITY_COORDS.GA["atlanta"],
    "301": CITY_COORDS.GA["atlanta"],
    "302": CITY_COORDS.GA["atlanta"],
    "303": CITY_COORDS.GA["atlanta"],
    "310": CITY_COORDS.GA["macon"],
    "312": CITY_COORDS.GA["macon"],
    "313": CITY_COORDS.GA["savannah"],
    "314": CITY_COORDS.GA["savannah"],
    "316": CITY_COORDS.GA["valdosta"],
    "352": CITY_COORDS.AL["birmingham"],
    "358": CITY_COORDS.AL["huntsville"],
    "360": CITY_COORDS.AL["montgomery"],
    "365": CITY_COORDS.AL["mobile"],
    "370": CITY_COORDS.TN["nashville"],
    "372": CITY_COORDS.TN["nashville"],
    "379": CITY_COORDS.TN["knoxville"],
    "381": CITY_COORDS.TN["memphis"],
    "390": CITY_COORDS.MS["jackson"],
    "395": CITY_COORDS.MS["gulfport"],
    "402": CITY_COORDS.KY["louisville"],
    "405": CITY_COORDS.KY["lexington"],
    "432": CITY_COORDS.OH["columbus"],
    "441": CITY_COORDS.OH["cleveland"],
    "452": CITY_COORDS.OH["cincinnati"],
    "462": CITY_COORDS.IN["indianapolis"],
    "482": CITY_COORDS.MI["detroit"],
    "492": CITY_COORDS.MI["grand rapids"],
    "550": CITY_COORDS.MN["st paul"],
    "554": CITY_COORDS.MN["minneapolis"],
    "532": CITY_COORDS.WI["milwaukee"],
    "537": CITY_COORDS.WI["madison"],
    "601": CITY_COORDS.IL["chicago"],
    "606": CITY_COORDS.IL["chicago"],
    "607": CITY_COORDS.IL["chicago"],
    "608": CITY_COORDS.IL["chicago"],
    "631": CITY_COORDS.MO["st louis"],
    "641": CITY_COORDS.MO["kansas city"],
    "701": CITY_COORDS.LA["new orleans"],
    "708": CITY_COORDS.LA["baton rouge"],
    "721": CITY_COORDS.AR["little rock"],
    "731": CITY_COORDS.OK["oklahoma city"],
    "741": CITY_COORDS.OK["tulsa"],
    "750": CITY_COORDS.TX["dallas"],
    "751": CITY_COORDS.TX["dallas"],
    "752": CITY_COORDS.TX["dallas"],
    "753": CITY_COORDS.TX["dallas"],
    "761": CITY_COORDS.TX["fort worth"],
    "770": CITY_COORDS.TX["houston"],
    "772": CITY_COORDS.TX["houston"],
    "782": CITY_COORDS.TX["san antonio"],
    "787": CITY_COORDS.TX["austin"],
    "799": CITY_COORDS.TX["el paso"],
    "802": CITY_COORDS.CO["denver"],
    "809": CITY_COORDS.CO["colorado springs"],
    "841": CITY_COORDS.UT["salt lake city"],
    "850": CITY_COORDS.AZ["phoenix"],
    "852": CITY_COORDS.AZ["phoenix"],
    "857": CITY_COORDS.AZ["tucson"],
    "871": CITY_COORDS.NM["albuquerque"],
    "891": CITY_COORDS.NV["las vegas"],
    "894": CITY_COORDS.NV["reno"],
    "900": CITY_COORDS.CA["los angeles"],
    "901": CITY_COORDS.CA["los angeles"],
    "902": CITY_COORDS.CA["los angeles"],
    "906": CITY_COORDS.CA["long beach"],
    "919": CITY_COORDS.CA["san diego"],
    "921": CITY_COORDS.CA["san diego"],
    "926": CITY_COORDS.CA["irvine"],
    "941": CITY_COORDS.CA["san francisco"],
    "950": CITY_COORDS.CA["san jose"],
    "958": CITY_COORDS.CA["sacramento"],
    "970": CITY_COORDS.OR["portland"],
    "972": CITY_COORDS.OR["portland"],
    "980": CITY_COORDS.WA["seattle"],
    "981": CITY_COORDS.WA["seattle"],
    "992": CITY_COORDS.WA["spokane"],
    "100": CITY_COORDS.NY["new york"],
    "101": CITY_COORDS.NY["new york"],
    "102": CITY_COORDS.NY["new york"],
    "104": CITY_COORDS.NY["bronx"],
    "112": CITY_COORDS.NY["brooklyn"],
    "113": CITY_COORDS.NY["queens"],
    "114": CITY_COORDS.NY["queens"],
    "117": CITY_COORDS.NY["long island"],
    "122": CITY_COORDS.NY["albany"],
    "142": CITY_COORDS.NY["buffalo"],
    "146": CITY_COORDS.NY["rochester"],
    "132": CITY_COORDS.NY["syracuse"],
    "070": CITY_COORDS.NJ["newark"],
    "073": CITY_COORDS.NJ["jersey city"],
    "080": CITY_COORDS.NJ["cherry hill"],
    "085": CITY_COORDS.NJ["trenton"],
    "021": CITY_COORDS.MA["boston"],
    "022": CITY_COORDS.MA["boston"],
    "029": CITY_COORDS.RI["providence"],
    "061": CITY_COORDS.CT["hartford"],
    "069": CITY_COORDS.CT["stamford"],
    "191": CITY_COORDS.PA["philadelphia"],
    "152": CITY_COORDS.PA["pittsburgh"],
    "171": CITY_COORDS.PA["harrisburg"],
    "197": CITY_COORDS.DE["wilmington"],
    "200": CITY_COORDS.DC["washington"],
    "212": CITY_COORDS.MD["baltimore"],
    "217": CITY_COORDS.MD["frederick"],
    "222": CITY_COORDS.VA["arlington"],
    "232": CITY_COORDS.VA["richmond"],
    "234": CITY_COORDS.VA["norfolk"],
    "252": CITY_COORDS.WV["charleston"],
    "272": CITY_COORDS.NC["durham"],
    "276": CITY_COORDS.NC["raleigh"],
    "274": CITY_COORDS.NC["greensboro"],
    "282": CITY_COORDS.NC["charlotte"],
    "284": CITY_COORDS.NC["wilmington"],
    "288": CITY_COORDS.NC["asheville"],
    "292": CITY_COORDS.SC["columbia"],
    "294": CITY_COORDS.SC["charleston"],
    "295": CITY_COORDS.SC["myrtle beach"],
    "296": CITY_COORDS.SC["greenville"]
  };

  // ZIP5 overrides for dense South Florida coverage. These are used before ZIP3
  // so outliers under shared prefixes (for example 33040 in the Keys versus
  // 330xx in Broward) resolve to the right region.
  var ZIP5_COORDS = {
    // Florida Keys and lower Miami-Dade
    "33001": CITY_COORDS.FL["islamorada"],
    "33036": CITY_COORDS.FL["islamorada"],
    "33037": CITY_COORDS.FL["key largo"],
    "33040": CITY_COORDS.FL["key west"],
    "33041": CITY_COORDS.FL["key west"],
    "33042": CITY_COORDS.FL["key west"],
    "33043": CITY_COORDS.FL["big pine key"],
    "33044": CITY_COORDS.FL["key west"],
    "33045": CITY_COORDS.FL["key west"],
    "33050": CITY_COORDS.FL["marathon"],
    "33051": CITY_COORDS.FL["marathon"],
    "33052": CITY_COORDS.FL["marathon"],
    "33070": CITY_COORDS.FL["tavernier"],
    "33030": CITY_COORDS.FL["homestead"],
    "33031": CITY_COORDS.FL["homestead"],
    "33032": CITY_COORDS.FL["cutler bay"],
    "33033": CITY_COORDS.FL["homestead"],
    "33034": CITY_COORDS.FL["florida city"],
    "33035": CITY_COORDS.FL["homestead"],
    "33039": CITY_COORDS.FL["homestead"],
    // Broward County
    "33004": CITY_COORDS.FL["dania beach"],
    "33009": CITY_COORDS.FL["hallandale beach"],
    "33019": CITY_COORDS.FL["hollywood"],
    "33020": CITY_COORDS.FL["hollywood"],
    "33021": CITY_COORDS.FL["hollywood"],
    "33023": CITY_COORDS.FL["west park"],
    "33024": CITY_COORDS.FL["pembroke pines"],
    "33025": CITY_COORDS.FL["miramar"],
    "33026": CITY_COORDS.FL["pembroke pines"],
    "33027": CITY_COORDS.FL["miramar"],
    "33028": CITY_COORDS.FL["weston"],
    "33029": CITY_COORDS.FL["weston"],
    "33054": CITY_COORDS.FL["opa locka"],
    "33055": CITY_COORDS.FL["miami gardens"],
    "33056": CITY_COORDS.FL["miami gardens"],
    "33060": CITY_COORDS.FL["pompano beach"],
    "33062": CITY_COORDS.FL["pompano beach"],
    "33063": CITY_COORDS.FL["coconut creek"],
    "33064": CITY_COORDS.FL["deerfield beach"],
    "33065": CITY_COORDS.FL["coral springs"],
    "33067": CITY_COORDS.FL["parkland"],
    "33069": CITY_COORDS.FL["north lauderdale"],
    "33071": CITY_COORDS.FL["coral springs"],
    "33073": CITY_COORDS.FL["coconut creek"],
    "33076": CITY_COORDS.FL["parkland"],
    "33077": CITY_COORDS.FL["coral springs"],
    // Miami-Dade County
    "33109": CITY_COORDS.FL["miami beach"],
    "33122": CITY_COORDS.FL["doral"],
    "33126": CITY_COORDS.FL["miami"],
    "33131": CITY_COORDS.FL["brickell"],
    "33132": CITY_COORDS.FL["wynwood"],
    "33133": CITY_COORDS.FL["coconut grove"],
    "33134": CITY_COORDS.FL["coral gables"],
    "33137": CITY_COORDS.FL["wynwood"],
    "33139": CITY_COORDS.FL["south beach"],
    "33140": CITY_COORDS.FL["miami beach"],
    "33141": CITY_COORDS.FL["north beach"],
    "33142": CITY_COORDS.FL["miami"],
    "33143": CITY_COORDS.FL["south miami"],
    "33146": CITY_COORDS.FL["coral gables"],
    "33149": CITY_COORDS.FL["key biscayne"],
    "33154": CITY_COORDS.FL["bal harbour"],
    "33156": CITY_COORDS.FL["pinecrest"],
    "33157": CITY_COORDS.FL["palmetto bay"],
    "33158": CITY_COORDS.FL["palmetto bay"],
    "33160": CITY_COORDS.FL["sunny isles beach"],
    "33161": CITY_COORDS.FL["north miami"],
    "33162": CITY_COORDS.FL["north miami beach"],
    "33165": CITY_COORDS.FL["westchester"],
    "33166": CITY_COORDS.FL["doral"],
    "33167": CITY_COORDS.FL["north miami"],
    "33170": CITY_COORDS.FL["cutler bay"],
    "33172": CITY_COORDS.FL["doral"],
    "33173": CITY_COORDS.FL["kendall"],
    "33175": CITY_COORDS.FL["kendall west"],
    "33176": CITY_COORDS.FL["kendall"],
    "33177": CITY_COORDS.FL["south miami heights"],
    "33178": CITY_COORDS.FL["doral"],
    "33179": CITY_COORDS.FL["miami gardens"],
    "33180": CITY_COORDS.FL["aventura"],
    "33181": CITY_COORDS.FL["north miami"],
    "33186": CITY_COORDS.FL["kendall west"],
    "33187": CITY_COORDS.FL["kendall west"],
    "33189": CITY_COORDS.FL["cutler bay"],
    "33190": CITY_COORDS.FL["homestead"],
    "33193": CITY_COORDS.FL["kendall west"],
    "33194": CITY_COORDS.FL["tamiami"],
    "33196": CITY_COORDS.FL["kendall west"],
    // Palm Beach County
    "33401": CITY_COORDS.FL["west palm beach"],
    "33403": CITY_COORDS.FL["lake park"],
    "33405": CITY_COORDS.FL["west palm beach"],
    "33408": CITY_COORDS.FL["north palm beach"],
    "33410": CITY_COORDS.FL["palm beach gardens"],
    "33411": CITY_COORDS.FL["royal palm beach"],
    "33412": CITY_COORDS.FL["palm beach gardens"],
    "33414": CITY_COORDS.FL["wellington"],
    "33415": CITY_COORDS.FL["greenacres"],
    "33417": CITY_COORDS.FL["west palm beach"],
    "33418": CITY_COORDS.FL["palm beach gardens"],
    "33426": CITY_COORDS.FL["boynton beach"],
    "33431": CITY_COORDS.FL["boca raton"],
    "33432": CITY_COORDS.FL["boca raton"],
    "33433": CITY_COORDS.FL["boca raton"],
    "33434": CITY_COORDS.FL["boca raton"],
    "33435": CITY_COORDS.FL["boynton beach"],
    "33436": CITY_COORDS.FL["boynton beach"],
    "33437": CITY_COORDS.FL["boynton beach"],
    "33444": CITY_COORDS.FL["delray beach"],
    "33445": CITY_COORDS.FL["delray beach"],
    "33446": CITY_COORDS.FL["delray beach"],
    "33458": CITY_COORDS.FL["jupiter"],
    "33467": CITY_COORDS.FL["lake worth"],
    "33469": CITY_COORDS.FL["jupiter"],
    "33470": CITY_COORDS.FL["loxahatchee"],
    "33472": CITY_COORDS.FL["boynton beach"],
    "33477": CITY_COORDS.FL["jupiter"],
    "33478": CITY_COORDS.FL["jupiter"],
    "33480": CITY_COORDS.FL["palm beach"],
    "33483": CITY_COORDS.FL["delray beach"],
    "33484": CITY_COORDS.FL["delray beach"],
    "33486": CITY_COORDS.FL["boca raton"],
    "33487": CITY_COORDS.FL["boca raton"],
    "33496": CITY_COORDS.FL["boca raton"],
    "33498": CITY_COORDS.FL["boca raton"]
  };

  // Geographic center of each state, an always-available fallback so a quote can
  // still be produced for a town that isn't in the tables above.
  var STATE_CENTROIDS = {
    AL: [32.7794, -86.8287], AK: [64.0685, -152.2782], AZ: [34.2744, -111.6602],
    AR: [34.8938, -92.4426], CA: [37.1841, -119.4696], CO: [38.9972, -105.5478],
    CT: [41.6219, -72.7273], DE: [38.9896, -75.505], FL: [28.6305, -82.4497],
    GA: [32.6415, -83.4426], HI: [20.2927, -156.3737], ID: [44.3509, -114.613],
    IL: [40.0417, -89.1965], IN: [39.8942, -86.2816], IA: [42.0751, -93.496],
    KS: [38.4937, -98.3804], KY: [37.5347, -85.3021], LA: [31.0689, -91.9968],
    ME: [45.3695, -69.2428], MD: [39.055, -76.7909], MA: [42.2596, -71.8083],
    MI: [44.3467, -85.4102], MN: [46.3943, -94.6043], MS: [32.7364, -89.6678],
    MO: [38.3566, -92.458], MT: [47.0527, -109.6333], NE: [41.5378, -99.7951],
    NV: [39.3289, -116.6312], NH: [43.6805, -71.5811], NJ: [40.1907, -74.6728],
    NM: [34.44, -106.1216], NY: [42.9538, -75.5268], NC: [35.5557, -79.3877],
    ND: [47.4501, -100.4659], OH: [40.2862, -82.7937], OK: [35.5889, -97.4943],
    OR: [43.9336, -120.5583], PA: [40.8781, -77.7996], RI: [41.6762, -71.5562],
    SC: [33.6189, -80.9066], SD: [44.4443, -100.2263], TN: [35.858, -86.3505],
    TX: [31.4757, -99.3312], UT: [39.3055, -111.6703], VT: [44.0687, -72.6658],
    VA: [37.5215, -78.8537], WA: [47.3826, -120.4472], WV: [38.6409, -80.6227],
    WI: [44.6243, -89.9941], WY: [42.9957, -107.5512], DC: [38.9072, -77.0369]
  };

  /* ------------------------------------------------------------------ logic */

  function normalizeHomeSize(value) {
    var n = Number(value);
    if (!isFinite(n) || Math.floor(n) !== n || n < 0 || n > MAX_HOME_SIZE) {
      throw new Error("Invalid home size. Please choose how much you're moving.");
    }
    return n;
  }

  function calculateEstimate(distanceMiles, homeSize) {
    var miles = Number(distanceMiles);
    var size = normalizeHomeSize(homeSize);

    if (!isFinite(miles) || miles < 0) {
      throw new Error("Invalid driving distance.");
    }

    var hours;
    if (miles <= LOCAL_MILE_LIMIT) {
      hours = LOCAL_HOURS[size];
    } else {
      var drivingHours = Math.max(1, Math.round(miles / LOCAL_MILE_LIMIT));
      hours = Math.min(8, Math.max(2, drivingHours + LOADING_HOURS[size]));
    }

    var price = HOUR_PRICE[hours];
    if (typeof price !== "number") {
      throw new Error("Unable to price this move.");
    }

    return {
      distanceMiles: Math.round(miles * 10) / 10,
      homeSize: size,
      homeSizeLabel: HOME_SIZE_LABELS[size],
      estimatedHours: hours,
      estimatedPrice: price
    };
  }

  function findBand(key) {
    var wanted = String(key == null ? "" : key).trim();
    if (!wanted) return null;
    for (var i = 0; i < DISTANCE_BANDS.length; i++) {
      if (DISTANCE_BANDS[i].key === wanted) return DISTANCE_BANDS[i];
    }
    return null;
  }

  /** Representative mileage for a band key, or null when none was chosen. */
  function milesFromBand(key) {
    var band = findBand(key);
    if (band) return band.miles;
    if (String(key == null ? "" : key).trim()) {
      throw new Error("Invalid distance range selected.");
    }
    return null;
  }

  function bandLabel(key) {
    var band = findBand(key);
    return band ? band.label : "";
  }

  /**
   * The range a real mileage falls into. Used to correct the dropdown when the
   * locations a customer entered clearly disagree with the range showing. A
   * cross-country move must never stay priced as a local one.
   */
  function bandForMiles(miles) {
    var value = Number(miles);
    if (!isFinite(value) || value < 0) return "";
    for (var i = 0; i < DISTANCE_BANDS.length; i++) {
      if (value <= DISTANCE_BANDS[i].max) return DISTANCE_BANDS[i].key;
    }
    return DISTANCE_BANDS[DISTANCE_BANDS.length - 1].key;
  }

  function normalizeText(text) {
    return String(text == null ? "" : text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Pulls a usable city out of whatever the customer (or Google Places) put in
   * the field: "Miami", "Miami, FL 33131, USA" and "123 Main St, North Miami
   * Beach, FL" all need to resolve.
   */
  function matchCity(rawCity, cities) {
    if (!cities) return null;

    var segments = String(rawCity == null ? "" : rawCity).split(",");
    for (var i = 0; i < segments.length; i++) {
      var name = normalizeText(segments[i]);
      if (name && cities[name]) return cities[name];
    }

    // Longest known name that appears in the text wins, so "north miami
    // beach" is never mistaken for "miami".
    var whole = normalizeText(rawCity);
    if (!whole) return null;
    var best = null;
    var bestLength = 0;
    for (var key in cities) {
      if (!Object.prototype.hasOwnProperty.call(cities, key)) continue;
      if (key.length <= bestLength) continue;
      if ((" " + whole + " ").indexOf(" " + key + " ") >= 0) {
        best = cities[key];
        bestLength = key.length;
      }
    }
    return best;
  }

  function findZip(addr) {
    var direct = String(addr.zip == null ? "" : addr.zip).trim();
    var match = /\b(\d{5})\b/.exec(direct) || /\b(\d{5})\b/.exec(String(addr.city == null ? "" : addr.city));
    return match ? match[1] : "";
  }

  function resolveCoordinates(addr) {
    if (!addr) return null;
    var state = String(addr.state == null ? "" : addr.state).trim().toUpperCase();

    var city = matchCity(addr.city, CITY_COORDS[state]);
    if (city) return city;

    var zip = findZip(addr);
    if (zip && ZIP5_COORDS[zip]) return ZIP5_COORDS[zip];
    if (zip && ZIP3_COORDS[zip.slice(0, 3)]) return ZIP3_COORDS[zip.slice(0, 3)];

    return STATE_CENTROIDS[state] || null;
  }

  function haversineMiles(a, b) {
    var toRad = Math.PI / 180;
    var R = 3958.8; // Earth radius in miles
    var dLat = (b[0] - a[0]) * toRad;
    var dLon = (b[1] - a[1]) * toRad;
    var s =
      Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.pow(Math.sin(dLon / 2), 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  /**
   * Approximate driving miles. A customer-selected `band` always wins over the
   * coordinate math so the price they were shown is the price they get.
   */
  function estimateMiles(origin, destination, band) {
    var banded = milesFromBand(band);
    if (banded !== null) return banded;

    var a = resolveCoordinates(origin);
    var b = resolveCoordinates(destination);
    if (!a || !b) {
      throw new Error("Unable to calculate distance. Please check both locations.");
    }
    return Math.round(haversineMiles(a, b) * ROAD_DISTANCE_FACTOR * 10) / 10;
  }

  /** Everything a caller needs: miles + hours + price in one step. */
  function quote(origin, destination, homeSize, band) {
    var miles = estimateMiles(origin, destination, band);
    var result = calculateEstimate(miles, homeSize);
    result.distanceBand = findBand(band) ? String(band).trim() : "";
    return result;
  }

  var core = {
    HOUR_PRICE: HOUR_PRICE,
    LOCAL_MILE_LIMIT: LOCAL_MILE_LIMIT,
    HOME_SIZE_LABELS: HOME_SIZE_LABELS,
    HOME_SIZE_ORDER: HOME_SIZE_ORDER,
    MAX_HOME_SIZE: MAX_HOME_SIZE,
    DISTANCE_BANDS: DISTANCE_BANDS,
    REVIEW_SPECIALTY_ITEMS: REVIEW_SPECIALTY_ITEMS,
    ROAD_DISTANCE_FACTOR: ROAD_DISTANCE_FACTOR,
    CITY_COORDS: CITY_COORDS,
    ZIP5_COORDS: ZIP5_COORDS,
    ZIP3_COORDS: ZIP3_COORDS,
    STATE_CENTROIDS: STATE_CENTROIDS,
    normalizeHomeSize: normalizeHomeSize,
    calculateEstimate: calculateEstimate,
    shouldFlagNeedsReview: shouldFlagNeedsReview,
    milesFromBand: milesFromBand,
    bandLabel: bandLabel,
    bandForMiles: bandForMiles,
    resolveCoordinates: resolveCoordinates,
    estimateMiles: estimateMiles,
    quote: quote
  };

  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.HerculesQuoteCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this);
