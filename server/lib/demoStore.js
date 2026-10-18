// demoStore.js — a server-side sample Etsy shop for the reviewer/demo account.
// Lets reviewers exercise every EtsyOps tool 24/7 with no connected Etsy shop.
// Result shapes mirror what the etsy.js client returns (plus the derived
// analysis fields EtsyOps computes), so ChatGPT sees the same formats whether a
// call was served here or from live Etsy. Clearly illustrative demo data — never
// presented as a real shop's live figures.

export const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'reviewer@etsyops.demo').toLowerCase();

const SHOP = { shop_id: 900001, shop_name: 'MapleAndMoss', currency: 'USD' };

// The sample listings. `_meta` holds the derived signals EtsyOps surfaces
// (views/sales trend, an SEO score, and detected issues) — computed by the
// engine over live listings, canned here for the demo.
const LISTINGS = [
  {
    listing_id: 700101, title: 'Hand-poured Soy Candle — Cedar & Sage, 8oz Amber Jar',
    state: 'active', type: 'physical', price: 24.0, currency: 'USD', quantity: 42, sku: 'CNDL-CS-8',
    tags: ['soy candle', 'cedar sage candle', 'hand poured candle', 'amber jar candle', 'housewarming gift', 'cozy home decor', 'natural candle', 'aromatherapy'],
    url: 'https://www.etsy.com/listing/700101', created: '2025-11-02',
    _meta: { views_30d: 1840, favorites: 312, sales_30d: 58, revenue_30d: 1392.0, seo_score: 82, issues: [] },
  },
  {
    listing_id: 700102, title: 'Minimalist Digital Wedding Invitation Template — Editable Canva Set',
    state: 'active', type: 'download', price: 12.5, currency: 'USD', quantity: 999, sku: 'WED-INV-01',
    tags: ['wedding invitation', 'digital invitation', 'canva template', 'editable invite', 'minimalist wedding', 'printable invitation', 'wedding suite', 'modern wedding'],
    url: 'https://www.etsy.com/listing/700102', created: '2025-09-18',
    _meta: { views_30d: 4210, favorites: 980, sales_30d: 173, revenue_30d: 2162.5, seo_score: 88, issues: [] },
  },
  {
    listing_id: 700103, title: 'Custom Pet Portrait — Hand-painted Watercolor from Your Photo',
    state: 'active', type: 'physical', price: 65.0, currency: 'USD', quantity: 10, sku: 'PET-WC',
    tags: ['pet portrait', 'custom dog portrait', 'watercolor pet', 'pet memorial gift', 'cat portrait', 'personalized pet art', 'dog mom gift', 'pet loss gift'],
    url: 'https://www.etsy.com/listing/700103', created: '2025-08-05',
    _meta: { views_30d: 920, favorites: 210, sales_30d: 14, revenue_30d: 910.0, seo_score: 74, issues: ['Long production time (14 days) may hurt conversion vs. category'] },
  },
  {
    // The clearly-underperforming listing the audit flags.
    listing_id: 700104, title: 'Ceramic Coffee Mug', // weak, generic title
    state: 'active', type: 'physical', price: 18.0, currency: 'USD', quantity: 30, sku: 'MUG-01',
    tags: ['mug', 'coffee mug', 'ceramic'], // only 3 of 13 tags used
    url: 'https://www.etsy.com/listing/700104', created: '2025-10-21',
    _meta: {
      views_30d: 96, favorites: 7, sales_30d: 1, revenue_30d: 18.0, seo_score: 31,
      issues: [
        'Title is generic (17 chars) — missing materials, style, use-case, buyer keywords',
        'Only 3 of 13 tags used; no long-tail terms',
        'No alt-text on images',
        'Views far below shop median — low search visibility',
      ],
    },
  },
  {
    listing_id: 700105, title: '2026 Digital Planner PDF — GoodNotes / iPad Hyperlinked',
    state: 'draft', type: 'download', price: 15.0, currency: 'USD', quantity: 999, sku: 'PLAN-26',
    tags: ['digital planner', '2026 planner', 'goodnotes planner', 'ipad planner', 'hyperlinked planner'],
    url: null, created: '2026-01-04',
    _meta: { views_30d: 0, favorites: 0, sales_30d: 0, revenue_30d: 0, seo_score: 61, issues: ['Draft — not yet published'] },
  },
  {
    listing_id: 700106, title: 'Macrame Wall Hanging — Boho Cotton, 24in',
    state: 'expired', type: 'physical', price: 48.0, currency: 'USD', quantity: 0, sku: 'MAC-24',
    tags: ['macrame wall hanging', 'boho decor', 'cotton macrame', 'fiber art', 'wall tapestry'],
    url: 'https://www.etsy.com/listing/700106', created: '2025-06-11',
    _meta: { views_30d: 40, favorites: 88, sales_30d: 0, revenue_30d: 0, issues: ['Expired + sold out — renew or retire; had 88 favorites (latent demand)'], seo_score: 70 },
  },
];

