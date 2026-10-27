window.HerculesEstimate = window.HerculesEstimate || {};

/**
 * Common household items for the /estimate page.
 *
 *   cuft  truck space one item takes (cubic feet)
 *   lbs   typical weight, which sets how many movers it needs to lift
 *   load  minutes for a 2-person crew to pad, wrap and load one item
 *         (unloading is priced as a share of this, see PRICING in estimate.js)
 *   asm   minutes to take it apart at pickup and put it back together at
 *         delivery, combined; 0 if it moves in one piece
 *   box   a "not included" packing item this one usually needs
 *   alt   extra words people search for
 *
 * These are planning averages, not measurements. Tune them freely: the page
 * reads everything from here.
 */
window.HerculesEstimate.ITEMS = [
  // Living room
  { id: "sofa", name: "Sofa (3-seat)", emoji: "🛋️", cat: "Living room", cuft: 45, lbs: 150, load: 14, asm: 0, alt: "couch" },
  { id: "sectional", name: "Sectional sofa", emoji: "🛋️", cat: "Living room", cuft: 80, lbs: 280, load: 22, asm: 20, alt: "couch l-shape" },
  { id: "loveseat", name: "Loveseat", emoji: "🛋️", cat: "Living room", cuft: 30, lbs: 100, load: 10, asm: 0, alt: "couch small" },
  { id: "sleeper", name: "Sleeper sofa", emoji: "🛋️", cat: "Living room", cuft: 50, lbs: 250, load: 18, asm: 0, alt: "pull out couch bed" },
  { id: "armchair", name: "Armchair", emoji: "🪑", cat: "Living room", cuft: 15, lbs: 60, load: 6, asm: 0, alt: "accent chair" },
  { id: "recliner", name: "Recliner", emoji: "🪑", cat: "Living room", cuft: 25, lbs: 120, load: 8, asm: 0, alt: "lazy boy chair" },
  { id: "ottoman", name: "Ottoman", emoji: "🟫", cat: "Living room", cuft: 6, lbs: 25, load: 2, asm: 0, alt: "footstool pouf" },
  { id: "coffee-table", name: "Coffee table", emoji: "🟫", cat: "Living room", cuft: 10, lbs: 40, load: 4, asm: 0 },
  { id: "side-table", name: "Side / end table", emoji: "🟫", cat: "Living room", cuft: 5, lbs: 20, load: 3, asm: 0, alt: "end table accent" },
  { id: "tv-small", name: "TV up to 55\"", emoji: "📺", cat: "Living room", cuft: 8, lbs: 40, load: 6, asm: 6, box: "tvbox", alt: "television" },
  { id: "tv-large", name: "TV 65\" or bigger", emoji: "📺", cat: "Living room", cuft: 12, lbs: 70, load: 9, asm: 10, box: "tvbox", alt: "television big" },
  { id: "tv-stand", name: "TV stand", emoji: "🗄️", cat: "Living room", cuft: 15, lbs: 70, load: 6, asm: 0, alt: "media console" },
  { id: "ent-center", name: "Entertainment center", emoji: "🗄️", cat: "Living room", cuft: 40, lbs: 200, load: 15, asm: 20, alt: "wall unit" },
  { id: "bookshelf", name: "Bookshelf", emoji: "📚", cat: "Living room", cuft: 20, lbs: 80, load: 7, asm: 10, alt: "bookcase shelves" },
  { id: "rug", name: "Area rug", emoji: "🧶", cat: "Living room", cuft: 6, lbs: 30, load: 3, asm: 0, alt: "carpet" },
  { id: "floor-lamp", name: "Floor lamp", emoji: "💡", cat: "Living room", cuft: 4, lbs: 10, load: 2, asm: 0, alt: "light" },
  { id: "table-lamp", name: "Table lamp", emoji: "💡", cat: "Living room", cuft: 2, lbs: 5, load: 1, asm: 0, alt: "light" },
  { id: "mirror", name: "Large mirror", emoji: "🪞", cat: "Living room", cuft: 5, lbs: 30, load: 5, asm: 0, box: "fragile" },
  { id: "art", name: "Wall art / frame", emoji: "🖼️", cat: "Living room", cuft: 3, lbs: 10, load: 2, asm: 0, box: "fragile", alt: "painting picture" },
  { id: "plant", name: "Large plant", emoji: "🪴", cat: "Living room", cuft: 4, lbs: 30, load: 2, asm: 0 },
  { id: "piano", name: "Upright piano", emoji: "🎹", cat: "Living room", cuft: 60, lbs: 500, load: 30, asm: 0, alt: "keyboard" },
  { id: "grand-piano", name: "Grand / baby grand piano", emoji: "🎹", cat: "Living room", cuft: 110, lbs: 750, load: 60, asm: 30 },
  { id: "aquarium", name: "Aquarium (emptied)", emoji: "🐠", cat: "Living room", cuft: 15, lbs: 150, load: 15, asm: 0, box: "fragile", alt: "fish tank" },

  // Bedroom
  { id: "king-bed", name: "King bed + mattress", emoji: "🛏️", cat: "Bedroom", cuft: 70, lbs: 200, load: 14, asm: 40, alt: "bed frame" },
  { id: "queen-bed", name: "Queen bed + mattress", emoji: "🛏️", cat: "Bedroom", cuft: 60, lbs: 170, load: 12, asm: 35, alt: "bed frame" },
  { id: "full-bed", name: "Full / twin bed + mattress", emoji: "🛏️", cat: "Bedroom", cuft: 45, lbs: 120, load: 10, asm: 25, alt: "bed frame single double" },
  { id: "bunk-bed", name: "Bunk bed", emoji: "🛏️", cat: "Bedroom", cuft: 50, lbs: 150, load: 10, asm: 45 },
  { id: "crib", name: "Crib", emoji: "🍼", cat: "Bedroom", cuft: 20, lbs: 50, load: 5, asm: 20, alt: "baby" },
  { id: "mattress", name: "Mattress only", emoji: "🛏️", cat: "Bedroom", cuft: 30, lbs: 80, load: 5, asm: 0, alt: "bed" },
  { id: "dresser", name: "Dresser", emoji: "🗄️", cat: "Bedroom", cuft: 40, lbs: 150, load: 10, asm: 0, alt: "chest drawers" },
  { id: "chest", name: "Tall chest of drawers", emoji: "🗄️", cat: "Bedroom", cuft: 30, lbs: 120, load: 8, asm: 0, alt: "dresser" },
  { id: "nightstand", name: "Nightstand", emoji: "🟫", cat: "Bedroom", cuft: 6, lbs: 35, load: 3, asm: 0, alt: "bedside table" },
  { id: "armoire", name: "Wardrobe / armoire", emoji: "🚪", cat: "Bedroom", cuft: 45, lbs: 200, load: 15, asm: 20, alt: "closet cabinet" },
  { id: "vanity", name: "Vanity / makeup table", emoji: "🪞", cat: "Bedroom", cuft: 20, lbs: 80, load: 6, asm: 0 },

  // Dining & kitchen
  { id: "dining-table", name: "Dining table", emoji: "🍽️", cat: "Dining & kitchen", cuft: 30, lbs: 100, load: 9, asm: 15, alt: "kitchen table" },
  { id: "dining-chair", name: "Dining chair", emoji: "🪑", cat: "Dining & kitchen", cuft: 5, lbs: 15, load: 2, asm: 0, alt: "kitchen chair" },
  { id: "bar-stool", name: "Bar stool", emoji: "🪑", cat: "Dining & kitchen", cuft: 4, lbs: 15, load: 2, asm: 0, alt: "counter stool" },
  { id: "china", name: "China cabinet / hutch", emoji: "🗄️", cat: "Dining & kitchen", cuft: 40, lbs: 200, load: 15, asm: 10, box: "fragile", alt: "buffet sideboard" },
  { id: "fridge", name: "Refrigerator", emoji: "🧊", cat: "Dining & kitchen", cuft: 50, lbs: 250, load: 18, asm: 0, alt: "fridge" },
  { id: "freezer", name: "Chest freezer", emoji: "🧊", cat: "Dining & kitchen", cuft: 30, lbs: 200, load: 14, asm: 0 },
  { id: "washer", name: "Washer", emoji: "🧺", cat: "Dining & kitchen", cuft: 25, lbs: 170, load: 15, asm: 0, alt: "washing machine laundry" },
  { id: "dryer", name: "Dryer", emoji: "🧺", cat: "Dining & kitchen", cuft: 25, lbs: 120, load: 12, asm: 0, alt: "laundry" },
  { id: "microwave", name: "Microwave", emoji: "🍲", cat: "Dining & kitchen", cuft: 3, lbs: 35, load: 2, asm: 0 },

  // Office
  { id: "desk", name: "Desk", emoji: "🖥️", cat: "Office", cuft: 25, lbs: 100, load: 9, asm: 15, alt: "table work" },
  { id: "office-chair", name: "Office chair", emoji: "💺", cat: "Office", cuft: 8, lbs: 35, load: 3, asm: 0, alt: "desk chair" },
  { id: "file-cabinet", name: "Filing cabinet", emoji: "🗄️", cat: "Office", cuft: 10, lbs: 80, load: 5, asm: 0, alt: "file" },
  { id: "computer", name: "Computer / monitor", emoji: "💻", cat: "Office", cuft: 3, lbs: 20, load: 3, asm: 0, box: "fragile", alt: "pc screen" },
  { id: "printer", name: "Printer", emoji: "🖨️", cat: "Office", cuft: 3, lbs: 25, load: 2, asm: 0 },

  // Garage, outdoor & fitness
  { id: "patio-table", name: "Patio table", emoji: "⛱️", cat: "Garage & outdoor", cuft: 20, lbs: 60, load: 6, asm: 10, alt: "outdoor" },
  { id: "patio-chair", name: "Patio chair", emoji: "🪑", cat: "Garage & outdoor", cuft: 5, lbs: 15, load: 2, asm: 0, alt: "outdoor lounge" },
  { id: "grill", name: "BBQ grill (empty tank)", emoji: "🔥", cat: "Garage & outdoor", cuft: 15, lbs: 80, load: 8, asm: 0, alt: "barbecue" },
  { id: "bike", name: "Bicycle", emoji: "🚲", cat: "Garage & outdoor", cuft: 10, lbs: 30, load: 4, asm: 0, alt: "bike" },
  { id: "mower", name: "Lawn mower (empty)", emoji: "🌿", cat: "Garage & outdoor", cuft: 15, lbs: 70, load: 6, asm: 0 },
  { id: "toolchest", name: "Rolling tool chest", emoji: "🧰", cat: "Garage & outdoor", cuft: 15, lbs: 220, load: 10, asm: 0, alt: "tools" },
  { id: "ladder", name: "Ladder", emoji: "🪜", cat: "Garage & outdoor", cuft: 5, lbs: 20, load: 2, asm: 0 },
  { id: "kayak", name: "Kayak / surfboard", emoji: "🛶", cat: "Garage & outdoor", cuft: 15, lbs: 50, load: 5, asm: 0, alt: "paddle board" },
  { id: "treadmill", name: "Treadmill", emoji: "🏃", cat: "Garage & outdoor", cuft: 30, lbs: 250, load: 18, asm: 20, alt: "gym fitness" },
  { id: "exercise-bike", name: "Exercise bike / elliptical", emoji: "🚴", cat: "Garage & outdoor", cuft: 15, lbs: 120, load: 8, asm: 10, alt: "peloton gym" },
  { id: "weights", name: "Weight bench + weights", emoji: "🏋️", cat: "Garage & outdoor", cuft: 20, lbs: 320, load: 15, asm: 10, alt: "gym dumbbells" },
  { id: "pool-table", name: "Pool table", emoji: "🎱", cat: "Garage & outdoor", cuft: 60, lbs: 700, load: 45, asm: 60, alt: "billiards" },
  { id: "safe-small", name: "Small safe", emoji: "🔒", cat: "Garage & outdoor", cuft: 5, lbs: 120, load: 8, asm: 0 },
  { id: "gun-safe", name: "Gun safe / large safe", emoji: "🔒", cat: "Garage & outdoor", cuft: 20, lbs: 600, load: 30, asm: 0 },
  { id: "massage-chair", name: "Massage chair", emoji: "💺", cat: "Garage & outdoor", cuft: 30, lbs: 250, load: 15, asm: 0 },

  // Boxes & small stuff (packed by the customer)
  { id: "box-small", name: "Small box (packed)", emoji: "📦", cat: "Boxes & bags", cuft: 1.5, lbs: 20, load: 1, asm: 0, alt: "boxes" },
  { id: "box-medium", name: "Medium box (packed)", emoji: "📦", cat: "Boxes & bags", cuft: 3, lbs: 30, load: 1.5, asm: 0, alt: "boxes" },
  { id: "box-large", name: "Large box (packed)", emoji: "📦", cat: "Boxes & bags", cuft: 4.5, lbs: 35, load: 2, asm: 0, alt: "boxes" },
  { id: "tote", name: "Plastic tote / bin", emoji: "🗃️", cat: "Boxes & bags", cuft: 3, lbs: 25, load: 1, asm: 0, alt: "storage container" },
  { id: "suitcase", name: "Suitcase / duffel bag", emoji: "🧳", cat: "Boxes & bags", cuft: 3, lbs: 25, load: 1, asm: 0, alt: "luggage bag" },
  { id: "clothes", name: "Hanging clothes (per 2 ft)", emoji: "👔", cat: "Boxes & bags", cuft: 4, lbs: 15, load: 2, asm: 0, box: "wardrobe", alt: "closet" },
  { id: "kids-toys", name: "Toy chest / kids' stuff", emoji: "🧸", cat: "Boxes & bags", cuft: 10, lbs: 40, load: 3, asm: 0, alt: "toys" },
  { id: "guitar", name: "Guitar / instrument case", emoji: "🎸", cat: "Boxes & bags", cuft: 2, lbs: 10, load: 1, asm: 0 },
  { id: "vacuum", name: "Vacuum", emoji: "🧹", cat: "Boxes & bags", cuft: 2, lbs: 15, load: 1, asm: 0 },
  { id: "fan", name: "Fan / heater", emoji: "🌀", cat: "Boxes & bags", cuft: 2, lbs: 10, load: 1, asm: 0 },
  { id: "xmas-tree", name: "Artificial Christmas tree", emoji: "🎄", cat: "Boxes & bags", cuft: 8, lbs: 30, load: 2, asm: 0 }
];

