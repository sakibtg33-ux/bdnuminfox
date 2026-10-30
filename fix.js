// fix.js — proper state-machine JSON repair for broken data.json.
// Handles: trailing commas, missing commas between object props,
// missing commas between array elements (including numeric/null/bool),
// truncated tail. Writes valid data.json in place.

const fs = require('fs');
const path = require('path');
const FILE = path.join(process.cwd(), 'data.json');
const raw = fs.readFileSync(FILE, 'utf8');
console.log('input bytes:', raw.length);

function repair(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const stack = [];
  const VAL = 0, KEY = 1, COLON = 2, COMMA = 3;
  let state = VAL;
  let lastSig = -1;

  const push = (c) => { out.push(c); lastSig = out.length - 1; };
  const pushWs = (c) => { out.push(c); };
  const top = () => stack[stack.length - 1];

  function stripTrailingComma() {
    if (lastSig >= 0 && out[lastSig] === ',') {
      out.splice(lastSig, 1);
      let k = out.length - 1;
      while (k >= 0 && /\s/.test(out[k])) k--;
      lastSig = k;
    }
  }

  function startsValue(ch, pos) {
    if (ch === '"' || ch === '{' || ch === '[' || ch === '-') return true;
    if (ch >= '0' && ch <= '9') return true;
    if (ch === 't' && src.slice(pos, pos + 4) === 'true') return true;
    if (ch === 'f' && src.slice(pos, pos + 5) === 'false') return true;
    if (ch === 'n' && src.slice(pos, pos + 4) === 'null') return true;
    return false;
  }

  function readString() {
    push('"'); i++;
    let esc = false;
    while (i < n) {
      const cc = src[i];
      if (esc) { push(cc); esc = false; i++; continue; }
      if (cc === '\\') { push(cc); esc = true; i++; continue; }
      if (cc === '"') { push('"'); i++; break; }
      push(cc); i++;
    }
  }

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { pushWs(c); i++; continue; }

    if (state === VAL) {
      if (c === ']' && top() === 'a') { stripTrailingComma(); push(']'); stack.pop(); i++; state = COMMA; }
      else if (c === '"') { readString(); state = COMMA; }
      else if (c === '{') { push('{'); stack.push('o'); i++; state = KEY; }
      else if (c === '[') { push('['); stack.push('a'); i++; state = VAL; }
      else if (c === '-' || (c >= '0' && c <= '9')) {
        while (i < n && /[-+0-9.eE]/.test(src[i])) { push(src[i]); i++; }
        state = COMMA;
      }
      else if (c === 't' && src.slice(i, i + 4) === 'true') { for (const ch of 'true') push(ch); i += 4; state = COMMA; }
      else if (c === 'f' && src.slice(i, i + 5) === 'false') { for (const ch of 'false') push(ch); i += 5; state = COMMA; }
      else if (c === 'n' && src.slice(i, i + 4) === 'null') { for (const ch of 'null') push(ch); i += 4; state = COMMA; }
      else { i++; }
    } else if (state === KEY) {
      if (c === '}' && top() === 'o') { stripTrailingComma(); push('}'); stack.pop(); i++; state = COMMA; }
      else if (c === '"') { readString(); state = COLON; }
      else { i++; }
    } else if (state === COLON) {
      if (c === ':') { push(':'); i++; state = VAL; } else { i++; }
    } else {
      if (c === ',') { push(','); i++; state = (top() === 'o') ? KEY : VAL; }
      else if (c === '}' && top() === 'o') { stripTrailingComma(); push('}'); stack.pop(); i++; state = COMMA; }
      else if (c === ']' && top() === 'a') { stripTrailingComma(); push(']'); stack.pop(); i++; state = COMMA; }
      else if (startsValue(c, i)) { push(','); state = (top() === 'o') ? KEY : VAL; }
      else { i++; }
    }
  }

  while (stack.length) { stripTrailingComma(); push(stack.pop() === 'o' ? '}' : ']'); }

  return out.join('');
}

const repaired = repair(raw);
try {
  const parsed = JSON.parse(repaired);
  const arr = Array.isArray(parsed) ? parsed : (parsed.records || []);
  console.log('OK — valid JSON,', arr.length, 'records,', repaired.length, 'bytes');
  fs.writeFileSync(FILE, repaired);
  console.log('wrote', FILE);
} catch (e) {
  console.error('repair failed:', e.message);
  console.error('---');
  const pos = (e.message.match(/position (\d+)/) || [])[1];
  if (pos) {
    const idx = parseInt(pos, 10);
    console.error('around byte', idx, '→', JSON.stringify(repaired.slice(Math.max(0, idx - 60), idx + 60)));
  }
  process.exit(1);
}
