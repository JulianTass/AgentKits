'use strict';

const path = require('path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT || 3080);
const publicDir = path.join(__dirname, 'public');

app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Healthcare Auth Portal: http://127.0.0.1:${PORT}/`);
  console.log('Add this exact URL to your Okta app Sign-in redirect URIs.');
});
