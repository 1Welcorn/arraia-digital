const https = require('https');

const options = {
  hostname: 'arraia-digital.vercel.app',
  path: '/api/sync/users/test_master_token@escola.pr.gov.br',
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer arraia_digital_2026_super_secret'
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

req.end();
