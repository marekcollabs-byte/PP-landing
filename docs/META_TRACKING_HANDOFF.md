# Meta Purchase Tracking / CAPI Handoff

> Repo: `marekcollabs-byte/PP-landing`
> Production: `https://www.prvnipomoc.eu`
> Last handoff update: 2026-09-15
> Purpose: give Codex enough context to audit, verify and continue the Meta Purchase tracking work without reconstructing the prior debugging session.

## 0. Executive summary

The intended source of truth for **paid purchases** is now:

```text
Meta ad
  -> prvnipomoc.eu landing page
  -> SimpleShop checkout
  -> SimpleShop marks the product PAID
  -> product-level "Webhook po zaplacení"
  -> https://www.prvnipomoc.eu/api/simpleshop-paid
  -> Meta Conversions API
  -> Purchase event in dataset 1412041910578955
```

The server-side flow is proven to work for individual real purchases:

```text
1 real paid order
-> 1 GET /api/simpleshop-paid
-> HTTP 200
-> 1 Meta CAPI Purchase accepted
```

Example verified production event:

```text
eventId: simpleshop_12936974
value: 399
currency: CZK
eventsReceived: 1
```

However, a historical aggregate discrepancy is still unresolved:

```text
Period 2026-09-01 through 2026-09-09
SimpleShop paid orders: 27
Meta Events Manager browser Purchase events: 26
Meta Events Manager server Purchase events: 52
```

Do **not** assume that `52 server events = 52 attributed conversions`. The Events Manager UI explicitly notes that received events can later be excluded/deduplicated. Still, the roughly 2x server count needs to be explained before declaring the setup fully correct.

The current production webhook itself should not be rewritten blindly. Latest live checks showed it behaving 1:1 for individual orders.

---

## 1. Relevant Meta assets

- Meta dataset / pixel name: `PDF Ebook pixel`
- Dataset / Pixel ID: `1412041910578955`
- Ad account ID: `944238032987114`
- Business Portfolio ID: `297293009713006`
- Production domain: `www.prvnipomoc.eu`

The ad account was claimed into the Business Portfolio so the user could generate a Conversions API access token.

### Current Ads Manager behavior

In the ad-level Tracking section Meta shows `PDF Ebook pixel` as the selected website dataset. This is expected. CAPI is **not** selected as a second separate tracking source in the ad. Browser and server events feed the same Meta dataset.

---

## 2. Current repo state

### `index.html`

Current behavior:

- Meta Pixel ID `1412041910578955`
- fires `PageView`
- contains Facebook domain verification meta tag:

```html
<meta name="facebook-domain-verification" content="4p60306etnr3wg3roeov0kdt8k90g4" />
```

There is no repo-side `Purchase` event in `index.html`.

### `dekuji.html`

Current behavior:

- initializes Meta Pixel `1412041910578955`
- does **not** fire browser `Purchase`
- old JavaScript `fbq("track", "Purchase", ...)` was removed
- old noscript Purchase image was also removed

Current repo code search for `fbq Purchase` returns no result.

Important: the Meta Pixel base is intentionally still present on the page.

### `api/simpleshop-paid.js`

This is the current CAPI endpoint.

High-level behavior:

1. accepts GET or POST
2. authenticates with query/body `secret` against `SIMPLESHOP_WEBHOOK_SECRET`
3. takes an order identifier from:
   - `order_number`
   - fallback `number`
   - fallback `id`
4. parses `total` (fallback `price`) robustly
5. ignores unresolved SimpleShop placeholders such as `{customer_tel}`
6. hashes customer matching data with SHA-256
7. sends Meta CAPI `Purchase`
8. uses:

```js
event_id: `simpleshop_${orderNumber}`
```

9. sends actual paid `value` and `currency`
10. logs successful events without logging raw customer PII

Current event payload includes:

```js
{
  event_name: 'Purchase',
  event_time: Math.floor(Date.now() / 1000),
  event_id: `simpleshop_${orderNumber}`,
  action_source: 'website',
  event_source_url: 'https://www.prvnipomoc.eu/',
  user_data: {
    em,
    ph,
    fn,
    ln,
    country,
    external_id
  },
  custom_data: {
    currency,
    value,
    content_name: 'První pomoc u dětí',
    content_type: 'product'
  }
}
```

