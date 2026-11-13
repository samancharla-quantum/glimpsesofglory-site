/* Glimpses of Glory cart settings. The ONE switch for the cart:
   enabled: false  -> no cart anywhere; every product keeps its email "Order" button (the site works exactly as before).
   enabled: true   -> "Add to cart" buttons + cart drawer; the email order link stays under each button as a fallback. */
window.GOG_CART = {
  enabled: true,
  // Checkout service (Cloudflare Worker, LIVE Square payments). Stage 6, approved by Satish Nov 13 2026.
  workerUrl: 'https://gog-cart-prod.jolly-base-8339.workers.dev',
  pickupText: "Free pickup in Brooklyn Park, MN. We'll contact you to arrange a time within 2-3 days."
};
