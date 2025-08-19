const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

(async () => {
  const file = path.resolve(__dirname, '..', 'db.json');
  const adapter = new JSONFile(file);
  const db = new Low(adapter, { manufacturers: [] });
  await db.read();

  db.data.manufacturers ||= [];

  const list = [
    { id: '1080', name: '1080 Disc Golf' },
    { id: '3disc', name: '3 Disc Golf' },
    { id: 'abc', name: 'ABC Discs' },
    { id: 'agl', name: 'AGL Discs' },
    { id: 'aerobie', name: 'Aerobie' },
    { id: 'alfadiscs', name: 'Alfa Discs' },
    { id: 'aquaflight', name: 'AquaFlight' },
    { id: 'arsenal', name: 'Arsenal Discworks' },
    { id: 'axiom', name: 'Axiom' },
    { id: 'birdie', name: 'Birdie Disc Golf Supply' },
    { id: 'blackzombie', name: 'Black Zombie' },
    { id: 'ching', name: 'Ching' },
    { id: 'clash', name: 'Clash Discs' },
    { id: 'crosslap', name: 'Crosslap' },
    { id: 'daredevil', name: 'Daredevil Discs' },
    { id: 'dga', name: 'DGA' },
    { id: 'discmania', name: 'Discmania' },
    { id: 'discraft', name: 'Discraft' },
    { id: 'disctroyer', name: 'Disctroyer' },
    { id: 'discwing', name: 'Discwing' },
    { id: 'divergent', name: 'Divergent Discs' },
    { id: 'dynamic', name: 'Dynamic Discs' },
    { id: 'elevation', name: 'Elevation Disc Golf' },
    { id: 'ev7', name: 'EV-7' },
    { id: 'finishline', name: 'Finish Line' },
    { id: 'fullturn', name: 'Full Turn Discs' },
    { id: 'gateway', name: 'Gateway' },
    { id: 'galaxy', name: 'Galaxy Disc Golf' },
    { id: 'goliath', name: 'Goliath Discs' },
    { id: 'guru', name: 'Guru Disc Golf' },
    { id: 'hooligan', name: 'Hooligan Discs' },
    { id: 'hyzerbomb', name: 'HyzerBomb' },
    { id: 'infinite', name: 'Infinite Discs' },
    { id: 'innova', name: 'Innova' },
    { id: 'kastaplast', name: 'Kastaplast' },
    { id: 'launch', name: 'Launch Disc Golf' },
    { id: 'legacy', name: 'Legacy Discs' },
    { id: 'latitude64', name: 'Latitude 64' },
    { id: 'lightning', name: 'Lightning Discs' },
    { id: 'loft', name: 'Loft Discs' },
    { id: 'lonestar', name: 'Lone Star Disc' },
    { id: 'millennium', name: 'Millennium' },
    { id: 'mint', name: 'Mint Discs' },
    { id: 'mvp', name: 'MVP' },
    { id: 'obdiscs', name: 'Obsidian Discs' },
    { id: 'ozone', name: 'Ozone Disc Golf' },
    { id: 'prodigy', name: 'Prodigy' },
    { id: 'prodiscus', name: 'Prodiscus' },
    { id: 'reptilian', name: 'Reptilian Disc Golf' },
    { id: 'remix', name: 'Remix Disc Golf' },
    { id: 'rpm', name: 'RPM Discs' },
    { id: 'skyquest', name: 'Skyquest' },
    { id: 'storm', name: 'Storm Disc Golf' },
    { id: 'streamline', name: 'Streamline' },
    { id: 'sune', name: 'Sune Sport' },
    { id: 'terminalvelocity', name: 'Terminal Velocity' },
    { id: 'tsa', name: 'Thought Space Athletics' },
    { id: 'trashpanda', name: 'Trash Panda' },
    { id: 'ub', name: 'UB Disc Golf' },
    { id: 'vibram', name: 'Vibram' },
    { id: 'viking', name: 'Viking Discs' },
    { id: 'westside', name: 'Westside Discs' },
    { id: 'wild', name: 'Wild Discs' },
    { id: 'wingit', name: 'Wing It Disc Golf' },
    { id: 'xcom', name: 'X-Com' },
    { id: 'yikun', name: 'Yikun' },
    { id: 'zing', name: 'Zing' },
  ];

  for (const m of list) {
    const i = db.data.manufacturers.findIndex((x) => x.id === m.id);
    if (i >= 0) db.data.manufacturers[i] = { ...db.data.manufacturers[i], ...m };
    else db.data.manufacturers.push(m);
  }

  await db.write();
  console.log('✅ Manufacturers seed listo');
})();
