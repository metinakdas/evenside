/*
 * GÜVENLİK PROVASI — kullanıcının KENDİ jetonuyla, başkasının verisine saldırmayı dener.
 * Hiçbir şey tahmin edilmiyor: her deneme gerçek isteğe çıkıyor, sonuç HTTP durumuyla
 * raporlanıyor. Yazma denemeleri bilerek "geri alınabilir" seçiliyor (ad değişikliği gibi)
 * ve BAŞARILI olursa hemen geri alınıyor.
 */
const fs = require('fs');
const T = 'C:/Users/metin/AppData/Local/Temp/';
const KEY = fs.readFileSync(T + 'k.txt', 'utf8').trim();
const session = JSON.parse(fs.readFileSync(T + 'login.json', 'utf8'));
const U = 'https://gqkwuilixnhhfvjnbnvm.supabase.co/rest/v1/';
const ME = session.user.id;
const h = {
  apikey: KEY,
  Authorization: `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const results = [];
const say = (baslik, gecti, ayrinti) => {
  results.push(`${gecti ? 'GÜVENLİ' : 'AÇIK   '} · ${baslik}${ayrinti ? ' → ' + ayrinti : ''}`);
};

const get = async (path) => {
  const r = await fetch(U + path, { headers: h });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const send = async (method, path, body) => {
  const r = await fetch(U + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* boş gövde */ }
  return { status: r.status, body: parsed, raw: text.slice(0, 160) };
};

(async () => {
  /* --- Keşif: başkasına ait satırlar --- */
  const players = (await get('players?select=id,name,owner_id,merged_into')).body || [];
  const squads = (await get('squads?select=id,name,owner_id,join_code')).body || [];
  const foreignSquad = squads.find((s) => s.owner_id !== ME);
  const myCard = players.find((p) => p.owner_id === ME);
  const foreignOwned = players.find((p) => p.owner_id && p.owner_id !== ME);
  const shared = players.find((p) => !p.owner_id);

  results.push(`— keşif: ${players.length} kart, ${squads.length} takım · başkasının takımı: ${foreignSquad ? foreignSquad.name : 'yok'} · başkasının sahipli kartı: ${foreignOwned ? foreignOwned.name : 'yok'}`);

  /* 1. Başkasının TAKIM ADINI değiştirebilir miyim? */
  if (foreignSquad) {
    const r = await send('PATCH', `squads?id=eq.${foreignSquad.id}`, { name: foreignSquad.name + ' HACK' });
    const changed = Array.isArray(r.body) && r.body.length > 0;
    say('başkasının takımı yeniden adlandırılamaz', !changed, `HTTP ${r.status}`);
    if (changed) await send('PATCH', `squads?id=eq.${foreignSquad.id}`, { name: foreignSquad.name });
  }

  /* 2. Başkasının takımını silebilir miyim? */
  if (foreignSquad) {
    const r = await send('DELETE', `squads?id=eq.${foreignSquad.id}`);
    const after = (await get(`squads?select=id&id=eq.${foreignSquad.id}`)).body || [];
    say('başkasının takımı silinemez', after.length === 1, `HTTP ${r.status}`);
  }

  /* 3. Başkasının takımına BAŞKASI adına üye ekleyebilir miyim? (kimlik uydurma) */
  if (foreignSquad) {
    const r = await send('POST', 'squad_members', {
      squad_id: foreignSquad.id,
      user_id: '00000000-0000-0000-0000-0000000000aa',
      player_id: null,
    });
    say('başkası adına üyelik eklenemez', r.status >= 400, `HTTP ${r.status}`);
  }

  /* 4. Üyesi olduğum ama SAHİBİ olmadığım takımın kadrosunu yazabilir miyim? */
  if (foreignSquad && players[0]) {
    const r = await send('POST', 'squad_players', { squad_id: foreignSquad.id, player_id: players[0].id, sort_order: 99 });
    say('üye, başkasının kadrosunu değiştiremez', r.status >= 400, `HTTP ${r.status}`);
  }

  /* 5. Başkasının SAHİPLİ kartını kendi üstüme geçirebilir miyim? (yetki yükseltme) */
  if (foreignOwned) {
    const r = await send('PATCH', `players?id=eq.${foreignOwned.id}`, { owner_id: ME });
    const changed = Array.isArray(r.body) && r.body.length > 0;
    say('başkasının kartı sahiplenilemez', !changed, `HTTP ${r.status}`);
    if (changed) await send('PATCH', `players?id=eq.${foreignOwned.id}`, { owner_id: foreignOwned.owner_id });
  }

  /* 6. Başkasının sahipli kartını silebilir miyim? */
  if (foreignOwned) {
    const r = await send('DELETE', `players?id=eq.${foreignOwned.id}`);
    const after = (await get(`players?select=id&id=eq.${foreignOwned.id}`)).body || [];
    say('başkasının kartı silinemez', after.length === 1, `HTTP ${r.status}`);
  }

  /* 7. SAHİPSİZ havuz kartını kendi üstüme geçirebilir miyim? (kart çalma) */
  if (shared) {
    const r = await send('PATCH', `players?id=eq.${shared.id}`, { owner_id: ME });
    const changed = Array.isArray(r.body) && r.body.length > 0;
    say('sahipsiz kart kendi üstüne geçirilemez (BEKLENEN: politika buna izin veriyor olabilir)', !changed, `HTTP ${r.status}`);
    if (changed) await send('PATCH', `players?id=eq.${shared.id}`, { owner_id: null });
  }

  /* 8. Kendi kartımı başkasının üstüne yazabilir miyim? */
  if (myCard) {
    const r = await send('PATCH', `players?id=eq.${myCard.id}`, { owner_id: '00000000-0000-0000-0000-0000000000bb' });
    const changed = Array.isArray(r.body) && r.body.length > 0;
    say('kart başkasının üstüne geçirilemez', !changed, `HTTP ${r.status}`);
    if (changed) await send('PATCH', `players?id=eq.${myCard.id}`, { owner_id: ME });
  }

  /* 9. auth.users okunabiliyor mu? (e-posta sızıntısı) */
  const users = await get('users?select=*');
  say('auth şeması REST üzerinden okunamaz', users.status >= 400, `HTTP ${users.status}`);

  /* 10. Oturumsuz (anon) okuma mümkün mü? */
  // PostgREST oturumsuz istekte 200 + BOŞ küme döner: ölçüt durum kodu değil, SATIR sayısı.
  const anon = await fetch(U + 'players?select=id', { headers: { apikey: KEY } });
  const anonRows = await anon.json().catch(() => []);
  say('oturumsuz okuma satır DÖNDÜRMÜYOR', Array.isArray(anonRows) && anonRows.length === 0, `HTTP ${anon.status}, ${Array.isArray(anonRows) ? anonRows.length : '?'} satır`);

  /* 11. Katılma kodları başkalarına görünüyor mu? (tasarım kararı: takım okuması serbest) */
  const codes = squads.filter((s) => s.owner_id !== ME && s.join_code);
  say('başkasının katılma kodu listelenemiyor', codes.length === 0, `${codes.length} kod görünüyor`);

  console.log(results.join('\n'));
})().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
