const express = require('express');
const path = require('path');
const multer = require('multer');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');
const lessMiddleware = require('less-middleware');
const bcrypt = require('bcryptjs');

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
  sessions: [],
  users: []
};

const db = new Low(adapter, defaultData);

async function initDB() {
  await db.read();
  db.data ||= defaultData;   // por si el archivo está vacío o no existe
  db.data.sessions ||= [];
  db.data.stats ||= { circle1: { hits: 0, attempts: 0 }, circle2: { hits: 0, attempts: 0 } };
  db.data.discStats ||= {};
  db.data.users ||= [];
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

  // Seed de usuario por defecto si no existe
  const exists = db.data.users.find(u => u.email === 'yosoy@arkev.com');
  if (!exists) {
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync('Ze2ju7', 10);
    db.data.users.push({ id, username: 'BogeyMaker', email: 'yosoy@arkev.com', passwordHash, createdAt: new Date().toISOString() });
    // Asignar elementos sin userId al usuario por defecto
    db.data.discs = (db.data.discs || []).map(d => d.userId ? d : { ...d, userId: id });
    db.data.routines = (db.data.routines || []).map(r => r.userId ? r : { ...r, userId: id });
    db.data.sessions = (db.data.sessions || []).map(s => s.userId ? s : { ...s, userId: id });
  }
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
app.use(express.static(path.join(__dirname, 'public'))); // manifest y otros

// Multer: guardar imágenes con extensión para que el navegador detecte el tipo MIME
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage });

// User ID
const cookieParser = require('cookie-parser');

app.use(cookieParser());
// Hydratar usuario autenticado si hay cookie
app.use((req, res, next) => {
  const uid = req.cookies.uid;
  if (uid) {
    const user = (db.data.users || []).find(u => u.id === uid);
    if (user) req.user = user;
  }
  next();
});

// Protección básica de rutas (excepto públicas y estáticos)
const isPublicPath = (p) => {
  return p === '/login' || p === '/register' || p === '/splash' || p === '/post-splash' ||
    p === '/manifest.webmanifest' || p.startsWith('/css') || p.startsWith('/images') || p.startsWith('/favicon');
};
app.use((req, res, next) => {
  if (!req.user && !isPublicPath(req.path)) {
    return res.redirect('/login');
  }
  next();
});

// Auth: Login/Registro/Logout
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login');
});

app.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  const users = db.data.users || [];
  const user = users.find(u => (u.username === identifier) || (u.email === identifier));
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash || '')) {
    return res.render('auth/login', { error: 'Usuario o contraseña inválidos.' });
  }
  res.cookie('uid', user.id, { httpOnly: false, maxAge: 1000*60*60*24*30 });
  return res.redirect('/');
});

app.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/register');
});

const validPassword = (pwd) => /^(?=.*[A-Z])(?=.*\d).{6,}$/.test(pwd || '');
app.post('/register', (req, res) => {
  let { username, email, password, confirm } = req.body;
  username = (username || '').trim();
  email = (email || '').trim().toLowerCase();
  if (!username || !email || !password || !confirm) {
    return res.render('auth/register', { error: 'Completa todos los campos.', values: { username, email } });
  }
  if (password !== confirm) {
    return res.render('auth/register', { error: 'Las contraseñas no coinciden.', values: { username, email } });
  }
  if (!validPassword(password)) {
    return res.render('auth/register', { error: 'La contraseña no cumple los requisitos.', values: { username, email } });
  }
  const users = db.data.users || [];
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.render('auth/register', { error: 'El nombre de usuario ya existe.', values: { username, email } });
  }
  if (users.find(u => (u.email || '').toLowerCase() === email)) {
    return res.render('auth/register', { error: 'El email ya está registrado.', values: { username, email } });
  }
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.data.users.push({ id, username, email, passwordHash, createdAt: new Date().toISOString() });
  db.write();
  res.cookie('uid', id, { httpOnly: false, maxAge: 1000*60*60*24*30 });
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  res.clearCookie('uid');
  res.redirect('/login');
});

// Soporta también GET para enlaces directos de cierre de sesión
app.get('/logout', (req, res) => {
  res.clearCookie('uid');
  res.redirect('/login');
});


