import https from 'https';
import { URL } from 'url';

function n8nFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, {
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          async text() { return body.toString(); },
          async json() { return JSON.parse(body.toString()); },
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const n8nBase = 'https://n8n.srv1711190.hstgr.cloud';
  const n8nPath = req.query.n8nPath || '';

  const url = new URL(req.url, 'http://localhost');
  url.searchParams.delete('n8nPath');
  const targetUrl = `${n8nBase}${n8nPath}${url.search}`;

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    const fetchOptions = {
      method: req.method,
      headers: {},
    };

    if (req.headers['content-type']) {
      fetchOptions.headers['Content-Type'] = req.headers['content-type'];
    }

    if (rawBody.length > 0) {
      fetchOptions.body = rawBody;
    }

    const response = await n8nFetch(targetUrl, fetchOptions);
    const data = await response.text();

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        res.status(response.status).json(JSON.parse(data));
        return;
      } catch {}
    }

    res.status(response.status).send(data);
  } catch (error) {
    res.status(502).json({ error: 'Proxy error', message: error.message });
  }
}
