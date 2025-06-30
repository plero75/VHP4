/* ----------- constantes ----------- */
const proxy = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const cacheStatic = { stops: null, firstLast: null, lastFetch: null };
const dayMs = 24 * 60 * 60 * 1000;

/* mapping arrêt → id ligne complet (LineRef) */
const lineMap = {
  "STIF:StopArea:SP:43135:": "STIF:Line::C01742:",
  "STIF:StopArea:SP:463641:": "STIF:Line::C01789:",
  "STIF:StopArea:SP:463644:": "STIF:Line::C01805:",
};

/* ----------- démarrage ----------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadStaticData();      // charge /static/*.json ou localStorage
  startFetchLoops();           // lance les rafraîchissements 60 s
});

function startFetchLoops() {
  updateDateTime();
  fetchAllHoraires();
  fetchMeteo();
  fetchTrafficRoad();
  fetchNewsTicker();
  setInterval(() => {
    updateDateTime();
    fetchAllHoraires();
    fetchMeteo();
    fetchTrafficRoad();
    fetchNewsTicker();
  }, 60000);
}

/* ----------- horloge ----------- */
function updateDateTime() {
  document.getElementById("datetime").textContent =
    new Date().toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
}

/* ----------- STATIC (premiers/derniers + arrêts) ----------- */
async function loadStaticData() {
  const saved = JSON.parse(localStorage.getItem("dashboardStatic") || "null");
  if (saved && Date.now() - saved.lastFetch < dayMs) {
    Object.assign(cacheStatic, saved);
    return;
  }
  try {
    /* chemins relatifs (« ./static/… ») pour GitHub Pages */
    const [stops, firstLast] = await Promise.all([
      fetch("./static/gtfs-stops.json").then((r) => r.json()),
      fetch("./static/gtfs-firstlast.json").then((r) => r.json()),
    ]);
    cacheStatic.stops = stops;
    cacheStatic.firstLast = firstLast;
    cacheStatic.lastFetch = Date.now();
    localStorage.setItem("dashboardStatic", JSON.stringify(cacheStatic));
  } catch (e) {
    console.warn("Static data unavailable", e);
  }
}

/* ----------- RÉFRESH HORAIRES ----------- */
function fetchAllHoraires() {
  fetchHoraires("rer", "STIF:StopArea:SP:43135:", "🚆 RER A");
  fetchHoraires("bus77", "STIF:StopArea:SP:463641:", "🚌 Bus 77");
  fetchHoraires("bus201", "STIF:StopArea:SP:463644:", "🚌 Bus 201");
}

async function fetchHoraires(elId, stopId, title) {
  const el = document.getElementById(elId);
  try {
    const url =
      proxy +
      encodeURIComponent(
        `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${stopId}`
      );
    const res = await fetch(url);
    const data = await res.json();
    const visits =
      data.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit ||
      [];

    /* entête + premier/dernier */
    let html = `<h2>${title}</h2>`;
    const fl = cacheStatic.firstLast?.[elId];
    if (fl) html += `♦️ ${fl.first} → ${fl.last}<br>`;

    if (visits.length === 0) {
      el.innerHTML = html + "<p>Aucun passage</p>";
      return;
    }

    for (const v of visits.slice(0, 4)) {
      const call = v.MonitoredVehicleJourney.MonitoredCall;
      const aimed = new Date(call.AimedDepartureTime);
      const expected = new Date(call.ExpectedDepartureTime);
      const diff = Math.round((expected - aimed) / 60000);
      const cancelled =
        (call.ArrivalStatus || "").toLowerCase() === "cancelled";
      const horaire =
        diff > 1
          ? `<s>${aimed.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}</s> → ${expected.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })} (retard +${diff}′)`
          : expected.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            });
      html += cancelled
        ? `❌ ${call.DestinationDisplay} (supprimé)<br>`
        : `🕒 ${horaire} → ${call.DestinationDisplay}<br>`;

      /* gares desservies dynamiques RER */
      if (elId === "rer") {
        const journeyId = v.MonitoredVehicleJourney?.VehicleJourneyRef;
        if (journeyId) {
          html += `<div id="gares-${journeyId}">🚉 …</div>`;
          fetchJourneyStops(journeyId);
        }
      }
    }

    /* Infos trafic ligne */
    const alert = await fetchLineInfo(stopId);
    if (alert) html += `<div class="info">${alert}</div>`;
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<h2>${title}</h2><p>Erreur horaires</p>`;
  }
}

/* ----------- gares desservies ----------- */
async function fetchJourneyStops(journeyId) {
  try {
    const url =
      proxy +
      encodeURIComponent(
        `https://prim.iledefrance-mobilites.fr/marketplace/vehicle_journeys/${journeyId}`
      );
    const res = await fetch(url);
    const data = await res.json();
    const stops =
      data.vehicle_journeys?.[0]?.stop_times
        ?.map((s) => s.stop_point.name)
        .join(", ") || "";
    const div = document.getElementById(`gares-${journeyId}`);
    if (div) div.textContent = stops ? `🚉 ${stops}` : "";
  } catch {
    /* silencieux */
  }
}

/* ----------- infos trafic ligne ----------- */
async function fetchLineInfo(stopId) {
  const lineId = lineMap[stopId];
  if (!lineId) return "";
  try {
    const url =
      proxy +
      encodeURIComponent(
        `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${lineId}`
      );
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = await res.json();
    const msg =
      data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage?.[0]
        ?.Message;
    return msg ? `⚠️ ${msg}` : "";
  } catch {
    return "";
  }
}

/* ----------- météo ----------- */
async function fetchMeteo() {
  const el = document.getElementById("meteo");
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=48.8402&longitude=2.4274&current_weather=true"
    );
    const data = await res.json();
    const c = data.current_weather;
    el.innerHTML = `<h2>🌤 Météo locale</h2><p>${c.temperature} °C | Vent ${c.windspeed} km/h</p>`;
  } catch {
    el.innerHTML = "<p>Erreur météo</p>";
  }
}

/* ----------- trafic routier ----------- */
async function fetchTrafficRoad() {
  const el = document.getElementById("road");
  try {
    const res = await fetch(
      "https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-du-trafic-en-temps-reel&q=&rows=100"
    );
    const data = await res.json();
    const a86 = data.records.find((r) => r.fields.route.includes("A86"))?.fields;
    const per =
      data.records.find((r) =>
        r.fields.route.toLowerCase().includes("périphérique")
      )?.fields;
    el.innerHTML = `<h2>🚗 Trafic routier</h2><p>A86 : ${a86?.niveau || "n/a"} | Périph’ : ${
      per?.niveau || "n/a"
    }</p>`;
  } catch {
    el.innerHTML = "<p>Erreur trafic routier</p>";
  }
}

/* ----------- fil actu ----------- */
async function fetchNewsTicker() {
  const el = document.getElementById("newsTicker");
  try {
    const res = await fetch(
      "https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss"
    );
    const data = await res.json();
    el.textContent = data.items
      .slice(0, 10)
      .map((i) => i.title)
      .join(" • ");
  } catch {
    el.textContent = "Erreur actus";
  }
}