Not every `user_data` field is guaranteed to be present. Missing/empty SimpleShop values are omitted.

---

## 3. Vercel

Project:

- project name: `pp-landing`
- project ID: `prj_GGm9XSiFUEUb7YbUrBUa4awj8aSn`
- team ID: `team_95ROznQlzktLzJcivR4X5Y4a`

Expected production endpoint:

```text
https://www.prvnipomoc.eu/api/simpleshop-paid
```

### Environment variables

Expected production env vars:

```text
META_CAPI_ACCESS_TOKEN=<secret>
SIMPLESHOP_WEBHOOK_SECRET=<secret>
```

Optional/defaulted in code:

```text
META_PIXEL_ID=1412041910578955       # code has this fallback
META_GRAPH_API_VERSION=v26.0         # code has this fallback
```

`META_TEST_EVENT_CODE` was used temporarily during setup and then removed before production.

Do not add a test event code back to Production unless intentionally testing, otherwise live purchases may go to Test Events rather than normal production reporting.

### Vercel log limitation

The project was on a plan where runtime log retention available through tooling was approximately 1 hour. Historical request-by-request reconstruction for 1-9 September was therefore not possible later.

---

## 4. SimpleShop configuration

### Product-level paid webhook

The main ebook product uses **Webhook po zaplacení** (webhook after payment).

Current intended URL template:

```text
https://www.prvnipomoc.eu/api/simpleshop-paid?secret=REDACTED&order_number={id}&total={total}&currency={currency}&email={mail}&phone={customer_tel}&first_name={customer_firstname}&last_name={customer_lastname}&country={customer_country_code}&customer_id={id_customer}
```

Notes:

- `secret` must equal Vercel `SIMPLESHOP_WEBHOOK_SECRET`.
- Do not commit the actual secret.
- `{id}` is intentionally used as the stable order/document identifier passed into our `order_number` query parameter.
- Earlier `{order_number}` produced an empty value in live SimpleShop requests.
- Customer phone/country/customer ID may be optional. Endpoint must tolerate missing values.

### Global SimpleShop webhook

Checked manually in:

```text
Nastavení -> Propojení s dalšími systémy -> API / Webhook
```

The global webhook URL field was empty. Therefore it is not currently a known source of duplicate calls.

### Other products

A checked secondary product had both:

- `Webhook po objednání`: empty
- `Webhook po zaplacení`: empty

Therefore a second product-level webhook was not found in that product.

### Redirect after payment

A product has:

```text
URL po uhrazení = https://prvnipomoc.eu/dekuji.html
```

This is a redirect and is not the CAPI source.

---

## 5. Relevant commits / debugging timeline

### 1. Add server CAPI endpoint

Commit:

```text
96a8513119894d78bcc9fc8f183cc2643b25eb36
Add SimpleShop paid webhook for Meta CAPI
2026-08-19
```

Created:

```text
api/simpleshop-paid.js
```

Initial implementation:

- webhook secret authentication
- SHA-256 customer data hashing
- Meta CAPI `Purchase`
- actual value/currency
- deterministic `event_id = simpleshop_<order identifier>`
- temporary support for Meta test event code

### 2. Remove browser Purchase from thank-you page

Commit:

```text
141f68047f6263dc072b98dd2b3ebd23e5135762
Remove browser Purchase event from thank-you page
2026-08-19
```

Removed from `dekuji.html`:

```js
fbq("track", "Purchase", {
  value: 399.00,
  currency: "CZK"
});
```

Also removed the noscript `ev=Purchase` image.

Reason: the old implementation fired Purchase every time `dekuji.html` loaded, causing obvious overcounting/reloads and hardcoded 399 CZK regardless of actual paid order data.

### 3. Harden SimpleShop webhook parameters

Commit:

```text
eb1c4f327f25a96a6f7d2b0c3ddd05a9d3c3276c
Harden SimpleShop webhook parameter handling
2026-08-20
```

Changes:

- robust money parser
- accept `order_number`, `number`, or `id`
- accept `total` or fallback `price`
- safe diagnostics for missing fields
- success logging:

```text
SimpleShop Purchase sent to Meta {
  eventId,
  value,
  currency,
  eventsReceived
}
```

### 4. Ignore unresolved SimpleShop placeholders

Commit:

