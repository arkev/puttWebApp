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
    { id: 'innova', name: 'Innova' },
    { id: 'discraft', name: 'Discraft' },
    { id: 'dynamic', name: 'Dynamic Discs' },
    { id: 'latitude64', name: 'Latitude 64' },
    { id: 'westside', name: 'Westside Discs' },
    { id: 'discmania', name: 'Discmania' },
    { id: 'mvp', name: 'MVP' },
    { id: 'axiom', name: 'Axiom' },
    { id: 'streamline', name: 'Streamline' },
    { id: 'prodigy', name: 'Prodigy' },
    { id: 'kastaplast', name: 'Kastaplast' },
    { id: 'lonestar', name: 'Lone Star' },
    { id: 'infinite', name: 'Infinite Discs' },
    { id: 'gateway', name: 'Gateway' },
    { id: 'clash', name: 'Clash Discs' },
    { id: 'tsa', name: 'Thought Space Athletics' },
    { id: 'dga', name: 'DGA' },
    { id: 'mint', name: 'Mint Discs' },
  ];

  for (const m of list) {
    const i = db.data.manufacturers.findIndex((x) => x.id === m.id);
    if (i >= 0) db.data.manufacturers[i] = { ...db.data.manufacturers[i], ...m };
    else db.data.manufacturers.push(m);
  }

  await db.write();
  console.log('✅ Manufacturers seed listo');
})();
