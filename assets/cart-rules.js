/* GENERATED from worker/src/rules.js by `npm run build:site-rules`. Do not edit here. */
(function (root) {
// Glimpses of Glory cart rules: pure functions, no network. Money is integer cents.
// Used by the Worker (authoritative) and copied to the site (assets/cart-rules.js) for the live preview.
// Approved by Satish, Nov 13 2026 (Stage 0 answers):
//   - Pickup in the north suburbs of Minneapolis: $0 shipping (buyer choice).
//   - Free shipping when the merchandise subtotal AFTER discounts is $60.00 or more (before tax and shipping).
//   - Cards-only orders of 1-5 cards: $2.00. Cards-only with 6+ cards: $9.95.
//   - Everything else: $9.95 flat per order.
//   - Coasters: "4 for $20" on ANY mix of single coasters (round and square): $12 off per group of 4 units.
//   - Sales tax: MN tax is not set up in Square, so no tax is computed. TODO: revisit with tax preparer.

const RULES = {
  FLAT_SHIP_CENTS: 995,
  CARD_SHIP_CENTS: 200,
  CARD_SHIP_MAX_CARDS: 5,
  FREE_SHIP_MIN_CENTS: 6000,
  COASTER_GROUP_SIZE: 4,
  COASTER_GROUP_DISCOUNT_CENTS: 1200,
  MAX_QTY_PER_LINE: 20,
  MAX_LINES: 25,
  MAX_UNITS: 100
};

// Product kind from the SKU. Cards: GOG-26-GC###. Single coasters: GOG-26-COSQ### / GOG-26-CORD###
// (a "-S4" Set of 4 variation is already priced at $20 in Square, so it is NOT counted toward the mix-and-match discount).
function kindOfSku(sku) {
  const s = String(sku || '').toUpperCase();
  if (/^GOG-\d\d-GC\d+/.test(s)) return 'card';
  if (/^GOG-\d\d-CO(SQ|RD)\d+$/.test(s)) return 'coaster';
  return 'other';
}

// Validate the raw cart from the browser. Returns { items:[{sku,qty}] } or throws Error with .status 400.
function validateCart(body) {
  const bad = (msg) => { const e = new Error(msg); e.status = 400; throw e; };
  if (!body || typeof body !== 'object') bad('Missing cart');
  const items = Array.isArray(body.items) ? body.items : bad('items must be a list');
  if (!items.length) bad('Your cart is empty');
  const merged = new Map();
  for (const it of items) {
    const sku = String((it && it.sku) || '').trim().toUpperCase();
    const qty = Number(it && it.qty);
    if (!/^GOG-\d\d-[A-Z0-9-]{2,30}$/.test(sku)) bad('Unknown item code');
    if (!Number.isInteger(qty) || qty < 1) bad('Quantity must be a whole number of at least 1');
    merged.set(sku, (merged.get(sku) || 0) + qty);
  }
  if (merged.size > RULES.MAX_LINES) bad('Too many different items in one order');
  let units = 0;
  for (const [, q] of merged) {
    if (q > RULES.MAX_QTY_PER_LINE) bad('Please order at most ' + RULES.MAX_QTY_PER_LINE + ' of one item online (email us for more)');
    units += q;
  }
  if (units > RULES.MAX_UNITS) bad('Order too large for online checkout (email us)');
  const fulfillment = body.fulfillment === 'pickup' ? 'pickup' : body.fulfillment === 'ship' ? 'ship' : bad('Choose shipping or pickup');
  let pickup = null;
  if (fulfillment === 'pickup') {
    const p = body.pickup || {};
    const name = String(p.name || '').trim().replace(/\s+/g, ' ');
    const phone = String(p.phone || '').replace(/[^\d+]/g, '');
    if (name.length < 2 || name.length > 60) bad('Please enter a name for pickup');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) bad('Please enter a phone number for pickup');
    pickup = { name, phone: digits.length === 10 ? '+1' + digits : '+' + digits };
  }
  return { items: [...merged].map(([sku, qty]) => ({ sku, qty })), fulfillment, pickup };
}

// lines: [{ sku, qty, unitCents, kind? }]  (unitCents must come from Square on the server)
// Returns the full price breakdown. Rounding: all integer cents.
function priceCart(lines, fulfillment) {
  const L = lines.map((l) => ({ ...l, kind: l.kind || kindOfSku(l.sku), lineCents: l.unitCents * l.qty }));
  const subtotal = L.reduce((a, l) => a + l.lineCents, 0);
  const coasterUnits = L.filter((l) => l.kind === 'coaster').reduce((a, l) => a + l.qty, 0);
  const groups = Math.floor(coasterUnits / RULES.COASTER_GROUP_SIZE);
  const discount = groups * RULES.COASTER_GROUP_DISCOUNT_CENTS;
  const afterDiscount = subtotal - discount;
  const cardUnits = L.filter((l) => l.kind === 'card').reduce((a, l) => a + l.qty, 0);
  const cardsOnly = L.length > 0 && L.every((l) => l.kind === 'card');

  let shipping, method, shipLabel;
  if (fulfillment === 'pickup') {
    shipping = 0; method = 'pickup'; shipLabel = 'Free pickup in the north suburbs of Minneapolis';
  } else if (afterDiscount >= RULES.FREE_SHIP_MIN_CENTS) {
    shipping = 0; method = 'free'; shipLabel = 'Free shipping (orders $60+)';
  } else if (cardsOnly && cardUnits <= RULES.CARD_SHIP_MAX_CARDS) {
    shipping = RULES.CARD_SHIP_CENTS; method = 'cards'; shipLabel = 'Card mail (up to 5 cards)';
  } else {
    shipping = RULES.FLAT_SHIP_CENTS; method = 'flat'; shipLabel = 'Shipping (USPS Ground Advantage)';
  }
  const tax = 0; // TODO: MN sales tax not set up in Square; confirm with tax preparer before enabling.
  return {
    lines: L, subtotal, coasterUnits, coasterGroups: groups, discount, afterDiscount,
    cardUnits, cardsOnly, shipping, method, shipLabel, tax, total: afterDiscount + shipping + tax,
    toFreeShipping: fulfillment === 'pickup' ? 0 : Math.max(0, RULES.FREE_SHIP_MIN_CENTS - afterDiscount),
    coastersToNextGroup: coasterUnits % RULES.COASTER_GROUP_SIZE === 0 ? 0 : RULES.COASTER_GROUP_SIZE - (coasterUnits % RULES.COASTER_GROUP_SIZE)
  };
}

// Split the coaster discount across coaster lines (by units, remainder to the first lines) so each
// line gets its own fixed-amount LINE_ITEM discount in the Square order. Sum always equals `discount`.
function allocateCoasterDiscount(lines, discount) {
  const coasters = lines.filter((l) => (l.kind || kindOfSku(l.sku)) === 'coaster');
  const units = coasters.reduce((a, l) => a + l.qty, 0);
  if (!discount || !units) return [];
  let left = discount;
  const out = coasters.map((l) => {
    const share = Math.floor((discount * l.qty) / units);
    left -= share;
    return { sku: l.sku, cents: share };
  });
  for (let i = 0; left > 0; i = (i + 1) % out.length) { out[i].cents += 1; left -= 1; }
  return out.filter((a) => a.cents > 0);
}

function fmt(cents) { return '$' + (cents / 100).toFixed(2); }

root.GOGRules = { RULES, kindOfSku, validateCart, priceCart, allocateCoasterDiscount, fmt };
})(typeof window !== "undefined" ? window : globalThis);
