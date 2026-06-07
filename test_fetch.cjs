async function test() {
  const token = 'arraia_digital_2026_super_secret';
  const res = await fetch(`https://arraia-digital.vercel.app/api/sync/sessions?t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(data);
}
test();
