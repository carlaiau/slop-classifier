const $ = id => document.getElementById(id);
const sample = `On Saturday morning, the library opened its doors an hour earlier than usual. A handwritten sign at the entrance invited neighbours to bring a broken household object and see whether someone could help repair it.

Mara arrived with a lamp that had belonged to her grandmother. The switch clicked, but the bulb stayed dark. Across the table, a retired electrician loosened the base and found a wire that had pulled free. They spent twenty minutes putting it back together.

Repair is often discussed as an alternative to buying something new. Yet the people gathered around those tables were also exchanging stories, tools, and the small practical skills that rarely make it into a manual. One person taught another how to thread a needle. Someone else explained why a bicycle brake was rubbing against its wheel.

Not everything could be fixed. A cracked kettle went home in the same bag it had arrived in, and the owner of an old radio left with the name of a specialist. The volunteers wrote down what they had tried so that the next person would not have to begin again.

By noon, the room had become noticeably quieter. The last visitors folded the tables, gathered stray screws into a jar, and returned the chairs to their usual places. Mara switched on her lamp once more before packing it away.

This sample passage was written for a software demonstration. Any highlights are model signals for inspection, not evidence about how a sentence was produced.`;
let config, text = '', sentences = [], results = new Map(), nodes = new Map(), mapNodes = new Map(), nearby = new Set();
let observer, generation = 0, active = 0, paused = false, timer, controllers = new Set(), prepared = null;
let eligible = new Map(), observations = [], viewport = null, requestCount = 0, detailId = null;
const request = async (path, data, signal) => {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}), signal });
  const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Request failed'); return body;
};
const scoreOf = r => config.mode === 'demo' ? r?.displayScore : config.scoreKind === 'raw-prefix-mean' ? r?.raw : r?.calibrated;
function update(id) {
  const r = results.get(id), status = r?.status ?? 'unscored', score = scoreOf(r);
  const marked = status === 'scored' && Number.isFinite(score) && score >= Number($('threshold').value);
  for (const el of [nodes.get(id), mapNodes.get(id)]) if (el) { el.dataset.status = status; el.dataset.marked = String(marked); }
  const map = mapNodes.get(id);
  if (map) map.setAttribute('aria-label', `Sentence ${Number(id.slice(1)) + 1}: ${status}${marked ? ', above threshold' : ''}`);
  if (detailId === id) detail(id);
}
function detail(id) {
  detailId = id;
  const r = results.get(id), number = Number(id.slice(1)) + 1;
  let info = `Sentence ${number}. `;
  if (!r) info += 'Not analyzed. Reading nearby will schedule analysis.';
  else if (r.status === 'pending') info += 'Analysis pending.';
  else if (r.status === 'failed') info += 'Analysis failed. Use Retry visible sentences.';
  else if (r.status === 'insufficient') info += r.reason;
  else if (config.mode === 'demo') info += `Simulated signal ${scoreOf(r).toFixed(2)}. This value is generated for the interface, not by a detector.`;
  else if (config.scoreKind === 'raw-prefix-mean') info += `Experimental prefix-mean ${r.raw.toFixed(2)}, averaging ${r.words?.length ?? 0} content-word judgments. This is a local model signal, not a calibrated authorship probability or a word-level explanation.`;
  else info += `Model signal ${r.calibrated.toFixed(2)}; raw ${r.raw.toFixed(2)}. Calibrated on the frozen research sample, not a universal authorship probability.`;
  $('detail-text').textContent = info;
  $('mobile-detail-text').textContent = info;
  if (matchMedia('(max-width: 800px)').matches) $('mobile-detail').hidden = false;
}
function progress() {
  const completed = [...results.values()].filter(r => ['scored', 'insufficient'].includes(r.status)).length;
  $('progress').textContent = `${completed} of ${sentences.length} sentences analyzed`;
}
function startViewport() {
  const pending = [...nearby].filter(id => !results.has(id));
  if (pending.length) {
    viewport = { id: observations.length, eligibleAt: Math.min(...pending.map(id => eligible.get(id) ?? performance.now())), ids: pending, firstSentenceMs: null, completeMs: null, cache: 'miss', batches: [], wastedRequests: 0 };
    observations.push(viewport);
  }
  else viewport = null;
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (!viewport) startViewport(); pump(); }, 50);
}
async function pump() {
  if (paused || document.hidden || !config) return;
  while (active < config.runtime.concurrency) {
    const ids = [...nearby].filter(id => !results.has(id)).slice(0, config.runtime.batch);
    if (!ids.length) return;
    const current = generation, observed = viewport, controller = new AbortController();
    controllers.add(controller); active++; requestCount++;
    const began = performance.now(), queueMs = Math.max(0, began - Math.min(...ids.map(id => eligible.get(id) ?? began)));
    ids.forEach(id => { results.set(id, { status: 'pending' }); update(id); });
    // Deliberately not awaited: the outer loop fills bounded request slots.
    request('/api/score', { text, ids }, controller.signal).then(async data => {
      if (generation !== current) return;
      data.results.forEach(r => { results.set(r.id, r); update(r.id); }); progress();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (generation !== current) return;
      const completedAt = performance.now(), wasted = ids.every(id => !nearby.has(id));
      if (observed) {
        observed.batches.push({ apiMs: data.apiMs, queueMs, endToEndMs: completedAt - began, sentences: ids.length, serverState: data.serverState, cache: data.results.every(r => r.cached) ? 'hit' : 'miss', failed: false, wasted });
        observed.cache = observed.batches.every(b => b.cache === 'hit') ? 'hit' : 'miss';
        if (wasted) observed.wastedRequests++;
        if (observed.firstSentenceMs === null && data.results.some(r => r.status === 'scored')) observed.firstSentenceMs = completedAt - observed.eligibleAt;
        if (observed.ids.every(id => ['scored', 'insufficient'].includes(results.get(id)?.status))) observed.completeMs = completedAt - observed.eligibleAt;
      }
    }).catch(error => {
      if (generation !== current || error.name === 'AbortError') return;
      ids.forEach(id => { results.set(id, { status: 'failed' }); update(id); });
      $('analysis-error').textContent = error.message; $('retry').hidden = false;
      if (observed) observed.batches.push({ queueMs, endToEndMs: performance.now() - began, failed: true });
    }).finally(() => {
      controllers.delete(controller);
      if (generation === current) { active--; schedule(); }
    });
  }
}
function resetReading() {
  generation++; controllers.forEach(c => c.abort()); controllers.clear(); observer?.disconnect(); clearTimeout(timer);
  active = 0; nearby.clear(); eligible.clear(); results.clear(); nodes.clear(); mapNodes.clear(); observations = []; viewport = null; paused = false; requestCount = 0; detailId = null;
  $('analysis-error').textContent = ''; $('retry').hidden = true; $('pause').textContent = 'Pause analysis';
  $('mobile-detail').hidden = true;
}
function render() {
  resetReading();
  $('ingest').hidden = true; $('reading').hidden = false; $('new-text').hidden = false; $('map-empty').hidden = true; $('export').hidden = false;
  $('text').replaceChildren(); $('map').replaceChildren();
  let offset = 0;
  for (const s of sentences) {
    $('text').append(document.createTextNode(text.slice(offset, s.start)));
    const span = document.createElement('span'); span.className = 'sentence'; span.id = s.id; span.tabIndex = 0; span.textContent = text.slice(s.start, s.end);
    span.addEventListener('mouseenter', () => detail(s.id)); span.addEventListener('focus', () => detail(s.id));
    span.addEventListener('click', () => detail(s.id));
    $('text').append(span); nodes.set(s.id, span); offset = s.end;
    const button = document.createElement('button'); button.type = 'button';
    button.addEventListener('click', () => { if ($('drawer').open) $('drawer').close(); span.scrollIntoView({ block: 'center' }); span.focus({ preventScroll: true }); });
    button.addEventListener('keydown', event => {
      const at = sentences.findIndex(r => r.id === s.id);
      const dest = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: sentences.length - 1, PageDown: at + 10, PageUp: at - 10 }[event.key];
      if (dest !== undefined) { event.preventDefault(); mapNodes.get(sentences[Math.max(0, Math.min(sentences.length - 1, dest))].id)?.focus(); }
    });
    $('map').append(button); mapNodes.set(s.id, button); update(s.id);
  }
  $('text').append(document.createTextNode(text.slice(offset)));
  $('reading-meta').textContent = `${sentences.length} sentences · ${text.length.toLocaleString()} characters · analyzed as you read`;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { nearby.add(entry.target.id); if (!eligible.has(entry.target.id)) eligible.set(entry.target.id, performance.now()); }
      else { nearby.delete(entry.target.id); eligible.delete(entry.target.id); }
    }
    schedule();
  }, { rootMargin: '160px 0px' });
  nodes.forEach(node => observer.observe(node));
  $('threshold').disabled = false; progress(); window.scrollTo(0, 0); $('main').focus();
}
$('sample').addEventListener('click', () => { $('paste').value = sample; $('paste').dispatchEvent(new Event('input')); $('paste').focus(); });
$('paste').addEventListener('input', () => { $('character-count').textContent = `${$('paste').value.length.toLocaleString()} / 50,000 characters`; prepared = null; $('begin').hidden = true; $('estimate').textContent = ''; });
$('prepare').addEventListener('click', async () => {
  $('ingest-error').textContent = ''; $('prepare').disabled = true;
  try {
    const candidate = $('paste').value;
    if (!candidate.trim()) throw new Error('Paste a passage or try the sample first.');
    await request('/api/session');
    const plan = await request('/api/plan', { text: candidate });
    if ($('paste').value !== candidate) return;
    prepared = { text: candidate, sentences: plan.sentences };
    $('estimate').textContent = `${plan.sentences.length} sentences. ${config.mode === 'demo' ? 'Simulated analysis is free.' : `Rough full-text estimate: ${plan.estimate.requests} sentence request packets before batching, $${plan.estimate.estimatedUsd.toFixed(4)}. Only nearby sentences are analyzed.`}`;
    $('begin').hidden = false; $('begin').focus();
  } catch (error) { $('ingest-error').textContent = error.message; } finally { $('prepare').disabled = false; }
});
$('begin').addEventListener('click', () => { if (prepared) { text = prepared.text; sentences = prepared.sentences; render(); } });
$('threshold').addEventListener('input', () => { $('threshold-value').textContent = Number($('threshold').value).toFixed(2); sentences.forEach(s => update(s.id)); });
$('reset').addEventListener('click', () => { $('threshold').value = String(Math.min(1, config.threshold)); $('threshold').dispatchEvent(new Event('input')); });
$('pause').addEventListener('click', () => { paused = !paused; $('pause').textContent = paused ? 'Resume analysis' : 'Pause analysis'; if (!paused) schedule(); });
$('retry').addEventListener('click', () => { for (const id of nearby) if (results.get(id)?.status === 'failed') { results.delete(id); update(id); } $('analysis-error').textContent = ''; $('retry').hidden = true; schedule(); });
$('new-text').addEventListener('click', async () => {
  resetReading(); text = ''; sentences = []; prepared = null; $('paste').value = ''; $('paste').dispatchEvent(new Event('input'));
  $('reading').hidden = true; $('ingest').hidden = false; $('new-text').hidden = true; $('map').replaceChildren(); $('map-empty').hidden = false; $('text').replaceChildren(); $('progress').textContent = ''; $('threshold').disabled = true; $('export').hidden = true;
  $('detail-text').textContent = 'Focus a sentence to inspect its status.';
  await request('/api/clear').catch(() => {}); if ($('drawer').open) $('drawer').close(); $('paste').focus();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else schedule(); });
