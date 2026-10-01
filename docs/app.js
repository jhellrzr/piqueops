import { SCENARIOS, HEAT_LIMIT, createKitchen, validKitchen, activeIncident, scenarioFor, deployBatch, triggerIncident, resolveIncident, rollbackBatch, refillJar, pageJake, postmortem } from './kitchen.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const STORAGE_KEY = 'piqueops.kitchen.v1';
const views = ['overview', 'deployments', 'incidents', 'postmortems'];
let storageAvailable = true;
let kitchen = createKitchen();
let busy = false;
let toastTimer;
let selectedReport;

try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (validKitchen(stored)) kitchen = stored;
} catch (error) { if (!(error instanceof SyntaxError)) storageAvailable = false; }

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function timeLabel(at) {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? 'Earlier' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}

function update(next) {
  kitchen = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(kitchen)); storageAvailable = true; }
  catch { storageAvailable = false; }
  render();
}

function route() {
  const requested = location.hash.slice(1);
  const current = views.includes(requested) ? requested : 'overview';
  $$('[data-view]').forEach(section => { section.hidden = section.dataset.view !== current; });
  $$('[data-nav]').forEach(link => {
    if (link.dataset.nav === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = current[0].toUpperCase() + current.slice(1);
  document.title = `${current[0].toUpperCase() + current.slice(1)} · PiqueOps`;
}

function render() {
  const incident = activeIncident(kitchen);
  const scenario = incident ? scenarioFor(incident) : null;
  document.body.dataset.health = incident ? 'degraded' : 'healthy';
  $('#system-title').replaceChildren(document.createTextNode(incident ? 'Some systems spicy' : 'All systems spicy'), element('span', '.'));
  $('#system-subtitle').textContent = incident ? 'Something has gone wrong. The enterprise is one person with a dish towel.' : 'Your infrastructure has 99.99% uptime. Your plate has four minutes.';
  $('#metric-heat').textContent = kitchen.current.heat.toLocaleString('en-US');
  $('#metric-plates').replaceChildren(document.createTextNode(kitchen.plates.toLocaleString('en-US')), element('span', 'plates', 'unit'));
  $('#heat-note').textContent = kitchen.current.heat > HEAT_LIMIT ? 'Taste buds have left the chat.' : kitchen.current.heat > 10000 ? 'A bold career move.' : 'Assertive, but employable.';
  $('#batch-id').textContent = kitchen.current.id;
  $('#fill-label').textContent = `${kitchen.fill}% remaining`;
  $('#fill-bar').style.width = `${kitchen.fill}%`;
  $('#sauce-fill').setAttribute('y', String(285 - kitchen.fill * 2.1));
  $('#sauce-fill').setAttribute('height', String(kitchen.fill * 2.1));
  $('#map-status').textContent = incident ? '● Degraded' : '● Healthy';
  $('#map-status').classList.toggle('danger', Boolean(incident));
  $('#plate-state').textContent = incident ? 'Regrets reported' : 'Receiving traffic';
  $('#deployment-count').textContent = String(kitchen.sequence);
  $('#incident-count').textContent = incident ? '1' : '0';
  $('#incident-banner').hidden = !incident;
  if (incident) {
    $('#banner-title').textContent = `${incident.id} · ${scenario.title}`;
    $('#banner-impact').textContent = scenario.impact;
  }
  $('#storage-status').textContent = storageAvailable ? 'Saved in this browser' : 'Temporary session · storage unavailable';
  $('#activity-list').replaceChildren(...kitchen.events.slice(0, 4).map(item => {
    const li = element('li');
    const time = element('time', timeLabel(item.at));
    time.dateTime = item.at;
    li.append(element('span', '', `event-dot ${item.kind}`), element('span', item.message), time);
    return li;
  }));
  renderDeployments();
  renderIncidents();
  renderReport();
  $('#rollback-button').disabled = busy || (!kitchen.previous && !kitchen.activeIncident);
  $$('[data-action="deploy"]').forEach(button => {
    button.disabled = busy || Boolean(incident);
    button.title = incident ? 'Resolve the active incident first.' : '';
  });
  $$('[data-action="incident"]').forEach(button => { button.disabled = busy || Boolean(incident); });
}

function renderDeployments() {
  $('#deployment-rows').replaceChildren(...kitchen.deployments.map(batch => {
    const row = element('tr');
    const name = element('td', batch.id);
    if (batch.id === kitchen.current.id) name.append(element('small', 'CURRENT'));
    const status = element('td');
    const state = batch.id === kitchen.current.id && kitchen.activeIncident ? 'degraded' : batch.status;
    status.append(element('span', state, `pill ${state === 'degraded' ? 'danger' : state === 'rolled back' ? 'neutral' : ''}`));
    const date = element('td');
    const time = element('time', timeLabel(batch.at));
    time.dateTime = batch.at;
    date.append(time);
    row.append(name, element('td', `${batch.heat.toLocaleString('en-US')} SHU`), element('td', 'production plate'), status, date);
    return row;
  }));
}

function actionButton(label, action, className = 'button small') {
  const button = element('button', label, className);
  button.dataset.action = action;
  return button;
}

function renderIncidents() {
  if (!kitchen.incidents.length) {
    const empty = element('div', null, 'panel empty-state');
    empty.append(element('span', '⚑'), element('h2', 'Quiet kitchen. Suspicious kitchen.'), element('p', 'No incidents reported. You can fix that in one click.'), actionButton('Inject an incident ↗', 'incident', 'button'));
    $('#incident-list').replaceChildren(empty);
    return;
  }
  $('#incident-list').replaceChildren(...kitchen.incidents.map(incident => {
    const scenario = scenarioFor(incident);
    const card = element('article', null, 'incident-card');
    const top = element('div', null, 'incident-card-top');
    top.append(element('span', incident.id, 'mono'), element('span', `SEV-${scenario.severity}`, `pill ${incident.resolved ? 'neutral' : 'danger'}`), element('span', incident.resolved ? '● Resolved' : '● Investigating', 'mono'));
    const bottom = element('div', null, 'incident-card-bottom');
    bottom.append(element('small', `${scenario.service} · Commander: Jake · ${timeLabel(incident.at)}`));
    const actions = element('div', null, 'button-group');
    if (!incident.resolved) actions.append(actionButton('Resolve incident ↗', 'resolve'));
    const report = actionButton('Read postmortem →', 'report');
    report.dataset.incident = incident.id;
    actions.append(report);
    bottom.append(actions);
    card.append(top, element('h2', scenario.title), element('p', incident.resolved ? scenario.resolution : scenario.impact), bottom);
    return card;
  }));
}

function reportIncident() {
  return kitchen.incidents.find(i => i.id === selectedReport) ?? kitchen.incidents[0];
}

function renderReport() {
  const incident = reportIncident();
  $('#report-empty').hidden = Boolean(incident);
  $('#report-content').hidden = !incident;
  $('#copy-report').disabled = !incident;
  $('#download-report').disabled = !incident;
  $('#report-incident').disabled = !incident;
  $('#report-incident').replaceChildren(...kitchen.incidents.map(i => {
    const option = element('option', `${i.id} · ${scenarioFor(i).title}`);
    option.value = i.id;
    return option;
  }));
  if (!incident) { $('#report-content').replaceChildren(); return; }
  selectedReport = incident.id;
  $('#report-incident').value = selectedReport;
  const scenario = scenarioFor(incident);
  const nodes = [element('h2', `${incident.id}: ${scenario.title}`), element('p', `${incident.resolved ? 'RESOLVED' : 'OPEN — DRAFT'} / SEV-${scenario.severity} / COMMANDER: JAKE, HOLDING A PLATE`, 'report-meta')];
  for (const [title, text] of [
    ['What happened', scenario.cause], ['Impact', scenario.impact],
    [incident.resolved ? 'Resolution' : 'Proposed resolution', scenario.resolution],
    ['What went well', 'Nobody said “let’s hop on a quick call.”'],
    ['What went poorly', 'Everything immediately before this document.'],
    ['Action item', `${scenario.action} Owner: Jake. Due: before the next plate (already overdue).`]
  ]) nodes.push(element('h3', title), element('p', text));
  nodes.push(element('p', 'No individuals were blamed. The bottle knows what it did.', 'report-ending'));
  $('#report-content').replaceChildren(...nodes);
}

function openDialog(id) {
  $$('dialog[open]').forEach(dialog => dialog.close());
  $(id).showModal();
}

const deploymentSteps = [
  'Compiled peppers. Resolved vinegar dependency.',
  'Unit tests passed. Spoon requests PTO.',
  'Canary spoon has entered the environment.',
  'Jake approved Jake’s change.',
  'Batch promoted to production plate.'
];

async function runDeployment(heat) {
  if (busy) return;
  busy = true;
  render();
  $('#deploy-form').hidden = true;
  $('#deploy-progress').hidden = false;
  $('#deployment-done').hidden = true;
  $('#deploy-title').textContent = 'Deploying to lunch…';
  $('#deploy-steps').replaceChildren(...deploymentSteps.map(text => element('li', `○  ${text}`)));
  const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 600;
  for (const step of $('#deploy-steps').children) {
    step.className = 'current';
    await new Promise(resolve => setTimeout(resolve, delay));
    step.className = 'done';
    step.textContent = step.textContent.replace('○', '✓');
  }
  busy = false;
  try {
    update(deployBatch(kitchen, heat));
    $('#deploy-title').textContent = kitchen.activeIncident ? 'Lunch has been impacted.' : 'Deployment delicious.';
    notify(kitchen.activeIncident ? 'Scoville budget exceeded. An incident has been opened.' : `${kitchen.current.id} is live. Stakeholders may now eat.`);
  } catch (error) {
    $('#deploy-title').textContent = 'Deployment stopped.';
    notify(error.message);
    render();
  }
  $('#deployment-done').hidden = false;
  $('#deployment-done').focus();
}

async function perform(action, source) {
  if (busy && !['help', 'commands', 'page'].includes(action)) {
    notify('A deployment is in progress. One bad decision at a time.');
    return;
  }
  switch (action) {
    case 'deploy':
      if (kitchen.activeIncident) { notify('Resolve the active incident before deploying.'); return; }
      $('#deploy-form').hidden = false;
      $('#deploy-progress').hidden = true;
      $('#deploy-title').textContent = 'How much confidence?';
      openDialog('#deploy-dialog');
      break;
    case 'incident':
      if (kitchen.activeIncident) { notify('The current incident would like your attention first.'); return; }
      update(triggerIncident(kitchen, SCENARIOS[kitchen.incidentSequence % SCENARIOS.length].id));
      selectedReport = kitchen.activeIncident;
      renderReport();
      notify(`${kitchen.activeIncident} opened. This could have been a sandwich.`);
      break;
    case 'resolve':
      update(resolveIncident(kitchen));
      notify('Service restored. A blameless postmortem has been prepared.');
      break;
    case 'rollback':
      update(rollbackBatch(kitchen));
      notify('Previous batch restored. History will remember the extra rice.');
      break;
    case 'refill':
      update(refillJar(kitchen));
      notify('Jar topped up. This counts as infrastructure investment.');
      break;
    case 'page':
      update(pageJake(kitchen));
      notify('Jake paged Jake. Jake is unavailable because Jake is paging Jake.');
      break;
    case 'commands': openDialog('#command-dialog'); break;
    case 'help': openDialog('#help-dialog'); break;
    case 'reset': openDialog('#reset-dialog'); break;
    case 'postmortems': location.hash = 'postmortems'; break;
    case 'report':
      selectedReport = source.dataset.incident;
      renderReport();
      location.hash = 'postmortems';
      break;
    case 'copy-report':
      try { await navigator.clipboard.writeText(postmortem(reportIncident())); notify('Postmortem copied. Organizational learning is now portable.'); }
      catch { notify('Clipboard unavailable. Use Download .md to save the report.'); }
      break;
    case 'download-report': {
      const incident = reportIncident();
      if (!incident) return;
      const url = URL.createObjectURL(new Blob([postmortem(incident)], { type: 'text/markdown;charset=utf-8' }));
      const link = element('a');
      link.href = url;
      link.download = `piqueops-${incident.id.toLowerCase()}-postmortem.md`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Postmortem exported. We are calling this knowledge management.');
      break;
    }
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-close')) button.closest('dialog').close();
  if (button.dataset.command) {
    button.closest('dialog').close();
    perform(button.dataset.command, button);
  } else if (button.dataset.action) perform(button.dataset.action, button);
});

$('#deploy-form').addEventListener('submit', event => {
  event.preventDefault();
  runDeployment(Number(new FormData(event.currentTarget).get('heat')));
});

$('#confirm-reset').addEventListener('click', () => {
  if (busy) { notify('Wait for the active deployment to finish before resetting.'); return; }
  selectedReport = undefined;
  update(createKitchen());
  $('#reset-dialog').close();
  location.hash = 'overview';
  notify('New jar. Clean conscience. Exactly the same on-call engineer.');
});

$('#report-incident').addEventListener('change', event => {
  selectedReport = event.target.value;
  renderReport();
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if ($('#command-dialog').open) $('#command-dialog').close();
    else openDialog('#command-dialog');
  }
});

window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0, behavior: 'instant' }); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || busy) return;
  try {
    const next = JSON.parse(event.newValue);
    if (validKitchen(next)) { kitchen = next; render(); }
  } catch { /* An unrelated or incomplete storage value does not replace the kitchen. */ }
});

render();
route();
