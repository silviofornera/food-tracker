/* Food Tracker - nutrition & portion math (pure, no DOM). */
(function (root) {
  'use strict';
  var FT = root.FT = root.FT || {};

  var MACROS = ['kcal', 'p', 'c', 'f'];
  var MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
  var MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

  function num(v) {
    if (typeof v === 'string') v = v.replace(',', '.');
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }

  /* Nutrients for `amount` base units (g or ml) of a food with per-100 values. */
  function nutrientsFor(per100, amount) {
    var k = num(amount) / 100, out = {};
    MACROS.forEach(function (m) { out[m] = num(per100 && per100[m]) * k; });
    return out;
  }

  /* amount in base units = qty x unit size */
  function portionAmount(qty, unit) { return num(qty) * num(unit && unit.g); }

  function sum(list) {
    var t = { kcal: 0, p: 0, c: 0, f: 0 };
    (list || []).forEach(function (e) { MACROS.forEach(function (m) { t[m] += num(e[m]); }); });
    return t;
  }

  /* Atwater estimate, used when a database row has macros but no energy. */
  function kcalFromMacros(p, c, f) { return 4 * num(p) + 4 * num(c) + 9 * num(f); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDateKey(k) { var a = k.split('-'); return new Date(+a[0], +a[1] - 1, +a[2], 12); }
  function shiftDate(k, days) { var d = parseDateKey(k); d.setDate(d.getDate() + days); return dateKey(d); }

  /* Meal bucket from time of day. */
  function mealForTime(d) {
    d = d || new Date();
    var h = d.getHours() + d.getMinutes() / 60;
    if (h >= 4 && h < 10.5) return 'breakfast';
    if (h >= 10.5 && h < 14.5) return 'lunch';
    if (h >= 14.5 && h < 17) return 'snack';
    if (h >= 17 && h < 21.5) return 'dinner';
    return 'snack';
  }

  var OZ = 28.3495, FLOZ = 29.5735;
  var GENERIC_ML = [
    { label: '1 cup (240 ml)', g: 240 }, { label: '1 glass (250 ml)', g: 250 },
    { label: '1 soda can (355 ml)', g: 355 }, { label: '1 tbsp (15 ml)', g: 15 }, { label: '1 tsp (5 ml)', g: 5 }
  ];

  /* Full unit list for the portion picker: household units first (they are the
     fast path), then base unit, 100 base, optional imperial. De-duplicated. */
  function unitsFor(food, opts) {
    opts = opts || {};
    var base = food.base === 'ml' ? 'ml' : 'g', out = [], seen = {};
    function add(u) {
      var g = num(u.g); if (!(g > 0) || !u.label) return;
      var key = u.label.toLowerCase(); if (seen[key]) return;
      seen[key] = 1; out.push({ label: u.label, g: g });
    }
    (food.units || []).forEach(add);
    if (base === 'ml' && food.src !== 'starter' && food.src !== 'custom') GENERIC_ML.forEach(add);
    add({ label: base, g: 1 });
    add({ label: '100 ' + base, g: 100 });
    if (opts.imperial) add(base === 'ml' ? { label: 'fl oz', g: FLOZ } : { label: 'oz', g: OZ });
    return out;
  }

  /* Default portion: last used for this food, else first household unit x1,
     else 100 g/ml. Returns {qty, unitIndex}. */
  function defaultPortion(units, last) {
    if (last && last.unit) {
      for (var i = 0; i < units.length; i++) if (units[i].label === last.unit) return { qty: num(last.qty) || 1, unitIndex: i };
    }
    var first = units[0];
    if (first && first.g !== 1) return { qty: 1, unitIndex: 0 };
    return { qty: 100, unitIndex: 0 };
  }

  /* Parse "30 g", "1 can (355 ml)", "2 biscuits (25g)", "8 fl oz (240 mL)" ->
     {amount, base} in g/ml or null. Prefers the metric figure. */
  function parseServing(text) {
    if (!text) return null;
    var s = String(text).toLowerCase().replace(',', '.');
    var re = /(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|cl|dl|l|fl\.?\s?oz|oz)\b/g, m, best = null;
    while ((m = re.exec(s))) {
      var v = parseFloat(m[1]), u = m[2].replace(/[.\s]/g, ''), r = null;
      if (u === 'g') r = { amount: v, base: 'g', pri: 3 };
      else if (u === 'kg') r = { amount: v * 1000, base: 'g', pri: 3 };
      else if (u === 'mg') r = { amount: v / 1000, base: 'g', pri: 3 };
      else if (u === 'ml') r = { amount: v, base: 'ml', pri: 3 };
      else if (u === 'cl') r = { amount: v * 10, base: 'ml', pri: 3 };
      else if (u === 'dl') r = { amount: v * 100, base: 'ml', pri: 3 };
      else if (u === 'l') r = { amount: v * 1000, base: 'ml', pri: 3 };
      else if (u === 'floz') r = { amount: v * FLOZ, base: 'ml', pri: 1 };
      else if (u === 'oz') r = { amount: v * OZ, base: 'g', pri: 1 };
      if (r && (!best || r.pri > best.pri)) best = r;
    }
    return best && best.amount > 0 ? { amount: round(best.amount, 1), base: best.base } : null;
  }

  function fmt(v, d) {
    v = num(v);
    if (d == null) d = v < 10 && v % 1 !== 0 ? 1 : 0;
    return String(round(v, d));
  }

  FT.nutrition = {
    MACROS: MACROS, MEALS: MEALS, MEAL_LABEL: MEAL_LABEL, OZ: OZ, FLOZ: FLOZ,
    num: num, round: round, nutrientsFor: nutrientsFor, portionAmount: portionAmount, sum: sum,
    kcalFromMacros: kcalFromMacros, dateKey: dateKey, parseDateKey: parseDateKey, shiftDate: shiftDate,
    mealForTime: mealForTime, unitsFor: unitsFor, defaultPortion: defaultPortion, parseServing: parseServing, fmt: fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FT.nutrition;
})(typeof window !== 'undefined' ? window : globalThis);
