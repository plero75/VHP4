/* ========== CONST ========== */
const proxy = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const lineMap = {
  "STIF:StopArea:SP:43135:": "STIF:Line::C01742:",
  "STIF:StopArea:SP:463641:": "STIF:Line::C01789:",
  "STIF:StopArea:SP:463644:": "STIF:Line::C01805:",
};
const cache = { stops: null, firstLast: null, lastFetch: 0 };
const ONE_DAY = 86_400_000;

/* ========== BOOT ========== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadStatic();
  loop();
  setInterval(loop, 60_000);
});

function loop() {
  clock();
  fetchAll();
  startWeatherLoop();
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

/* ========== STATIC JSON (/static) ========== */
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

/* ========== HORAIRES ========= */
function fetchAll() {
  horaire("rer",  "STIF:StopArea:SP:43135:", "🚆 RER A");
  horaire("bus77","STIF:StopArea:SP:463641:", "🚌 Bus 77");
  horaire("bus201","STIF:StopArea:SP:463644:","🚌 Bus 201");
  meteo();
  traficRoute();
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
      const fl = cache.firstLast?.[id];
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
    }

    for (const v of visits.slice(0, 4)) {
      const call = v.MonitoredVehicleJourney.MonitoredCall;
      const aimed = new Date(call.AimedDepartureTime);
      const exp   = new Date(call.ExpectedDepartureTime);
      const diff  = Math.round((exp - aimed) / 60000);
      const late  = diff > 1;
      const cancel = (call.ArrivalStatus || "").toLowerCase() === "cancelled";

      html += cancel
        ? `❌ ${call.DestinationDisplay} (supprimé)<br>`
        : `🕒 ${late ? `<s>${aimed.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'})}</s> → ` : ""}${exp.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'})} → ${call.DestinationDisplay}${late ? ` (retard +${diff}′)` : ""}<br>`;

      /* gares desservies (RER uniquement) */
      if (id === "rer") {
        const journey = v.MonitoredVehicleJourney?.VehicleJourneyRef;
        if (journey) {
          html += `<div id="gares-${journey}">🚉 …</div>`;
          loadStops(journey);
        }
      }
    }

    /* alerte trafic */
    const alert = await lineAlert(stop);
    if (alert) html += `<div class="info">${alert}</div>`;

    block.innerHTML = html;
  } catch (e) {
    block.innerHTML = `<h2>${title}</h2>Erreur horaire`;
  }
}

/* stops par train */
async function loadStops(journey) {
  try {
    const url = proxy + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/vehicle_journeys/${journey}`
    );
    const data = await fetch(url).then(r => r.ok ? r.json() : null);
    const list = data?.vehicle_journeys?.[0]?.stop_times
                  ?.map(s => s.stop_point.name)
                  ?.join(", ");
    const div = document.getElementById(`gares-${journey}`);
    if (div) div.textContent = list ? `🚉 ${list}` : "";
  } catch { /* ignore */ }
}

/* alerte ligne */
async function lineAlert(stop) {
  const line = lineMap[stop];
  if (!line) return "";
  try {
    const url = proxy + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line}`
    );
    const data = await fetch(url).then(r=>r.ok?r.json():null);
    const msg  = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]
                  ?.InfoMessage?.[0]?.Message;
    return msg ? `⚠️ ${msg}` : "";
  } catch { return ""; }
}

/* ========== MÉTÉO ========== */
async function meteo() {
  const el = document.getElementById("meteo");
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.8402&longitude=2.4274&current_weather=true");
    const c = (await r.json()).current_weather;
    el.innerHTML = `<h2>🌤 Météo locale</h2>${c.temperature} °C | Vent ${c.windspeed} km/h`;
  } catch { el.textContent = "Erreur météo"; }
}

/* ========== TRAFIC ROUTIER ========== */
async function traficRoute() {
  const el = document.getElementById("road");
  try {
    const url = "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-du-trafic-en-temps-reel-sur-le-reseau-routier-national&q=&rows=100";
    const rec = (await fetch(url).then(r=>r.json())).records;
    const a86 = rec.find(r=>r.fields.route.includes("A86"))?.fields.niveau ?? "n/a";
    const per = rec.find(r=>r.fields.route.toLowerCase().includes("périph"))?.fields.niveau ?? "n/a";
    el.innerHTML = `<h2>🚗 Trafic routier</h2>A86 : ${a86} | Périph : ${per}`;
  } catch { el.textContent = "Erreur trafic routier"; }
}

/* ========== ACTU RSS ========== */
async function news() {
  const el = document.getElementById("newsTicker");
  try {
    const r = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss");
    el.textContent = (await r.json()).items.slice(0,10).map(i=>i.title).join(" • ");
  } catch { el.textContent = "Actus indisponibles"; }
}


async function fetchTrafficMessages() {
  try {
    const lines = [
      "STIF:Line::C01742:", // RER A
      "STIF:Line::C01789:", // Bus 77
      "STIF:Line::C01805:"  // Bus 201
    ];
    for (const line of lines) {
      const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line}`);
      const data = await fetch(url).then(r => r.ok ? r.json() : null);
      const messages = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
      const block = document.getElementById(`info-${line}`);
      if (messages.length) {
        let html = "⚠️ Perturbations :<br>";
        messages.forEach(msg => {
          const content = msg?.Content?.MessageText || "Indisponible";
          html += `• ${content}<br>`;
        });
        block.innerHTML = html;
      } else {
        block.innerHTML = "";
      }
    }
  } catch (e) {
    console.warn("Erreur infos trafic :", e);
  }
}

function startWeatherLoop() {
  meteo(); // appel immédiat
  setInterval(meteo, 30 * 60 * 1000); // toutes les 30 min
}