const byId = (id) => LISTINGS.find((l) => String(l.listing_id) === String(id));
const pub = (l) => ({
  listing_id: l.listing_id, title: l.title, state: l.state, type: l.type, price: l.price, currency: l.currency,
  quantity: l.quantity, sku: l.sku, tags: l.tags, url: l.url, created: l.created, ...l._meta,
});

// Sample reviews with recurring complaint themes (for review mining).
const REVIEWS = [
  { listing_id: 700101, rating: 5, text: 'Smells amazing and burns clean!' },
  { listing_id: 700101, rating: 3, text: 'Lovely candle but shipping took almost two weeks.' },
  { listing_id: 700103, rating: 4, text: 'Beautiful portrait, though it took longer than I expected to arrive.' },
  { listing_id: 700104, rating: 2, text: 'Mug is fine but the handle felt smaller than the photos suggested.' },
  { listing_id: 700101, rating: 4, text: 'Great scent — arrived a bit slowly and the box was a little dented.' },
  { listing_id: 700103, rating: 5, text: 'Exactly like my dog! Packaging was gorgeous.' },
  { listing_id: 700104, rating: 3, text: 'Cute but smaller than I imagined. Wish the size was clearer.' },
];

// Sample customer messages awaiting a reply.
const MESSAGES = [
  { message_id: 'msg-8801', from: 'buyer_lauren', listing_id: 700103, text: 'Hi! Could I get the pet portrait by the 20th for a birthday? And can you do two pets in one?' },
  { message_id: 'msg-8802', from: 'buyer_marco', listing_id: 700101, text: 'My candle arrived with a cracked lid. Can you help?' },
];

