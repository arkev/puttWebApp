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
  discStats: {}
};

const db = new Low(adapter, defaultData);

async function initDB() {
  await db.read();
  db.data ||= defaultData;   // por si el archivo está vacío o no existe
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
  const manufacturers = db.data.manufacturers || [];
  res.render('discs/new', { manufacturers });
});

app.get('/discs', (req, res) => {
  const discs = (db.data.discs || []).map((d) => {
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
  const { brand, model, plastic, weight, color, flight } = req.body;
  const disc = { id: uuidv4(), brand, model, plastic, weight, color, flight };
  if (req.file) disc.image = req.file.filename;
  db.data.discs.push(disc);
  db.write();
  res.redirect('/discs');
});

app.get('/discs/:id', (req, res) => {
  const disc = db.data.discs.find((d) => d.id === req.params.id);
  if (!disc) return res.redirect('/discs');
  const stats = db.data.discStats[disc.id];
  res.render('discs/show', { disc, stats });
});

app.get('/discs/compare', (req, res) => {
  let ids = req.query.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  const discs = db.data.discs.filter((d) => ids.includes(d.id));
  res.render('discs/compare', { discs, stats: db.data.discStats });
});

// Routines
app.get('/routines', (req, res) => {
  res.render('routines/index', { routines: db.data.routines });
});

app.get('/routines/new', (req, res) => {
  res.render('routines/new');
});

app.post('/routines/new', (req, res) => {
  const { name, distances } = req.body;
  const stations = (distances || '')
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((n) => !isNaN(n));
  const routine = { id: uuidv4(), name, stations };
  db.data.routines.push(routine);
  db.write();
  res.redirect('/routines');
});

app.get('/routines/:id/start', (req, res) => {
  const routine = db.data.routines.find((r) => r.id === req.params.id);
  if (!routine) return res.redirect('/routines');
  const mode = req.query.mode;
  const discs = db.data.discs;
  res.render('routines/start', { routine, mode, discs });
});

app.post('/routines/:id/complete', (req, res) => {
  const routine = db.data.routines.find((r) => r.id === req.params.id);
  if (!routine) return res.redirect('/routines');
  const mode = req.query.mode;
  if (mode === 'individual') {
    let ids = req.body.discIds || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids.forEach((id) => {
      const attc1 = Number(req.body[`attc1_${id}`] || 0);
      const hitc1 = Number(req.body[`hitc1_${id}`] || 0);
      const attc2 = Number(req.body[`attc2_${id}`] || 0);
      const hitc2 = Number(req.body[`hitc2_${id}`] || 0);
      const stats =
        db.data.discStats[id] || {
          circle1: { hits: 0, attempts: 0 },
          circle2: { hits: 0, attempts: 0 },
        };
      stats.circle1.attempts += attc1;
      stats.circle1.hits += hitc1;
      stats.circle2.attempts += attc2;
      stats.circle2.hits += hitc2;
      db.data.discStats[id] = stats;
      db.data.stats.circle1.attempts += attc1;
      db.data.stats.circle1.hits += hitc1;
      db.data.stats.circle2.attempts += attc2;
      db.data.stats.circle2.hits += hitc2;
    });
  } else if (mode === 'total') {
    routine.stations.forEach((station, i) => {
      const attempts = Number(req.body[`attempts_${i}`] || 0);
      const hits = Number(req.body[`hits_${i}`] || 0);
      if (station <= 10) {
        db.data.stats.circle1.attempts += attempts;
        db.data.stats.circle1.hits += hits;
      } else {
        db.data.stats.circle2.attempts += attempts;
        db.data.stats.circle2.hits += hits;
      }
    });
  }
  db.write();
  res.render('routines/result', { routine });
});

// Stats
app.get('/stats', (req, res) => {
  res.render('stats/index', { stats: db.data.stats });
});

// Home (única)
app.get('/', (req, res) => {
  const userId = req.clientId || 'local';
  const routines = (db.data.routines || []).filter(r => r.userId === userId);
  const sessions = (db.data.sessions || []).filter(s => s.userId === userId).slice(-5).reverse();

  const lastRoutine = routines[routines.length - 1] || null;

  const c1 = db.data.stats?.circle1 || { hits: 0, attempts: 0 };
  const c2 = db.data.stats?.circle2 || { hits: 0, attempts: 0 };
  const pct = (h, a) => (a ? Math.round((h / a) * 100) : 0);

  res.render('index', {
    user: { name: 'Kev', avatarUrl: '/images/avatar.png' },
    lastRoutine,
    kpis: {
      c1: pct(c1.hits, c1.attempts),
      c2: pct(c2.hits, c2.attempts),
      sessionsCount: sessions.length,
    },
    sessions,
    activeTab: 'home'
  });
});

// Botón central: Sesión
app.get('/session', (req, res) => {
  const routines = db.data.routines || [];
  const lastRoutine = routines[routines.length - 1];
  if (lastRoutine) {
    return res.redirect(`/routines/${lastRoutine.id}/start?mode=total`);
  }
  return res.redirect('/routines/new');
});