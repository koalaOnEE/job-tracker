// Reads the private job list from GitHub and lets you correct a status.
const DEFAULT_REPO = 'koalaOnEE/job-tracker-data';
const STATUSES = ['Applied', 'Interview', 'Rejected', 'No reply'];
const STATUS_CLASS = { Applied: 'applied', Interview: 'interview', Rejected: 'rejected', 'No reply': 'noreply' };

const $ = (id) => document.getElementById(id);
const state = { jobs: [], overrides: {}, overridesSha: null, filter: 'All', query: '', data: null };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const settings = () => ({ token: store.get('jt.token'), repo: store.get('jt.repo') || DEFAULT_REPO });

function api(path, init = {}) {
  const { token, repo } = settings();
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...init.headers },
  });
}

function decode(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj, null, 2) + '\n');
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}

async function readFile(path) {
  const res = await api(path);
  if (res.status === 404) return { value: null, sha: null };
  if (res.status === 401 || res.status === 403) throw new Error('auth');
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const body = await res.json();
  return { value: decode(body.content), sha: body.sha };
}

async function load() {
  const [jobs, overrides] = await Promise.all([readFile('data/jobs.json'), readFile('data/overrides.json')]);
  state.data = jobs.value || { jobs: [] };
  state.jobs = state.data.jobs || [];
  state.overrides = overrides.value || {};
  state.overridesSha = overrides.sha;
  render();
}

const statusOf = (job) => state.overrides[job.id] || job.autoStatus || 'Applied';

async function saveOverride(id, status) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = { ...state.overrides };
    if (status) next[id] = status;
    else delete next[id];
    const res = await api('data/overrides.json', {
      method: 'PUT',
      body: JSON.stringify({
        message: status ? `Set status to ${status}` : 'Back to automatic status',
        content: encode(next),
        ...(state.overridesSha ? { sha: state.overridesSha } : {}),
      }),
    });
    if (res.ok) {
      state.overrides = next;
      state.overridesSha = (await res.json()).content.sha;
      return;
    }
    if (res.status !== 409 && res.status !== 422) throw new Error(`GitHub returned ${res.status}`);
    // Someone else saved first: reload and try again.
    const fresh = await readFile('data/overrides.json');
    state.overrides = fresh.value || {};
    state.overridesSha = fresh.sha;
  }
  throw new Error('Could not save, please try again');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function ago(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hr ago` : formatDate(iso);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

function jobCard(job) {
  const current = statusOf(job);
  const manual = Boolean(state.overrides[job.id]);
  const select = el('select', { className: STATUS_CLASS[current], ariaLabel: `Status for ${job.title}` });
  for (const s of STATUSES) select.append(el('option', { value: s, textContent: s, selected: s === current }));
  if (manual) select.append(el('option', { value: '', textContent: '↺ Auto' }));

  select.addEventListener('change', async () => {
    const chosen = select.value;
    // Picking the automatic value again means "stop overriding".
    const override = chosen && chosen !== job.autoStatus ? chosen : null;
    select.disabled = true;
    try {
      await saveOverride(job.id, override);
      toast(override ? `Marked as ${override}` : 'Back to automatic');
    } catch (err) {
      toast(err.message === 'auth' ? 'Your GitHub key cannot save changes' : err.message);
    }
    render();
  });

  return el('li', { className: 'job' },
    el('div', { className: 'title', textContent: job.title }),
    el('div', { className: 'status' }, select, manual ? el('div', { className: 'manual', textContent: 'set by you' }) : null),
    el('div', { className: 'company', textContent: job.company }),
    el('div', { className: 'meta', textContent: `Applied ${formatDate(job.appliedAt)} · ${job.source}` }),
  );
}

function render() {
  const counts = { All: state.jobs.length };
  for (const s of STATUSES) counts[s] = state.jobs.filter((j) => statusOf(j) === s).length;

  $('filters').replaceChildren(...['All', ...STATUSES].map((f) => {
    const b = el('button', { type: 'button' }, f, el('span', { className: 'n', textContent: counts[f] }));
    b.setAttribute('aria-pressed', String(state.filter === f));
    b.addEventListener('click', () => { state.filter = f; render(); });
    return b;
  }));

  const q = state.query.toLowerCase();
  const shown = state.jobs.filter((j) =>
    (state.filter === 'All' || statusOf(j) === state.filter) &&
    (!q || `${j.title} ${j.company}`.toLowerCase().includes(q)));
  $('list').replaceChildren(...shown.map(jobCard));

  const empty = $('empty');
  empty.hidden = shown.length > 0;
  empty.textContent = state.jobs.length
    ? 'No jobs match.'
    : 'No applications yet. They show up here within about 30 minutes of the confirmation email.';

  const alerts = (state.data.accounts || []).filter((a) => !a.ok)
    .map((a) => el('div', { className: 'alert', textContent: `${a.email} couldn't be checked: ${a.error}` }));
  if (!(state.data.accounts || []).length) {
    alerts.push(el('div', { className: 'alert', textContent: 'No email inbox is connected yet. Run "Add Outlook inbox" in your data repo\'s Actions tab.' }));
  }
  $('alerts').replaceChildren(...alerts);

  const unmatched = state.data.unmatched || [];
  const box = $('unmatched');
  box.hidden = unmatched.length === 0;
  box.querySelector('ul').replaceChildren(...unmatched.map((u) =>
    el('li', { textContent: `${formatDate(u.date)} · ${u.from}: ${u.subject}` })));

  $('synced').textContent = state.data.lastRun ? `Emails last checked ${ago(state.data.lastRun)}.` : '';
}

function showSetup(show) {
  $('setup').hidden = !show;
  $('app').hidden = show;
  if (show) {
    $('token').value = settings().token || '';
    $('repo').value = settings().repo;
  }
}

async function start() {
  if (!settings().token) return showSetup(true);
  showSetup(false);
  try {
    await load();
    return true;
  } catch (err) {
    if (err.message === 'auth') {
      toast('That GitHub key was not accepted');
      showSetup(true);
    } else {
      toast(`Couldn't load: ${err.message}`);
    }
  }
}

$('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  store.set('jt.token', $('token').value.trim());
  store.set('jt.repo', $('repo').value.trim() || DEFAULT_REPO);
  start();
});
$('forget').addEventListener('click', () => {
  store.remove('jt.token');
  $('token').value = '';
  toast('Key removed from this device');
});
$('settings-btn').addEventListener('click', () => showSetup($('setup').hidden));
$('refresh').addEventListener('click', () => start().then((ok) => ok && toast('Up to date')));
$('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && settings().token) start(); });

start();
