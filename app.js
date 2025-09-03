const express = require('express');
const path = require('path');
const multer = require('multer');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');
const lessMiddleware = require('less-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const file = path.resolve(__dirname, 'db.json');
const adapter = new JSONFile(file);

// >>> clave: define datos por defecto y pásalos al constructor
const defaultData = {
  discs: [],
  routines: [],
  manufacturers: [],
  stats: {
    circle1: { hits: 0, attempts: 0 },
    circle2: { hits: 0, attempts: 0 }
  },
  discStats: {},
  sessions: []
};

const db = new Low(adapter, defaultData);

async function initDB() {
  await db.read();
  db.data ||= defaultData;   // por si el archivo está vacío o no existe
  db.data.sessions ||= [];
  db.data.stats ||= { circle1: { hits: 0, attempts: 0 }, circle2: { hits: 0, attempts: 0 } };
  db.data.discStats ||= {};
  // Normalizar posibles valores nulos o no numéricos en stats globales
  ['circle1', 'circle2'].forEach((c) => {
    if (!db.data.stats[c]) db.data.stats[c] = { hits: 0, attempts: 0 };
    db.data.stats[c].hits = Number(db.data.stats[c].hits) || 0;
    db.data.stats[c].attempts = Number(db.data.stats[c].attempts) || 0;
  });
  // Normalizar discStats
  Object.keys(db.data.discStats || {}).forEach((id) => {
    const s = db.data.discStats[id] || {};
    s.circle1 = s.circle1 || { hits: 0, attempts: 0 };
    s.circle2 = s.circle2 || { hits: 0, attempts: 0 };
    s.circle1.hits = Number(s.circle1.hits) || 0;
    s.circle1.attempts = Number(s.circle1.attempts) || 0;
    s.circle2.hits = Number(s.circle2.hits) || 0;
    s.circle2.attempts = Number(s.circle2.attempts) || 0;
    db.data.discStats[id] = s;
  });
  await db.write();
}

// Inicializar la base de datos antes de arrancar el servidor
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
});

// Middleware
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(
  lessMiddleware(path.join(__dirname, 'less'), {
    dest: path.join(__dirname, 'public', 'css'),
    force: true,
    preprocess: {
      path: function (pathname, req) {
        return pathname.replace('/css', '');
      },
    },
  })
);
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

const upload = multer({ dest: path.join(__dirname, 'public', 'images') });

// User ID
const cookieParser = require('cookie-parser');

app.use(cookieParser());
app.use((req, res, next) => {
  if (!req.cookies.clientId) {
    const id = uuidv4();
    // httpOnly:false para poder usarlo del lado cliente si te hace falta
    res.cookie('clientId', id, { httpOnly: false, maxAge: 1000*60*60*24*365 });
    req.clientId = id;
  } else {
    req.clientId = req.cookies.clientId;
  }
  next();
});


// Discs
app.get('/discs/new', (req, res) => {
  const manufacturers = (db.data.manufacturers || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  res.render('discs/new', { manufacturers, activeTab: 'discs' });
});

app.get('/discs', (req, res) => {
  const discs = (db.data.discs || []).map((d) => {
    let flight = d.flight;
    if (typeof flight === 'string') {
      const [speed, glide, turn, fade] = flight.split('|');
      flight = { speed, glide, turn, fade };
    }
    const st = db.data.discStats?.[d.id] || {
      circle1: { hits: 0, attempts: 0 },
      circle2: { hits: 0, attempts: 0 },
    };
    const c1h = st.circle1.hits || 0,
      c1a = st.circle1.attempts || 0;
    const c2h = st.circle2.hits || 0,
      c2a = st.circle2.attempts || 0;
    const th = c1h + c2h,
      ta = c1a + c2a;
    const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);
    return {
      ...d,
      flight,
      stats: {
        c1: { h: c1h, a: c1a, pct: pct(c1h, c1a) },
        c2: { h: c2h, a: c2a, pct: pct(c2h, c2a) },
        total: { h: th, a: ta, pct: pct(th, ta) },
      },
    };
  });
  res.render('discs/index', { discs, activeTab: 'discs' });
});

app.post('/discs/new', upload.single('image'), (req, res) => {
  const { alias, brand, model, plastic, weight, color, speed, glide, turn, fade } = req.body;
  const flight = { speed, glide, turn, fade };
  const disc = { id: uuidv4(), alias, brand, model, plastic, weight, color, flight };
  if (req.file) disc.image = req.file.filename;
  db.data.discs.push(disc);
  db.write();
  res.redirect('/discs');
});

