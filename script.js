const proxy = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const cacheStatic = { stops: null, firstLast: null, lastFetch: null };
const dayMs = 24*60*60*1000;

document.addEventListener('DOMContentLoaded', async () => {
  await loadStaticData();
  startFetchLoops();
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

function updateDateTime() {
  document.getElementById('datetime').textContent =
    new Date().toLocaleString('fr-FR', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// ------------ STATIC DATA ------------
async function loadStaticData() {
  const saved = JSON.parse(localStorage.getItem('dashboardStatic') || 'null');
  if (saved && (Date.now() - saved.lastFetch) < dayMs) {
    Object.assign(cacheStatic, saved);
    console.log('Static data from localStorage');
    return;
  }
  try {
    const [stops, firstLast] = await Promise.all([ fetch('/static/gtfs-stops.json').then(r=>r.json()),
                                                   fetch('/static/gtfs-firstlast.json').then(r=>r.json()) ]);
    cacheStatic.stops = stops;
    cacheStatic.firstLast = firstLast;
    cacheStatic.lastFetch = Date.now();
    localStorage.setItem('dashboardStatic', JSON.stringify(cacheStatic));
    console.log('Static data fetched from /static');
  } catch(e) {
    console.warn('Static data unavailable', e);
  }
}

// ------------ REAL-TIME ------------
function fetchAllHoraires() {
  fetchHoraires('rer', 'STIF:StopArea:SP:43135:', '🚆 RER A');
  fetchHoraires('bus77', 'STIF:StopArea:SP:463641:', '🚌 Bus 77');
  fetchHoraires('bus201', 'STIF:StopArea:SP:463644:', '🚌 Bus 201');
}

async function fetchHoraires(elId, stopId, title) {
  const el = document.getElementById(elId);
  try {
    const res = await fetch(`${proxy}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${stopId}`);
    const data = await res.json();
    const visits = data.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit || [];
    let html = `<h2>${title}</h2>`;
    const firstLast = cacheStatic.firstLast?.[elId];
    if(firstLast) html += `<p>♦️ Premier : ${firstLast.first} | Dernier : ${firstLast.last}</p>`;
    if (visits.length === 0) {
      html += "<p>Aucun passage</p>";
      el.innerHTML = html; return;
    }
    for (const v of visits.slice(0,4)) {
      const call = v.MonitoredVehicleJourney.MonitoredCall;
      const aimed = new Date(call.AimedDepartureTime);
      const expected = new Date(call.ExpectedDepartureTime);
      const diff = Math.round((expected-aimed)/60000);
      const delayTxt = diff>1 ? ` <s>${aimed.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</s> → ${expected.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} (retard +${diff}′)` : expected.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      const cancelled = (call.ArrivalStatus || '').toLowerCase()==='cancelled';
      html += cancelled ? `❌ ${call.DestinationDisplay} (supprimé)<br>` :
                          `🕒 ${delayTxt} → ${call.DestinationDisplay}<br>`;
      // gare desservies pour RER
      if(elId==='rer') {
        const journeyId = v.MonitoredVehicleJourney.VehicleJourneyRef;
        html += `<div id="gares-${journeyId}">🚉 ...</div>`;
        fetchJourneyStops(journeyId);
      }
    }
    // Infos trafic
    fetchLineInfo(stopId, elId).then(banner=>{
      if(banner) html += `<div class="info">${banner}</div>`;
      el.innerHTML = html;
    });
  } catch(e) {
    el.innerHTML = `<h2>${title}</h2><p>Erreur horaires</p>`;
  }
}

async function fetchJourneyStops(journeyId){
  try{
    const res = await fetch(`${proxy}https://prim.iledefrance-mobilites.fr/marketplace/vehicle_journeys/${journeyId}`);
    const data = await res.json();
    const stops = data.vehicle_journeys?.[0]?.stop_times?.map(s=>s.stop_point.name).join(', ');
    document.getElementById(`gares-${journeyId}`).textContent = stops ? `🚉 ${stops}` : '';
  }catch{ document.getElementById(`gares-${journeyId}`).textContent=''; }
}

async function fetchLineInfo(stopId, elId){
  try{
    const lineMap = { 'STIF:StopArea:SP:43135:':'C01742','STIF:StopArea:SP:463641:':'C01789','STIF:StopArea:SP:463644:':'C01805'};
    const lineId = lineMap[stopId];
    const res = await fetch(`${proxy}https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${lineId}`);
    const data = await res.json();
    const msg = data.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage?.[0]?.Message;
    return msg? `⚠️ ${msg}`:'';
  }catch{ return ''; }
}

// ------------ METEO ------------
async function fetchMeteo(){
  const el = document.getElementById('meteo');
  try{
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.8402&longitude=2.4274&current_weather=true");
    const data = await res.json();
    const cw = data.current_weather;
    el.innerHTML = `<h2>🌤 Météo locale</h2><p>${cw.temperature} °C | Vent ${cw.windspeed} km/h</p>`;
  }catch{ el.innerHTML="<p>Erreur météo</p>"; }
}

// ------------ TRAFIC ROUTIER ------------
async function fetchTrafficRoad(){
  const el = document.getElementById('road');
  try{
    const res = await fetch("https://data.opendatasoft.com/api/records/1.0/search/?dataset=etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede&q=&rows=100");
    const data = await res.json();
    const a86 = data.records.find(r=>r.fields.route.includes('A86'))?.fields;
    const periph = data.records.find(r=>r.fields.route.toLowerCase().includes('périph'))?.fields;
    const txt = `A86 : ${a86?.niveau ?? 'n/a'} | Périphérique : ${periph?.niveau ?? 'n/a'}`;
    el.innerHTML = `<h2>🚗 Trafic routier</h2><p>${txt}</p>`;
  }catch{ el.innerHTML="<p>Erreur trafic routier</p>"; }
}

// ------------ NEWS TICKER ------------
async function fetchNewsTicker(){
  const el = document.getElementById('newsTicker');
  try{
    const res = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss");
    const data = await res.json();
    const titles = data.items.slice(0,10).map(i=>i.title).join(' • ');
    el.textContent = titles;
  }catch{ el.textContent="Erreur actus"; }
}
