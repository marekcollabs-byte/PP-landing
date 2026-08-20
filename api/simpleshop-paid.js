const crypto = require('crypto');

function first(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function cleanValue(value) {
  const raw = first(value);
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (/^\{[^{}]+\}$/.test(text)) return undefined;
  return text;
}

function normalize(value) {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned.toLowerCase() : '';
}

function sha256(value) {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function parseMoney(value) {
  const cleaned = cleanValue(value);
  if (!cleaned) return NaN;
  let raw = cleaned.replace(/\s/g, '');
  raw = raw.replace(/[^0-9,.-]/g, '');

  if (raw.includes(',') && raw.includes('.')) {
    // Assume the last separator is the decimal separator.
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else {
      raw = raw.replace(/,/g, '');
    }
  } else {
    raw = raw.replace(',', '.');
  }

  return Number(raw);
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const source = req.method === 'GET' ? req.query : { ...req.query, ...(req.body || {}) };

  const secret = cleanValue(source.secret);
  if (!process.env.SIMPLESHOP_WEBHOOK_SECRET || secret !== process.env.SIMPLESHOP_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const pixelId = process.env.META_PIXEL_ID || '1412041910578955';
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';

  if (!accessToken) {
    return res.status(500).json({ ok: false, error: 'META_CAPI_ACCESS_TOKEN is not configured' });
  }

  const orderNumber = cleanValue(source.order_number) || cleanValue(source.number) || cleanValue(source.id);
  const totalRaw = cleanValue(source.total) ?? cleanValue(source.price);
  const currency = (cleanValue(source.currency) || 'CZK').toUpperCase();

  if (!orderNumber || totalRaw === undefined) {
    console.warn('SimpleShop webhook missing required fields', {
      hasOrderNumber: Boolean(orderNumber),
      hasTotal: totalRaw !== undefined,
      receivedKeys: Object.keys(source).filter((key) => key !== 'secret' && key !== 'email' && key !== 'phone')
    });
    return res.status(400).json({ ok: false, error: 'Missing order_number/number/id or total' });
  }

  const total = parseMoney(totalRaw);
  if (!Number.isFinite(total) || total < 0) {
    console.warn('SimpleShop webhook invalid total', {
      totalType: typeof totalRaw,
      totalPreview: String(totalRaw).replace(/[0-9]/g, '#').slice(0, 32)
    });
    return res.status(400).json({ ok: false, error: 'Invalid total' });
  }

  const emailHash = sha256(source.email);
  const phone = cleanValue(source.phone);
  const phoneHash = sha256(phone ? phone.replace(/[^0-9+]/g, '') : undefined);
  const firstNameHash = sha256(source.first_name);
  const lastNameHash = sha256(source.last_name);
  const countryHash = sha256(source.country);
  const externalIdHash = sha256(source.customer_id);

  const userData = {};
  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (firstNameHash) userData.fn = [firstNameHash];
  if (lastNameHash) userData.ln = [lastNameHash];
  if (countryHash) userData.country = [countryHash];
  if (externalIdHash) userData.external_id = [externalIdHash];

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `simpleshop_${orderNumber}`,
    action_source: 'website',
    event_source_url: 'https://www.prvnipomoc.eu/',
    user_data: userData,
    custom_data: {
      currency,
      value: total,
      content_name: 'První pomoc u dětí',
      content_type: 'product'
    }
  };

  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const metaBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Meta CAPI error', { status: response.status, body: metaBody, orderNumber });
      return res.status(502).json({ ok: false, error: 'Meta CAPI rejected event', meta: metaBody });
    }

    console.log('SimpleShop Purchase sent to Meta', {
      eventId: event.event_id,
      value: total,
      currency,
      eventsReceived: metaBody.events_received
    });

    return res.status(200).json({
      ok: true,
      event_id: event.event_id,
      events_received: metaBody.events_received,
      test_mode: Boolean(process.env.META_TEST_EVENT_CODE)
    });
  } catch (error) {
    console.error('Meta CAPI request failed', { message: error.message, orderNumber });
    return res.status(500).json({ ok: false, error: 'Meta CAPI request failed' });
  }
};
