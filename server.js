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

// ---------------- TABLEAU DE BORD ----------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

app.get('/dashboard', (req, res) => {
  if (req.query.secret !== SECRET) {
    return res.status(401).send('Secret invalide. Ajoute ?secret=ton_secret à l\'URL.');
  }

  const heartbeats = alerts.filter(a => a.raw && a.raw.type === 'heartbeat');
  const entries = alerts.filter(a => a.raw && a.raw.type === 'ict_mtf_entry').slice(-10).reverse();
  const latest = heartbeats.length ? heartbeats[heartbeats.length - 1] : null;

  const biasColor = (v) => v === 'bullish' ? '#1fae5c' : v === 'bearish' ? '#e0453c' : '#666';
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="60">
<title>myJ - Tableau de bord XAUUSD</title>
<style>
  body { background:#0f1115; color:#e6e6e6; font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin:0; padding:24px; }
  h1 { font-size:22px; margin-bottom:4px; }
  .sub { color:#888; font-size:13px; margin-bottom:24px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:32px; }
  .card { background:#1a1d24; border-radius:10px; padding:16px; border:1px solid #2a2d35; }
  .card .label { font-size:12px; color:#999; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; }
  .card .value { font-size:20px; font-weight:600; }
  table { width:100%; border-collapse: collapse; margin-top:8px; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #2a2d35; font-size:13px; }
  th { color:#999; text-transform:uppercase; font-size:11px; }
  .long { color:#1fae5c; font-weight:600; }
  .short { color:#e0453c; font-weight:600; }
  .empty { color:#666; font-style:italic; padding:20px 0; }
  .price { font-size:26px; font-weight:700; margin-bottom:2px; }
</style>
</head>
<body>
  <h1>myJ — XAUUSD</h1>
  <div class="sub">Dernière mise à jour : ${latest ? escapeHtml(latest.receivedAt) : 'aucune donnée reçue encore'} · rafraîchi automatiquement toutes les 60s</div>

  ${latest ? `
  <div class="price">${escapeHtml(latest.raw.price)} $</div>
  <div class="grid">
    <div class="card"><div class="label">Biais Daily</div><div class="value" style="color:${biasColor(latest.raw.dailyBias)}">${escapeHtml((latest.raw.dailyBias || '-').toUpperCase())}</div></div>
    <div class="card"><div class="label">Tendance 4H</div><div class="value">${escapeHtml((latest.raw.trend4h || '-').toUpperCase())}</div></div>
    <div class="card"><div class="label">Zone</div><div class="value">${escapeHtml((latest.raw.zone || '-').toUpperCase())}</div></div>
    <div class="card"><div class="label">StochRSI 15m</div><div class="value">${escapeHtml(latest.raw.stochRSI15m)}</div></div>
    <div class="card"><div class="label">Kill Zone</div><div class="value">${latest.raw.killZone === true || latest.raw.killZone === 'true' ? 'ACTIVE ✅' : 'inactive'}</div></div>
    <div class="card"><div class="label">Setup en attente</div><div class="value" style="color:${biasColor(latest.raw.pendingSetup)}">${escapeHtml((latest.raw.pendingSetup || 'none').toUpperCase())}</div></div>
  </div>
  ` : '<div class="empty">Aucun heartbeat reçu encore — vérifie que l\'alerte "Any alert() function call" est bien active sur TradingView.</div>'}

  <h2>Derniers signaux d'entrée</h2>
  ${entries.length ? `
  <table>
    <tr><th>Heure</th><th>Direction</th><th>Prix</th><th>Note</th></tr>
    ${entries.map(e => `<tr>
      <td>${escapeHtml(e.receivedAt)}</td>
      <td class="${e.direction}">${escapeHtml((e.direction || '-').toUpperCase())}</td>
      <td>${escapeHtml(e.price)}</td>
      <td>${escapeHtml(e.note || '')}</td>
    </tr>`).join('')}
  </table>
  ` : '<div class="empty">Aucun signal d\'entrée pour l\'instant.</div>'}
</body>
</html>`;

  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`myJ webhook server running on port ${PORT}`);
});