app.get('/discs/:id/edit', (req, res) => {
  const disc = db.data.discs.find((d) => d.id === req.params.id);
  if (!disc) return res.redirect('/discs');
  if (typeof disc.flight === 'string') {
    const [speed, glide, turn, fade] = disc.flight.split('|');
    disc.flight = { speed, glide, turn, fade };
  }
  const manufacturers = (db.data.manufacturers || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  res.render('discs/new', { disc, manufacturers, activeTab: 'discs' });
});

app.post('/discs/:id/edit', upload.single('image'), (req, res) => {
  const idx = db.data.discs.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.redirect('/discs');
  const { alias, brand, model, plastic, weight, color, speed, glide, turn, fade } = req.body;
  const flight = { speed, glide, turn, fade };
  const disc = db.data.discs[idx];
  db.data.discs[idx] = { ...disc, alias, brand, model, plastic, weight, color, flight };
  if (req.file) db.data.discs[idx].image = req.file.filename;
  db.write();
  res.redirect('/discs');
});

app.post('/discs/:id/delete', (req, res) => {
  db.data.discs = db.data.discs.filter(d => d.id !== req.params.id);
  if (db.data.discStats) {
    delete db.data.discStats[req.params.id];
  }
  db.write();
  res.redirect('/discs');
});

app.get('/discs/compare', (req, res) => {
  let ids = req.query.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  const { start, end } = req.query;
  const parseDate = (s, isEnd = false) => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    const ms = Date.UTC(
      y,
      m - 1,
      d,
      isEnd ? 23 : 0,
      isEnd ? 59 : 0,
      isEnd ? 59 : 0,
      isEnd ? 999 : 0
    );
    const date = new Date(ms);
    return isNaN(date) ? null : date;
  };
  const startDate = parseDate(start);
  const endDate = parseDate(end, true);
  const filtering = startDate || endDate;

  const statsByDisc = ids.reduce((acc, id) => {
    acc[id] = { c1: { h: 0, a: 0 }, c2: { h: 0, a: 0 } };
    return acc;
  }, {});

  if (filtering) {
    (db.data.sessions || []).forEach((s) => {
      const d = new Date(s.date);
      if (startDate && d < startDate) return;
      if (endDate && d > endDate) return;
      if (!Array.isArray(s.discs)) return;
      s.discs.forEach((ds) => {
        if (!statsByDisc[ds.id]) return;
        statsByDisc[ds.id].c1.h += ds.c1.h;
        statsByDisc[ds.id].c1.a += ds.c1.a;
        statsByDisc[ds.id].c2.h += ds.c2.h;
        statsByDisc[ds.id].c2.a += ds.c2.a;
      });
    });
  } else {
    ids.forEach((id) => {
      const st = db.data.discStats?.[id];
      if (!st) return;
      statsByDisc[id] = {
        c1: { h: st.circle1?.hits || 0, a: st.circle1?.attempts || 0 },
        c2: { h: st.circle2?.hits || 0, a: st.circle2?.attempts || 0 },
      };
    });
  }
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);
  const manufacturerMap = new Map(
    (db.data.manufacturers || []).map((m) => [m.name, m.id])
  );
  const discs = db.data.discs
    .filter((d) => ids.includes(d.id))
    .map((d) => {
      const st = statsByDisc[d.id] || { c1: { h: 0, a: 0 }, c2: { h: 0, a: 0 } };
      const th = st.c1.h + st.c2.h;
      const ta = st.c1.a + st.c2.a;
      const short = manufacturerMap.get(d.brand) || d.brand;
      const brandShort = short.charAt(0).toUpperCase() + short.slice(1);
      return {
        ...d,
        brandShort,
        stats: {
          c1: { h: st.c1.h, a: st.c1.a, pct: pct(st.c1.h, st.c1.a) },
          c2: { h: st.c2.h, a: st.c2.a, pct: pct(st.c2.h, st.c2.a) },
          total: { h: th, a: ta, pct: pct(th, ta) },
        },
      };
    });
  res.render('discs/compare', { discs, start, end, ids, activeTab: 'discs' });
});

app.get('/discs/:id', (req, res) => {
  const disc = db.data.discs.find((d) => d.id === req.params.id);
  if (!disc) return res.redirect('/discs');
  if (typeof disc.flight === 'string') {
    const [speed, glide, turn, fade] = disc.flight.split('|');
    disc.flight = { speed, glide, turn, fade };
  }
  const stats = db.data.discStats[disc.id];
  res.render('discs/show', { disc, stats });
});

// Routines
app.get('/routines', (req, res) => {
  res.render('routines/index', { routines: db.data.routines, activeTab: 'routines' });
});

