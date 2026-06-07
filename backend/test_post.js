const https = require('https');

const data = JSON.stringify([{email: "test_master_token@escola.pr.gov.br", nome: "Test", pin_acesso: "123", nivel_acesso: "OPERADOR_CAIXA"}]);

const options = {
  hostname: 'arraia-digital.vercel.app',
  path: '/api/sync/users',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer arraia_digital_2026_super_secret',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
