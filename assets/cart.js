/* Glimpses of Glory cart: keeps the cart in this browser (localStorage), shows a drawer with a live
   shipping/discount preview (same rules as the checkout service: assets/cart-rules.js), and hands off to
   secure checkout. Turned on/off by window.GOG_CART.enabled in assets/cart-config.js. */
(function () {
  var CFG = window.GOG_CART || {};
  var R = window.GOGRules;
  var API = { enabled: false, canBuy: function () { return false; } };
  window.GOGCart = API;
  if (!CFG.enabled || !R) return;
  API.enabled = true;

  var KEY = 'gog-cart-v1';
  var SCRIPT = document.currentScript || document.querySelector('script[src*="cart.js"]');
  var ROOT = '/'; try { ROOT = new URL('..', SCRIPT.src).pathname; } catch (e) {}

  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); s.items = Array.isArray(s.items) ? s.items : []; s.fulfillment = s.fulfillment === 'pickup' ? 'pickup' : 'ship'; s.pickup = s.pickup || {}; return s; }
    catch (e) { return { items: [], fulfillment: 'ship', pickup: {} }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var state = load();

  // Thank-you page empties the cart.
  if (document.body.hasAttribute('data-clear-cart')) { state = { items: [], fulfillment: state.fulfillment, pickup: {} }; save(); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function money(c) { return R.fmt(c); }
  function priceCents(text) { var m = String(text || '').match(/\$\s*(\d+(?:\.\d{1,2})?)/); return m ? Math.round(parseFloat(m[1]) * 100) : 0; }
  function units() { return state.items.reduce(function (a, i) { return a + i.qty; }, 0); }

  API.priceCents = priceCents;
  API.canBuy = function (p) { return !!(p && p.sku && /^GOG-\d\d-[A-Z0-9-]+$/i.test(p.sku) && priceCents(p.price) > 0); };
  API.add = function (p, qty, photo) {
    qty = qty || 1;
    var sku = p.sku.toUpperCase(), it = state.items.filter(function (i) { return i.sku === sku; })[0];
    if (it) it.qty = Math.min(R.RULES.MAX_QTY_PER_LINE, it.qty + qty);
    else state.items.push({ sku: sku, qty: Math.min(R.RULES.MAX_QTY_PER_LINE, qty), name: p.name, priceCents: priceCents(p.price), photo: photo || '' });
    save(); paint(); toast('Added to cart: ' + p.name);
  };
  API.open = function () { openDrawer(); };

  // ---- Markup ---------------------------------------------------------------
  var btn = el('button', 'cart-btn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-controls', 'cartdrawer');
  btn.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5.2 4l.4 2H21l-2.4 8.4a2 2 0 0 1-1.9 1.6H8.1a2 2 0 0 1-2-1.6L3.6 2H1V0h4.2l.4 2Z" transform="translate(0 1)"/></svg><span class="lbl">Cart</span><span class="count" aria-live="polite">0</span>';
  var bar = document.querySelector('.topbar .in');
  if (bar) { var menu = bar.querySelector('.menu-btn'); bar.insertBefore(btn, menu || null); }

  var wrap = el('div', 'cartdrawer'); wrap.id = 'cartdrawer'; wrap.hidden = true;
  wrap.innerHTML =
    '<div class="cd-shade" data-close></div>' +
    '<aside class="cd-panel" role="dialog" aria-modal="true" aria-labelledby="cd-title">' +
    '<div class="cd-head"><h2 id="cd-title">Your cart</h2><button type="button" class="cd-x" data-close aria-label="Close cart">&times;</button></div>' +
    '<div class="cd-body"><ul class="cd-lines"></ul><p class="cd-empty">Your cart is empty. Browse the shop and tap \u201cAdd to cart\u201d.</p>' +
    '<div class="cd-hints"></div>' +
    '<fieldset class="cd-ful"><legend>How would you like to get it?</legend>' +
    '<label><input type="radio" name="cd-ful" value="ship"> <span><b>Ship it to me</b><small>$9.95 per order &middot; free at $60+ &middot; cards only (up to 5): $2</small></span></label>' +
    '<label><input type="radio" name="cd-ful" value="pickup"> <span><b>Pick up (free)</b><small class="cd-pktext"></small></span></label>' +
    '<div class="cd-pk"><label>Name for pickup<input type="text" name="cd-name" autocomplete="name" maxlength="60"></label>' +
    '<label>Phone (we\u2019ll text you)<input type="tel" name="cd-phone" autocomplete="tel" maxlength="20"></label></div></fieldset>' +
    '<dl class="cd-sum"></dl><p class="cd-note">Final total is confirmed on the secure checkout page. No sales tax is added.</p>' +
    '<p class="cd-err" role="alert"></p></div>' +
    '<div class="cd-foot"><button type="button" class="btn cd-go">Checkout</button>' +
    '<a class="cd-mail" href="mailto:hello@glimpsesofglory.shop">Prefer email? Send us your order</a></div>' +
    '</aside>';
  document.body.appendChild(wrap);
  var $ = function (s) { return wrap.querySelector(s); };
  $('.cd-pktext').textContent = CFG.pickupText || 'Free pickup in Brooklyn Park, MN.';
  var live = el('div', 'cart-toast'); live.setAttribute('role', 'status'); document.body.appendChild(live);

  var toastT;
  function toast(msg) {
    live.textContent = msg; live.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(function () { live.classList.remove('show'); }, 2600);
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
  }

  // ---- Paint ----------------------------------------------------------------
  function quote() {
    return R.priceCart(state.items.map(function (i) { return { sku: i.sku, qty: i.qty, unitCents: i.priceCents }; }), state.fulfillment);
  }

  function paint() {
    var n = units();
    btn.querySelector('.count').textContent = n; btn.classList.toggle('has', n > 0);
    btn.setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items'));
    var ul = $('.cd-lines'); ul.innerHTML = '';
    state.items.forEach(function (it) {
      var li = el('li', 'cd-line');
      var im = el('div', 'cd-thumb');
      if (it.photo) { var img = el('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = it.photo; img.onerror = function () { this.remove(); }; im.appendChild(img); }
      li.appendChild(im);
      var mid = el('div', 'cd-mid'); mid.appendChild(el('div', 'cd-name', it.name)); mid.appendChild(el('div', 'cd-each', money(it.priceCents) + ' each'));
      var q = el('div', 'cd-qty');
      var minus = el('button', null, '\u2212'); minus.type = 'button'; minus.setAttribute('aria-label', 'One fewer ' + it.name);
      var inp = el('input'); inp.type = 'number'; inp.min = 1; inp.max = R.RULES.MAX_QTY_PER_LINE; inp.value = it.qty; inp.setAttribute('aria-label', 'Quantity of ' + it.name); inp.inputMode = 'numeric';
      var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'One more ' + it.name);
      var rm = el('button', 'cd-rm', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + it.name);
      minus.onclick = function () { setQty(it.sku, it.qty - 1); };
      plus.onclick = function () { setQty(it.sku, it.qty + 1); };
      inp.onchange = function () { setQty(it.sku, parseInt(inp.value, 10) || 0); };
      rm.onclick = function () { setQty(it.sku, 0); };
      q.appendChild(minus); q.appendChild(inp); q.appendChild(plus); q.appendChild(rm);
      mid.appendChild(q); li.appendChild(mid);
      li.appendChild(el('div', 'cd-lt', money(it.priceCents * it.qty)));
      ul.appendChild(li);
    });
    var empty = !state.items.length;
    $('.cd-empty').hidden = !empty;
    [$('.cd-ful'), $('.cd-sum'), $('.cd-note'), $('.cd-hints')].forEach(function (x) { x.hidden = empty; });
    $('.cd-go').disabled = empty;
    [].slice.call(wrap.querySelectorAll('input[name="cd-ful"]')).forEach(function (r) { r.checked = r.value === state.fulfillment; });
    $('.cd-pk').hidden = state.fulfillment !== 'pickup';
    $('input[name="cd-name"]').value = state.pickup.name || '';
    $('input[name="cd-phone"]').value = state.pickup.phone || '';
    if (empty) return;
    var qt = quote(), sum = $('.cd-sum'); sum.innerHTML = '';
    function row(k, v, cls) { var d = el('div', cls || ''); d.appendChild(el('dt', null, k)); d.appendChild(el('dd', null, v)); sum.appendChild(d); }
    row('Subtotal', money(qt.subtotal));
    if (qt.discount) row('Coasters 4 for $20 (\u00d7' + qt.coasterGroups + ')', '\u2212' + money(qt.discount), 'disc');
    row(qt.method === 'pickup' ? 'Pickup' : qt.method === 'free' ? 'Shipping (free at $60+)' : qt.method === 'cards' ? 'Card mail (up to 5 cards)' : 'Shipping', qt.shipping ? money(qt.shipping) : 'Free');
    row('Estimated total', money(qt.total), 'tot');
    var hints = $('.cd-hints'); hints.innerHTML = '';
    if (qt.coasterUnits && qt.coastersToNextGroup) hints.appendChild(el('p', null, 'Add ' + qt.coastersToNextGroup + ' more coaster' + (qt.coastersToNextGroup === 1 ? '' : 's') + ' (any designs) to get 4 for $20.'));
    if (state.fulfillment === 'ship' && qt.toFreeShipping > 0) hints.appendChild(el('p', null, 'Add ' + money(qt.toFreeShipping) + ' more for free shipping.'));
    if (state.fulfillment === 'ship' && qt.cardsOnly && qt.cardUnits > R.RULES.CARD_SHIP_MAX_CARDS && qt.method === 'flat') hints.appendChild(el('p', null, 'Card mail is $2 for up to 5 cards; larger card orders ship as a package.'));
    hints.hidden = !hints.children.length;
  }

  function setQty(sku, q) {
    q = Math.max(0, Math.min(R.RULES.MAX_QTY_PER_LINE, q));
    state.items = state.items.map(function (i) { if (i.sku === sku) i.qty = q; return i; }).filter(function (i) { return i.qty > 0; });
    save(); paint();
  }

  wrap.addEventListener('change', function (e) {
    if (e.target.name === 'cd-ful') { state.fulfillment = e.target.value; save(); paint(); }
  });
  wrap.addEventListener('input', function (e) {
    if (e.target.name === 'cd-name') { state.pickup.name = e.target.value; save(); }
    if (e.target.name === 'cd-phone') { state.pickup.phone = e.target.value; save(); }
  });

  // ---- Open / close ---------------------------------------------------------
  var lastFocus = null;
  function openDrawer() {
    lastFocus = document.activeElement; paint(); $('.cd-err').textContent = '';
    wrap.hidden = false; requestAnimationFrame(function () { wrap.classList.add('open'); });
    document.documentElement.classList.add('cart-lock'); $('.cd-x').focus();
  }
  function closeDrawer() {
    wrap.classList.remove('open'); document.documentElement.classList.remove('cart-lock');
    setTimeout(function () { wrap.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  btn.addEventListener('click', openDrawer);
  wrap.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !wrap.hidden) closeDrawer(); });

  // ---- Checkout -------------------------------------------------------------
  $('.cd-go').addEventListener('click', function () {
    var err = $('.cd-err'), go = $('.cd-go'); err.textContent = '';
    if (state.fulfillment === 'pickup') {
      if ((state.pickup.name || '').trim().length < 2) { err.textContent = 'Please enter a name for pickup.'; $('input[name="cd-name"]').focus(); return; }
      if ((state.pickup.phone || '').replace(/\D/g, '').length < 10) { err.textContent = 'Please enter a phone number so we can arrange pickup.'; $('input[name="cd-phone"]').focus(); return; }
    }
    var body = { items: state.items.map(function (i) { return { sku: i.sku, qty: i.qty }; }), fulfillment: state.fulfillment };
    if (state.fulfillment === 'pickup') body.pickup = { name: state.pickup.name, phone: state.pickup.phone };
    go.disabled = true; go.textContent = 'Opening secure checkout\u2026';
    fetch(CFG.workerUrl.replace(/\/$/, '') + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.url) throw new Error(res.j.error || 'Checkout is briefly unavailable.');
        location.href = res.j.url;
      })
      .catch(function (e) {
        err.textContent = (e && e.message && !/fetch/i.test(e.message) ? e.message : 'Checkout is briefly unavailable.') + ' You can also email your order to hello@glimpsesofglory.shop.';
        go.disabled = false; go.textContent = 'Checkout';
      });
  });

  paint();
})();
