const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'db.json');
const raw = fs.readFileSync(file, 'utf8');
let data = JSON.parse(raw);

data.sessions = data.sessions || [];
data.stats = data.stats || { circle1: { hits: 0, attempts: 0 }, circle2: { hits: 0, attempts: 0 } };

['circle1', 'circle2'].forEach(c => {
  if (!data.stats[c]) data.stats[c] = { hits: 0, attempts: 0 };
  data.stats[c].hits = Number(data.stats[c].hits) || 0;
  data.stats[c].attempts = Number(data.stats[c].attempts) || 0;
});

data.discStats = data.discStats || {};
Object.keys(data.discStats).forEach(id => {
  const s = data.discStats[id] || {};
  s.circle1 = s.circle1 || { hits: 0, attempts: 0 };
  s.circle2 = s.circle2 || { hits: 0, attempts: 0 };
  s.circle1.hits = Number(s.circle1.hits) || 0;
  s.circle1.attempts = Number(s.circle1.attempts) || 0;
  s.circle2.hits = Number(s.circle2.hits) || 0;
  s.circle2.attempts = Number(s.circle2.attempts) || 0;
  data.discStats[id] = s;
});

fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
console.log('db.json normalizado: stats y discStats actualizados.');
