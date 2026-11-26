#!/usr/bin/env node
/**
 * SBTÜ Haftalık Yemek Listesi Scraper
 * Kaynak : https://www.sivas.edu.tr/yemek-listesi
 * Çıktı  : ./yemek.json  (proje kök dizini)
 *
 * Harici bağımlılık gerektirmez (Node.js yerleşik https modülü).
 *
 * Gerçek HTML yapısı (gözlemlenen):
 *   div.yemekhane-week
 *     div.yemekhane-week-title  → "Kasım 2026 - 4. Hafta"
 *     div.row
 *       div.yemekhane-table
 *         div.yemekhane-primary
 *           div.yemekhane-heading | div.bugun
 *             span.yemekhane-title.text-center → "Perşembe 26 Kasım 2026 12:00"
 *           div.yemekhane
 *             ul.list-group-yemekhane
 *               li.list-group-item-yemekhane
 *                 span.badge → "85 kal"
 *                 (text node) → "MERCİMEK ÇORBASI"
 */

'use strict';

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

const MENU_URL    = 'https://www.sivas.edu.tr/yemek-listesi';
const OUTPUT_FILE = path.join(__dirname, '..', 'yemek.json');

const TR_MONTHS = {
  ocak:1, şubat:2, mart:3, nisan:4, mayıs:5, haziran:6,
  temmuz:7, ağustos:8, eylül:9, ekim:10, kasım:11, aralık:12
};

