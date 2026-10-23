/* Glimpses of Glory shop: loads the Products sheet and renders the home page or one category page.
   Shared by /index.html and every /<category>/index.html. Settings live here only. */
(function () {
  // ---- Settings -------------------------------------------------------
  var SHEET_ID = '1pcVfe6pvB_jF8MCk5sKVdR3AQpWwAfS9g8yBf9-8ZXQ';
  var CSV_URL = window.GOG_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&headers=1&sheet=Products';
  var ORDER_EMAIL = 'hello@glimpsesofglory.shop';
  var HOME_LIMIT = 4;       // products shown per category on the home page; the rest are on the category page
  // Site root (folder that holds index.html), worked out from this script's own URL (/assets/shop.js),
  // so the same file works on the home page and inside /tumblers/ etc.
  var SCRIPT = document.currentScript || document.querySelector('script[src*="shop.js"]');
  var ROOT = '/';
  try { ROOT = new URL('..', SCRIPT.src).pathname; } catch (e) {}
  var PLACEHOLDER = ROOT + 'placeholder.jpg';
  // key = Sheet "Category" value (lower case), id = home-page anchor (#tumblers), page = folder of the category page.
  var CATEGORIES = [
    { key:'greeting cards', id:'greeting-cards', page:'greeting-cards', name:'Greeting Cards', thumb:'cat-cards.jpg',
      blurb:'Scripture-inspired Christmas and everyday cards, singles, 5-packs, and boxed sets.' },
    { key:'tumblers', id:'tumblers', page:'tumblers', name:'Tumblers', thumb:'cat-tumblers.jpg',
      blurb:'Sublimated tumblers with designs to carry a word of hope through the day.' },
    { key:'coasters', id:'coasters', page:'coasters', name:'Coasters', thumb:'cat-coasters.jpg',
      blurb:'Ceramic coasters with cork backing, sold individually or in sets.' },
    { key:'glass cutting boards', id:'cutting-boards', page:'cutting-boards', name:'Glass Cutting Boards', thumb:'cat-cutting-boards.jpg',
      blurb:'Tempered glass cutting boards that double as beautiful kitchen keepsakes.' },
    { key:'gifts & more', id:'misc', page:'gifts', name:'Gifts & More', thumb:'cat-gifts.jpg',
      blurb:'Seasonal pieces, custom orders, and other handcrafted treasures.' }
  ];
  CATEGORIES.forEach(function (c) { c.thumb = ROOT + c.thumb; c.url = ROOT + c.page + '/'; });
  // Which page is this? <body data-category="tumblers"> on a category page, nothing on the home page.
  var PAGE_CAT = null;
  (function () {
    var want = document.body.getAttribute('data-category');
    CATEGORIES.forEach(function (c) { if (want && c.page === want) PAGE_CAT = c; });
  })();
  var IS_HOME = !PAGE_CAT;
  // Default gallery captions, in column order: Photo Link, Image 2, Image 3, Image 4 (+ Video).
  // A "Captions" column in the Sheet (separated by |) overrides these for one product.
  var CAPTIONS = {
    'greeting cards':       { img:['Front', 'Inside', 'Standing open'], video:'Video' },
    'tumblers':             { img:['Whole tumbler', 'Side 1 close-up', 'Side 2 close-up'], video:'Rotating display' },
    'coasters':             { img:['Front close-up', 'Set of four', 'Isometric view', 'Backing'], video:'Video' },
    'glass cutting boards': { img:['Front close-up', 'Back with feet', 'Isometric view', 'On backlit display stand'], video:'Video' },
    'gifts & more':         { img:[], video:'Video' }
  };

  // ---- Helpers --------------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // RFC 4180 CSV parser: quoted fields, "" escapes, commas and newlines inside quotes.
  function parseCSV(text) {
    var rows = [], row = [], field = '', i = 0, q = false, c;
    text = String(text).replace(/^\uFEFF/, '');
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ''; }); });
  }

  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\band\b/g, '&'); }

  function toObjects(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return norm(h); });
    function idx(names) { for (var k = 0; k < names.length; k++) { var j = head.indexOf(names[k]); if (j > -1) return j; } return -1; }
    var col = {
      show: idx(['show']), category: idx(['category']), name: idx(['name']), description: idx(['description']),
      price: idx(['price']), lead: idx(['lead time', 'leadtime']), photo: idx(['photo link', 'photo']),
      link: idx(['square link', 'order link', 'link']), sort: idx(['sort']),
      img2: idx(['image 2', 'image2', 'photo 2']), img3: idx(['image 3', 'image3', 'photo 3']),
      img4: idx(['image 4', 'image4', 'photo 4']), video: idx(['video', 'video link']),
      captions: idx(['captions', 'caption']), slug: idx(['slug', 'page name'])
    };
    if (col.photo < 0) col.photo = idx(['image 1', 'image', 'photo link 1']);
    if (col.name < 0 || col.category < 0) throw new Error('Sheet headers not recognized');
    return rows.slice(1).map(function (r) {
      function g(k) { return col[k] > -1 && r[col[k]] != null ? String(r[col[k]]).trim() : ''; }
      return { show:g('show'), category:g('category'), name:g('name'), description:g('description'),
               price:g('price'), lead:g('lead'), photo:g('photo'), link:g('link'), sort:g('sort'),
               img2:g('img2'), img3:g('img3'), img4:g('img4'), video:g('video'), captions:g('captions'), slug:g('slug') };
    });
  }

  function isYes(v) { return /^(yes|y|true|x|1)$/i.test(String(v).trim()); }

  // Sample listings (Name starts with "SAMPLE", or Price says "(sample)") demonstrate the gallery.
  // They are hidden on the home page but still shown (and deep-linkable) on the category pages.
  function isSample(p) { return /^\s*sample\b/i.test(p.name || '') || /\(\s*sample\s*\)/i.test(p.price || ''); }

  // Google Drive share link -> file id (file/d/ID/view, open?id=ID, uc?id=ID, thumbnail?id=ID, lh3 .../d/ID).
  function driveId(link) {
    if (!/(drive|docs)\.google\.com|googleusercontent\.com/i.test(link)) return '';
    var m = link.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || link.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ||
            link.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }
  // A file committed to the repo, e.g. "images/card-front.jpg" (no spaces, no "..").
  function isRepoPath(link, exts) {
    return new RegExp('^(?!.*\\.\\.)[A-Za-z0-9_\\-./]+\\.(' + exts + ')$', 'i').test(link) && !/^\//.test(link);
  }
  // Image cell -> URL that works in an <img>, or '' if the cell is empty / not usable.
  function imgSrc(link, w) {
    link = String(link || '').trim();
    if (!link) return '';
    var id = driveId(link);
    if (id) return 'https://lh3.googleusercontent.com/d/' + id + '=w' + (w || 800);
    if (/^https?:\/\//i.test(link)) return link;
    if (isRepoPath(link, 'jpe?g|png|webp|gif|svg|avif')) return ROOT + link;
    return '';
  }
  // Google-hosted images are refused for some referrers (e.g. local previews), so send none.
  function setSrc(img, url) {
    if (/googleusercontent\.com|drive\.google\.com|ytimg\.com/i.test(url)) img.referrerPolicy = 'no-referrer';
    img.src = url;
  }
  function photoUrl(link, fallback) { return imgSrc(link, 800) || fallback || PLACEHOLDER; }

  // Video cell -> {type:'yt', id} for YouTube, {type:'drive', id} for Drive, {type:'mp4', src} for a video file.
  function videoInfo(link) {
    link = String(link || '').trim();
    if (!link) return null;
    var m = link.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
    if (m) return { type:'yt', id:m[1] };
    var id = driveId(link);
    if (id) return { type:'drive', id:id };
    if (/^https?:\/\//i.test(link) && /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(link)) return { type:'mp4', src:link };
    if (isRepoPath(link, 'mp4|webm|m4v|mov')) return { type:'mp4', src:ROOT + link };
    return null;
  }

  // All views for one product, in order; empty cells are skipped (no placeholder art).
  function buildViews(p, catKey) {
    var d = CAPTIONS[catKey] || { img:[], video:'Video' }, views = [];
    [p.photo, p.img2, p.img3, p.img4].forEach(function (link, i) {
      if (imgSrc(link)) views.push({ type:'img', link:String(link).trim(), caption:d.img[i] || '' });
    });
    var v = videoInfo(p.video);
    if (v) { v.caption = d.video; views.push(v); }
    var over = p.captions ? p.captions.split('|') : [];
    views.forEach(function (vw, i) { var o = (over[i] || '').trim(); if (o) vw.caption = o; });
    return views;
  }

  function slugify(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
  }

  function safeLink(link) { link = String(link || '').trim(); return /^https?:\/\//i.test(link) ? link : ''; }

  function orderHref(p) {
    var l = safeLink(p.link);
    if (l) return l;
    var body = 'Hello Glimpses of Glory,\n\nI would like to order: ' + p.name +
      (p.price ? ' (' + p.price + ')' : '') + '\nQuantity: \nNeeded by (date): \nPersonalization / notes: \n\nMy name and phone: \n\nThank you!';
    return 'mailto:' + ORDER_EMAIL + '?subject=' + encodeURIComponent('Order request: ' + p.name) +
           '&body=' + encodeURIComponent(body);
  }

  function sortNum(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 1e9 : n; }

  // ---- Rendering ------------------------------------------------------
  function countLabel(n) { return n + (n === 1 ? ' item' : ' items'); }

  function catTile(c, items) { // items: array to show a count badge, or null while loading
    var a = el('a', 'cat'); a.href = c.url;
    var img = el('div', 'img');
    img.style.backgroundImage = "url('" + c.thumb + "'), url('" + PLACEHOLDER + "')"; // category thumb, placeholder underneath as fallback
    if (items) img.appendChild(el('span', null, items.length ? countLabel(items.length) : 'Coming soon'));
    a.appendChild(img); a.appendChild(el('h3', null, c.name)); a.appendChild(el('p', null, c.blurb));
    return a;
  }

  function comingSoon(c) {
    var soon = el('div', 'soon');
    var si = el('img'); si.alt = c.name; si.src = c.thumb; si.loading = 'lazy';
    si.onerror = function () { if (this.src.indexOf(PLACEHOLDER) === -1) this.src = PLACEHOLDER; };
    soon.appendChild(si);
    soon.appendChild(document.createTextNode('Coming soon \u2014 new pieces are being lovingly made.'));
    return soon;
  }

  // Neutral stand-in for a real product that has no usable photo yet (no category art, so it can't read as a sample).
  function noPhoto() { var d = el('div', 'nophoto'); d.appendChild(el('span', null, 'Photo coming soon')); return d; }

  function productCard(p, c) {
    var card = el('article', 'prod');
    var href = '#p/' + p.slug;
    var ph = el('a', 'ph'); ph.href = href; ph.setAttribute('aria-label', 'View photos: ' + p.name);
    var first = p.views.filter(function (v) { return v.type === 'img'; })[0];
    if (!first && !isSample(p)) {
      ph.appendChild(noPhoto());
    } else {
      var im = el('img', 'photo'); im.loading = 'lazy'; im.alt = p.name;
      setSrc(im, first ? imgSrc(first.link, 800) : photoUrl(p.photo, c.thumb));
      im.onerror = function () {
        if (!isSample(p)) { this.replaceWith(noPhoto()); return; } // real product: neutral placeholder
        if (this.src.indexOf(PLACEHOLDER) === -1) this.src = PLACEHOLDER;
      };
      ph.appendChild(im);
    }
    var nImg = p.views.filter(function (v) { return v.type === 'img'; }).length, hasVid = p.views.length > nImg;
    if (p.views.length > 1) ph.appendChild(el('span', 'views', nImg + (nImg === 1 ? ' photo' : ' photos') + (hasVid ? ' + video' : '')));
    card.appendChild(ph);
    var h = el('h3'), ha = el('a', null, p.name); ha.href = href; ha.tabIndex = -1; h.appendChild(ha);
    card.appendChild(h);
    if (p.description) card.appendChild(el('p', 'desc', p.description));
    card.appendChild(el('div', 'spacer'));
    var meta = el('div', 'meta');
    if (p.price) meta.appendChild(el('div', 'price', p.price));
    if (p.lead) meta.appendChild(el('div', 'lead', p.lead));
    card.appendChild(meta);
    var b = el('a', 'btn', 'Order'); b.href = orderHref(p);
    if (safeLink(p.link)) { b.target = '_blank'; b.rel = 'noopener'; }
    card.appendChild(b);
    return card;
  }

  function mailLink(text) { var a = el('a', null, text); a.href = 'mailto:' + ORDER_EMAIL; return a; }

  // Home page: category tiles, then a section (up to HOME_LIMIT products + a link to the category page)
  // only for categories that have real products. Samples are skipped here; they stay on the category pages.
  function renderHome(groups) {
    var nav = document.getElementById('cats'), main = document.getElementById('sections');
    nav.innerHTML = ''; main.innerHTML = '';
    CATEGORIES.forEach(function (c) {
      var items = (groups ? (groups[c.key] || []) : []).filter(function (p) { return !isSample(p); });
      nav.appendChild(catTile(c, items));
      if (!items.length) return; // no real products yet: the tile above says "Coming soon"; no section on the home page

      var sec = el('section', 'catsec'); sec.id = c.id; // old #tumblers-style links keep working
      var h2 = el('h2', 'section'), hl = el('a', null, c.name); hl.href = c.url;
      h2.appendChild(hl); sec.appendChild(h2); sec.appendChild(el('div', 'divider'));
      sec.appendChild(el('p', 'intro', c.blurb));
      var grid = el('div', 'grid');
      items.slice(0, HOME_LIMIT).forEach(function (p) { grid.appendChild(productCard(p, c)); });
      sec.appendChild(grid);
      // always point to the category page, even when the section is short
      var w = el('div', 'seeall-wrap'), sa = el('a', 'seeall',
        items.length > HOME_LIMIT ? 'See all ' + c.name + ' (' + items.length + ') \u2192' : 'Visit the ' + c.name + ' page \u2192');
      sa.href = c.url; w.appendChild(sa); sec.appendChild(w);
      var top = el('a', 'totop', '\u2191 Back to categories'); top.href = '#top'; sec.appendChild(top);
      main.appendChild(sec);
    });
  }

  // Category page: every visible product in this category, then tiles for the other categories.
  // state is 'loading', 'error', or the grouped products.
  function renderCategory(state) {
    var c = PAGE_CAT, main = document.getElementById('sections'), count = document.getElementById('count');
    var loaded = typeof state === 'object';
    main.innerHTML = '';
    var grid = el('div', 'grid');
    main.appendChild(grid);
    if (state === 'loading') {
      grid.appendChild(el('div', 'loading', 'Loading ' + c.name.toLowerCase() + '\u2026'));
    } else if (state === 'error') {
      var n = el('div', 'notice');
      n.appendChild(document.createTextNode('Sorry, the catalog didn\u2019t load just now. Please refresh the page, or '));
      n.appendChild(mailLink('email us'));
      n.appendChild(document.createTextNode(' and we\u2019ll gladly help.'));
      grid.appendChild(n);
    } else {
      var items = state[c.key] || [];
      if (count) count.textContent = items.length ? countLabel(items.length) : '';
      if (!items.length) grid.appendChild(comingSoon(c));
      else items.forEach(function (p) { grid.appendChild(productCard(p, c)); });
      if (items.length < 3) { // empty or nearly empty: say so kindly and point somewhere useful
        var note = el('div', 'notice');
        note.appendChild(document.createTextNode((items.length ? 'More ' + c.name.toLowerCase() + ' are on the way. ' : '') +
          'Looking for something special? We take custom orders \u2014 '));
        note.appendChild(mailLink('email us'));
        note.appendChild(document.createTextNode(', or browse the other categories below.'));
        main.appendChild(note);
      }
    }
    var more = el('section', 'more');
    more.appendChild(el('h2', 'section', 'Explore more')); more.appendChild(el('div', 'divider'));
    var mg = el('nav', 'grid'); mg.setAttribute('aria-label', 'Other categories');
    CATEGORIES.forEach(function (o) { if (o !== c) mg.appendChild(catTile(o, loaded ? (state[o.key] || []) : null)); });
    more.appendChild(mg);
    main.appendChild(more);
  }

  function render(groups) {
    if (IS_HOME) renderHome(groups);
    else renderCategory(groups || 'loading');
  }

  function group(products) {
    var groups = {}, fallback = 'gifts & more', keys = CATEGORIES.map(function (c) { return c.key; });
    BY_SLUG = {};
    products.forEach(function (p) {
      if (!isYes(p.show) || !p.name) return;
      var k = norm(p.category); if (keys.indexOf(k) === -1) k = fallback;
      p.cat = CATEGORIES[keys.indexOf(k)];
      p.views = buildViews(p, k);
      var base = slugify(p.slug || p.name), slug = base, n = 2;
      while (BY_SLUG[slug]) slug = base + '-' + (n++);
      p.slug = slug; BY_SLUG[slug] = p;
      (groups[k] = groups[k] || []).push(p);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return (sortNum(a.sort) - sortNum(b.sort)) || a.name.localeCompare(b.name); });
    });
    return groups;
  }

  // ---- Gallery pop-up -------------------------------------------------
  var BY_SLUG = {};
  if (!document.getElementById('gal')) { // the gallery markup lives here, not copied into every page
    var galWrap = document.createElement('div');
    galWrap.innerHTML =
      '<div class="gal" id="gal" role="dialog" aria-modal="true" aria-labelledby="gal-title" hidden>' +
      '<div class="box"><button type="button" class="close" aria-label="Close gallery">&times;</button>' +
      '<div class="media"><div class="stage">' +
      '<button type="button" class="navb prev" aria-label="Previous view">&#8249;</button>' +
      '<button type="button" class="navb next" aria-label="Next view">&#8250;</button></div>' +
      '<div class="cap" aria-live="polite"><b></b><small></small></div>' +
      '<div class="thumbs" role="group" aria-label="Product views"></div></div>' +
      '<div class="info"><h2 id="gal-title"></h2><div class="divider"></div><div class="price"></div><div class="lead"></div>' +
      '<p class="desc"></p><a class="btn" href="#">Order</a></div></div></div>';
    document.body.appendChild(galWrap.firstChild);
  }
  var gal = document.getElementById('gal'), box = gal.querySelector('.box'), stage = gal.querySelector('.stage'),
      thumbs = gal.querySelector('.thumbs'), capB = gal.querySelector('.cap b'), capS = gal.querySelector('.cap small'),
      prevB = gal.querySelector('.prev'), nextB = gal.querySelector('.next');
  var cur = null, idx = 0, isOpen = false, pushed = false, lastFocus = null;

  function ytEmbed(id) {
    return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&mute=1&loop=1&playlist=' + id + '&playsinline=1&rel=0&modestbranding=1';
  }

  function viewsOf(p) {
    if (p.views.length) return p.views;
    if (!isSample(p)) return [{ type:'none', caption:'' }]; // real product, no photo yet: neutral placeholder
    return [{ type:'img', link:p.cat.thumb, caption:'' }]; // no photos yet: same single image the card shows
  }

  function show(i) {
    var vs = viewsOf(cur);
    if (!vs.length) return;
    idx = (i + vs.length) % vs.length;
    var v = vs[idx];
    [].slice.call(stage.querySelectorAll('img,video,iframe,.nophoto')).forEach(function (n) { n.remove(); });
    var node;
    if (v.type === 'none') {
      node = noPhoto();
    } else if (v.type === 'img') {
      node = el('img'); node.alt = cur.name + (v.caption ? ' \u2014 ' + v.caption : ''); node.decoding = 'async';
      setSrc(node, imgSrc(v.link, 1600));
      node.onerror = function () { dropView(v); };
    } else if (v.type === 'mp4') {
      node = el('video'); node.muted = true; node.defaultMuted = true; node.loop = true; node.controls = true; node.autoplay = true;
      node.setAttribute('muted', ''); node.setAttribute('playsinline', ''); node.preload = 'auto';
      node.setAttribute('aria-label', cur.name + ' \u2014 ' + (v.caption || 'video'));
      node.src = v.src;
    } else {
      node = el('iframe'); node.title = cur.name + ' \u2014 ' + (v.caption || 'video');
      node.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      node.src = v.type === 'yt' ? ytEmbed(v.id) : 'https://drive.google.com/file/d/' + v.id + '/preview';
    }
    stage.insertBefore(node, prevB);
    if (node.tagName === 'VIDEO') { var pr = node.play(); if (pr && pr.catch) pr.catch(function () {}); }
    capB.textContent = v.caption || '';
    capS.textContent = vs.length > 1 ? (idx + 1) + ' of ' + vs.length : '';
    prevB.hidden = nextB.hidden = vs.length < 2;
    [].slice.call(thumbs.children).forEach(function (t, j) { t.setAttribute('aria-current', j === idx ? 'true' : 'false'); });
    // warm the neighbours so arrows feel instant
    [idx + 1, idx - 1].forEach(function (j) { var n = vs[(j + vs.length) % vs.length]; if (n && n.type === 'img') setSrc(new Image(), imgSrc(n.link, 1600)); });
  }

  // An image that fails to load (deleted, or Drive file not shared) is simply removed from the gallery.
  function dropView(v) {
    var j = cur.views.indexOf(v);
    if (j < 0) return;
    cur.views.splice(j, 1);
    var wasShown = j === idx;
    if (j < idx) idx--;
    buildThumbs();
    if (wasShown) show(Math.min(j, viewsOf(cur).length - 1));
    else show(idx);
    var badge = document.querySelector('a.ph[href="#p/' + cur.slug + '"] .views');
    if (badge) {
      var nI = cur.views.filter(function (x) { return x.type === 'img'; }).length;
      if (cur.views.length < 2) badge.remove();
      else badge.textContent = nI + (nI === 1 ? ' photo' : ' photos') + (cur.views.length > nI ? ' + video' : '');
    }
  }

  function buildThumbs() {
    thumbs.innerHTML = '';
    var vs = viewsOf(cur);
    thumbs.hidden = vs.length < 2;
    vs.forEach(function (v, j) {
      if (v.type === 'none') return; // "Photo coming soon" placeholder: nothing to thumbnail
      var b = el('button', 'thumb' + (v.type === 'img' ? '' : ' vid')); b.type = 'button';
      b.setAttribute('aria-label', 'View ' + (j + 1) + (v.caption ? ': ' + v.caption : '') + (v.type === 'img' ? '' : ' (video)'));
      if (v.type === 'img') {
        var t = el('img'); t.alt = ''; t.loading = 'lazy'; setSrc(t, imgSrc(v.link, 200));
        t.onerror = function () { dropView(v); };
        b.appendChild(t);
      } else if (v.type === 'yt' || v.type === 'drive') {
        var ti = el('img'); ti.alt = ''; ti.loading = 'lazy';
        setSrc(ti, v.type === 'yt' ? 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg' : 'https://lh3.googleusercontent.com/d/' + v.id + '=w200');
        ti.onerror = function () { this.remove(); };
        b.appendChild(ti);
      } else {
        var tv = el('video'); tv.muted = true; tv.setAttribute('muted', ''); tv.setAttribute('playsinline', ''); tv.preload = 'metadata';
        tv.tabIndex = -1; tv.setAttribute('aria-hidden', 'true'); tv.src = v.src + (v.src.indexOf('#') < 0 ? '#t=0.5' : '');
        b.appendChild(tv);
      }
      b.addEventListener('click', function () { show(j); });
      thumbs.appendChild(b);
    });
  }

  function setInert(on) {
    [].slice.call(document.body.children).forEach(function (n) {
      if (n === gal || n.tagName === 'SCRIPT') return;
      if (on) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
    });
  }

  function openGal(p) {
    if (!isOpen) lastFocus = document.activeElement;
    cur = p; isOpen = true;
    gal.querySelector('#gal-title').textContent = p.name;
    var pr = gal.querySelector('.info .price'), ld = gal.querySelector('.info .lead'), ds = gal.querySelector('.info .desc'), ob = gal.querySelector('.info .btn');
    pr.textContent = p.price || ''; pr.hidden = !p.price;
    ld.textContent = p.lead || ''; ld.hidden = !p.lead;
    ds.textContent = p.description || ''; ds.hidden = !p.description;
    ob.href = orderHref(p);
    if (safeLink(p.link)) { ob.target = '_blank'; ob.rel = 'noopener'; } else { ob.removeAttribute('target'); ob.removeAttribute('rel'); }
    buildThumbs();
    gal.hidden = false; gal.classList.add('open'); document.documentElement.classList.add('gal-lock'); setInert(true);
    box.scrollTop = 0;
    show(0);
    gal.querySelector('.close').focus();
  }

  function hideGal() {
    if (!isOpen) return;
    isOpen = false;
    [].slice.call(stage.querySelectorAll('img,video,iframe,.nophoto')).forEach(function (n) { n.remove(); }); // stops video
    thumbs.innerHTML = '';
    gal.classList.remove('open'); gal.hidden = true; document.documentElement.classList.remove('gal-lock'); setInert(false);
    var back = lastFocus && document.contains(lastFocus) ? lastFocus : document.querySelector('a.ph[href="#p/' + (cur && cur.slug) + '"]');
    if (back && back.focus) back.focus();
  }

  function closeGal() {
    if (!isOpen) return;
    if (pushed) { pushed = false; history.back(); return; } // hashchange -> route() -> hideGal()
    var sec = IS_HOME && cur && cur.cat ? '#' + cur.cat.id : '';
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + sec);
    hideGal();
  }

  function route() {
    var m = location.hash.match(/^#p\/([^\/?#]+)/), p = null;
    if (m) { try { p = BY_SLUG[decodeURIComponent(m[1]).toLowerCase()]; } catch (e) {} }
    if (p) openGal(p); else { pushed = false; hideGal(); }
  }

  gal.querySelector('.close').addEventListener('click', closeGal);
  prevB.addEventListener('click', function () { show(idx - 1); });
  nextB.addEventListener('click', function () { show(idx + 1); });
  gal.addEventListener('click', function (e) { if (e.target === gal) closeGal(); });
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeGal(); return; }
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === 'ArrowLeft' && tag !== 'VIDEO') { show(idx - 1); }
    else if (e.key === 'ArrowRight' && tag !== 'VIDEO') { show(idx + 1); }
    else if (e.key === 'Tab') { // focus trap
      var f = [].slice.call(gal.querySelectorAll('button:not([hidden]), a[href], video[controls], iframe'))
        .filter(function (n) { return n.offsetParent !== null && !n.closest('[hidden]'); });
      if (!f.length) return;
      var a = f.indexOf(document.activeElement);
      if (e.shiftKey && (a <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (a === f.length - 1 || a < 0)) { e.preventDefault(); f[0].focus(); }
    }
  });
  // swipe left/right on the main view (phones)
  var sx = null, sy = 0;
  stage.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive:true });
  stage.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) show(idx + (dx < 0 ? 1 : -1));
  }, { passive:true });
  // clicking a product card (anywhere except the Order button) opens its gallery
  document.getElementById('sections').addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.ph, .prod h3 a');
    var card = e.target.closest && e.target.closest('.prod');
    if (!card || (e.target.closest('.btn'))) return;
    if (!a) a = card.querySelector('a.ph');
    if (!a) return;
    e.preventDefault();
    pushed = true;
    if (location.hash === a.getAttribute('href')) route(); else location.hash = a.getAttribute('href');
  });
  window.addEventListener('hashchange', route);

  // ---- Mobile menu ------------------------------------------------------
  document.documentElement.classList.add('js');
  var menuBtn = document.querySelector('.menu-btn'), siteNav = document.getElementById('sitenav');
  function setMenu(open) { menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); siteNav.classList.toggle('open', open); }
  if (menuBtn && siteNav) {
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && siteNav.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (siteNav.classList.contains('open') && !(e.target.closest && e.target.closest('.topbar'))) setMenu(false);
    });
    siteNav.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) setMenu(false); });
  }

  render(null); // home: tiles right away (and as the fallback); category page: a loading line
  var ctl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
  fetch(CSV_URL, { cache:'no-store', signal: ctl ? ctl.signal : undefined })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (t) {
      clearTimeout(timer);
      if (/^\s*</.test(t)) throw new Error('Not CSV (sheet may not be shared publicly)');
      render(group(toObjects(parseCSV(t))));
      var dl = location.hash.match(/^#p\/([^\/?#]+)/);
      if (dl) {
        var p = null; try { p = BY_SLUG[decodeURIComponent(dl[1]).toLowerCase()]; } catch (e) {}
        if (p && IS_HOME) { var s2 = document.getElementById(p.cat.id); if (s2) s2.scrollIntoView(); }
        route(); // shared / QR deep link: #p/<slug>
      } else if (location.hash) { var t2 = document.getElementById(location.hash.slice(1)); if (t2) t2.scrollIntoView(); }
    })
    .catch(function (e) {
      clearTimeout(timer);
      if (window.console) console.warn('Catalog not loaded:', e);
      if (!IS_HOME) renderCategory('error');
    });
})();

