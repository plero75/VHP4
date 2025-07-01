export const CONFIG = {
  proxy: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=",
  stops: {
    rer:  "STIF:StopArea:SP:43135:",
    bus77:"STIF:StopArea:SP:463641:",
    bus201:"STIF:StopArea:SP:463644:"
  },
  refreshIntervals: {
    stopMonitoring: 60,    // en secondes
    generalMessage: 600,   // en secondes (10min)
    meteo: 1800            // en secondes (30min)
  }
};