// ─── HTTP GET — yönlendirme destekli ─────────────────────────────────────────
function fetchUrl(url, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) { reject(new Error('Çok fazla yönlendirme')); return; }
        const loc = res.headers.location;
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        resolve(fetchUrl(next, maxRedirects - 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`)); return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Bağlantı zaman aşımı')); });
  });
}

// ─── HTML varlıklarını çöz ───────────────────────────────────────────────────
function ent(s) {
  return s
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/&#(\d+);/g,(_,c) => String.fromCharCode(+c))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const map = {ouml:'ö',uuml:'ü',ccedil:'ç',scedil:'ş',iuml:'ı',
                   Ouml:'Ö',Uuml:'Ü',Ccedil:'Ç',Scedil:'Ş',Iuml:'İ',
                   atilde:'â',eacute:'é',iacute:'í'};
      return map[name] || m;
    });
}

// ─── Tag'leri sil ────────────────────────────────────────────────────────────
function stripTags(s) { return s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }

// ─── "Perşembe 26 Kasım 2026 12:00" → { dateKey:"2026-11-26", dayName:"Perşembe" } ──
function parseTitle(raw) {
  const text = ent(raw.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  // Format: "Gün DD MonthName YYYY HH:MM" veya "GÜN DD MONTHNAME YYYY 12:00"
  const m = text.match(/^(\S+)\s+(\d{1,2})\s+(\S+)\s+(\d{4})/i);
  if (!m) return null;
  const [, rawDay, day, rawMonth, year] = m;
  const monthKey = rawMonth.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')   // accent strip fallback
    .replace('i̇','i');
  // Türkçe normalize
  const turkishMonthKey = rawMonth.toLowerCase()
    .replace('ş','s').replace('ı','i').replace('ğ','g')
    .replace('ü','u').replace('ö','o').replace('ç','c');

  let monthNum = TR_MONTHS[rawMonth.toLowerCase()] || TR_MONTHS[monthKey];
  if (!monthNum) {
    // Fuzzy match
    for (const [k, v] of Object.entries(TR_MONTHS)) {
      const kn = k.replace('ş','s').replace('ı','i').replace('ğ','g')
                  .replace('ü','u').replace('ö','o').replace('ç','c');
      if (kn === turkishMonthKey) { monthNum = v; break; }
    }
  }
  if (!monthNum) return null;

  const yyyy = parseInt(year, 10);
  const mm   = String(monthNum).padStart(2,'0');
  const dd   = String(parseInt(day, 10)).padStart(2,'0');
  const dateKey = `${yyyy}-${mm}-${dd}`;

  // Gün adını normalize et (büyük → kapitalize)
  const dayName = rawDay.charAt(0).toUpperCase()
    + rawDay.slice(1).toLowerCase()
      .replace('i̇','i').replace('ş','ş').replace('ı','ı');

  return { dateKey, dayName: rawDay.charAt(0).toUpperCase() + rawDay.slice(1).toLowerCase() };
}

// ─── Kalori ayrıştır: "85 kal", "143/191 kal" → ilk sayı ───────────────────
function parseKal(badge) {
  const m = badge.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Math.round(parseFloat(m[1].replace(',','.'))) : 0;
}

// ─── Ana ayrıştırma ──────────────────────────────────────────────────────────
function parseMenuHtml(html) {
  const result = { days: {}, weeks: [] };

  // script/style/comment temizle
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ');

  // ─── 1) yemekhane-week blokları ───────────────────────────────────────────
  // Her bloğu  <div class="yemekhane-week"> ... </div>  olarak çek
  const weekBlockRe = /<div[^>]+class="[^"]*yemekhane-week[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let weekMatch;

  // Daha güvenilir: "yemekhane-week" başlangıcından sonraki büyük blokları al
  // Önce tüm ofsetten bul, sonra eşleşen kapanış parantezini manuel say
  const weekStarts = [];
  let idx = 0;
  while (true) {
    const start = clean.indexOf('yemekhane-week', idx);
    if (start === -1) break;
    // Div başlangıcını geri bul
    const divStart = clean.lastIndexOf('<div', start);
    if (divStart !== -1) weekStarts.push(divStart);
    idx = start + 14;
  }

  // yemekhane-week-title içindeki tekrar olanları çıkar, sadece kapsayıcıları al
  const uniqueWeekDivs = [];
  for (const ws of weekStarts) {
    const sub = clean.substring(ws, ws + 30);
    if (/yemekhane-week[^-]/.test(sub) || sub.includes('yemekhane-week"')) {
      uniqueWeekDivs.push(ws);
    }
  }

  // Her hafta bloğunu işle
  for (const wStart of uniqueWeekDivs) {
    // Hafta başlığını bul
    const titleMatch = clean.substring(wStart, wStart + 400).match(
      /class="yemekhane-week-title"[^>]*>([^<]*)</
    );
    const weekTitle = titleMatch ? ent(titleMatch[1]).trim() : '';
    if (weekTitle) result.weeks.push(weekTitle);

    // Hafta için bitiş sınırı: Yaklaşık 5000 karakter (en fazla 5-7 gün)
    const weekChunk = clean.substring(wStart, wStart + 15000);

    // ─── 2) yemekhane-table div'leri (gün kartları) ────────────────────────
    const dayRe = /class="[^"]*yemekhane-table[^"]*"[\s\S]*?(?=class="[^"]*yemekhane-table[^"]*"|$)/g;
    let dayMatch;
    while ((dayMatch = dayRe.exec(weekChunk)) !== null) {
      const dayChunk = dayMatch[0];

      // span.yemekhane-title → "Perşembe 26 Kasım 2026 12:00"
      const titleEl = dayChunk.match(/<span[^>]+yemekhane-title[^>]*>([\s\S]*?)<\/span>/i);
      if (!titleEl) continue;
      const parsed = parseTitle(titleEl[1]);
      if (!parsed) continue;
      const { dateKey, dayName } = parsed;

      // li.list-group-item-yemekhane
      const items = [];
      const liRe = /<li[^>]+list-group-item-yemekhane[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRe.exec(dayChunk)) !== null) {
        const liHtml = liMatch[1];
        // span.badge → kalori
        const badgeM = liHtml.match(/<span[^>]+badge[^>]*>([\s\S]*?)<\/span>/i);
        const calRaw = badgeM ? stripTags(badgeM[1]) : '';
        const calKal = parseKal(calRaw);
        // Yemek adı: badge span'ı çıkardıktan sonra kalan metin
        const nameRaw = liHtml.replace(/<span[^>]+badge[^>]*>[\s\S]*?<\/span>/i,'');
        const name    = ent(stripTags(nameRaw)).toUpperCase().trim();
        if (name.length > 1) {
          items.push({
            name,
            calories: calRaw.trim() || ''
          });
        }
      }

      if (items.length > 0) {
        result.days[dateKey] = {
          dayName,
          items,
          totalCalories: items.reduce((s, it) => s + parseKal(it.calories), 0)
        };
      }
    }
  }

  // Hafta başlığı: en güncel (son) haftayı al
  if (result.weeks.length > 0) {
    result.weekTitle = result.weeks[result.weeks.length - 1];
  } else {
    // Tarihlerden türet
    const dates = Object.keys(result.days).sort();
    if (dates.length) {
      const d = new Date(dates[0] + 'T12:00:00');
      const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                      'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
      result.weekTitle = `${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  }

  return result;
}

// ─── Ana akış ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[fetch-menu] ${new Date().toISOString()} — Veri çekiliyor…`);
  console.log(`[fetch-menu] URL: ${MENU_URL}`);

  let html;
  try {
    html = await fetchUrl(MENU_URL);
    console.log(`[fetch-menu] HTML alındı: ${html.length.toLocaleString()} karakter`);
  } catch (err) {
    console.error('[fetch-menu] HATA — HTTP isteği başarısız:', err.message);
    if (fs.existsSync(OUTPUT_FILE)) {
      console.log('[fetch-menu] Mevcut yemek.json korunuyor (ağ hatası).');
    } else {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        updatedAt: new Date().toISOString(), weekTitle: '', fetchError: err.message, days: {}
      }, null, 2), 'utf8');
    }
    process.exit(1);
  }

  const { days, weekTitle } = parseMenuHtml(html);
  const dateKeys = Object.keys(days).sort();

  const output = { updatedAt: new Date().toISOString(), weekTitle, days };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  if (dateKeys.length === 0) {
    console.warn('[fetch-menu] UYARI: Hiç gün verisi ayrıştırılamadı!');
    // İlk 2000 karakteri bas (debug)
    console.log('[fetch-menu] HTML başlangıcı:\n' + html.substring(0, 2000));
  } else {
    console.log(`[fetch-menu] ✓ ${dateKeys.length} gün → ${OUTPUT_FILE}`);
    console.log(`[fetch-menu] Hafta: ${weekTitle}`);
    dateKeys.forEach(d => {
      const day = days[d];
      console.log(`  ${d} ${day.dayName}: ${day.items.length} yemek, ${Math.round(day.totalCalories)} kal`);
      day.items.forEach(it => console.log(`    • ${it.calories.padEnd(10)} ${it.name}`));
    });
  }
}

main().catch(err => { console.error('[fetch-menu] Beklenmeyen hata:', err); process.exit(1); });