// Shown as one-tap chips under the search bar.
window.HerculesEstimate.POPULAR = ["sofa", "queen-bed", "dresser", "dining-table", "tv-small", "box-medium", "fridge", "washer"];

// "Add by room": tap a room to see its usual items with + and −.
window.HerculesEstimate.ROOMS = [
  { id: "living", name: "Living room", emoji: "🛋️", items: ["sofa", "sectional", "loveseat", "armchair", "recliner", "coffee-table", "side-table", "tv-small", "tv-large", "tv-stand", "ent-center", "bookshelf", "rug", "floor-lamp", "art", "plant", "piano"] },
  { id: "bedroom", name: "Bedroom", emoji: "🛏️", items: ["king-bed", "queen-bed", "full-bed", "mattress", "dresser", "chest", "nightstand", "armoire", "vanity", "mirror", "tv-small", "table-lamp", "clothes"] },
  { id: "kids", name: "Kids' room", emoji: "🧸", items: ["full-bed", "bunk-bed", "crib", "dresser", "nightstand", "kids-toys", "bookshelf", "desk"] },
  { id: "dining", name: "Dining room", emoji: "🍽️", items: ["dining-table", "dining-chair", "china", "bar-stool", "rug", "art"] },
  { id: "kitchen", name: "Kitchen", emoji: "🍳", items: ["fridge", "freezer", "microwave", "bar-stool", "box-medium", "box-small"] },
  { id: "office", name: "Home office", emoji: "🖥️", items: ["desk", "office-chair", "file-cabinet", "computer", "printer", "bookshelf"] },
  { id: "laundry", name: "Laundry", emoji: "🧺", items: ["washer", "dryer", "vacuum", "fan"] },
  { id: "garage", name: "Garage & patio", emoji: "🌴", items: ["patio-table", "patio-chair", "grill", "bike", "mower", "toolchest", "ladder", "kayak", "tote", "safe-small", "gun-safe"] },
  { id: "gym", name: "Gym & games", emoji: "🏋️", items: ["treadmill", "exercise-bike", "weights", "pool-table", "massage-chair"] },
  { id: "boxes", name: "Boxes & bags", emoji: "📦", items: ["box-small", "box-medium", "box-large", "tote", "suitcase", "clothes", "xmas-tree"] }
];

