/* Food Tracker - built-in offline starter foods.
   Row: [id, name, kcal, protein, total carb, fat (per 100 g or ml), base, [[unit label, g-or-ml], ...]]
   Values are typical USDA-style averages, rounded. */
(function (root) {
  'use strict';
  var FT = root.FT = root.FT || {};
  var R = [
    // Fruit
    ['apple', 'Apple, raw', 52, 0.3, 14, 0.2, 'g', [['1 medium apple', 182], ['1 small apple', 150], ['1 cup slices', 110]]],
    ['banana', 'Banana', 89, 1.1, 23, 0.3, 'g', [['1 medium banana', 118], ['1 large banana', 136]]],
    ['orange', 'Orange', 47, 0.9, 12, 0.1, 'g', [['1 medium orange', 131]]],
    ['strawberries', 'Strawberries', 32, 0.7, 7.7, 0.3, 'g', [['1 cup', 150], ['1 strawberry', 12]]],
    ['blueberries', 'Blueberries', 57, 0.7, 14, 0.3, 'g', [['1 cup', 148], ['1 handful', 40]]],
    ['grapes', 'Grapes', 69, 0.7, 18, 0.2, 'g', [['1 cup', 150], ['10 grapes', 50]]],
    ['avocado', 'Avocado', 160, 2, 8.5, 14.7, 'g', [['1 avocado', 150], ['1/2 avocado', 75]]],
    // Vegetables
    ['tomato', 'Tomato', 18, 0.9, 3.9, 0.2, 'g', [['1 medium tomato', 123], ['1 cherry tomato', 17], ['1 slice', 20]]],
    ['carrot', 'Carrot, raw', 41, 0.9, 10, 0.2, 'g', [['1 medium carrot', 61], ['1 cup chopped', 128]]],
    ['broccoli', 'Broccoli, cooked', 35, 2.4, 7.2, 0.4, 'g', [['1 cup', 156], ['1 floret', 30]]],
    ['spinach', 'Spinach, raw', 23, 2.9, 3.6, 0.4, 'g', [['1 cup', 30], ['1 handful', 25]]],
    ['lettuce', 'Lettuce / salad greens', 15, 1.4, 2.9, 0.2, 'g', [['1 cup shredded', 47], ['1 side salad', 85]]],
    ['cucumber', 'Cucumber', 15, 0.7, 3.6, 0.1, 'g', [['1 cucumber', 300], ['1 cup slices', 104]]],
    ['bell-pepper', 'Bell pepper', 26, 1, 6, 0.3, 'g', [['1 medium pepper', 119]]],
    ['onion', 'Onion', 40, 1.1, 9.3, 0.1, 'g', [['1 medium onion', 110], ['1 slice', 14]]],
    ['potato', 'Potato, boiled/baked', 87, 1.9, 20, 0.1, 'g', [['1 medium potato', 173], ['1 cup', 156]]],
    ['sweet-potato', 'Sweet potato, baked', 90, 2, 21, 0.2, 'g', [['1 medium', 114], ['1 cup', 200]]],
    ['fries', 'French fries', 312, 3.4, 41, 15, 'g', [['1 medium serving', 117], ['1 small serving', 71], ['1 large serving', 154]]],
    // Grains
    ['rice-white', 'Rice, white, cooked', 130, 2.7, 28, 0.3, 'g', [['1 cup cooked', 158], ['1/2 cup cooked', 79]]],
    ['rice-brown', 'Rice, brown, cooked', 123, 2.7, 26, 1, 'g', [['1 cup cooked', 195]]],
    ['pasta', 'Pasta, cooked', 158, 5.8, 31, 0.9, 'g', [['1 cup cooked', 140], ['1 plate', 250]]],
    ['pasta-dry', 'Pasta, dry', 371, 13, 75, 1.5, 'g', [['1 serving (80 g)', 80], ['1 serving (100 g)', 100]]],
    ['bread-white', 'Bread, white', 266, 8.9, 49, 3.3, 'g', [['1 slice', 28], ['2 slices', 56]]],
    ['bread-wheat', 'Bread, whole wheat', 252, 12, 43, 3.5, 'g', [['1 slice', 32], ['2 slices', 64]]],
    ['bagel', 'Bagel', 257, 10, 50, 1.6, 'g', [['1 bagel', 105]]],
    ['tortilla', 'Tortilla, flour', 304, 8, 50, 7.7, 'g', [['1 tortilla (20 cm)', 49], ['1 large tortilla', 70]]],
    ['oats', 'Oats, rolled, dry', 379, 13, 68, 6.5, 'g', [['1/2 cup dry', 40], ['1 cup dry', 80]]],
    ['cereal', 'Breakfast cereal, corn flakes', 357, 7.5, 84, 0.4, 'g', [['1 cup', 28], ['1 bowl', 40]]],
    ['quinoa', 'Quinoa, cooked', 120, 4.4, 21, 1.9, 'g', [['1 cup cooked', 185]]],
    // Protein
    ['chicken-breast', 'Chicken breast, cooked, skinless', 165, 31, 0, 3.6, 'g', [['1 breast', 172], ['1/2 breast', 86], ['1 slice', 25]]],
    ['chicken-leg', 'Chicken leg (drumstick), cooked, with skin', 216, 27, 0, 11.2, 'g', [['1 chicken leg', 72], ['2 chicken legs', 144]]],
    ['chicken-thigh', 'Chicken thigh, cooked, with skin', 229, 25, 0, 15.5, 'g', [['1 thigh', 85]]],
    ['beef-ground', 'Ground beef 85%, cooked', 250, 26, 0, 15, 'g', [['1 patty', 85], ['1 cup', 135]]],
    ['steak', 'Beef steak, sirloin, cooked', 206, 30, 0, 8.6, 'g', [['1 steak', 200], ['1 small steak', 120]]],
    ['pork-chop', 'Pork chop, cooked', 231, 26, 0, 13, 'g', [['1 chop', 140]]],
    ['bacon', 'Bacon, cooked', 541, 37, 1.4, 42, 'g', [['1 slice', 8], ['3 slices', 24]]],
    ['ham', 'Ham, sliced', 145, 21, 1.5, 5.5, 'g', [['1 slice', 28]]],
    ['prosciutto', 'Prosciutto crudo', 250, 26, 0.3, 16, 'g', [['1 slice', 15], ['1 serving (50 g)', 50]]],
    ['salmon', 'Salmon, cooked', 206, 22, 0, 12, 'g', [['1 fillet', 150], ['1/2 fillet', 75]]],
    ['tuna-can', 'Tuna, canned in water', 116, 26, 0, 0.8, 'g', [['1 can, drained', 112]]],
    ['shrimp', 'Shrimp, cooked', 99, 24, 0.2, 0.3, 'g', [['1 large shrimp', 6], ['1 serving (85 g)', 85]]],
    ['egg', 'Egg, whole', 143, 12.6, 0.7, 9.5, 'g', [['1 large egg', 50], ['2 large eggs', 100], ['1 medium egg', 44]]],
    ['tofu', 'Tofu, firm', 144, 17, 2.8, 8.7, 'g', [['1/2 cup', 126], ['1 slice', 84]]],
    ['beans-black', 'Black beans, cooked', 132, 8.9, 24, 0.5, 'g', [['1 cup', 172], ['1/2 cup', 86]]],
    ['lentils', 'Lentils, cooked', 116, 9, 20, 0.4, 'g', [['1 cup', 198]]],
    // Dairy
    ['milk-whole', 'Milk, whole', 61, 3.2, 4.8, 3.3, 'ml', [['1 cup (240 ml)', 240], ['1 glass (250 ml)', 250], ['1 splash (30 ml)', 30]]],
    ['milk-2', 'Milk, 2% reduced fat', 50, 3.3, 4.8, 2, 'ml', [['1 cup (240 ml)', 240], ['1 glass (250 ml)', 250]]],
    ['yogurt-greek', 'Greek yogurt, plain, nonfat', 59, 10, 3.6, 0.4, 'g', [['1 container (170 g)', 170], ['1 cup', 245]]],
    ['yogurt', 'Yogurt, plain, whole milk', 61, 3.5, 4.7, 3.3, 'g', [['1 container (125 g)', 125], ['1 cup', 245]]],
    ['cheddar', 'Cheese, cheddar', 403, 23, 3.1, 33, 'g', [['1 slice', 21], ['1 cup shredded', 113]]],
    ['mozzarella', 'Cheese, mozzarella', 280, 28, 3.1, 17, 'g', [['1 ball', 125], ['1 slice', 28]]],
    ['parmesan', 'Cheese, parmesan', 392, 36, 3.2, 26, 'g', [['1 tbsp grated', 5], ['1 piece (30 g)', 30]]],
    ['butter', 'Butter', 717, 0.9, 0.1, 81, 'g', [['1 tbsp', 14], ['1 tsp', 5], ['1 pat', 5]]],
    // Fats, nuts, spreads
    ['olive-oil', 'Olive oil', 884, 0, 0, 100, 'g', [['1 tbsp', 13.5], ['1 tsp', 4.5]]],
    ['peanut-butter', 'Peanut butter', 588, 25, 20, 50, 'g', [['1 tbsp', 16], ['2 tbsp', 32]]],
    ['almonds', 'Almonds', 579, 21, 22, 50, 'g', [['1 handful', 28], ['10 almonds', 12]]],
    ['walnuts', 'Walnuts', 654, 15, 14, 65, 'g', [['1 handful', 28]]],
    ['mayo', 'Mayonnaise', 680, 1, 0.6, 75, 'g', [['1 tbsp', 14]]],
    ['ketchup', 'Ketchup', 101, 1, 27, 0.1, 'g', [['1 tbsp', 17], ['1 packet', 9]]],
    ['honey', 'Honey', 304, 0.3, 82, 0, 'g', [['1 tbsp', 21], ['1 tsp', 7]]],
    ['sugar', 'Sugar, white', 387, 0, 100, 0, 'g', [['1 tsp', 4], ['1 tbsp', 12.5], ['1 packet', 4]]],
    // Prepared / snacks
    ['pizza', 'Pizza, cheese', 266, 11, 33, 10, 'g', [['1 slice', 107], ['1 whole pizza (30 cm)', 640]]],
    ['hamburger', 'Hamburger with bun', 254, 13, 24, 11, 'g', [['1 burger', 110], ['1 large burger', 220]]],
    ['chips', 'Potato chips', 536, 7, 53, 35, 'g', [['1 small bag (28 g)', 28], ['1 handful', 20]]],
    ['chocolate-dark', 'Dark chocolate 70%', 598, 7.8, 46, 43, 'g', [['1 square', 10], ['1 bar (100 g)', 100]]],
    ['chocolate-milk', 'Milk chocolate', 535, 7.7, 59, 30, 'g', [['1 square', 7], ['1 bar (43 g)', 43]]],
    ['cookie', 'Cookie, chocolate chip', 488, 5.1, 64, 24, 'g', [['1 cookie', 16], ['1 large cookie', 40]]],
    ['ice-cream', 'Ice cream, vanilla', 207, 3.5, 24, 11, 'g', [['1 scoop', 66], ['1 cup', 132]]],
    ['protein-powder', 'Whey protein powder', 400, 80, 8, 6, 'g', [['1 scoop', 30]]],
    // Drinks
    ['cola', 'Cola / soda', 42, 0, 10.6, 0, 'ml', [['1 soda can (355 ml)', 355], ['1 bottle (500 ml)', 500], ['1 glass (250 ml)', 250]]],
    ['orange-juice', 'Orange juice', 45, 0.7, 10.4, 0.2, 'ml', [['1 cup (240 ml)', 240], ['1 glass (250 ml)', 250]]],
    ['coffee', 'Coffee, black', 1, 0.1, 0, 0, 'ml', [['1 cup (240 ml)', 240], ['1 espresso (30 ml)', 30], ['1 mug (350 ml)', 350]]],
    ['beer', 'Beer, regular', 43, 0.5, 3.6, 0, 'ml', [['1 can (355 ml)', 355], ['1 pint (473 ml)', 473], ['1 bottle (330 ml)', 330]]],
    ['wine-red', 'Wine, red', 85, 0.1, 2.6, 0, 'ml', [['1 glass (150 ml)', 150], ['1 bottle (750 ml)', 750]]]
  ];
  /* Fiber per 100 g/ml (typical values). Foods not listed have none. Carbs above are total carbs, fiber included. */
  var FIBER = {
    apple: 2.4, banana: 2.6, orange: 2.4, strawberries: 2, blueberries: 2.4, grapes: 0.9, avocado: 6.7,
    tomato: 1.2, carrot: 2.8, broccoli: 3.3, spinach: 2.2, lettuce: 1.3, cucumber: 0.5, 'bell-pepper': 2.1, onion: 1.7,
    potato: 1.8, 'sweet-potato': 3.3, fries: 3.8,
    'rice-white': 0.4, 'rice-brown': 1.6, pasta: 1.8, 'pasta-dry': 3.2, 'bread-white': 2.7, 'bread-wheat': 6, bagel: 2.2,
    tortilla: 3, oats: 10.1, cereal: 3.3, quinoa: 2.8,
    tofu: 2.3, 'beans-black': 8.7, lentils: 7.9,
    'peanut-butter': 6, almonds: 12.5, walnuts: 6.7, ketchup: 0.3, honey: 0.2,
    pizza: 2.3, hamburger: 0.9, chips: 4.4, 'chocolate-dark': 10.9, 'chocolate-milk': 3.4, cookie: 2.4, 'ice-cream': 0.7,
    'orange-juice': 0.2
  };
  FT.starterFoods = R.map(function (r) {
    return {
      id: 'st:' + r[0], src: 'starter', name: r[1], brand: '',
      per100: { kcal: r[2], p: r[3], c: r[4], f: r[5], fi: FIBER[r[0]] || 0 }, base: r[6],
      units: r[7].map(function (u) { return { label: u[0], g: u[1] }; })
    };
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = FT.starterFoods;
})(typeof window !== 'undefined' ? window : globalThis);