// Discs
app.get('/discs/new', (req, res) => {
  const manufacturers = (db.data.manufacturers || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  res.render('discs/new', { manufacturers, activeTab: 'discs' });
});

app.get('/discs', (req, res) => {
  const userId = req.user.id;
  // Construir stats por disco desde sesiones (modo individual)
  const sessions = (db.data.sessions || []).filter(s => s.userId === userId && Array.isArray(s.discs));
  const statsByDisc = {};
  sessions.forEach(s => {
    s.discs.forEach(ds => {
      const id = ds.id;
      if (!statsByDisc[id]) statsByDisc[id] = { c1: { h: 0, a: 0 }, c2: { h: 0, a: 0 } };
      statsByDisc[id].c1.h += Number(ds.c1?.h) || 0;
      statsByDisc[id].c1.a += Number(ds.c1?.a) || 0;
      statsByDisc[id].c2.h += Number(ds.c2?.h) || 0;
      statsByDisc[id].c2.a += Number(ds.c2?.a) || 0;
    });
  });
  const discs = (db.data.discs || []).filter(d => d.userId === userId).map((d) => {
    let flight = d.flight;
    if (typeof flight === 'string') {
      const [speed, glide, turn, fade] = flight.split('|');
      flight = { speed, glide, turn, fade };
    }
    const st = statsByDisc[d.id] || { c1: { h: 0, a: 0 }, c2: { h: 0, a: 0 } };
    const c1h = st.c1.h, c1a = st.c1.a;
    const c2h = st.c2.h, c2a = st.c2.a;
    const th = c1h + c2h;
    const ta = c1a + c2a;
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
  const disc = { id: uuidv4(), alias, brand, model, plastic, weight, color, flight, userId: req.user.id };
  if (req.file) disc.image = req.file.filename;
  db.data.discs.push(disc);
  db.write();
  res.redirect('/discs');
});

app.get('/discs/:id/edit', (req, res) => {
  const disc = db.data.discs.find((d) => d.id === req.params.id && d.userId === req.user.id);
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
  const idx = db.data.discs.findIndex((d) => d.id === req.params.id && d.userId === req.user.id);
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
  db.data.discs = db.data.discs.filter(d => !(d.id === req.params.id && d.userId === req.user.id) );
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

  // Derivar SIEMPRE desde sesiones del usuario
  (db.data.sessions || []).forEach((s) => {
    if (s.userId !== req.user.id) return;
    if (!Array.isArray(s.discs)) return;
    const d = new Date(s.date);
    if (startDate && d < startDate) return;
    if (endDate && d > endDate) return;
    s.discs.forEach((ds) => {
      if (!statsByDisc[ds.id]) return;
      statsByDisc[ds.id].c1.h += Number(ds.c1?.h) || 0;
      statsByDisc[ds.id].c1.a += Number(ds.c1?.a) || 0;
      statsByDisc[ds.id].c2.h += Number(ds.c2?.h) || 0;
      statsByDisc[ds.id].c2.a += Number(ds.c2?.a) || 0;
    });
  });
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);
  const manufacturerMap = new Map(
    (db.data.manufacturers || []).map((m) => [m.name, m.id])
  );
  const userId = req.user.id;
  const discs = db.data.discs
    .filter((d) => ids.includes(d.id) && d.userId === userId)
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
  const disc = db.data.discs.find((d) => d.id === req.params.id && d.userId === req.user.id);
  if (!disc) return res.redirect('/discs');
  if (typeof disc.flight === 'string') {
    const [speed, glide, turn, fade] = disc.flight.split('|');
    disc.flight = { speed, glide, turn, fade };
  }
  // Recalcular stats del disco desde sesiones
  const sessionsForUser = (db.data.sessions || []).filter(s => s.userId === req.user.id && Array.isArray(s.discs));
  const stats = { circle1: { hits: 0, attempts: 0 }, circle2: { hits: 0, attempts: 0 } };
  sessionsForUser.forEach(s => {
    s.discs.forEach(ds => {
      if (ds.id !== disc.id) return;
      stats.circle1.hits += Number(ds.c1?.h) || 0;
      stats.circle1.attempts += Number(ds.c1?.a) || 0;
      stats.circle2.hits += Number(ds.c2?.h) || 0;
      stats.circle2.attempts += Number(ds.c2?.a) || 0;
    });
  });
  res.render('discs/show', { disc, stats });
});

// Routines
app.get('/routines', (req, res) => {
  const routines = (db.data.routines || []).filter(r => r.userId === req.user.id);
  res.render('routines/index', { routines, activeTab: 'routines' });
});

app.get('/routines/new', (req, res) => {
  res.render('routines/new', { activeTab: 'routines' });
});

app.post('/routines/new', (req, res) => {
  const { name } = req.body;
  let stations = req.body.stations || [];
  if (!Array.isArray(stations)) stations = [stations];
  stations = stations.map((d) => Number(d)).filter((n) => !isNaN(n) && n > 0);
  const routine = { id: uuidv4(), name, stations, userId: req.user.id };
  db.data.routines.push(routine);
  db.write();
  res.redirect('/routines');
});


app.get('/routines/:id/edit', (req, res) => {
  const routine = db.data.routines.find(r => r.id === req.params.id && r.userId === req.user.id);
  if (!routine) return res.redirect('/routines');
  res.render('routines/new', { routine, activeTab: 'routines' });
});

app.post('/routines/:id/edit', (req, res) => {
  const idx = db.data.routines.findIndex(r => r.id === req.params.id && r.userId === req.user.id);
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
  db.data.routines = db.data.routines.filter(r => !(r.id === req.params.id && r.userId === req.user.id));
  db.write();
  res.redirect('/routines');
});

app.get('/routines/:id/start', (req, res) => {
  const routine = db.data.routines.find((r) => r.id === req.params.id && r.userId === req.user.id);
  if (!routine) return res.redirect('/routines');
  const mode = req.query.mode;
  let discs = (db.data.discs || []).filter(d => d.userId === req.user.id);
  const discIds = req.query.discIds;
  const totalDiscs = Number(req.query.totalDiscs) || 0;
  if (mode === 'individual' && discIds) {
    const ids = Array.isArray(discIds) ? discIds : [discIds];
    discs = ids
      .map(id => db.data.discs.find(d => d.id === id && d.userId === req.user.id))
      .filter(Boolean);
  }
  res.render('routines/start', { routine, mode, discs, totalDiscs, activeTab: 'routines' });
});

app.post('/routines/:id/complete', (req, res) => {
  const routine = db.data.routines.find((r) => r.id === req.params.id && r.userId === req.user.id);
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
    userId: req.user.id,
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
  const userId = req.user.id;
  const allRoutines = db.data.routines || [];
  const routines = allRoutines.filter(r => r.userId === userId);
  const allSessions = (db.data.sessions || []).filter(s => s.userId === userId);
  const sessions = allSessions.slice(-5).reverse();

  // Mapa rutinaId -> nombre para etiquetar sesiones (solo del usuario)
  const routineById = new Map((routines || []).map(r => [r.id, r]));
  const sessionsView = sessions.map(s => ({
    ...s,
    routineName: s.routineId ? (routineById.get(s.routineId)?.name || 'Rutina') : undefined,
  }));

  let lastRoutine = null;
  if (allSessions.length) {
    const last = allSessions[allSessions.length - 1];
    lastRoutine = routines.find(r => r.id === last.routineId) || null;
  } else {
    lastRoutine = routines[routines.length - 1] || null; // no usar rutinas de otros usuarios
  }

  // KPIs por usuario (no globales)
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);
  let c1h = 0, c1a = 0, c2h = 0, c2a = 0;
  allSessions.forEach((s) => {
    if (s.mode === 'individual' && Array.isArray(s.discs)) {
      s.discs.forEach((ds) => {
        c1h += Number(ds.c1?.h) || 0;
        c1a += Number(ds.c1?.a) || 0;
        c2h += Number(ds.c2?.h) || 0;
        c2a += Number(ds.c2?.a) || 0;
      });
    } else if (Array.isArray(s.stations)) {
      s.stations.forEach((st) => {
        const d = Number(st.distance);
        const hits = Number(st.hits) || 0;
        const att = Number(st.attempts) || 0;
        if (!isNaN(d) && d <= 10) { c1h += hits; c1a += att; }
        else { c2h += hits; c2a += att; }
      });
    }
  });

  res.render('index', {
    user: { name: req.user.username, avatarUrl: req.user.avatar ? ('/images/' + req.user.avatar) : '/images/avatar.png' },
    lastRoutine,
    kpis: {
      c1: pct(c1h, c1a),
      c2: pct(c2h, c2a),
      sessionsCount: allSessions.length,
    },
    sessions: sessionsView,
    activeTab: 'home'
  });
});

// Botón central: Sesión
app.get('/session', (req, res) => {
  const routines = (db.data.routines || []).filter(r => r.userId === req.user.id);
  const lastRoutine = routines[routines.length - 1];
  if (lastRoutine) {
    return res.redirect(`/routines/${lastRoutine.id}/start`);
  }
  return res.redirect('/routines/new');
});

// Post-splash: decide a dónde ir según autenticación
app.get('/post-splash', (req, res) => {
  if (req.user) return res.redirect('/');
  return res.redirect('/login');
});

// Tú (perfil)
app.get('/you', (req, res) => {
  const userId = req.user.id;
  const allSessions = (db.data.sessions || []).filter(s => s.userId === userId);
  const discsCount = (db.data.discs || []).filter(d => d.userId === userId).length;
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);
  // Agregar C1/C2 por usuario a partir de sus sesiones
  let c1h = 0, c1a = 0, c2h = 0, c2a = 0;
  allSessions.forEach((s) => {
    if (s.mode === 'individual' && Array.isArray(s.discs)) {
      s.discs.forEach((ds) => {
        c1h += Number(ds.c1?.h) || 0;
        c1a += Number(ds.c1?.a) || 0;
        c2h += Number(ds.c2?.h) || 0;
        c2a += Number(ds.c2?.a) || 0;
      });
    } else if (Array.isArray(s.stations)) {
      s.stations.forEach((st) => {
        const d = Number(st.distance);
        const hits = Number(st.hits) || 0;
        const att = Number(st.attempts) || 0;
        if (!isNaN(d) && d <= 10) { c1h += hits; c1a += att; }
        else { c2h += hits; c2a += att; }
      });
    }
  });
  const totalH = c1h + c2h;
  const totalA = c1a + c2a;
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
    c1: pct(c1h, c1a),
    c2: pct(c2h, c2a),
    sessionsCount: allSessions.length,
    discsCount,
    streakWeeks,
  };
  res.render('you/index', {
    user: { name: req.user.username, avatarUrl: req.user.avatar ? ('/images/' + req.user.avatar) : '/images/avatar.png' },
    kpis,
    activeTab: 'you',
  });
});

