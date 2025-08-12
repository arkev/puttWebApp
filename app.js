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

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

// Discs
app.get('/discs', (req, res) => {
  res.render('discs/index', { discs: db.data.discs });
});

app.get('/discs/new', (req, res) => {
  res.render('discs/new');
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
