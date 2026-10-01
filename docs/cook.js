import { SOURCE, INGREDIENTS, STEPS, SCALES, scaledIngredients, formatQuantity, shoppingList, soakReady, timerRemaining, makeBatch, validNotebook } from './recipe.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const PREF_KEY = 'piqueops.recipe.v1';
const NOTE_KEY = 'piqueops.notebook.v1';
let prefs = { scale: 1, metric: false, checked: [], completed: [], soak: { startedAt: null, hours: 24 }, timer: { deadline: null, remaining: 600 } };
let notebook = { version: 1, batches: [] };
let canStore = true;
let editingId = null;
let toastTimer;

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch (error) { if (!(error instanceof SyntaxError)) canStore = false; return null; }
}
const savedPrefs = readJSON(PREF_KEY);
if (savedPrefs) {
  if (SCALES.includes(savedPrefs.scale)) prefs.scale = savedPrefs.scale;
  prefs.metric = savedPrefs.metric === true;
  if (Array.isArray(savedPrefs.checked)) prefs.checked = savedPrefs.checked.filter(id => INGREDIENTS.some(i => i.id === id));
  if (Array.isArray(savedPrefs.completed)) prefs.completed = savedPrefs.completed.filter(id => STEPS.some(s => s.id === id));
  if ([12, 24, 48].includes(savedPrefs.soak?.hours)) prefs.soak.hours = savedPrefs.soak.hours;
  if (typeof savedPrefs.soak?.startedAt === 'string' && Number.isFinite(new Date(savedPrefs.soak.startedAt).getTime())) prefs.soak.startedAt = savedPrefs.soak.startedAt;
  const timer = savedPrefs.timer;
  if (timer && Number.isInteger(timer.remaining) && timer.remaining >= 0 && timer.remaining <= 600 && (timer.deadline === null || Number.isFinite(timer.deadline))) prefs.timer = timer;
}
const savedNotebook = readJSON(NOTE_KEY);
if (validNotebook(savedNotebook)) notebook = savedNotebook;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5000);
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); canStore = true; }
  catch { canStore = false; }
  $('#notebook-status').textContent = canStore ? 'Stored only in this browser. Export a backup to keep your notes.' : 'Browser storage unavailable. Export a backup before closing this tab.';
  return canStore;
}

const savePrefs = () => save(PREF_KEY, prefs);
const localDateTime = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const today = () => localDateTime(new Date()).slice(0, 10);
const dateLabel = value => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