window.addEventListener('scroll', () => { viewport = null; schedule(); }, { passive: true });
$('export').addEventListener('click', () => {
  const payload = { schema: 'reader-timings-v1', synthetic: config.mode === 'demo', researchOnly: config.researchOnly, scoringVersion: config.scoringVersion, runtime: config.runtime, requests: requestCount, observations, note: 'Only timing and status metadata. No text or sentence scores. Missing completions and failures must be audited before release.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'reader-timings.json'; anchor.click(); URL.revokeObjectURL(url);
});
let drawerSource, drawerAnchor;
function openDrawer(id, title) {
  if ($('drawer').open) $('drawer').close();
  drawerSource = $(id); drawerAnchor = document.createComment('drawer origin'); drawerSource.before(drawerAnchor);
  $('drawer-content').append(drawerSource); $('drawer-title').textContent = title; $('drawer').showModal(); $('close-drawer').focus();
}
$('open-config').addEventListener('click', () => openDrawer('settings', 'Reading settings'));
$('open-map').addEventListener('click', () => openDrawer('map-panel', 'Text map'));
$('close-drawer').addEventListener('click', () => $('drawer').close());
$('hide-detail').addEventListener('click', () => { $('mobile-detail').hidden = true; detailId = null; });
$('drawer').addEventListener('close', () => { if (drawerAnchor && drawerSource) { drawerAnchor.replaceWith(drawerSource); drawerAnchor = null; drawerSource = null; } });
try {
  config = await (await fetch('/api/config')).json();
  $('mode').textContent = config.mode === 'demo' ? 'Simulated scores · no model calls' : 'Validated technical setup · limited pilot';
  if (config.scoreKind === 'raw-prefix-mean') {
    $('threshold-label').textContent = 'Raw prefix-mean cutoff';
    $('threshold').min = '0.20'; $('threshold').max = '0.60'; $('threshold').step = '0.01';
  }
  $('threshold').value = String(Math.min(1, config.threshold)); $('threshold-value').textContent = Number($('threshold').value).toFixed(2);
  if (config.mode === 'live') {
    $('threshold-note').textContent = 'Default calibrated on the frozen research sample. Other settings change false-positive and miss rates.';
    $('privacy').textContent = 'Visible sentences and their context go through this local server to TypeSafe. Application caches are session-only and expire after 30 minutes. The provider has separate retention terms; do not paste confidential text without checking them.';
    $('reading-banner').textContent = 'AI-typicality signals support inspection. They do not prove authorship.';
    $('research-status').textContent = 'Technical gates passed for this frozen setup. Reader understanding is still being studied.';
    if (config.exploratory) {
      $('mode').textContent = 'Experimental prefix-mean · live JEV';
      $('research-status').textContent = 'Local exploration only. Detection has not passed technical gates. The reader study is outside this project.';
      $('threshold-note').textContent = 'Raw word-average signal. Around 0.38 flagged 5% of human-labeled sentences in a small development sample. This is not a validated default. Dragging changes highlights without API calls.';
      $('reading-banner').textContent = 'Experimental prefix-mean scores. Word judgments are averaged per sentence; highlights are not proof of authorship.';
    } else if (config.researchOnly) {
      $('mode').textContent = 'Live research · pilot not approved';
      $('research-status').textContent = 'Research instrumentation only. Technical gates are not complete; the reader study is outside this project.';
      $('threshold-note').textContent = 'Research calibration setting. Not a validated default. Other settings change false-positive and miss rates.';
      $('reading-banner').textContent = 'Experimental JEV scores. This session measures the system; it is not a validated detector or participant pilot.';
    }
  }
} catch { $('mode').textContent = 'Configuration unavailable'; $('prepare').disabled = true; $('ingest-error').textContent = 'Restart the local server and reload this page.'; }