```text
274b2ae382d239154373b398aca281fc10e360de
Ignore unresolved SimpleShop webhook placeholders
2026-08-20
```

Added `cleanValue()` so values like:

```text
{customer_tel}
{customer_country_code}
{id_customer}
```

are treated as missing rather than hashed and sent to Meta as garbage matching data.

---

## 6. What failed during setup

### Failure A: browser Purchase on `dekuji.html`

Problem:

```text
Every thank-you page load -> Purchase 399 CZK
```

Observed historical example:

```text
SimpleShop paid orders: 57
Meta browser Purchase events: 122
```

This implementation was removed in commit `141f680...`.

### Failure B: initial live webhook returned HTTP 400

SimpleShop successfully called the production endpoint, but live calls returned:

```text
HTTP 400
hasOrderNumber: false
hasTotal: true
```

The `order_number` key was present but empty because the URL used:

```text
order_number={order_number}
```

The SimpleShop URL was changed to:

```text
order_number={id}
```

After this change, real paid orders started returning HTTP 200.

### Successful real-order example

Production log:

```text
GET /api/simpleshop-paid 200
SimpleShop Purchase sent to Meta {
  eventId: 'simpleshop_12792004',
  value: 399,
  currency: 'CZK',
  eventsReceived: 1
}
```

Later verified live sale on 2026-09-09:

```text
GET /api/simpleshop-paid 200
SimpleShop Purchase sent to Meta {
  eventId: 'simpleshop_12936974',
  value: 399,
  currency: 'CZK',
  eventsReceived: 1
}
```

For the latter event, only one endpoint call was observed in the available Vercel log window.

---

## 7. Current Meta observations

### Event matching quality

Observed Meta Events Manager value:

```text
Event Match Quality: 6.1 / 10
```

This can likely be improved later, but it is not the primary unresolved bug.

### 1-9 September 2026 aggregate

User manually confirmed:

```text
SimpleShop paid orders: 27
Meta browser Purchase received: 26
Meta server Purchase received: 52
```

Meta UI also showed:

```text
Deduplication: in accordance with recommendations
Data freshness: real time
```

Meta UI text warns that Events Manager displays received/unattributed events and some may be removed by deduplication/data-use rules. Therefore source counts must not automatically be interpreted as final attributed conversion counts.

### Browser Purchase source

Current repo no longer fires browser Purchase.

SimpleShop's own Meta/browser tracking is the leading explanation for remaining browser Purchases, because browser count (~26) is close to the real order count (27). This should be treated as **likely, not fully proven from repo code**.

If browser + server are intended to represent the same conversion, verify whether they share a compatible `event_id`. Our server event ID is `simpleshop_<id>`. If SimpleShop's browser Purchase uses a different event ID, browser/server deduplication may not pair them.

---

## 8. Main unresolved issue

### Why did Meta show 52 server Purchases for 27 paid orders?

Known facts:

1. Latest individual paid order produced exactly one observed webhook request in Vercel.
2. That request produced exactly one Meta-accepted event (`eventsReceived: 1`).
3. SimpleShop global webhook was checked and is empty.
4. A secondary product checked manually had no paid/order webhook configured.
5. Repo contains only one CAPI endpoint implementation and no browser `Purchase` code.
6. Historical per-request Vercel logs were unavailable by the time the discrepancy was investigated.

Therefore the 52/27 discrepancy is **not yet explained**.

Possible explanations Codex should evaluate rather than assume:

- another server-side/CAPI integration outside this repo
- SimpleShop/Meta integration sending server events independently
- retries/duplicate CAPI requests that are received by Meta but deduplicated later
- historical setup/test-period noise in the selected Meta date range
- Events Manager "received server events" semantics vs final deduplicated/attributed Purchase count
- a second product/integration not yet manually inspected
- browser/server event pairing problem due to different `event_id` values

Do not "fix" the current webhook by adding random dedup state until the actual source of the 52 events is identified.

---

## 9. Recommended Codex audit plan

### Priority 1 — static repo audit

Verify independently:

```text
1. Search entire repo for:
   Purchase
   fbq(
   graph.facebook.com
   /events
   1412041910578955
   META_CAPI_ACCESS_TOKEN
   simpleshop-paid

2. Confirm no second code path sends Purchase.
3. Confirm `dekuji.html` does not fire Purchase.
4. Confirm `index.html` only fires PageView.
5. Review `api/simpleshop-paid.js` for correctness and privacy/security issues.
```

