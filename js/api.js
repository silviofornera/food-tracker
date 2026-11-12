/* Food Tracker - public food database clients (Open Food Facts, USDA FoodData Central).
   Everything is normalized to: {id, src, name, brand, per100:{kcal,p,c,f}, base:'g'|'ml', units:[{label,g}]} */
(function (root) {
  'use strict';
  var FT = root.FT = root.FT || {};
  var N = FT.nutrition || (typeof require !== 'undefined' ? require('./nutrition.js') : null);

  var OFF = 'https://world.openfoodfacts.org';
  var OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,quantity,countries_tags';
  var USDA = 'https://api.nal.usda.gov/fdc/v1';

  function has(v) { return v !== undefined && v !== null && v !== ''; }
  function title(s) { s = String(s || '').trim(); return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(\/-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : s; }

  /* ---------- Open Food Facts ---------- */
  function normalizeOFF(p) {
    if (!p) return null;
    var name = (p.product_name || p.product_name_en || '').trim(), nt = p.nutriments || {};
    if (!name || !p.code) return null;
    var kcal = nt['energy-kcal_100g'];
    if (!has(kcal) && has(nt.energy_100g)) kcal = N.num(nt.energy_100g) / 4.184;
    var pr = nt.proteins_100g, c = nt.carbohydrates_100g, f = nt.fat_100g, fi = N.num(nt.fiber_100g);
    if (!has(kcal) && !has(pr) && !has(c) && !has(f)) return null;
    if (!has(kcal)) kcal = N.kcalFromMacros(pr, c, f);
    // Label conventions differ: US/Canada "carbohydrates" include fiber, most other countries (EU etc.) list carbs
    // WITHOUT fiber. The app stores total carbs (US convention) and derives net = carbs - fiber, so for non-US labels
    // fiber is added back; otherwise it would be subtracted twice. Products with no country are read as US labels.
    var tags = p.countries_tags || [], us = !tags.length || tags.some(function (t) { return /united-states|canada/.test(t); });
    if (has(c) && fi > 0 && !us) c = N.num(c) + fi;
    var serving = N.parseServing(p.serving_size), units = [];
    var base = (p.serving_quantity_unit === 'ml' || p.product_quantity_unit === 'ml' || (serving && serving.base === 'ml') ||
      /\d\s*(ml|cl|l)\b/i.test(p.quantity || '')) ? 'ml' : 'g';
    var sq = N.num(p.serving_quantity) || (serving && serving.amount) || 0;
    if (sq > 0) {
      var txt = String(p.serving_size || '').trim();
      var plain = /^\s*[\d.,]+\s*(g|ml|cl|l|kg)\s*$/i.test(txt);
      units.push({ label: plain || !txt ? '1 serving (' + N.fmt(sq) + ' ' + base + ')' : (/^\d/.test(txt) ? txt : '1 serving: ' + txt), g: sq });
    }
    var pq = N.num(p.product_quantity);
    if (pq > 0 && pq !== sq) units.push({ label: '1 package (' + N.fmt(pq) + ' ' + base + ')', g: pq });
    return {
      id: 'off:' + p.code, src: 'off', code: String(p.code), name: name, brand: String(p.brands || '').split(',')[0].trim(),
      per100: { kcal: N.round(N.num(kcal), 1), p: N.round(N.num(pr), 1), c: N.round(N.num(c), 1), f: N.round(N.num(f), 1), fi: N.round(fi, 1) },
      base: base, units: units
    };
  }

  function getJSON(url, opts) {
    var f = (opts && opts.fetch) || root.fetch;
    return f(url, { signal: opts && opts.signal }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }

  function searchOFF(q, opts) {
    var url = OFF + '/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n&search_terms=' +
      encodeURIComponent(q) + '&fields=' + OFF_FIELDS;
    return getJSON(url, opts).then(function (d) { return (d.products || []).map(normalizeOFF).filter(Boolean); });
  }
  function barcodeOFF(code, opts) {
    code = String(code).replace(/\D/g, '');
    return getJSON(OFF + '/api/v2/product/' + code + '.json?fields=' + OFF_FIELDS, opts)
      .then(function (d) { return d && d.product ? normalizeOFF(Object.assign({ code: code }, d.product)) : null; })
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  }

  /* ---------- USDA FoodData Central ---------- */
  function usdaNutrient(list, ids, numbers) {
    for (var j = 0; j < ids.length; j++) {
      for (var i = 0; i < (list || []).length; i++) {
        var n = list[i], nut = n.nutrient || {};
        var id = n.nutrientId || nut.id, no = String(n.nutrientNumber || nut.number || '');
        if (id === ids[j] || (numbers[j] && no === numbers[j])) { var v = has(n.value) ? n.value : n.amount; if (has(v)) return N.num(v); }
      }
    }
    return null;
  }
  function usdaPer100(list) {
    var p = usdaNutrient(list, [1003], ['203']), c = usdaNutrient(list, [1005], ['205']), f = usdaNutrient(list, [1004], ['204']);
    var fi = usdaNutrient(list, [1079], ['291']);          // Fiber, total dietary
    var kcal = usdaNutrient(list, [1008, 2047, 2048], ['208', '957', '958']);
    if (kcal === null) kcal = N.kcalFromMacros(p, c, f);
    return { kcal: N.round(kcal, 1), p: N.round(p || 0, 1), c: N.round(c || 0, 1), f: N.round(f || 0, 1), fi: N.round(fi || 0, 1) };
  }
  function usdaUnit(m) {
    var g = N.num(m.gramWeight); if (!(g > 0)) return null;
    var label = m.disseminationText || m.portionDescription || '';
    if (!label || /not specified/i.test(label)) {
      var mu = m.measureUnit && m.measureUnit.name, parts = [];
      if (/not specified/i.test(m.modifier || '')) return null;
      parts.push(N.fmt(has(m.amount) ? m.amount : 1));
      if (mu && !/undetermined/i.test(mu)) parts.push(mu);
      if (m.modifier && !/^\d+$/.test(m.modifier)) parts.push(m.modifier);
      if (parts.length < 2) return null;
      label = parts.join(' ');
    }
    return { label: label.trim(), g: N.round(g, 1) };
  }
  function normalizeUSDA(f) {
    if (!f || !f.fdcId || !f.description) return null;
    var su = String(f.servingSizeUnit || '').toLowerCase(), base = (su === 'ml' || su === 'mlt') ? 'ml' : 'g', units = [];
    var ss = N.num(f.servingSize);
    if (ss > 0 && (base === 'ml' || su === 'g' || su === 'grm')) {
      var hh = String(f.householdServingFullText || '').trim().toLowerCase();
      units.push({ label: (hh ? (/^\d/.test(hh) ? hh : '1 ' + hh) : '1 serving') + ' (' + N.fmt(ss) + ' ' + base + ')', g: ss });
    }
    (f.foodMeasures || []).concat(f.foodPortions || []).sort(function (a, b) { return (a.rank || a.sequenceNumber || 0) - (b.rank || b.sequenceNumber || 0); })
      .forEach(function (m) { var u = usdaUnit(m); if (u) units.push(u); });
    return {
      id: 'usda:' + f.fdcId, src: 'usda', fdcId: f.fdcId, name: title(f.description), brand: title(f.brandName || f.brandOwner || ''),
      dataType: f.dataType || '', per100: usdaPer100(f.foodNutrients), base: base, units: units.slice(0, 12)
    };
  }
  function searchUSDA(q, key, opts) {
    var url = USDA + '/foods/search?api_key=' + encodeURIComponent(key || 'DEMO_KEY') + '&pageSize=20&query=' + encodeURIComponent(q) +
      '&dataType=' + encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS),Branded');
    return getJSON(url, opts).then(function (d) {
      // Generic foods (Foundation, SR Legacy, Survey) before branded products; API relevance order kept inside each group.
      var foods = (d.foods || []).map(normalizeUSDA).filter(Boolean);
      return foods.filter(function (f) { return f.dataType !== 'Branded'; }).concat(foods.filter(function (f) { return f.dataType === 'Branded'; }));
    });
  }
  /* Full record: brings foodPortions (household units) for foods whose search row had none. */
  function detailUSDA(fdcId, key, opts) {
    return getJSON(USDA + '/food/' + fdcId + '?api_key=' + encodeURIComponent(key || 'DEMO_KEY'), opts).then(normalizeUSDA);
  }

  FT.api = { normalizeOFF: normalizeOFF, normalizeUSDA: normalizeUSDA, searchOFF: searchOFF, barcodeOFF: barcodeOFF, searchUSDA: searchUSDA, detailUSDA: detailUSDA };
  if (typeof module !== 'undefined' && module.exports) module.exports = FT.api;
})(typeof window !== 'undefined' ? window : globalThis);
