document.addEventListener('DOMContentLoaded', () => {
  updateDateTime();
  fetchHoraires('rer-a', 'STIF:StopArea:SP:43135:');
  fetchHoraires('bus-77', 'STIF:StopArea:SP:463641:');
  fetchHoraires('bus-201', 'STIF:StopArea:SP:463644:');
  fetchVelib();
  fetchMeteo();
  fetchCirculation();
  setInterval(() => {
    updateDateTime();
    fetchHoraires('rer-a', 'STIF:StopArea:SP:43135:');
    fetchHoraires('bus-77', 'STIF:StopArea:SP:463641:');
    fetchHoraires('bus-201', 'STIF:StopArea:SP:463644:');
    fetchVelib();
    fetchMeteo();
    fetchCirculation();
  }, 60000);
});

function updateDateTime() {
  const now = new Date();
  document.querySelector('header h1').textContent = `Dashboard Temps Réel – Hippodrome de Vincennes – ${now.toLocaleString('fr-FR')}`;
}

async function fetchHoraires(elementId, stopArea) {
  const container = document.getElementById(elementId);
  container.innerHTML = 'Chargement…';
  try {
    const response = await fetch(
      `https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/marketplace/stop-monitoring?MonitoringRef=${stopArea}`
    );
    const data = await response.json();
    if (data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit) {
      container.innerHTML = data.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit
        .slice(0,4)
        .map(v => {
          const aimed = new Date(v.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime);
          const expected = new Date(v.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime);
          const delay = Math.round((expected - aimed) / 60000);
          let delayInfo = '';
          if (delay > 1) delayInfo = ` ⚠️ Retardé de +${delay} min`;
          return `<p>🕐 ${aimed.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})} ⏳ ${expected.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}${delayInfo}</p>`;
        })
        .join('');
    } else {
      container.innerHTML = 'Aucun horaire disponible.';
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = 'Erreur lors du chargement.';
  }
}

function fetchVelib() {
  document.getElementById('velib').innerHTML = '🚲 Données Vélib en cours…';
}

function fetchMeteo() {
  const container = document.getElementById('meteo');
  container.innerHTML = '☀️ Météo en cours…';
  fetch('https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.435&current_weather=true')
    .then(response => response.json())
    .then(data => {
      const weather = data.current_weather;
      let icon = 'clear.png';
      if (weather.weathercode >= 1 && weather.weathercode <= 3) icon = 'cloudy.png';
      else if (weather.weathercode >= 51 && weather.weathercode <= 67) icon = 'rain.png';
      else if (weather.weathercode >= 95) icon = 'storm.png';
      else if (weather.weathercode >= 71 && weather.weathercode <= 77) icon = 'snow.png';
      else if (weather.weathercode === 45 || weather.weathercode === 48) icon = 'fog.png';
      container.innerHTML = `
        <img src="assets/meteo/${icon}" alt="Météo" style="height:40px;vertical-align:middle;"/> 
        ${weather.temperature}°C - ${getWeatherDescription(weather.weathercode)}
      `;
    })
    .catch(() => container.innerHTML = 'Erreur météo');
}

function getWeatherDescription(code) {
  const descriptions = {
    0: 'Ciel clair',
    1: 'Peu nuageux',
    2: 'Partiellement nuageux',
    3: 'Couvert',
    45: 'Brouillard',
    48: 'Brouillard givrant',
    51: 'Bruine faible',
    61: 'Pluie faible',
    71: 'Neige faible',
    95: 'Orage'
  };
  return descriptions[code] || 'Inconnu';
}

function fetchCirculation() {
  document.getElementById('circulation').innerHTML = '🚗 Infos circulation en cours…';
}