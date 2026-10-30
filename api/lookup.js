// api/lookup.js — Vercel Node.js serverless function
// Reads data.json from the project root, sanitizes trailing commas,
// serves prefix search + pagination for the BD NUM TO NID frontend.

const fs = require('fs');
const path = require('path');

function loadRecords() {
  const filePath = path.join(process.cwd(), 'data.json');
  let raw = fs.readFileSync(filePath, 'utf8');
  // data.json currently contains trailing commas — strip them before parsing
  raw = raw.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(raw);
}

module.exports = (req, res) => {
  try {
    const { info, q, offset = '0', limit = '100' } = req.query;
    const records = loadRecords();
    const total = records.length;

    // /api/lookup?info=1 → { total }
    if (info === '1') {
      return res.status(200).json({ total });
    }

    const prefix = String(q || '').trim();
    if (!prefix) {
      return res.status(400).json({ error: 'q is required' });
    }

    // Prefix match on the phone number field
    const matches = records.filter((r) =>
      String(r.number || '').startsWith(prefix)
    );
    const totalMatches = matches.length;

    const off = Math.max(0, parseInt(offset, 10) || 0);
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));

    const page = matches.slice(off, off + lim).map((r) => ({
      number: r.number,
      nid: r.nid,
      dob: r.dob,
    }));

    return res.status(200).json({
      total_matches: totalMatches,
      total,
      matches: page,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
