/* Senaryolarda kullanılan küçük yardımcılar. */
window.qa = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  byText: (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text)),
  all: (sel) => [...document.querySelectorAll(sel)],
  text: (sel) => (document.querySelector(sel) || {}).textContent?.trim() ?? null,
  /* elementFromPoint ile gerçek dokunma alanı (kenardan yürüyerek). */
  hit: (el) => {
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const at = (x, y) => { const h = document.elementFromPoint(x, y); return h === el || el.contains(h); };
    let l = cx, r = cx, t = cy, bo = cy;
    while (l > 0 && at(l - 1, cy)) l--;
    while (r < innerWidth - 1 && at(r + 1, cy)) r++;
    while (t > 0 && at(cx, t - 1)) t--;
    while (bo < innerHeight - 1 && at(cx, bo + 1)) bo++;
    return Math.round(r - l + 1) + 'x' + Math.round(bo - t + 1);
  },
};
