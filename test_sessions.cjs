const axios = require('axios');

async function test() {
  try {
    const token = 'arraia_digital_2026_super_secret';
    const res = await axios.get('https://arraia-digital.vercel.app/api/sync/sessions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Sessions no Servidor:", res.data.length);
    console.log(res.data);
  } catch (e) {
    console.error("Erro:", e.response ? e.response.data : e.message);
  }
}
test();
