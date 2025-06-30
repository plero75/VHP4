const fs = require('fs').promises;
const fetch = (...args) => import('node-fetch').then(({default:fetch})=>fetch(...args));

const proxy = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

async function download(url, filePath){
  const res = await fetch(proxy + encodeURIComponent(url));
  if(!res.ok) throw new Error(res.statusText);
  const json = await res.json();
  await fs.writeFile(filePath, JSON.stringify(json, null, 2));
  console.log("✅ Saved", filePath);
}

(async ()=>{
  try{
    await fs.mkdir('static', {recursive:true});
    await download("https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop-areas?bbox=2.3,48.7,2.5,48.9","static/gtfs-stops.json");
    await download("https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/lines/C01742/firstlast","static/gtfs-firstlast.json");
  }catch(e){
    console.error("❌",e);
    process.exit(1);
  }
})();