### Priority 2 — reason about deduplication

Determine whether this design can deduplicate a browser Purchase emitted by SimpleShop against our server Purchase.

Questions to answer:

```text
- What event_id does SimpleShop's browser Purchase use?
- Can that same event_id be made available to the paid webhook?
- Does Meta require same event_name + same event_id for browser/server dedup here?
- Is our current `simpleshop_<id>` event_id guaranteed to match anything browser-side?
```

If the IDs cannot match, decide whether browser Purchase should be disabled in SimpleShop and server CAPI become the sole Purchase source, or whether the architecture should be changed to share an event ID.

### Priority 3 — live request audit

Because Vercel logs are short-lived, during the next few real sales capture:

```text
- timestamp
- HTTP status
- eventId
- value
- currency
- eventsReceived
```

For each SimpleShop paid order verify:

```text
1 paid order -> 1 unique eventId -> 1 successful CAPI request
```

Do not log raw email, phone, name, or webhook secret.

If duplicate calls with the **same** event ID are observed, then consider durable idempotency before the Meta call. A process-memory Set is not sufficient on serverless infrastructure.

### Priority 4 — reconcile Meta reporting

For a clean future time window after the current setup stabilized, compare:

```text
SimpleShop paid order count
vs
server Purchase events received
vs
browser Purchase events received
vs
Ads Manager attributed Purchase conversions
```

Prefer a fresh post-fix window rather than relying on 1-9 September historical data.

### Priority 5 — improve match quality only after counts are trusted

Potential later work:

- validate Meta-normalization requirements for `ph`, `fn`, `ln`, `country`
- verify phone normalization includes country code as Meta expects
- consider `fbp` / `fbc` capture if a reliable privacy-compliant path exists
- verify domain ownership/verification status in Meta UI

Do not optimize match quality while event cardinality is still uncertain.

---

## 10. Security / privacy notes

- Never commit `META_CAPI_ACCESS_TOKEN`.
- Never commit `SIMPLESHOP_WEBHOOK_SECRET`.
- Raw customer email/phone/name should not be logged.
- Current endpoint hashes customer identifiers before sending to Meta.
- The webhook currently uses GET query parameters because of the SimpleShop product webhook URL pattern. This means raw customer fields can exist in the incoming request URL and may be exposed in infrastructure/access logs. Codex should assess whether SimpleShop can send POST data for this product-level paid webhook and whether switching to POST is feasible without breaking the integration.
- The webhook secret was visible in a prior setup screenshot/chat. Recommended hygiene: rotate `SIMPLESHOP_WEBHOOK_SECRET` in Vercel and update the SimpleShop webhook URL once the current audit is complete.

---

## 11. Guardrails for Codex

Before changing production tracking:

1. Read this file and current `api/simpleshop-paid.js`.
2. Treat SimpleShop paid status as the purchase source of truth.
3. Do not re-add browser Purchase to `dekuji.html`.
4. Do not hardcode `399` as Purchase value; preserve actual paid `total`.
5. Do not expose secrets or raw PII in logs/commits.
6. Do not create a new Meta Pixel/dataset without a specific reason.
7. Do not change the ad-level dataset selection; `PDF Ebook pixel` is the correct dataset.
8. Do not infer that Meta source-event counts equal attributed conversions without verifying Meta's dedup/reporting semantics.
9. Make minimal, testable changes with one clear hypothesis at a time.
10. For any tracking code change, document the before/after behavior here.

---

## 12. Definition of done

Tracking can be considered fully verified when a clean production window shows all of the following:

```text
A. Every SimpleShop PAID order triggers one intended Purchase flow.
B. No unpaid/order-created-only transaction is treated as the authoritative server Purchase.
C. The number of unique server Purchase events matches paid orders within understood edge cases.
D. Browser/server duplicates are either correctly deduplicated by shared event_id or only one Purchase source is active.
E. Ads Manager optimization uses the same trusted Purchase event.
F. No test event code is active in Production.
G. No raw PII or secrets are exposed by our application logs or repo.
```

Until A-D are proven on a clean window, consider the implementation **functional but not fully reconciled**.