app.get('/routines/new', (req, res) => {
  res.render('routines/new', { activeTab: 'routines' });
});

app.post('/routines/new', (req, res) => {
  const { name } = req.body;
  let stations = req.body.stations || [];
  if (!Array.isArray(stations)) stations = [stations];
  stations = stations.map((d) => Number(d)).filter((n) => !isNaN(n) && n > 0);
  const routine = { id: uuidv4(), name, stations, userId: req.clientId };
  db.data.routines.push(routine);
  db.write();
  res.redirect('/routines');
});


app.get('/routines/:id/edit', (req, res) => {
  const routine = db.data.routines.find(r => r.id === req.params.id);
  if (!routine) return res.redirect('/routines');
  res.render('routines/new', { routine, activeTab: 'routines' });
});

app.post('/routines/:id/edit', (req, res) => {
  const idx = db.data.routines.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.redirect('/routines');
  const { name } = req.body;
  let stations = req.body.stations || [];
  if (!Array.isArray(stations)) stations = [stations];
  stations = stations.map((d) => Number(d)).filter((n) => !isNaN(n) && n > 0);
  db.data.routines[idx] = { ...db.data.routines[idx], name, stations };
  db.write();
  res.redirect('/routines');
});

app.post('/routines/:id/delete', (req, res) => {
  db.data.routines = db.data.routines.filter(r => r.id !== req.params.id);
  db.write();
  res.redirect('/routines');
});

app.get('/routines/:id/start', (req, res) => {
  const routine = db.data.routines.find((r) => r.id === req.params.id);
  if (!routine) return res.redirect('/routines');
  const mode = req.query.mode;
  let discs = db.data.discs;
  const discIds = req.query.discIds;
  const totalDiscs = Number(req.query.totalDiscs) || 0;
  if (mode === 'individual' && discIds) {
    const ids = Array.isArray(discIds) ? discIds : [discIds];
    discs = ids
      .map(id => db.data.discs.find(d => d.id === id))
      .filter(Boolean);
  }
  res.render('routines/start', { routine, mode, discs, totalDiscs, activeTab: 'routines' });
});

app.post('/routines/:id/complete', (req, res) => {
  const routine = db.data.routines.find((r) => r.id === req.params.id);
  if (!routine) return res.redirect('/routines');
  const mode = req.query.mode;
  let repeatUrl = `/routines/${routine.id}/start?mode=${mode}`;
  const sessionStations = [];
  const sessionDiscs = [];
  if (mode === 'individual') {
    let ids = req.body.discIds || [];
    if (!Array.isArray(ids)) ids = [ids];
    const uniqueIds = [...new Set(ids)];
    uniqueIds.forEach((id) => {
  const attc1 = Number(req.body[`attc1_${id}`]) || 0;
  const hitc1 = Number(req.body[`hitc1_${id}`]) || 0;
  const attc2 = Number(req.body[`attc2_${id}`]) || 0;
  const hitc2 = Number(req.body[`hitc2_${id}`]) || 0;
  const stats = db.data.discStats[id] || { circle1: { hits: 0, attempts: 0 }, circle2: { hits: 0, attempts: 0 } };
  stats.circle1 = stats.circle1 || { hits: 0, attempts: 0 };
  stats.circle2 = stats.circle2 || { hits: 0, attempts: 0 };
  stats.circle1.attempts = Number(stats.circle1.attempts) || 0;
  stats.circle1.hits = Number(stats.circle1.hits) || 0;
  stats.circle2.attempts = Number(stats.circle2.attempts) || 0;
  stats.circle2.hits = Number(stats.circle2.hits) || 0;
  stats.circle1.attempts += attc1;
  stats.circle1.hits += hitc1;
  stats.circle2.attempts += attc2;
  stats.circle2.hits += hitc2;
  db.data.discStats[id] = stats;
  // Normalizar antes de sumar al stat global
  db.data.stats.circle1.attempts = Number(db.data.stats.circle1.attempts) || 0;
  db.data.stats.circle1.hits = Number(db.data.stats.circle1.hits) || 0;
  db.data.stats.circle2.attempts = Number(db.data.stats.circle2.attempts) || 0;
  db.data.stats.circle2.hits = Number(db.data.stats.circle2.hits) || 0;
  db.data.stats.circle1.attempts += attc1;
  db.data.stats.circle1.hits += hitc1;
  db.data.stats.circle2.attempts += attc2;
  db.data.stats.circle2.hits += hitc2;
      sessionDiscs.push({
        id,
        c1: { h: hitc1, a: attc1 },
        c2: { h: hitc2, a: attc2 },
      });
    });
    routine.stations.forEach((station, i) => {
      const hits = Number(req.body[`hitsStation_${i}`] || 0);
      const attempts = Number(req.body[`attemptsStation_${i}`] || 0);
      sessionStations.push({ distance: station, hits, attempts });
    });
    repeatUrl += ids.map((id) => `&discIds=${id}`).join('');
  } else if (mode === 'total') {
    const totalDiscs = Number(req.body.totalDiscs) || 0;
    routine.stations.forEach((station, i) => {
      const hits = Number(req.body[`hits_${i}`] || 0);
      const attempts = totalDiscs;
      sessionStations.push({ distance: station, hits, attempts });
      if (station <= 10) {
        db.data.stats.circle1.attempts += attempts;
        db.data.stats.circle1.hits += hits;
      } else {
        db.data.stats.circle2.attempts += attempts;
        db.data.stats.circle2.hits += hits;
      }
    });
    repeatUrl += `&totalDiscs=${totalDiscs}`;
  }
  const sessionData = {
    id: uuidv4(),
    userId: req.clientId,
    routineId: routine.id,
    mode,
    date: new Date().toISOString(),
    stations: sessionStations,
  };
  if (mode === 'individual') {
    sessionData.discs = sessionDiscs;
  }
  db.data.sessions.push(sessionData);
  db.write();
  res.render('routines/result', { routine, repeatUrl, activeTab: 'routines' });
});

