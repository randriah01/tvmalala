// myJ - Serveur webhook pour alertes TradingView (SMC XAUUSD)
// Reçoit les alertes envoyées par TradingView, les stocke, et les expose via API.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DB_FILE = path.join(__dirname, 'alerts.json');
// Clé secrète simple pour éviter que n'importe qui spam ton webhook.
// Change cette valeur et mets la même dans le message d'alerte TradingView.
const SECRET = process.env.WEBHOOK_SECRET || 'change-moi-en-secret-fort';

// Charge les alertes existantes au démarrage
function loadAlerts() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveAlerts(alerts) {
  fs.writeFileSync(DB_FILE, JSON.stringify(alerts, null, 2));
}

let alerts = loadAlerts();

// Endpoint de santé (pratique pour vérifier que Render tourne bien)
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'myJ webhook', alertsStored: alerts.length });
});

// Endpoint recevant les alertes TradingView (POST)
app.post('/webhook/tradingview', (req, res) => {
  const body = req.body;

  // Vérification du secret pour sécuriser l'endpoint
  if (body.secret !== SECRET) {
    return res.status(401).json({ error: 'secret invalide' });
  }

  const alert = {
    receivedAt: new Date().toISOString(),
    symbol: body.symbol || 'XAUUSD',
    timeframe: body.timeframe || null,
    type: body.type || null,        // ex: "order_block_mitigation", "fvg_entry"
    direction: body.direction || null, // "long" ou "short"
    price: body.price || null,
    note: body.note || null,
    raw: body,
  };

  alerts.push(alert);
  // On garde les 500 dernières alertes pour ne pas exploser le fichier
  if (alerts.length > 500) alerts = alerts.slice(-500);
  saveAlerts(alerts);

  console.log('Nouvelle alerte reçue:', alert);
  res.status(200).json({ ok: true });
});

// Endpoint de lecture — pour consulter les alertes récentes (protégé par le même secret en query param)
app.get('/alerts', (req, res) => {
  if (req.query.secret !== SECRET) {
    return res.status(401).json({ error: 'secret invalide' });
  }
  const limit = parseInt(req.query.limit) || 20;
  res.json(alerts.slice(-limit).reverse());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`myJ webhook server running on port ${PORT}`);
});