// ── the demo executor ────────────────────────────────────────────────────────
export async function demoExec(userId, tool, args = {}) {
  switch (tool) {
    case 'search_shop_listings': {
      const state = (args.state || 'active').toLowerCase();
      let rows = LISTINGS.filter((l) => state === 'all' || l.state === state);
      if (args.query) {
        const q = String(args.query).toLowerCase();
        rows = rows.filter((l) => (l.title + ' ' + l.tags.join(' ')).toLowerCase().includes(q));
      }
      if (args.underperforming) rows = rows.filter((l) => (l._meta.seo_score ?? 100) < 50 || (l._meta.sales_30d ?? 0) <= 1);
      rows.sort((a, b) => (b._meta.revenue_30d || 0) - (a._meta.revenue_30d || 0));
      return { shop: SHOP.shop_name, state, count: rows.length, results: rows.map(pub) };
    }
    case 'get_listing': {
      const l = byId(args.listingId);
      if (!l) throw new Error('Listing not found in this shop.');
      return { ...pub(l), issues: l._meta.issues || [] };
    }
    case 'generate_listing_content': {
      // Produce Etsy-ready SEO for an existing listing or a described product.
      const l = args.listingId ? byId(args.listingId) : null;
      const subject = l ? l.title : (args.product || 'Ceramic coffee mug');
      if (l && l.listing_id === 700104) {
        return {
          for: subject,
          suggested_title: 'Speckled Ceramic Coffee Mug, 12oz Handmade Stoneware Mug, Minimalist Cottagecore Kitchen, Coffee Lover Gift',
          suggested_tags: ['ceramic mug', 'handmade mug', 'stoneware mug', 'speckled mug', 'coffee lover gift', 'cottagecore kitchen', 'minimalist mug', '12oz mug', 'pottery mug', 'housewarming gift', 'unique coffee mug', 'rustic mug', 'gift for her'],
          suggested_description: 'Wheel-thrown 12oz stoneware mug with a hand-glazed speckled finish. Microwave- and dishwasher-safe. Each mug is slightly unique. A cozy gift for coffee and tea lovers. Ships in 2–3 business days in protective packaging.',
          alt_text_example: 'Speckled cream ceramic coffee mug on a wooden table with morning light',
          why: 'Original title used 17 of 140 characters and 3 of 13 tags. Adding material, size, style, and buyer-intent keywords is the single biggest lever for this listing’s visibility.',
          note: 'Review before publishing — this is a draft suggestion, not auto-applied. Use update_listing to apply.',
        };
      }
      return {
        for: subject,
        suggested_title: `${subject} — Handmade, Unique Gift, ${new Date().getFullYear()}`,
        suggested_tags: ['handmade', 'unique gift', 'gift for her', 'gift for him', 'home decor', 'personalized', 'small batch', 'made to order', 'cottagecore', 'minimalist', 'housewarming', 'boho', 'artisan'],
        suggested_description: `Thoughtfully made ${subject.toLowerCase()}. Describe materials, dimensions, care, and shipping here. Lead with the buyer’s use-case and the gift occasion.`,
        alt_text_example: `${subject} styled photo with natural light`,
        note: 'Draft SEO suggestion — review and edit before publishing.',
      };
    }
    case 'analyze_shop_performance': {
      const active = LISTINGS.filter((l) => l.state === 'active');
      const revenue = LISTINGS.reduce((s, l) => s + (l._meta.revenue_30d || 0), 0);
      const orders = LISTINGS.reduce((s, l) => s + (l._meta.sales_30d || 0), 0);
      const fees = +(revenue * 0.095 + orders * 0.2).toFixed(2); // ~6.5% + payment + $0.20 listing, illustrative
      const ranked = [...active].sort((a, b) => (b._meta.revenue_30d || 0) - (a._meta.revenue_30d || 0));
      return {
        shop: SHOP.shop_name, period: 'last 30 days', currency: 'USD',
        revenue_30d: +revenue.toFixed(2), orders_30d: orders, estimated_fees_30d: fees,
        net_estimate_30d: +(revenue - fees).toFixed(2), avg_order_value: +(revenue / Math.max(orders, 1)).toFixed(2),
        best_sellers: ranked.slice(0, 2).map((l) => ({ listing_id: l.listing_id, title: l.title, revenue_30d: l._meta.revenue_30d, sales_30d: l._meta.sales_30d })),
        underperformers: active.filter((l) => (l._meta.seo_score ?? 100) < 50 || (l._meta.sales_30d ?? 0) <= 1).map((l) => ({ listing_id: l.listing_id, title: l.title, views_30d: l._meta.views_30d, sales_30d: l._meta.sales_30d, top_issue: (l._meta.issues || [])[0] })),
        recommendations: [
          'Fix listing 700104 (Ceramic Coffee Mug) SEO — biggest visibility gap in the shop.',
          'Renew listing 700106 (Macrame) — it has 88 favorites but is expired (latent demand).',
          'Publish the 2026 Planner draft (700105) before Q1 planning season peaks.',
        ],
      };
    }
    case 'analyze_reviews': {
      const clusters = [
        { complaint: 'Shipping slower than expected', mentions: 3, severity: 0.55, affected_listings: [700101, 700103], recommended_action: 'Set realistic processing times and add a dispatch note; consider a faster ship option.' },
        { complaint: 'Item size unclear vs. photos (mug handle)', mentions: 2, severity: 0.6, affected_listings: [700104], recommended_action: 'Add dimensions + a size-reference photo to listing 700104; update the description.' },
        { complaint: 'Packaging damaged in transit', mentions: 1, severity: 0.4, affected_listings: [700101], recommended_action: 'Reinforce candle-lid packaging; proactively offer replacements.' },
      ];
      return { shop: SHOP.shop_name, review_count_analyzed: REVIEWS.length, clusters };
    }
    case 'draft_customer_reply': {
      const m = args.messageId ? MESSAGES.find((x) => x.message_id === args.messageId) : null;
      const text = m ? m.text : (args.text || '');
      let reply;
      if (m && m.message_id === 'msg-8801') {
        reply = 'Hi Lauren! Yes — I can have the watercolor pet portrait ready to arrive by the 20th if we finalize the photo in the next 2 days. I’d be happy to include both pets in one piece for a small add-on; I’ll send a custom option. Could you share clear photos of each pet? Thank you!';
      } else if (m && m.message_id === 'msg-8802') {
        reply = 'Hi Marco, I’m so sorry your candle arrived with a cracked lid! I’ll ship a replacement today at no charge — no need to return the original. Could you confirm your address is still correct? Thanks for your patience.';
      } else {
        reply = `Thank you so much for reaching out! ${text ? '' : ''}Happy to help — here’s the info you need… (edit before sending).`;
      }
      return { for_message: m?.message_id || null, draft_reply: reply, note: 'Draft only — review and send from Etsy Messages.' };
    }
    case 'create_draft_listing': {
      const id = 700200 + Math.floor((Date.now() / 1000) % 799);
      return {
        created: true,
        listing: { listing_id: id, state: 'draft', title: args.title || 'Untitled draft', type: args.type || 'physical', price: args.price ?? 0, currency: 'USD', quantity: args.quantity ?? 1, tags: args.tags || [] },
        note: 'Demo shop: a draft was simulated (not published). On a connected shop this creates a real Etsy draft you can review and publish.',
      };
    }
    case 'update_listing': {
      const l = byId(args.listingId);
      if (!l) throw new Error('Listing not found in this shop.');
      const applied = {};
      for (const k of ['title', 'price', 'quantity', 'tags', 'state', 'description']) if (k in args) applied[k] = args[k];
      return { updated: true, listing_id: l.listing_id, applied, note: 'Demo shop: update simulated (not saved). On a connected shop this patches the real listing.' };
    }
    default:
      throw new Error(`Unknown demo tool: ${tool}`);
  }
}