// Stats
app.get('/stats', (req, res) => {
  res.render('stats/index', { stats: db.data.stats });
});

// Splash screen (mostrada una vez por cookie)
app.get('/splash', (req, res) => {
  res.cookie('seenSplash', '1', { httpOnly: false, maxAge: 1000 * 60 * 60 * 24 * 7 });
  res.render('splash');
});

// Home (única)
app.get('/', (req, res) => {
  if (!req.cookies.seenSplash) {
    return res.redirect('/splash');
  }
  const userId = req.clientId || 'local';
  const allRoutines = db.data.routines || [];
  const routines = allRoutines.filter(r => r.userId === userId);
  const allSessions = (db.data.sessions || []).filter(s => s.userId === userId);
  const sessions = allSessions.slice(-5).reverse();

  // Mapa rutinaId -> nombre para etiquetar sesiones
  const routineById = new Map((allRoutines || []).map(r => [r.id, r]));
  const sessionsView = sessions.map(s => ({
    ...s,
    routineName: s.routineId ? (routineById.get(s.routineId)?.name || 'Rutina') : undefined,
  }));

  let lastRoutine = null;
  if (allSessions.length) {
    const last = allSessions[allSessions.length - 1];
    lastRoutine = allRoutines.find(r => r.id === last.routineId) || null;
  } else {
    lastRoutine = routines[routines.length - 1] || allRoutines[allRoutines.length - 1] || null;
  }

  const c1 = db.data.stats?.circle1 || { hits: 0, attempts: 0 };
  const c2 = db.data.stats?.circle2 || { hits: 0, attempts: 0 };
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);

  res.render('index', {
    user: { name: 'Kev', avatarUrl: '/images/avatar.png' },
    lastRoutine,
    kpis: {
      c1: pct(c1.hits, c1.attempts),
      c2: pct(c2.hits, c2.attempts),
      sessionsCount: allSessions.length,
    },
    sessions: sessionsView,
    activeTab: 'home'
  });
});

// Botón central: Sesión
app.get('/session', (req, res) => {
  const routines = db.data.routines || [];
  const lastRoutine = routines[routines.length - 1];
  if (lastRoutine) {
    return res.redirect(`/routines/${lastRoutine.id}/start`);
  }
  return res.redirect('/routines/new');
});

