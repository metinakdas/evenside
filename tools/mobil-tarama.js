(async () => {
  const out = [];
  const W = innerWidth;
  out.push('rota: ' + location.pathname + ' · ' + W + 'x' + innerHeight);
  out.push('yatay kaydırma: ' + (document.documentElement.scrollWidth > W + 1 ? 'VAR ✗ (' + document.documentElement.scrollWidth + ')' : 'yok ✓'));
  out.push('dikey kaydırma: ' + (document.documentElement.scrollHeight > innerHeight ? 'var' : 'yok'));

  const kucuk = [...document.querySelectorAll('button, a[href], input, select')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44); })
    .map((el) => (typeof el.className === 'string' && el.className ? el.className.split(' ')[0] : el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
  out.push('44px altı (' + kucuk.length + '): ' + (kucuk.slice(0, 8).join(' | ') || 'yok ✓'));

  const kucukYazi = [...document.querySelectorAll('*')]
    .filter((el) => el.children.length === 0 && el.textContent.trim() && el.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(el).fontSize) < 11)
    .map((el) => (typeof el.className === 'string' && el.className ? el.className.split(' ')[0] : el.tagName) + ' ' + getComputedStyle(el).fontSize);
  out.push('11px altı yazı (' + kucukYazi.length + '): ' + (kucukYazi.slice(0, 6).join(' | ') || 'yok ✓'));

  // Kesilen metin: kutusundan taşan satır içi içerik
  const kesik = [...document.querySelectorAll('button, span, p, h1, h2, div')]
    .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
    .map((el) => (typeof el.className === 'string' && el.className ? el.className.split(' ')[0] : el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth);
  out.push('kesilen metin (' + kesik.length + '): ' + (kesik.slice(0, 6).join(' | ') || 'yok ✓'));
  return out.join('\n');
})()