// Editar perfil
app.get('/you/edit', (req, res) => {
  const u = req.user;
  res.render('you/edit', { form: { username: u.username, email: u.email }, avatar: u.avatar });
});

app.post('/you/edit', upload.single('avatar'), (req, res) => {
  const u = req.user;
  const { username, email, password, confirm } = req.body;
  const users = db.data.users || [];
  // Validaciones básicas
  if (!username || !email) {
    return res.render('you/edit', { error: 'Usuario y email son obligatorios.', form: { username, email }, avatar: u.avatar });
  }
  const takenUser = users.find(x => x.id !== u.id && x.username.toLowerCase() === String(username).toLowerCase());
  if (takenUser) return res.render('you/edit', { error: 'Ese nombre de usuario ya está en uso.', form: { username, email }, avatar: u.avatar });
  const takenEmail = users.find(x => x.id !== u.id && (x.email || '').toLowerCase() === String(email).toLowerCase());
  if (takenEmail) return res.render('you/edit', { error: 'Ese email ya está en uso.', form: { username, email }, avatar: u.avatar });
  // Actualizar
  u.username = username.trim();
  u.email = String(email).trim().toLowerCase();
  if (req.file) {
    u.avatar = req.file.filename;
  }
  if (password) {
    if (password !== confirm) {
      return res.render('you/edit', { error: 'Las contraseñas no coinciden.', form: { username, email }, avatar: u.avatar });
    }
    if (!validPassword(password)) {
      return res.render('you/edit', { error: 'La contraseña no cumple los requisitos.', form: { username, email }, avatar: u.avatar });
    }
    u.passwordHash = bcrypt.hashSync(password, 10);
  }
  db.write();
  res.redirect('/you');
});