// "Start from a typical home": a starting list the customer then adjusts.
window.HerculesEstimate.PRESETS = [
  { id: "studio", name: "Studio", items: { "full-bed": 1, "loveseat": 1, "tv-small": 1, "tv-stand": 1, "dresser": 1, "dining-table": 1, "dining-chair": 2, "box-medium": 10, "box-small": 5 } },
  { id: "1br", name: "1 bedroom", items: { "queen-bed": 1, "dresser": 1, "nightstand": 2, "sofa": 1, "coffee-table": 1, "tv-small": 1, "tv-stand": 1, "dining-table": 1, "dining-chair": 4, "box-medium": 15, "box-small": 8, "box-large": 4 } },
  { id: "2br", name: "2 bedrooms", items: { "queen-bed": 1, "full-bed": 1, "dresser": 2, "nightstand": 3, "sofa": 1, "armchair": 1, "coffee-table": 1, "tv-small": 2, "tv-stand": 1, "dining-table": 1, "dining-chair": 4, "desk": 1, "office-chair": 1, "box-medium": 25, "box-small": 12, "box-large": 8 } },
  { id: "3br", name: "3 bedrooms", items: { "king-bed": 1, "queen-bed": 1, "full-bed": 1, "dresser": 3, "nightstand": 4, "sectional": 1, "armchair": 1, "coffee-table": 1, "tv-large": 1, "tv-small": 2, "tv-stand": 1, "dining-table": 1, "dining-chair": 6, "desk": 1, "office-chair": 1, "patio-table": 1, "patio-chair": 4, "box-medium": 40, "box-small": 20, "box-large": 12 } }
];
