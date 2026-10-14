# TAJ Order Relay — WhatsApp auto-forward (Phone 1 → Phone 2)

Every time a customer confirms a COD order on the **TAJ COLLECTIONS** store, the store
`POST`s the full order JSON here. This relay sends a clean order alert from **Phone 1**
(the connected WhatsApp session) to **Phone 2** (the business number that receives orders).

## How it works

```
Customer confirms order on taj-collections site
        │  POST /order {orderNumber, items, totals, customer}
        ▼
This relay (Node + Baileys, logged in as Phone 1)
        │  WhatsApp message
        ▼
Phone 2 — the number Moiz actually reads
```

## Deploy (Render free tier)

1. Push this repo to GitHub (already public: `abdulmoiz0portfolio/taj-order-relay`).
2. On [render.com](https://render.com) → **New + → Web Service** → connect this repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
4. **Environment variables** → add:
   - `PHONE2_NUMBER` = destination number in international format, no `+` (e.g. `923001234567`)
5. Deploy, then open `https://<your-service>.onrender.com/qr` and **scan the QR with Phone 1's
   WhatsApp** (Linked devices). The session is saved in `./auth_state`, so you only scan once
   (until WhatsApp logs it out).

> ⚠️ Render free tier sleeps when idle — the first order after sleep can take ~30–60s to
> forward while the service wakes. The store never waits on it (fire-and-forget).

## Endpoints

| Method | Path      | Purpose                                              |
|--------|-----------|------------------------------------------------------|
| GET    | `/`       | status line                                          |
| GET    | `/health` | `{ok:true, connected:true/false}`                    |
| GET    | `/qr`     | current login QR as PNG (404 when already connected)  |
| POST   | `/order`  | forward an order; body below                         |

### POST /order body

```json
{
  "orderNumber": "TJ-482913",
  "items": [{ "name": "Executive Bifold", "variant": "Espresso / Standard", "qty": 1, "price": 2499 }],
  "subtotal": 2499,
  "discount": 250,
  "shipping": 0,
  "total": 2249,
  "customer": { "name": "Ahmed Raza", "phone": "03001234567", "address": "House 12", "city": "Lahore" },
  "source": "taj-collections-checkout"
}
```

Phone 2 receives:

```
*NEW ORDER TJ-482913 — TAJ COLLECTIONS*
--------------------------
1) Executive Bifold (Espresso / Standard) x1 — Rs 2,499
--------------------------
Subtotal: Rs 2,499
Discount: -Rs 250
Shipping: FREE
*Total: Rs 2,249*
--------------------------
Name: Ahmed Raza
Phone: 03001234567
Address: House 12, Lahore
Payment: Cash on Delivery
```

## Store wiring

In the store's `assets/js/store.js`:

```js
const RELAY_URL = "https://<your-service>.onrender.com"; // "" = disabled
```

When set, checkout's confirm handler `POST`s every order to `RELAY_URL + "/order"` —
fire-and-forget: if the relay is down, the customer still sees their success screen.

## Local run

```bash
npm install
PHONE2_NUMBER=923001234567 node server.js
# scan the QR printed in the terminal (or open http://localhost:3000/qr)
```
