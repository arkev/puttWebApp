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
    { id: 'agl', name: 'Above Ground Level (AGL)' },
    { id: 'aerobie', name: 'Aerobie' },
    { id: 'alfadiscs', name: 'Alfa Discs' },
    { id: 'aquaflight', name: 'AquaFlight Discs' },
    { id: 'arsenal', name: 'Arsenal Discworks' },
    { id: 'axiom', name: 'Axiom Discs' },
    { id: 'birdie', name: 'Birdie' },
    { id: 'blackzombie', name: 'Black Zombie Disc Golf' },
    { id: 'ching', name: 'CHING' },
    { id: 'clash', name: 'Clash Discs' },
    { id: 'crosslap', name: 'Crosslap' },
    { id: 'daredevil', name: 'Daredevil Discs' },
    { id: 'deity', name: 'Deity Discs' },
    { id: 'dga', name: 'DGA (Disc Golf Association)' },
    { id: 'discgolduk', name: 'Disc Golf UK' },
    { id: 'discmania', name: 'Discmania' },
    { id: 'discraft', name: 'Discraft' },
    { id: 'disctroyer', name: 'Disctroyer' },
    { id: 'discwing', name: 'Discwing' },
    { id: 'divergent', name: 'Divergent Discs' },
    { id: 'doomsday', name: 'Doomsday Discs' },
    { id: 'dynamic', name: 'Dynamic Discs' },
    { id: 'element', name: 'Element Discs' },
    { id: 'elevation', name: 'Elevation Disc Golf' },
    { id: 'eurodisc', name: 'Eurodisc' },
    { id: 'ev7', name: 'EV-7' },
    { id: 'exel', name: 'Exel Discs' },
    { id: 'finishline', name: 'Finish Line Discs' },
    { id: 'fourthcircle', name: 'Fourth Circle Discs' },
    { id: 'franklin', name: 'Franklin Sports' },
    { id: 'fullturn', name: 'Full Turn Discs' },
    { id: 'galaxy', name: 'Galaxy Disc Golf' },
    { id: 'gateway', name: 'Gateway Disc Sports' },
    { id: 'goliath', name: 'Goliath Discs' },
    { id: 'guru', name: 'Guru' },
    { id: 'hooligan', name: 'Hooligan Discs' },
    { id: 'hyzerbomb', name: 'HyzerBomb' },
    { id: 'infinite', name: 'Infinite Discs' },
    { id: 'innova', name: 'Innova (Innova Champion Discs)' },
    { id: 'kastaplast', name: 'Kastaplast' },
    { id: 'launch', name: 'Launch Disc Golf' },
    { id: 'legacy', name: 'Legacy Discs' },
    { id: 'latitude64', name: 'Latitude 64' },
    { id: 'lightning', name: 'Lightning Discs' },
    { id: 'loft', name: 'Løft Discs' },
    { id: 'lonestar', name: 'Lone Star Disc' },
    { id: 'millennium', name: 'Millennium Golf Discs' },
    { id: 'mint', name: 'Mint Discs' },
    { id: 'mvp', name: 'MVP Disc Sports' },
    { id: 'neptune', name: 'Neptune Discs' },
    { id: 'nordisc', name: 'Nordisc' },
    { id: 'obdiscs', name: 'Obsidian Discs' },
    { id: 'ozone', name: 'Ozone Disc Golf' },
    { id: 'prodigy', name: 'Prodigy Disc' },
    { id: 'prodiscus', name: 'Prodiscus' },
    { id: 'reptilian', name: 'Reptilian Disc Golf' },
    { id: 'remix', name: 'Remix Disc Golf' },
    { id: 'rpm', name: 'RPM Discs' },
    { id: 'skyquest', name: 'Skyquest Discs' },
    { id: 'snap', name: 'Snap Discsports' },
    { id: 'storm', name: 'Storm Disc Golf' },
    { id: 'streamline', name: 'Streamline Discs' },
    { id: 'sune', name: 'Sune Sport' },
    { id: 'terminalvelocity', name: 'Terminal Velocity Discs' },
    { id: 'tobu', name: 'Tobu Discs' },
    { id: 'tsa', name: 'Thought Space Athletics' },
    { id: 'trashpanda', name: 'Trash Panda Disc Golf' },
    { id: 'ub', name: 'UB Disc Golf' },
    { id: 'vibram', name: 'Vibram Disc Golf' },
    { id: 'viking', name: 'Viking Discs' },
    { id: 'westside', name: 'Westside Discs' },
    { id: 'wild', name: 'Wild Discs' },
    { id: 'windward', name: 'Windward Discs' },
    { id: 'wingit', name: 'Wing It Disc Golf' },
    { id: 'wingman', name: 'Wingman Discs' },
    { id: 'xcom', name: 'XCOM Discs' },
    { id: 'yikun', name: 'Yikun Discs' },
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