function route() {
  const desired = location.hash.slice(1);
  const page = ['recipe', 'shopping', 'batches'].includes(desired) ? desired : 'recipe';
  $$('[data-page]').forEach(section => { section.hidden = section.dataset.page !== page; });
  $$('[data-nav]').forEach(link => {
    if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${page === 'recipe' ? 'The recipe' : page === 'shopping' ? 'Shopping list' : 'Batch notebook'} · PiqueOps`;
}

function renderIngredients() {
  const ingredients = scaledIngredients(prefs.scale, prefs.metric);
  const buildRow = (ingredient, prefix) => {
    const li = node('li', null, ingredient.pantry ? 'pantry-item' : '');
    const label = node('label');
    const input = node('input');
    input.type = 'checkbox';
    input.id = `${prefix}-${ingredient.id}`;
    input.dataset.ingredient = ingredient.id;
    input.checked = prefs.checked.includes(ingredient.id);
    label.append(input, node('span', ingredient.name, 'ingredient-name'), node('span', ingredient.quantity, 'quantity'));
    li.append(label);
    return li;
  };
  $('#recipe-ingredients').replaceChildren(...ingredients.map(i => buildRow(i, 'recipe')));
  $('#shopping-ingredients').replaceChildren(...ingredients.filter(i => !i.pantry).map(i => buildRow(i, 'shopping')));
  $$('[data-scale]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.scale) === prefs.scale)));
  $('#measure-units').value = prefs.metric ? 'metric' : 'us';
  $('#ingredient-scale').textContent = `${formatQuantity(prefs.scale)}×`;
  $('#shopping-scale').textContent = `${formatQuantity(prefs.scale)}× batch`;
  $('#scale-caption').textContent = { '0.5': 'A pilot program. In a saucepan.', '1': 'One batch. A reasonable amount of ambition.', '2': 'One for you. One for someone you like.', '3': 'You have become the hot sauce person.' }[prefs.scale];
  $('#measure-note').textContent = `${prefs.metric ? 'Only liquids convert to mL (rounded); solid measures stay as published. ' : ''}Use water to cover the vegetables; reserve the measured amount for blending.`;
  const total = ingredients.filter(i => !i.pantry);
  $('#shopping-progress').textContent = `${total.filter(i => prefs.checked.includes(i.id)).length} of ${total.length} checked`;
}

function toolButton(text, action, className = 'button secondary') {
  const button = node('button', text, className);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function buildSteps() {
  $('#recipe-steps').replaceChildren(...STEPS.map((step, index) => {
    const article = node('article', null, 'method-step');
    article.id = `step-${step.id}`;
    const heading = node('div', null, 'step-heading');
    const title = node('div', null, 'step-title');
    title.append(node('h3', step.title), node('p', step.aside, 'step-aside'));
    const label = node('label', null, 'step-check');
    const check = node('input');
    check.type = 'checkbox';
    check.dataset.step = step.id;
    check.setAttribute('aria-label', `Mark ${step.title} complete`);
    label.append(check, document.createTextNode('DONE'));
    heading.append(node('span', String(index + 1).padStart(2, '0'), 'step-number'), title, label);
    article.append(heading, node('p', step.text, 'step-body'));
    if (step.id === 'soak') article.append(buildSoakTool());
    if (step.id === 'simmer') article.append(buildTimer());
    if (step.id === 'blend') article.append(node('p', 'Cool hot ingredients as needed and follow your blender’s instructions for warm liquids.', 'blender-note'));
    return article;
  }));
  renderSteps();
}

function buildSoakTool() {
  const tool = node('div', null, 'step-tool');
  tool.append(node('span', 'FRIDGE-SOAK PLANNER', 'tool-label'));
  const fields = node('div', null, 'soak-fields');
  const startLabel = node('label', 'Started');
  const start = node('input');
  start.type = 'datetime-local';
  start.id = 'soak-start';
  startLabel.append(start);
  const hoursLabel = node('label', 'Soak length');
  const hours = node('select');
  hours.id = 'soak-hours';
  for (const value of [12, 24, 48]) {
    const option = node('option', `${value} hours`);
    option.value = value;
    hours.append(option);
  }
  hoursLabel.append(hours);
  fields.append(startLabel, hoursLabel, toolButton('Start now', 'start-soak'));
  const result = node('p', '', 'soak-result');
  result.id = 'soak-result';
  result.setAttribute('aria-live', 'polite');
  tool.append(fields, result, node('p', 'This plans your fridge soak; it does not send a reminder.', 'tool-note'));
  return tool;
}

function renderSoak() {
  $('#soak-start').value = prefs.soak.startedAt ? localDateTime(new Date(prefs.soak.startedAt)) : '';
  $('#soak-hours').value = String(prefs.soak.hours);
  if (!prefs.soak.startedAt) { $('#soak-result').textContent = 'Set a start time. The peppers will handle the waiting.'; return; }
  const ready = new Date(soakReady(prefs.soak.startedAt, prefs.soak.hours));
  const time = ready.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('#soak-result').textContent = `${ready.getTime() <= Date.now() ? 'Your planned soak ended' : 'Planned soak ends'} ${time}. Keep refrigerated.`;
}

function buildTimer() {
  const tool = node('div', null, 'step-tool');
  tool.append(node('span', 'SIMMER CHECK-IN', 'tool-label'));
  const row = node('div', null, 'timer-row');
  const digits = node('span', '10:00', 'timer-digits');
  digits.id = 'timer-digits';
  digits.setAttribute('role', 'timer');
  digits.setAttribute('aria-label', 'Simmer countdown');
  const toggle = toolButton('Start timer', 'timer-toggle');
  toggle.id = 'timer-toggle';
  row.append(digits, toggle, toolButton('Reset', 'timer-reset', 'text-button'));
  tool.append(row, node('p', 'Start once simmering. Check carrot tenderness at the end. On-screen cue only.', 'tool-note'));
  return tool;
}

function renderTimer() {
  const seconds = timerRemaining(prefs.timer);
  $('#timer-digits').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#timer-toggle').textContent = prefs.timer.deadline !== null ? 'Pause' : seconds === 0 ? 'Restart' : seconds < 600 ? 'Resume' : 'Start timer';
}

function renderSteps() {
  $$('[data-step]').forEach(input => {
    input.checked = prefs.completed.includes(input.dataset.step);
    input.closest('.method-step').classList.toggle('completed', input.checked);
  });
  $('#step-count').textContent = `${prefs.completed.length} / 4 complete`;
}

function batchField(name) { return $('#batch-form').elements.namedItem(name); }

function openBatch(id = null) {
  const batch = notebook.batches.find(b => b.id === id);
  editingId = batch?.id ?? null;
  $('#batch-form').reset();
  $('#batch-dialog-title').textContent = batch ? 'Amend your condiment.' : 'Commit your condiment.';
  $('#batch-error').textContent = '';
  batchField('madeOn').value = batch ? localDateTime(new Date(batch.date)).slice(0, 10) : today();
  batchField('scale').value = String(batch?.scale ?? prefs.scale);
  batchField('soakHours').value = String(batch?.soakHours ?? prefs.soak.hours);
  for (const name of ['name', 'peppers', 'notes']) batchField(name).value = batch?.[name] ?? '';
  for (const name of ['heat', 'tang']) batchField(name).value = String(batch?.[name] ?? 0);
  $('#batch-dialog').showModal();
}

const rating = number => number ? `${number}/5` : 'Not tasted';

function renderNotebook() {
  $('#batch-count').textContent = String(notebook.batches.length);
  $('#notebook-status').textContent = canStore ? 'Stored only in this browser. Export a backup to keep your notes.' : 'Browser storage unavailable. Export a backup before closing this tab.';
  if (!notebook.batches.length) {
    const empty = node('div', null, 'empty-state');
    empty.append(node('h2', 'No batches yet. Plenty of theories.'), node('p', 'Log what you actually made, then come back after tasting. The best batch deserves a reproducible recipe.'), toolButton('Log your first batch →', 'new-batch', 'button'));
    $('#batch-list').replaceChildren(empty);
  } else {
    $('#batch-list').replaceChildren(...notebook.batches.map(batch => {
      const card = node('article', null, 'batch-card');
      const top = node('div', null, 'batch-card-top');
      const time = node('time', dateLabel(batch.date));
      time.dateTime = batch.date;
      const edit = toolButton('Edit notes ↗', 'edit-batch', 'text-button');
      edit.dataset.batch = batch.id;
      top.append(time, edit);
      const meta = node('div', null, 'batch-meta');
      for (const text of [`${formatQuantity(batch.scale)}× recipe`, `${batch.soakHours}h soak`, `Heat: ${rating(batch.heat)}`, `Tang: ${rating(batch.tang)}`]) meta.append(node('span', text));
      card.append(top, node('h2', batch.name), meta);
      if (batch.peppers) card.append(node('p', `Peppers: ${batch.peppers}`, 'pepper-note'));
      card.append(node('p', batch.notes || 'No tasting notes yet. The scientific method is waiting.'));
      return card;
    }));
  }
  renderComparison();
}

function renderComparison() {
  $('#comparison').hidden = notebook.batches.length < 2;
  if (notebook.batches.length < 2) return;
  const latest = notebook.batches.slice(0, 2);
  const table = node('table');
  const head = node('thead');
  const heading = node('tr');
  heading.append(node('th', 'Last two batches'), ...latest.map(b => node('th', b.name)));
  head.append(heading);
  const body = node('tbody');
  for (const [label, read] of [['Scale', b => `${formatQuantity(b.scale)}×`], ['Soak', b => `${b.soakHours} hours`], ['Peppers', b => b.peppers || 'Not recorded'], ['Heat', b => rating(b.heat)], ['Tang', b => rating(b.tang)]]) {
    const row = node('tr');
    row.append(node('td', label), ...latest.map(b => node('td', read(b))));
    body.append(row);
  }
  table.append(head, body);
  $('#comparison').replaceChildren(node('h2', 'What changed this time?'), table);
}

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = node('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function act(action, source) {
  switch (action) {
    case 'print': window.print(); break;
    case 'new-batch': openBatch(); break;
    case 'edit-batch': openBatch(source.dataset.batch); break;
    case 'start-soak': prefs.soak.startedAt = new Date().toISOString(); savePrefs(); renderSoak(); break;
    case 'timer-toggle': {
      const remaining = timerRemaining(prefs.timer);
      prefs.timer = prefs.timer.deadline !== null ? { deadline: null, remaining } : { deadline: Date.now() + (remaining || 600) * 1000, remaining: remaining || 600 };
      savePrefs(); renderTimer(); break;
    }
    case 'timer-reset': prefs.timer = { deadline: null, remaining: 600 }; savePrefs(); renderTimer(); break;
    case 'clear-checks': prefs.checked = []; savePrefs(); renderIngredients(); break;
    case 'copy-list':
      try { await navigator.clipboard.writeText(shoppingList(prefs.scale, prefs.metric)); notify('Shopping list copied. Procurement is now your problem.'); }
      catch { notify('Clipboard unavailable. Use Download .txt instead.'); }
      break;
    case 'download-list': download(shoppingList(prefs.scale, prefs.metric), 'piqueops-shopping-list.txt', 'text/plain;charset=utf-8'); notify('Shopping list downloaded.'); break;
    case 'export-notebook': download(JSON.stringify({ ...notebook, source: SOURCE.url }, null, 2), `piqueops-batches-${today()}.json`, 'application/json'); notify('Notebook exported. A backup strategy with actual evidence.'); break;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-close')) button.closest('dialog').close();
  if (button.dataset.scale) {
    const nextScale = Number(button.dataset.scale);
    if (nextScale !== prefs.scale) {
      prefs.scale = nextScale;
      prefs.checked = [];
      savePrefs(); renderIngredients();
      notify('Quantities updated. Ingredient checks reset for the new batch size.');
    }
  }
  if (button.dataset.action) act(button.dataset.action, button);
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.dataset.ingredient) {
    prefs.checked = prefs.checked.filter(id => id !== input.dataset.ingredient);
    if (input.checked) prefs.checked.push(input.dataset.ingredient);
    savePrefs(); renderIngredients();
    document.getElementById(input.id)?.focus();
  }
  if (input.dataset.step) {
    prefs.completed = prefs.completed.filter(id => id !== input.dataset.step);
    if (input.checked) prefs.completed.push(input.dataset.step);
    savePrefs(); renderSteps();
  }
  if (input.id === 'measure-units') { prefs.metric = input.value === 'metric'; savePrefs(); renderIngredients(); }
  if (input.id === 'soak-start') {
    const date = new Date(input.value);
    prefs.soak.startedAt = Number.isFinite(date.getTime()) ? date.toISOString() : null;
    savePrefs(); renderSoak();
  }
  if (input.id === 'soak-hours') { prefs.soak.hours = Number(input.value); savePrefs(); renderSoak(); }
});

$('#batch-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!editingId && notebook.batches.length >= 100) throw new Error('Notebook holds 100 batches. Export a backup before starting a new notebook.');
    const form = new FormData(event.currentTarget);
    const date = new Date(`${form.get('madeOn')}T12:00:00`).toISOString();
    const batch = makeBatch({ name: form.get('name'), scale: Number(form.get('scale')), soakHours: Number(form.get('soakHours')), peppers: form.get('peppers'), heat: Number(form.get('heat')), tang: Number(form.get('tang')), notes: form.get('notes') }, editingId ?? crypto.randomUUID(), date);
    const index = notebook.batches.findIndex(b => b.id === editingId);
    if (index >= 0) notebook.batches[index] = batch;
    else notebook.batches.unshift(batch);
    notebook.batches.sort((a, b) => new Date(b.date) - new Date(a.date));
    const saved = save(NOTE_KEY, notebook);
    renderNotebook();
    $('#batch-dialog').close();
    location.hash = 'batches';
    notify(saved ? 'Batch saved. You have outperformed the masking-tape label.' : 'Kept for this session. Export a backup before closing the tab.');
  } catch (error) { $('#batch-error').textContent = error.message; }
});

$('#import-notebook').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 500000) throw new Error('Backup is too large. Choose a PiqueOps notebook under 500 KB.');
    const incoming = JSON.parse(await file.text());
    if (!validNotebook(incoming)) throw new Error('This is not a valid PiqueOps notebook backup.');
    const additions = incoming.batches.filter(b => !notebook.batches.some(saved => saved.id === b.id));
    if (notebook.batches.length + additions.length > 100) throw new Error('That import would exceed 100 saved batches.');
    notebook.batches.push(...additions);
    notebook.batches.sort((a, b) => new Date(b.date) - new Date(a.date));
    const saved = save(NOTE_KEY, notebook);
    renderNotebook();
    notify(`${additions.length} batch${additions.length === 1 ? '' : 'es'} imported; existing records kept.${saved ? '' : ' Export before closing: browser storage is unavailable.'}`);
  } catch (error) { notify(error instanceof SyntaxError ? 'That file is not valid JSON. Choose a PiqueOps backup.' : error.message); }
  event.target.value = '';
});

window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0, behavior: 'instant' }); });
setInterval(() => {
  if (prefs.timer.deadline !== null && timerRemaining(prefs.timer) === 0) {
    prefs.timer = { deadline: null, remaining: 0 };
    savePrefs();
    notify('Ten minutes are up. Check whether the carrot is soft.');
  }
  renderTimer();
}, 1000);

renderIngredients();
buildSteps();
renderSoak();
renderTimer();
renderNotebook();
route();
