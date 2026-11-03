// Emulates media features such as prefers-contrast on an open Steady page, for media the agent-browser CLI cannot set.
// Chrome drops the emulation when the DevTools session closes, so this holds the session open for the given seconds:
// run it in the background and take screenshots meanwhile.
// Usage: node tools/emulate-media.mjs <browser ws url> <page url prefix> <seconds> name=value [name=value ...]
// Example: node tools/emulate-media.mjs "$(agent-browser get cdp-url)" http://127.0.0.1:8765/ 30 prefers-contrast=more
const [url, prefix, secs, ...pairs] = process.argv.slice(2);
if (!url || !prefix || !(Number(secs) > 0) || !pairs.length || pairs.some((p) => !/^[a-z-]+=\S+$/.test(p))) {
  console.error('Usage: node tools/emulate-media.mjs <browser ws url> <page url prefix> <seconds> name=value [name=value ...]');
  process.exit(1);
}
const features = pairs.map((p) => { const [name, value] = p.split('='); return { name, value }; });
const ws = new WebSocket(url);
let id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
  pending.set(msg.id, { res, rej });
  ws.send(JSON.stringify(msg));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.rej(new Error(m.error.message));
  else p.res(m.result);
};
ws.onerror = () => {
  console.error(`Could not connect to ${url}`);
  process.exit(1);
};
ws.onopen = async () => {
  try {
    const { targetInfos } = await send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page' && t.url.startsWith(prefix));
    if (!page) throw new Error(`No open page starts with ${prefix}`);
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await send('Emulation.setEmulatedMedia', { features }, sessionId);
    console.log(`Emulating ${pairs.join(', ')} on ${page.url} for ${secs} s`);
    setTimeout(() => { ws.close(); process.exit(0); }, Number(secs) * 1000);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};
