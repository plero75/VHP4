import { CONFIG } from './config.js';

const proxy = CONFIG.proxy;
const lineMap = {
  "STIF:StopArea:SP:43135:": "STIF:Line::C01742:",
  "STIF:StopArea:SP:463641:": "STIF:Line::C01789:",
  "STIF:StopArea:SP:463644:": "STIF:Line::C01805:",
};
const cache = { stops: null, firstLast: null, lastFetch: 0 };
const ONE_DAY = 86_400_000;

document.addEventListener("DOMContentLoaded", async () => {
  await loadStatic();
  loop();
  setInterval(loop, 60_000);
  startWeatherLoop();
});

function loop() {
  clock();
  fetchAll();
}

function clock() {
  document.getElementById("datetime").textContent =
    new Date().toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
}

async function loadStatic() {
  try {
    const saved = JSON.parse(localStorage.getItem("dashStatic") || "null");
    if (saved && Date.now() - saved.lastFetch < ONE_DAY) {
      Object.assign(cache, saved);
      return;
    }
    const [stops, firstLast] = await Promise.all([
      fetch("./static/gtfs-stops.json").then((r) => r.ok ? r.json() : []),
      fetch("./static/gtfs-firstlast.json").then((r) => r.ok ? r.json() : {}),
    ]);
    Object.assign(cache, { stops, firstLast, lastFetch: Date.now() });
    localStorage.setItem("dashStatic", JSON.stringify(cache));
  } catch (e) {
    console.warn("Static GTFS indisponible :", e);
  }
}

function fetchAll() {
  horaire("rer",  CONFIG.stops.rer, "🚆 RER A");
  horaire("bus77",CONFIG.stops.bus77, "🚌 Bus 77");
  horaire("bus201",CONFIG.stops.bus201,"🚌 Bus 201");
  meteo();
  news();
}

async function horaire(id, stop, title) {
  const block = document.getElementById(id);
  try {
    const url = proxy + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${stop}`
    );
    const data = await fetch(url).then(r => r.json());
    const visits = data.Siri.ServiceDelivery.StopMonitoringDelivery[0]
                   .MonitoredStopVisit || [];

    let html = `<h2>${title}</h2>`;
    const fl = cache.firstLast?.[id];
    if (fl) html += `♦️ ${fl.first} – ${fl.last}<br>`;

    if (!visits.length) {
      if (fl) {
        const firstTime = parseTimeToDate(fl.first);
        const lastTime = parseTimeToDate(fl.last);
        const now = new Date();
        if (firstTime && now < firstTime) {
          block.innerHTML = html + `Service non commencé – premier départ prévu à ${fl.first}`;
          return;
        }
        if (lastTime && now > lastTime) {
          block.innerHTML = html + `Service terminé – prochain départ prévu à ${fl.first}`;
          return;
        }
      }
      block.innerHTML = html + "Aucun passage prévu pour l’instant";
      return;
    }

    // Affichage des 4 prochains passages
    for (let i = 0; i < visits.slice(0, 4).length; i++) {
      const v = visits[i];
      const call = v.MonitoredVehicleJourney.MonitoredCall;
      const aimed = new Date(call.AimedDepartureTime);
      const exp   = new Date(call.ExpectedDepartureTime);
      const diff  = Math.round((exp - aimed) / 60000);
      const late  = diff > 1;
      const cancel = (call.ArrivalStatus || "").toLowerCase() === "cancelled";

      // Destination extraction
      let destination;
      if (Array.isArray(call.DestinationDisplay)) {
        destination = call.DestinationDisplay[0]?.value || "Indisponible";
      } else if (typeof call.DestinationDisplay === 'object') {
        destination = call.DestinationDisplay?.value || JSON.stringify(call.DestinationDisplay);
      } else {
        destination = call.DestinationDisplay || "Indisponible";
      }

      // Taux de fréquentation
      let crowd = "";
      const occ = v.MonitoredVehicleJourney?.OccupancyStatus || v.MonitoredVehicleJourney?.Occupancy || "";
      if (occ) {
        if (/full|crowd|high/i.test(occ)) crowd = "🔴";
        else if (/standing|medium|average/i.test(occ)) crowd = "🟡";
        else if (/seats|low|few|empty|available/i.test(occ)) crowd = "🟢";
      }

      // Premier et dernier du jour, imminent, en gare/à l'arrêt
      let tag = "";
      const aimedStr = aimed.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'});
      if (fl?.first === aimedStr) tag = "🚦 Premier départ";
      if (fl?.last === aimedStr) tag = "🛑 Dernier départ";
      const now = new Date();
      const timeToExp = (exp.getTime() - now.getTime())/1000;
      if (timeToExp > 0 && timeToExp < 90) tag = "🟢 Imminent";
      const status = call.StopPointStatus || call.ArrivalProximityText || "";
      if (/arrivée|en gare|at stop|stopped/i.test(status) && id === "rer") tag = "🚉 En gare";
      if (/at stop|stopped/i.test(status) && id.startsWith("bus")) tag = "🚌 À l'arrêt";

      html += cancel
        ? `❌ ${destination} (supprimé)<br>`
        : `🕒 ${late ? `<s>${aimedStr}</s> → ` : ""}${exp.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'})} → ${destination} ${crowd} <b>${tag}</b>${late ? ` (retard +${diff}′)` : ""}<br>`;

      // Ticker gares (RER uniquement)
      if (id === "rer") {
        const journey = v.MonitoredVehicleJourney?.VehicleJourneyRef;
        if (journey) {
          html += `<div id="gares-${journey}" class="stops-scroll">🚉 …</div>`;
          loadStops(journey);
        }
      }
    }

    // Bandeau perturbations temps réel
    const alert = await lineAlert(stop);
    if (alert) html += `<div class="info">${alert}</div>`;

    block.innerHTML = html;
  } catch (e) {
    block.innerHTML = `<h2>${title}</h2>Erreur horaire`;
  }
}

async function lineAlert(stop) {
  const line = lineMap[stop];
  if (!line) return "";
  try {
    const url = proxy + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line}`
    );
    const data = await fetch(url).then(r => r.ok ? r.json() : null);
    const messages = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (!messages.length) return "";
    const msg = messages[0]?.Content?.MessageText || messages[0]?.Message || "";
    return msg ? `⚠️ ${msg}` : "";
  } catch { return ""; }
}

async function loadStops(journey) {
  try {
    const url = proxy + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/vehicle_journeys/${journey}`
    );
    const data = await fetch(url).then(r => r.ok ? r.json() : null);
    const list = data?.vehicle_journeys?.[0]?.stop_times
                  ?.map(s => s.stop_point.name)
                  ?.join(" ➔ ");
    const div = document.getElementById(`gares-${journey}`);
    if (div) div.textContent = list ? `🚉 ${list}` : "";
  } catch { /* ignore */ }
}

async function news() {
  const el = document.getElementById("newsTicker");
  try {
    const r = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss");
    el.textContent = (await r.json()).items.slice(0,3).map(i=>i.title).join(" • ");
  } catch { el.textContent = "Actus indisponibles"; }
}

async function meteo() {
  const el = document.getElementById("meteo");
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.8402&longitude=2.4274&current_weather=true");
    const c = (await r.json()).current_weather;
    el.innerHTML = `<h2>🌤 Météo locale</h2>${c.temperature} °C | Vent ${c.windspeed} km/h`;
  } catch { el.textContent = "Erreur météo"; }
}

function startWeatherLoop() {
  meteo();
  setInterval(meteo, 30 * 60 * 1000);
}

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}
