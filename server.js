/*
 * TAJ COLLECTIONS — WhatsApp order relay (Phone 1 → Phone 2)
 *
 * Flow:
 *   1. On boot, Baileys connects a WhatsApp session (Phone 1).
 *      - QR is printed to the terminal AND served as PNG at GET /qr (scan with Phone 1).
 *      - Session is persisted to ./auth_state so you only scan once.
 *   2. The store POSTs every confirmed COD order to POST /order.
 *   3. The relay formats a clean alert and sends it from Phone 1 to PHONE2_NUMBER (Phone 2).
 *
 * Env:
 *   PHONE2_NUMBER  destination WhatsApp number in international format, no "+" (e.g. 923001234567)
 *   PORT           default 3000 (Render sets this automatically)
 */
const express = require("express");
const QRCode = require("qrcode");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");

const PORT = process.env.PORT || 3000;

let sock = null;
let lastQR = null;
let connected = false;

function fmt(n) {
  return "Rs " + Number(n || 0).toLocaleString("en-PK");
}

function buildAlert(o) {
  const lines = [
    "*NEW ORDER " + (o.orderNumber || "") + " — TAJ COLLECTIONS*",
    "--------------------------",
    ...((o.items || []).map((it, k) =>
      `${k + 1}) ${it.name}${it.variant ? " (" + it.variant + ")" : ""} x${it.qty} — ${fmt(it.price * it.qty)}`
    )),
    "--------------------------",
    "Subtotal: " + fmt(o.subtotal),
    ...(o.discount ? ["Discount: -" + fmt(o.discount)] : []),
    "Shipping: " + (Number(o.shipping || 0) === 0 ? "FREE" : fmt(o.shipping)),
    "*Total: " + fmt(o.total) + "*",
    "--------------------------",
    "Name: " + ((o.customer && o.customer.name) || ""),
    "Phone: " + ((o.customer && o.customer.phone) || ""),
    "Address: " + [o.customer && o.customer.address, o.customer && o.customer.city].filter(Boolean).join(", "),
    "Payment: Cash on Delivery",
  ];
  return lines.join("\n");
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_state");
  sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      lastQR = qr;
      console.log("QR ready — scan at GET /qr");
    }
    if (connection === "close") {
      connected = false;
      const code = lastDisconnect && lastDisconnect.error
        ? new Boom(lastDisconnect.error).output.statusCode
        : 0;
      console.log("WhatsApp connection closed (code " + code + ") — reconnecting in 5s…");
      if (code === DisconnectReason.loggedOut) {
        console.log("Logged out: delete ./auth_state and scan the QR again.");
      }
      setTimeout(startWhatsApp, 5000);
    } else if (connection === "open") {
      connected = true;
      lastQR = null;
      console.log("WhatsApp connected as", sock.user && sock.user.id);
    }
  });
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/", (req, res) => {
  res.send("TAJ order relay — " + (connected ? "WhatsApp connected ✓" : "waiting for QR scan at /qr"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true, connected });
});

app.get("/qr", async (req, res) => {
  if (!lastQR) {
    return res.status(404).send(connected
      ? "Already connected — no QR needed."
      : "No QR yet — wait a few seconds and refresh.");
  }
  try {
    const png = await QRCode.toBuffer(lastQR, { width: 360, margin: 1 });
    res.type("png").send(png);
  } catch (e) {
    res.status(500).send("QR render failed");
  }
});

/*
 * POST /order
 * {
 *   orderNumber, items[{name,variant,qty,price}],
 *   subtotal, discount, shipping, total,
 *   customer{name,phone,address,city}, source
 * }
 */
app.post("/order", async (req, res) => {
  if (!connected || !sock) {
    return res.status(503).json({ ok: false, error: "WhatsApp not connected" });
  }
  const dest = String(process.env.PHONE2_NUMBER || "").replace(/\D/g, "");
  if (!dest) {
    return res.status(500).json({ ok: false, error: "PHONE2_NUMBER env not set" });
  }
  try {
    await sock.sendMessage(dest + "@s.whatsapp.net", { text: buildAlert(req.body || {}) });
    console.log("Order forwarded to", dest);
    res.json({ ok: true });
  } catch (e) {
    console.error("Forward failed:", e && e.message);
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.listen(PORT, () => {
  console.log("Relay listening on port " + PORT);
  startWhatsApp();
});