// Reiniciar/recalcular estadísticas de discos del usuario desde sus sesiones
app.post('/you/reset-disc-stats', (req, res) => {
  const userId = req.user.id;
  const discs = (db.data.discs || []).filter(d => d.userId === userId);
  db.data.discStats = db.data.discStats || {};
  // reset a cero
  discs.forEach(d => {
    db.data.discStats[d.id] = {
      circle1: { hits: 0, attempts: 0 },
      circle2: { hits: 0, attempts: 0 },
    };
  });
  // reconstruir desde sesiones del usuario (modo individual)
  const sessions = (db.data.sessions || []).filter(s => s.userId === userId && Array.isArray(s.discs));
  sessions.forEach((s) => {
    s.discs.forEach((ds) => {
      const st = db.data.discStats[ds.id];
      if (!st) return; // por si el disco fue borrado
      st.circle1.hits += Number(ds.c1?.h) || 0;
      st.circle1.attempts += Number(ds.c1?.a) || 0;
      st.circle2.hits += Number(ds.c2?.h) || 0;
      st.circle2.attempts += Number(ds.c2?.a) || 0;
    });
  });
  db.write();
  res.redirect('/discs');
});

// Sesiones - listado completo
app.get('/sessions', (req, res) => {
  const userId = req.user.id;
  const allRoutines = (db.data.routines || []).filter(r => r.userId === userId);
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
  const idx = (db.data.sessions || []).findIndex(s => s.id === req.params.id && s.userId === req.user.id);
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
