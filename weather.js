// Today's weather on the Today page, from Open-Meteo (free, no account needed). Uses your location or a town you type.
(function (root) {
  'use strict';
  const PLACE_KEY = 'st_weather_place_v1', CACHE_KEY = 'st_weather_v1', FRESH_FOR = 30 * 60 * 1000;
  const CODES = [
    [[0], '☀️', 'Clear'], [[1], '🌤️', 'Mostly clear'], [[2], '⛅', 'Partly cloudy'], [[3], '☁️', 'Overcast'],
    [[45, 48], '🌫️', 'Fog'], [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'],
    [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'], [[95, 96, 99], '⛈️', 'Thunderstorms'],
  ];
  function describe(code) { const hit = CODES.find(([codes]) => codes.includes(code)); return hit ? { icon: hit[1], text: hit[2] } : { icon: '🌡️', text: 'Weather' }; }
  function tip(day) {
    if (day.rain >= 60) return 'Good chance of rain. Pack a waterproof.';
    if (day.max >= 25) return 'Warm one. Take plenty of water.';
    if (day.min <= 2) return 'Cold start. Watch for ice.';
    if (day.wind >= 40) return 'Windy. Careful on ladders and roofs.';
    return '';
  }
  function forecastUrl(p) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat.toFixed(3) + '&longitude=' + p.lon.toFixed(3) +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=1';
  }
  function parse(json) {
    const d = json.daily;
    return { temp: Math.round(json.current.temperature_2m), code: json.current.weather_code,
      day: { max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0] ?? 0, wind: Math.round(d.wind_speed_10m_max[0] ?? 0) } };
  }
  const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch (_) { return f; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error('Weather is unavailable right now.'); return r.json(); }
  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location isn’t available on this device.'));
      navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'Your location' }),
        () => reject(new Error('Location was turned down. Type a town instead.')), { timeout: 10000, maximumAge: 30 * 60 * 1000 });
    });
  }
  async function findTown(name) {
    const json = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(name));
    const hit = json.results && json.results[0];
    if (!hit) throw new Error('Couldn’t find “' + name + '”. Try a nearby town.');
    return { lat: hit.latitude, lon: hit.longitude, name: hit.name };
  }

  let card;
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function showSetup(message) {
    card.replaceChildren();
    card.append(el('h2', null, 'Weather'));
    if (message) card.append(el('p', 'small', message));
    const row = el('div', 'row');
    const here = el('button', 'btn', 'Use my location'); here.type = 'button';
    here.onclick = () => choose(locate);
    const form = el('form', 'town-form');
    const input = el('input'); input.placeholder = 'Or type a town'; input.setAttribute('aria-label', 'Town for the weather'); input.maxLength = 60;
    const go = el('button', 'btn ghost', 'Show'); go.type = 'submit';
    form.append(input, go);
    form.onsubmit = e => { e.preventDefault(); if (input.value.trim()) choose(() => findTown(input.value.trim())); };
    row.append(here); card.append(row, form);
  }
  async function choose(find) {
    try { const place = await find(); write(PLACE_KEY, place); localStorage.removeItem(CACHE_KEY); await refresh(); }
    catch (e) { showSetup(e.message); }
  }
  function show(place, w) {
    const { icon, text } = describe(w.code);
    card.replaceChildren();
    const top = el('div', 'weather-top');
    top.append(el('span', 'weather-icon', icon));
    const info = el('div');
    info.append(el('p', 'weather-temp', w.temp + '°'), el('p', 'small', text + ' · ' + place.name));
    const range = el('div', 'weather-range');
    range.append(el('p', null, '↑ ' + w.day.max + '°  ↓ ' + w.day.min + '°'), el('p', 'small', '☔ ' + w.day.rain + '%  💨 ' + w.day.wind + ' km/h'));
    top.append(info, range);
    card.append(top);
    const t = tip(w.day); if (t) card.append(el('p', 'weather-tip', t));
    const change = el('button', 'link', 'Change place'); change.type = 'button';
    change.onclick = () => { localStorage.removeItem(PLACE_KEY); showSetup(); };
    card.append(change);
  }
  async function refresh() {
    if (!card || card.hidden) return;
    const place = read(PLACE_KEY, null);
    if (!place) return showSetup('See today’s weather before you head out.');
    const cached = read(CACHE_KEY, null);
    if (cached && cached.at > Date.now() - FRESH_FOR && cached.lat === place.lat) return show(place, cached.w);
    try {
      const w = parse(await getJSON(forecastUrl(place)));
      write(CACHE_KEY, { at: Date.now(), lat: place.lat, w });
      show(place, w);
    } catch (_) {
      if (cached) show(place, cached.w); else showSetup('Weather is unavailable right now. Check your signal.');
    }
  }
  function init(el, enabled) {
    card = el; card.hidden = !enabled;
    if (enabled) refresh();
  }

  const api = { init, refresh, describe, tip, parse, forecastUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Weather = api;
})(typeof window === 'undefined' ? globalThis : window);
