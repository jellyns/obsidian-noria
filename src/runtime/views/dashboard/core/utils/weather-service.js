/**
 * Noria weather service
 * 挂载：globalThis.dashboardCore.utils.weatherService
 */
(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.utils = root.utils || {};

  const DEFAULT_CFG = {
    enabled: true,
    provider: "qweather",
    qweatherKey: "",
    qweatherApiHost: "",
    manualCity: "",
    locale: "en",
    cacheMinutes: 45,
    ipLookupEndpoint: "https://ipwho.is/",
    fallbackEnabled: false,
    autoWriteDaily: true
  };
  const CACHE_KEY = "__noria_weather_cache_v2";
  const DAY_BLOCKS_PATH = ".obsidian/plugins/noria/views/dashboard/core/utils/diary-day-blocks.js";

  const norm = (v) => String(v || "").trim();
  const weatherLanguage = (cfg) => /^zh\b|^zh-/i.test(norm(cfg?.locale)) ? "zh" : "en";
  const nowTs = () => Date.now();
  const collapseWs = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const stripTags = (v) => String(v || "").replace(/<[^>]*>/g, " ");
  const cleanShortText = (v, maxLen = 120) => {
    const s = collapseWs(stripTags(v));
    if (!s) return "";
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  };
  const asNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const todayIso = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
  const dateLt = (a, b) => String(a || "") < String(b || "");
  const normalizeDateInput = (v) => {
    const s = norm(v);
    if (!s) return "";
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = (typeof window !== "undefined" && typeof window.moment === "function") ? window.moment : null;
    if (m) {
      const d = m(s, ["YYYY-MM-DD", "YYYYMMDD"], true);
      if (d && d.isValid && d.isValid()) return d.format("YYYY-MM-DD");
    }
    const native = new Date(s);
    if (!Number.isNaN(native.getTime())) {
      const y = native.getFullYear();
      const mm = String(native.getMonth() + 1).padStart(2, "0");
      const dd = String(native.getDate()).padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    }
    return "";
  };
  const parseDateFromPath = (filePath) => {
    const p = norm(filePath).replace(/\\/g, "/");
    if (!p) return "";
    const m1 = p.match(/(\d{4})-(\d{2})-(\d{2})\.md$/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
    const m2 = p.match(/(\d{4})(\d{2})(\d{2})\.md$/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    return "";
  };
  const resolveTargetDate = (targetDate, filePath) =>
    normalizeDateInput(targetDate) || parseDateFromPath(filePath) || todayIso();

  function getObsidianApi() {
    try {
      return globalThis?.obsidian || window?.obsidian || (typeof window?.require === "function" ? window.require("obsidian") : null);
    } catch (_) {
      return null;
    }
  }

  async function httpJson(url, options = {}) {
    const obs = getObsidianApi();
    const requestUrl = obs?.requestUrl;
    if (typeof requestUrl === "function") {
      const resp = await requestUrl({
        url,
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body
      });
      const txt = String(resp?.text || "").trim();
      if (!txt) {
        throw new Error(`Empty response: ${url}`);
      }
      try {
        return JSON.parse(txt);
      } catch (e) {
        throw new Error(`JSON parse failed (${url}): ${String(e?.message || e)}`);
      }
    }
    const resp = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body
    });
    const txt = String(await resp.text() || "").trim();
    if (!txt) {
      throw new Error(`Empty response: ${url}`);
    }
    try {
      return JSON.parse(txt);
    } catch (e) {
      throw new Error(`JSON parse failed (${url}): ${String(e?.message || e)}`);
    }
  }

  async function httpText(url) {
    const obs = getObsidianApi();
    const requestUrl = obs?.requestUrl;
    if (typeof requestUrl === "function") {
      const resp = await requestUrl({ url, method: "GET" });
      return String(resp?.text || "");
    }
    const resp = await fetch(url, { method: "GET" });
    return String(await resp.text());
  }

  function getMergedCfg(runtimeWeather) {
    return {
      ...DEFAULT_CFG,
      ...(runtimeWeather || {})
    };
  }

  function getCacheStore() {
    const g = globalThis;
    if (!g[CACHE_KEY]) g[CACHE_KEY] = {};
    return g[CACHE_KEY];
  }

  function buildCacheId(cfg, options = {}) {
    const td = norm(options.targetDate || todayIso());
    const anchorCity = norm(options.anchorCity || "");
    const anchorIp = norm(options.anchorIp || "");
    return `${norm(cfg.provider)}|${norm(cfg.manualCity)}|${weatherLanguage(cfg)}|${normalizeQweatherApiHost(cfg.qweatherApiHost)}|${norm(cfg.qweatherKey).slice(0, 8)}|${td}|${anchorCity}|${anchorIp}`;
  }

  function getCache(cfg, options = {}) {
    const store = getCacheStore();
    const key = buildCacheId(cfg, options);
    const item = store[key];
    if (!item || typeof item !== "object") return null;
    const ttl = Math.max(5, Number(cfg.cacheMinutes) || DEFAULT_CFG.cacheMinutes) * 60 * 1000;
    if (nowTs() - Number(item.at || 0) > ttl) return null;
    return item.payload || null;
  }

  function setCache(cfg, payload, options = {}) {
    const store = getCacheStore();
    const key = buildCacheId(cfg, options);
    store[key] = { at: nowTs(), payload };
  }

  function mapWeatherToPreset(rawText, tempMax, iconCode) {
    const t = norm(rawText);
    const tl = t.toLowerCase();
    const tempN = Number(tempMax);
    const iconN = Number(iconCode);

    if (Number.isFinite(iconN)) {
      if ([400, 401, 402, 403, 404, 405, 406, 407].includes(iconN)) return "雪";
      if ([300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318].includes(iconN)) return "雨";
      if ([102, 103].includes(iconN)) return "多云";
      if ([101, 104].includes(iconN)) return "阴";
      if ([200, 201, 202, 203, 204].includes(iconN)) return "风";
      if (iconN === 100 || iconN === 150) return Number.isFinite(tempN) && tempN >= 33 ? "暴晒" : "晴";
    }
    if (/[雪冰雹]/.test(t)) return "雪";
    if (/[雨雷阵雨]/.test(t)) return "雨";
    if (/[暴晒酷热炎热]/.test(t)) return "暴晒";
    if (/多云|少云/.test(t)) return "多云";
    if (/阴/.test(t)) return "阴";
    if (/风|大风|飓风/.test(t)) return "风";
    if (/晴/.test(t)) return Number.isFinite(tempN) && tempN >= 33 ? "暴晒" : "晴";
    if (/snow|sleet|hail/.test(tl)) return "雪";
    if (/rain|drizzle|shower|thunder/.test(tl)) return "雨";
    if (/overcast|cloud/.test(tl)) return "多云";
    if (/wind|breeze|gust/.test(tl)) return "风";
    if (/sunny|clear/.test(tl)) return Number.isFinite(tempN) && tempN >= 33 ? "暴晒" : "晴";
    return "多云";
  }

  function normalizeQweatherApiHost(value) {
    const host = norm(value)
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    return /^[a-z0-9.-]+(?::\d+)?$/.test(host) ? host : "";
  }

  function buildQweatherUrl(cfg, path, params = {}) {
    const host = normalizeQweatherApiHost(cfg?.qweatherApiHost);
    if (!host) throw new Error("Missing QWeather API Host");
    const query = Object.entries(params)
      .filter(([, value]) => value != null && String(value).trim() !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    return `https://${host}${path}${query ? `?${query}` : ""}`;
  }

  function qweatherRequestOptions(cfg) {
    const key = norm(cfg?.qweatherKey);
    if (!key) throw new Error("Missing QWeather API key");
    return { headers: { "X-QW-Api-Key": key } };
  }

  async function getIpLocation(cfg) {
    const primary = norm(cfg.ipLookupEndpoint || DEFAULT_CFG.ipLookupEndpoint);
    const candidates = [...new Set([
      primary,
      "https://ipwho.is/",
      "https://ipapi.co/json/"
    ].filter(Boolean))];
    let lastErr = "";
    for (const endpoint of candidates) {
      try {
        const data = await httpJson(endpoint, {
          headers: {
            "Content-Type": "application/json;charset=gb2312",
            "User-Agent": "Mozilla/5.0"
          }
        });
        const ip = norm(data?.ip);
        const cityCode = norm(data?.cityCode || data?.city || data?.region || data?.pro);
        const cityName = norm(data?.city || data?.region || data?.addr || data?.pro);
        const lat = norm(data?.latitude || data?.lat || data?.latitude_decimal || "");
        const lon = norm(data?.longitude || data?.lon || data?.longitude_decimal || "");
        if (ip || cityCode || cityName) {
          return { ip, cityCode, cityName, lat, lon };
        }
        lastErr = `empty location fields (${endpoint})`;
      } catch (e) {
        lastErr = String(e?.message || e || "unknown");
      }
    }
    throw new Error(`IP location failed: ${lastErr || "all endpoints failed"}`);
  }

  async function geocodeCityByOpenMeteo(city, cfg) {
    const q = norm(city);
    if (!q) throw new Error("Empty city; cannot geocode");
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=${weatherLanguage(cfg)}&format=json`;
    const data = await httpJson(url);
    const first = data?.results?.[0];
    const lat = asNum(first?.latitude);
    const lon = asNum(first?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Geocoding failed: ${q}`);
    return {
      city: cleanShortText(first?.name || q, 40),
      lat: String(lat),
      lon: String(lon)
    };
  }

  async function searchCity(city, cfg) {
    const url = buildQweatherUrl(cfg, "/geo/v2/city/lookup", { location: norm(city), number: 1 });
    const data = await httpJson(url, qweatherRequestOptions(cfg));
    if (String(data?.code || "") !== "200") throw new Error(`City lookup failed (${data?.code || "unknown"})`);
    const first = data?.location?.[0] || {};
    return {
      id: norm(first.id),
      name: norm(first.name || city)
    };
  }

  async function getQweatherDaily(locationParam, cfg) {
    const url = buildQweatherUrl(cfg, "/v7/weather/3d", { location: locationParam });
    const data = await httpJson(url, qweatherRequestOptions(cfg));
    if (String(data?.code || "") !== "200") throw new Error(`Weather fetch failed (${data?.code || "unknown"})`);
    const d = data?.daily?.[0] || {};
    return {
      textDay: norm(d.textDay),
      iconDay: norm(d.iconDay),
      tempMin: norm(d.tempMin),
      tempMax: norm(d.tempMax),
      humidity: norm(d.humidity)
    };
  }

  async function getQweatherNow(locationParam, cfg) {
    const url = buildQweatherUrl(cfg, "/v7/weather/now", { location: locationParam });
    const data = await httpJson(url, qweatherRequestOptions(cfg));
    if (String(data?.code || "") !== "200") return { textNow: "", iconNow: "", currentTemp: "", humidity: "" };
    const n = data?.now || {};
    return {
      textNow: norm(n.text),
      iconNow: norm(n.icon),
      currentTemp: norm(n.temp),
      humidity: norm(n.humidity)
    };
  }

  async function getQweatherAir(locationParam, cfg) {
    const url = buildQweatherUrl(cfg, "/v7/air/now", { location: locationParam });
    const data = await httpJson(url, qweatherRequestOptions(cfg));
    if (String(data?.code || "") !== "200") return { aqi: "", category: "" };
    return {
      aqi: norm(data?.now?.aqi),
      category: norm(data?.now?.category)
    };
  }

  async function getWttrWeather(cfg, city) {
    const place = norm(city);
    let ipLoc = { ip: "", cityCode: "", cityName: "" };
    try {
      ipLoc = await getIpLocation(cfg);
    } catch (_) {}
    const url = `https://wttr.in/${encodeURIComponent(place)}?format=j1&m`;
    const data = await httpJson(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const current = data?.current_condition?.[0] || {};
    const daily = data?.weather?.[0] || {};
    const nearest = data?.nearest_area?.[0] || {};
    const fahrenheitToCelsius = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? String(Math.round((n - 32) * 5 / 9)) : "";
    };
    const currentTemp = norm(current.temp_C) || fahrenheitToCelsius(current.temp_F);
    const tempMin = norm(daily.mintempC) || fahrenheitToCelsius(daily.mintempF);
    const tempMax = norm(daily.maxtempC) || fahrenheitToCelsius(daily.maxtempF);
    const humidity = norm(current.humidity);
    const condition = cleanShortText(
      current?.weatherDesc?.[0]?.value || current?.lang_zh?.[0]?.value || "Weather",
      80
    );
    const cityName = cleanShortText(
      nearest?.areaName?.[0]?.value || place || ipLoc.cityName || "自动定位",
      40
    );
    const mappedWeather = mapWeatherToPreset(condition, currentTemp || tempMax, current.weatherCode);
    const rawText = [
      condition,
      currentTemp ? `${currentTemp}℃` : "",
      tempMin && tempMax ? `${tempMin}~${tempMax}℃` : "",
      humidity ? `湿度${humidity}%` : ""
    ].filter(Boolean).join(" · ");
    return {
      city: cityName,
      rawText,
      mappedWeather,
      currentTemp,
      tempMin,
      tempMax,
      humidity,
      aqi: "",
      ip: ipLoc.ip,
      source: "wttr",
      statusText: condition
    };
  }

  function mapWmoCodeToText(code) {
    const c = Number(code);
    if ([0].includes(c)) return "晴";
    if ([1, 2].includes(c)) return "多云";
    if ([3].includes(c)) return "阴";
    if ([45, 48].includes(c)) return "雾";
    if ([51, 53, 55, 56, 57].includes(c)) return "毛毛雨";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return "雨";
    if ([71, 73, 75, 77, 85, 86].includes(c)) return "雪";
    if ([95, 96, 99].includes(c)) return "雷雨";
    return "多云";
  }

  function normalizeAqiCategory(aqi) {
    const n = Number(aqi);
    if (!Number.isFinite(n)) return "";
    if (n <= 50) return "优";
    if (n <= 100) return "良";
    if (n <= 150) return "轻度污染";
    if (n <= 200) return "中度污染";
    if (n <= 300) return "重度污染";
    return "严重污染";
  }

  const roundedWeatherNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : "";
  };

  async function getOpenMeteoRealtime(cfg, options = {}) {
    const anchor = options?.anchor || {};
    let city = norm(cfg.manualCity || anchor.city);
    let ip = norm(anchor.ip);
    let lat = norm(anchor.lat);
    let lon = norm(anchor.lon);
    if ((!lat || !lon) && city) {
      const geo = await geocodeCityByOpenMeteo(city, cfg);
      city = geo.city || city;
      lat = geo.lat;
      lon = geo.lon;
    }
    if (!lat || !lon) {
      const ipLoc = await getIpLocation(cfg);
      ip = ip || norm(ipLoc.ip);
      city = city || norm(ipLoc.cityName || ipLoc.cityCode || "自动定位");
      lat = norm(ipLoc.lat);
      lon = norm(ipLoc.lon);
      if (!lat || !lon) {
        const geo = await geocodeCityByOpenMeteo(city, cfg);
        city = geo.city || city;
        lat = geo.lat;
        lon = geo.lon;
      }
    }
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
      "&current=temperature_2m,relative_humidity_2m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1";
    const data = await httpJson(url);
    const current = data?.current || {};
    const daily = data?.daily || {};
    const currentTemp = roundedWeatherNumber(current.temperature_2m);
    const tempMin = roundedWeatherNumber(daily?.temperature_2m_min?.[0]);
    const tempMax = roundedWeatherNumber(daily?.temperature_2m_max?.[0]);
    const humidity = roundedWeatherNumber(current.relative_humidity_2m);
    const code = current.weather_code ?? daily?.weather_code?.[0];
    const statusText = mapWmoCodeToText(code);
    const mappedWeather = mapWeatherToPreset(statusText, currentTemp || tempMax, "");
    const rawText = [
      statusText,
      currentTemp ? `${currentTemp}℃` : "",
      tempMin && tempMax ? `${tempMin}~${tempMax}℃` : "",
      humidity ? `湿度${humidity}%` : ""
    ].filter(Boolean).join(" · ");
    return {
      city: cleanShortText(city || "自动定位", 40),
      rawText,
      mappedWeather,
      currentTemp,
      tempMin,
      tempMax,
      humidity,
      aqi: "",
      ip,
      source: "open-meteo",
      statusText,
      lat,
      lon
    };
  }

  async function getHistoricalWeatherByDate(cfg, options = {}) {
    const targetDate = resolveTargetDate(options.targetDate, options.filePath);
    const anchor = options.anchor || {};
    let city = norm(anchor.city || cfg.manualCity);
    let ip = norm(anchor.ip || "");
    let lat = norm(anchor.lat || "");
    let lon = norm(anchor.lon || "");

    if ((!lat || !lon) && city) {
      const geo = await geocodeCityByOpenMeteo(city, cfg);
      city = geo.city || city;
      lat = geo.lat;
      lon = geo.lon;
    }
    if (!lat || !lon) {
      const ipLoc = await getIpLocation(cfg);
      ip = ip || norm(ipLoc.ip);
      city = city || norm(ipLoc.cityName || ipLoc.cityCode || "自动定位");
      if (norm(ipLoc.lat) && norm(ipLoc.lon)) {
        lat = norm(ipLoc.lat);
        lon = norm(ipLoc.lon);
      } else {
        const geo = await geocodeCityByOpenMeteo(city, cfg);
        city = geo.city || city;
        lat = geo.lat;
        lon = geo.lon;
      }
    }

    const weatherUrl =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&start_date=${targetDate}&end_date=${targetDate}&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=auto`;
    const weatherData = await httpJson(weatherUrl);
    const daily = weatherData?.daily || {};
    const code = daily?.weather_code?.[0];
    const tempMax = norm(daily?.temperature_2m_max?.[0]);
    const tempMin = norm(daily?.temperature_2m_min?.[0]);
    const humidity = norm(daily?.relative_humidity_2m_mean?.[0]);
    const statusText = mapWmoCodeToText(code);
    const mappedWeather = mapWeatherToPreset(statusText, tempMax, "");

    let aqi = "";
    let aqiCategory = "";
    try {
      const airUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&start_date=${targetDate}&end_date=${targetDate}&daily=us_aqi&timezone=auto`;
      const airData = await httpJson(airUrl);
      const aqiNum = airData?.daily?.us_aqi?.[0];
      if (Number.isFinite(Number(aqiNum))) {
        aqi = String(Math.round(Number(aqiNum)));
        aqiCategory = normalizeAqiCategory(aqiNum);
      }
    } catch (_) {}

    const rawText = [
      statusText,
      tempMin && tempMax ? `${tempMin}~${tempMax}℃` : "",
      humidity ? `湿度${humidity}%` : "",
      aqi ? `AQI ${aqi}${aqiCategory ? `(${aqiCategory})` : ""}` : ""
    ].filter(Boolean).join(" · ");

    return {
      city: cleanShortText(city || "自动定位", 40),
      rawText,
      mappedWeather,
      tempMin,
      tempMax,
      humidity,
      aqi,
      ip,
      source: "history-api:open-meteo",
      statusText,
      targetDate,
      lat,
      lon
    };
  }

  async function getWeatherByQWeather(cfg, anchor = {}) {
    const key = norm(cfg.qweatherKey);
    if (!key) throw new Error("Missing QWeather API key");
    if (!normalizeQweatherApiHost(cfg.qweatherApiHost)) throw new Error("Missing QWeather API Host");

    const ipLoc = { ip: norm(anchor.ip), cityCode: "", cityName: norm(anchor.city), lat: norm(anchor.lat), lon: norm(anchor.lon) };
    let city = norm(cfg.manualCity || anchor.city);
    if (!city) {
      const loc = await getIpLocation(cfg);
      ipLoc.ip = norm(loc.ip);
      ipLoc.cityCode = norm(loc.cityCode);
      ipLoc.cityName = norm(loc.cityName);
      city = ipLoc.cityCode || ipLoc.cityName;
    }
    if (!city) throw new Error("IP location failed and no manual city is configured");

    let locationParam = "";
    let cityLabel = city;
    try {
      const geo = await searchCity(city, cfg);
      locationParam = geo.id;
      cityLabel = geo.name || city;
    } catch (geoErr) {
      const hasLatLon = norm(ipLoc.lat) && norm(ipLoc.lon);
      if (hasLatLon) {
        locationParam = `${ipLoc.lon},${ipLoc.lat}`;
        cityLabel = ipLoc.cityName || city;
      } else {
        throw geoErr;
      }
    }
    const daily = await getQweatherDaily(locationParam, cfg);
    let now = {};
    try {
      now = await getQweatherNow(locationParam, cfg);
    } catch (_) {}
    const air = await getQweatherAir(locationParam, cfg);
    const statusText = now.textNow || daily.textDay;
    const iconCode = now.iconNow || daily.iconDay;
    const currentTemp = norm(now.currentTemp);
    const humidity = norm(now.humidity || daily.humidity);
    const mappedWeather = mapWeatherToPreset(statusText, currentTemp || daily.tempMax, iconCode);
    const currentText = currentTemp ? `${currentTemp}℃` : "";
    const tempText = daily.tempMin && daily.tempMax ? `${daily.tempMin}~${daily.tempMax}℃` : "";
    const humidText = humidity ? `湿度${humidity}%` : "";
    const aqiText = air.aqi ? `AQI ${air.aqi}${air.category ? `(${air.category})` : ""}` : "";
    const rawText = [statusText, currentText, tempText, humidText, aqiText].filter(Boolean).join(" · ");

    return {
      city: cityLabel || city,
      rawText,
      mappedWeather,
      currentTemp,
      tempMin: daily.tempMin,
      tempMax: daily.tempMax,
      humidity,
      aqi: air.aqi,
      ip: ipLoc.ip,
      source: "qweather",
      statusText
    };
  }

  async function getRealtimeWeather(cfg, options = {}) {
    const provider = norm(cfg.provider).toLowerCase();
    if (provider === "wttr-only") {
      return getWttrWeather(cfg, options?.anchor?.city || cfg.manualCity);
    }
    if (provider === "open-meteo" || provider === "open-meteo-only") {
      return getOpenMeteoRealtime(cfg, options);
    }
    let qweatherError = null;
    try {
      return await getWeatherByQWeather(cfg, options?.anchor || {});
    } catch (err) {
      qweatherError = err;
      if (provider === "qweather" && cfg.fallbackEnabled !== true) throw err;
    }
    try {
      return await getOpenMeteoRealtime(cfg, options);
    } catch (openMeteoError) {
      if (provider === "qweather" && cfg.fallbackEnabled !== true) throw qweatherError || openMeteoError;
      return getWttrWeather(cfg, options?.anchor?.city || cfg.manualCity);
    }
  }

  async function getWeatherForDate(runtimeWeather, options = {}) {
    const cfg = getMergedCfg(runtimeWeather);
    if (!cfg.enabled) throw new Error("weather disabled");
    const targetDate = resolveTargetDate(options.targetDate, options.filePath);
    const today = todayIso();
    const isHistoryDate = dateLt(targetDate, today);
    const anchor = options.anchor || {};
    const cached = getCache(cfg, {
      targetDate,
      anchorCity: anchor.city,
      anchorIp: anchor.ip
    });
    if (cached) return cached;

    const payload = isHistoryDate
      ? await getHistoricalWeatherByDate(cfg, { targetDate, filePath: options.filePath, anchor })
      : await getRealtimeWeather(cfg, { targetDate, filePath: options.filePath, anchor });
    setCache(cfg, payload, {
      targetDate,
      anchorCity: anchor.city,
      anchorIp: anchor.ip
    });
    return payload;
  }

  async function getWeatherForHome(runtimeWeather) {
    return getWeatherForDate(runtimeWeather, { targetDate: todayIso() });
  }

  async function loadDayBlocks() {
    if (root.utils.diaryDayBlocks) return root.utils.diaryDayBlocks;
    let code = "";
    try {
      code = String(await app.vault.adapter.read(DAY_BLOCKS_PATH) || "");
    } catch (_) {}
    if (!code) return null;
    try {
      (0, eval)(code);
    } catch (_) {
      return null;
    }
    return root.utils.diaryDayBlocks || null;
  }

  async function resolveDiaryPathByDate(targetDate, filePath = "") {
    const parsedFromPath = parseDateFromPath(filePath);
    const iso = resolveTargetDate(targetDate, filePath);
    if (filePath && parsedFromPath && parsedFromPath === iso) return norm(filePath).replace(/\\/g, "/");
    const y = iso.slice(0, 4);
    const compact = iso.replace(/-/g, "");
    const configuredRoot = norm(globalThis.__noriaRuntimeBridge?.paths?.diaryRoot || "06_Diary").replace(/^\/+/, "").replace(/\/+$/, "") || "06_Diary";
    const roots = configuredRoot === "06_Diary" ? ["06_Diary"] : [configuredRoot, "06_Diary"];
    const guesses = roots.flatMap((rootPath) => [
      `${rootPath}/${y}/${iso}.md`,
      `${rootPath}/${y}/${compact}.md`,
      `${rootPath}/${iso}.md`
    ]);
    for (const p of guesses) {
      try {
        if (await app.vault.adapter.exists(p)) return p;
      } catch (_) {}
    }
    return guesses[0];
  }

  async function readWriteDailyWeather(targetDate, weatherState, options = {}) {
    const U = await loadDayBlocks();
    if (!U) return { ok: false, reason: "diary-day-blocks unavailable" };
    const payload = options.payload || {};
    const targetIso = resolveTargetDate(targetDate, options.filePath);
    const path = await resolveDiaryPathByDate(targetIso, options.filePath || "");
    const af = app.vault.getAbstractFileByPath(path);
    if (!af || !("path" in af)) return { ok: false, reason: `diary missing: ${path}` };

    const today = todayIso();
    const isHistoryDate = dateLt(targetIso, today);
    const forceOverwrite = !!options.forceOverwrite;
    const applyWeather = (current) => {
      const text = String(current || "");
      const existed = U.parseDailyStateFromBody(text);
      const hasCompleteSnapshot = !!(
        norm(existed.weather_status) &&
        norm(existed.weather_temp) &&
        norm(existed.weather_city) &&
        norm(existed.weather_source)
      );
      if (options.skipIfExists && norm(existed.weather)) {
        return { text, result: { ok: true, skipped: true, path } };
      }
      if (isHistoryDate && hasCompleteSnapshot && !forceOverwrite) {
        return { text, result: { ok: true, skipped: true, frozen: true, path, date: targetIso } };
      }

      const humidity = norm(payload.humidity || existed.weather_humidity).match(/\d{1,3}/)?.[0] || "";
      const aqi = norm(payload.aqi || existed.weather_aqi).match(/[0-9A-Za-z]{1,8}/)?.[0] || "";
      const payloadIp = norm(payload.ip).match(/\d{1,3}(?:\.\d{1,3}){3}/)?.[0] || "";
      const ip = isHistoryDate && norm(existed.weather_ip) && !forceOverwrite
        ? norm(existed.weather_ip)
        : (payloadIp || norm(existed.weather_ip).match(/\d{1,3}(?:\.\d{1,3}){3}/)?.[0] || "");
      const city = isHistoryDate && norm(existed.weather_city) && !forceOverwrite
        ? cleanShortText(existed.weather_city, 40)
        : cleanShortText(payload.city || existed.weather_city, 40);
      const nextState = {
        weather: cleanShortText(weatherState || payload.mappedWeather || existed.weather, 12),
        weather_status: cleanShortText(payload.statusText || payload.rawText || existed.weather_status, 120),
        weather_temp: payload.tempMin && payload.tempMax
          ? cleanShortText(`${payload.tempMin}~${payload.tempMax}`, 24)
          : (norm(payload.tempMax) ? cleanShortText(payload.tempMax, 24) : cleanShortText(existed.weather_temp, 24)),
        weather_humidity: humidity,
        weather_aqi: aqi,
        weather_ip: ip,
        weather_city: city,
        weather_source: cleanShortText(payload.source || existed.weather_source || "qweather", 20)
      };
      return {
        text: U.upsertDailyStateSection(text, nextState),
        result: { ok: true, path, state: nextState, date: targetIso }
      };
    };

    if (typeof app.vault.process === "function") {
      let outcome = { ok: false, path, reason: "weather-write-failed" };
      await app.vault.process(af, (current) => {
        const applied = applyWeather(current);
        outcome = applied.result;
        return applied.text;
      });
      return outcome;
    }
    const text = String(await app.vault.read(af) || "");
    const applied = applyWeather(text);
    if (applied.text !== text) await app.vault.modify(af, applied.text);
    return applied.result;
  }

  root.utils.weatherService = {
    getWeatherForHome,
    getWeatherForDate,
    readWriteDailyWeather,
    mapWeatherToPreset,
    parseDateFromPath,
    resolveTargetDate
  };
})();