// Tú (perfil)
app.get('/you', (req, res) => {
  const userId = req.clientId || 'local';
  const allSessions = (db.data.sessions || []).filter(s => s.userId === userId);
  const discsCount = (db.data.discs || []).length;
  const c1 = db.data.stats?.circle1 || { hits: 0, attempts: 0 };
  const c2 = db.data.stats?.circle2 || { hits: 0, attempts: 0 };
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);
  const totalH = (Number(c1.hits) || 0) + (Number(c2.hits) || 0);
  const totalA = (Number(c1.attempts) || 0) + (Number(c2.attempts) || 0);
  // Racha actual de semanas (ISO, lunes a domingo) con al menos una sesión
  const startOfISOWeek = (d0) => {
    const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
    const day = d.getUTCDay() || 7; // 1..7, donde 1=Lun
    d.setUTCDate(d.getUTCDate() - day + 1); // llevar a lunes
    d.setUTCHours(0,0,0,0);
    return d;
  };
  const weekStarts = new Set(
    allSessions.map(s => startOfISOWeek(new Date(s.date)).getTime())
  );
  let streakWeeks = 0;
  if (weekStarts.size) {
    const sorted = Array.from(weekStarts).sort((a,b)=>b-a);
    let current = sorted[0];
    streakWeeks = 1;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    while (weekStarts.has(current - oneWeek)) {
      streakWeeks++;
      current -= oneWeek;
    }
  }
  const kpis = {
    total: pct(totalH, totalA),
    c1: pct(c1.hits, c1.attempts),
    c2: pct(c2.hits, c2.attempts),
    sessionsCount: allSessions.length,
    discsCount,
    streakWeeks,
  };
  res.render('you/index', {
    user: { name: 'Kev', avatarUrl: '/images/avatar.png' },
    kpis,
    activeTab: 'you',
  });
});

// Sesiones - listado completo
app.get('/sessions', (req, res) => {
  const userId = req.clientId || 'local';
  const allRoutines = db.data.routines || [];
  const routineById = new Map(allRoutines.map(r => [r.id, r]));
  const allSessions = (db.data.sessions || [])
    .filter(s => s.userId === userId)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const sessionsView = allSessions.map(s => ({
    ...s,
    routineName: s.routineId ? (routineById.get(s.routineId)?.name || 'Rutina') : undefined,
  }));
  res.render('sessions/index', { sessions: sessionsView, sessionsCount: sessionsView.length, activeTab: 'home' });
});

// Eliminar sesión (con rollback de stats)
app.post('/sessions/:id/delete', (req, res) => {
  const idx = (db.data.sessions || []).findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.redirect('/sessions');
  const s = db.data.sessions[idx];

  // Asegurar estructura numérica
  db.data.stats = db.data.stats || { circle1: { hits: 0, attempts: 0 }, circle2: { hits: 0, attempts: 0 } };
  ['circle1', 'circle2'].forEach((c) => {
    db.data.stats[c] = db.data.stats[c] || { hits: 0, attempts: 0 };
    db.data.stats[c].hits = Number(db.data.stats[c].hits) || 0;
    db.data.stats[c].attempts = Number(db.data.stats[c].attempts) || 0;
  });

  const clamp = (n) => (n < 0 ? 0 : n);

  if (s.mode === 'individual' && Array.isArray(s.discs)) {
    s.discs.forEach((ds) => {
      const id = ds.id;
      const st = db.data.discStats?.[id];
      if (st) {
        st.circle1 = st.circle1 || { hits: 0, attempts: 0 };
        st.circle2 = st.circle2 || { hits: 0, attempts: 0 };
        st.circle1.hits = clamp((Number(st.circle1.hits) || 0) - (Number(ds.c1?.h) || 0));
        st.circle1.attempts = clamp((Number(st.circle1.attempts) || 0) - (Number(ds.c1?.a) || 0));
        st.circle2.hits = clamp((Number(st.circle2.hits) || 0) - (Number(ds.c2?.h) || 0));
        st.circle2.attempts = clamp((Number(st.circle2.attempts) || 0) - (Number(ds.c2?.a) || 0));
        db.data.discStats[id] = st;
      }
      db.data.stats.circle1.hits = clamp(db.data.stats.circle1.hits - (Number(ds.c1?.h) || 0));
      db.data.stats.circle1.attempts = clamp(db.data.stats.circle1.attempts - (Number(ds.c1?.a) || 0));
      db.data.stats.circle2.hits = clamp(db.data.stats.circle2.hits - (Number(ds.c2?.h) || 0));
      db.data.stats.circle2.attempts = clamp(db.data.stats.circle2.attempts - (Number(ds.c2?.a) || 0));
    });
  } else if (Array.isArray(s.stations)) {
    s.stations.forEach((stn) => {
      const d = Number(stn.distance);
      const hits = Number(stn.hits) || 0;
      const att = Number(stn.attempts) || 0;
      if (!isNaN(d) && d <= 10) {
        db.data.stats.circle1.hits = clamp(db.data.stats.circle1.hits - hits);
        db.data.stats.circle1.attempts = clamp(db.data.stats.circle1.attempts - att);
      } else {
        db.data.stats.circle2.hits = clamp(db.data.stats.circle2.hits - hits);
        db.data.stats.circle2.attempts = clamp(db.data.stats.circle2.attempts - att);
      }
    });
  }

  // Eliminar la sesión
  db.data.sessions.splice(idx, 1);
  db.write();
  res.redirect('/sessions');
});
