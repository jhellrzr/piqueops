export const VERSION = '0.2.0';
export const HEAT_LIMIT = 50000;
export const SCENARIOS = [
  { id: 'cap-lock', title: 'Unplanned cap rotation', service: 'Access control', severity: 2,
    cause: 'The lid was tightened by someone with something to prove.',
    impact: 'One plate is cooling. Stakeholder confidence is also cooling.',
    resolution: 'A dish towel bypassed the access-control layer.',
    action: 'Implement single sign-on. It is one person opening the jar.' },
  { id: 'heat-budget', title: 'Scoville budget exceeded', service: 'Taste buds', severity: 1,
    cause: 'The canary said "probably fine" before losing the ability to speak.',
    impact: 'Production traffic redirected to the nearest glass of milk.',
    resolution: 'Rolled back to the previous batch. Deployed emergency extra rice.',
    action: 'Require a second reviewer whose eyes are not watering.' },
  { id: 'single-bottle', title: 'Single point of flavor', service: 'Bottle availability', severity: 2,
    cause: 'The entire platform depended on one very small bottle.',
    impact: 'Three plates of beans entered a degraded experience.',
    resolution: 'Provisioned the backup bottle from the fridge door.',
    action: 'Buy a second jar. Tell investors we are now multi-region.' },
  { id: 'unbounded-pour', title: 'Unbounded pour', service: 'Flow control', severity: 1,
    cause: 'Someone removed the flow restrictor to improve throughput.',
    impact: 'The plate became a delivery mechanism for a puddle.',
    resolution: 'Scaled horizontally by adding another plate.',
    action: 'Add a rate limiter. It is a smaller hole.' },
  { id: 'label-drift', title: 'Configuration drift', service: 'Jar identity', severity: 2,
    cause: 'The label fell off. Everyone assumed it was the mild one.',
    impact: 'A development batch was promoted directly to a dinner guest.',
    resolution: 'Restored the label from a backup piece of masking tape.',
    action: 'Version-control the labels. Ask Jake to stop using pencil.' }
];

const clone = value => JSON.parse(JSON.stringify(value));
const event = (state, message, kind, at) => {
  state.events.unshift({ message, kind, at });
  state.events = state.events.slice(0, 30);
};

export function createKitchen(at = new Date().toISOString()) {
  return {
    schema: 1, sequence: 1, incidentSequence: 0, revision: 0,
    current: { id: 'batch-001', heat: 5800, at }, previous: null,
    fill: 82, plates: 14, activeIncident: null, incidents: [],
    deployments: [{ id: 'batch-001', heat: 5800, at, status: 'healthy' }],
    events: [
      { message: 'batch-001 is serving production traffic. Mostly plates.', kind: 'deploy', at },
      { message: 'Canary spoon passed. It has requested a transfer.', kind: 'system', at },
      { message: 'Kitchen online. Jake is on call. Again.', kind: 'system', at }
    ]
  };
}

export function validKitchen(value) {
  if (!value || value.schema !== 1 || !Number.isInteger(value.sequence) || value.sequence < 1 || !Number.isInteger(value.incidentSequence) || !Number.isInteger(value.revision)) return false;
  const batch = b => b && typeof b.id === 'string' && b.id.length < 50 && Number.isFinite(b.heat) && b.heat >= 1000 && b.heat <= 100000 && typeof b.at === 'string';
  if (!batch(value.current) || (value.previous !== null && !batch(value.previous))) return false;
  if (!Number.isFinite(value.fill) || value.fill < 0 || value.fill > 100 || !Number.isFinite(value.plates) || value.plates < 0) return false;
  if (!Array.isArray(value.events) || value.events.length > 30 || !value.events.every(e => typeof e.message === 'string' && e.message.length < 500 && typeof e.at === 'string' && typeof e.kind === 'string')) return false;
  if (!Array.isArray(value.deployments) || value.deployments.length > 12 || !value.deployments.every(batch)) return false;
  if (!Array.isArray(value.incidents) || value.incidents.length > 12 || !value.incidents.every(i => SCENARIOS.some(s => s.id === i.scenario) && typeof i.id === 'string' && typeof i.at === 'string' && typeof i.resolved === 'boolean' && batch(i.restore) && (i.resolvedAt == null || typeof i.resolvedAt === 'string'))) return false;
  return value.activeIncident === null || value.incidents.some(i => i.id === value.activeIncident && !i.resolved);
}

export function activeIncident(state) {
  return state.incidents.find(i => i.id === state.activeIncident) ?? null;
}

export function scenarioFor(incident) {
  return SCENARIOS.find(s => s.id === incident?.scenario) ?? SCENARIOS[0];
}

export function triggerIncident(state, scenarioId = 'cap-lock', at = new Date().toISOString()) {
  if (state.activeIncident) return clone(state);
  if (!SCENARIOS.some(s => s.id === scenarioId)) throw new Error('Unknown incident scenario.');
  const next = clone(state);
  const id = `INC-${String(++next.incidentSequence).padStart(3, '0')}`;
  const incident = { id, scenario: scenarioId, at, resolved: false, restore: clone(next.current) };
  if (scenarioId === 'heat-budget') next.current.heat = 96000;
  next.incidents.unshift(incident);
  next.incidents = next.incidents.slice(0, 12);
  next.activeIncident = id;
  next.revision++;
  event(next, `${id} opened: ${scenarioFor(incident).title}.`, 'incident', at);
  return next;
}

export function deployBatch(state, heat = 5800, at = new Date().toISOString()) {
  if (!Number.isInteger(heat) || heat < 1000 || heat > 100000) throw new Error('Heat must be a whole number between 1,000 and 100,000 SHU.');
  if (state.activeIncident) throw new Error('Resolve the active incident before deploying another batch.');
  if (state.fill < 8) throw new Error('The jar is nearly empty. Top it up before deploying.');
  let next = clone(state);
  next.previous = clone(next.current);
  next.current = { id: `batch-${String(++next.sequence).padStart(3, '0')}`, heat, at };
  next.fill = Math.max(0, next.fill - 8);
  next.plates += 3;
  next.revision++;
  next.deployments.unshift({ ...next.current, status: heat > HEAT_LIMIT ? 'degraded' : 'healthy' });
  next.deployments = next.deployments.slice(0, 12);
  event(next, `${next.current.id} deployed at ${heat.toLocaleString('en-US')} SHU. Lunch has been impacted.`, 'deploy', at);
  if (heat > HEAT_LIMIT) {
    next = triggerIncident(next, 'heat-budget', at);
    next.current.heat = heat;
    next.incidents[0].restore = clone(next.previous);
    next.incidents[0].failedBatch = next.current.id;
  }
  return next;
}

export function resolveIncident(state, at = new Date().toISOString()) {
  if (!activeIncident(state)) return clone(state);
  const next = clone(state);
  const incident = activeIncident(next);
  incident.resolved = true;
  incident.resolvedAt = at;
  if (incident.scenario === 'heat-budget') {
    const failed = next.deployments.find(b => b.id === incident.failedBatch);
    if (failed) failed.status = 'rolled back';
    next.current = clone(incident.restore);
    next.previous = null;
  }
  next.activeIncident = null;
  next.revision++;
  event(next, `${incident.id} resolved. ${scenarioFor(incident).resolution}`, 'resolved', at);
  return next;
}

export function rollbackBatch(state, at = new Date().toISOString()) {
  const next = state.activeIncident ? resolveIncident(state, at) : clone(state);
  if (!next.previous) return next;
  const failed = next.deployments.find(b => b.id === next.current.id);
  if (failed) failed.status = 'rolled back';
  const old = next.current.id;
  next.current = clone(next.previous);
  next.previous = null;
  next.revision++;
  event(next, `${old} rolled back. ${next.current.id} has been asked to work late.`, 'resolved', at);
  return next;
}

export function refillJar(state, at = new Date().toISOString()) {
  const next = clone(state);
  next.fill = 100;
  next.revision++;
  event(next, 'Jar topped up. Capacity planning has been declared a success.', 'system', at);
  return next;
}

export function pageJake(state, at = new Date().toISOString()) {
  const next = clone(state);
  next.revision++;
  event(next, 'Jake paged Jake. Jake is unavailable because Jake is paging Jake.', 'page', at);
  return next;
}

export function postmortem(incident) {
  if (!incident) return 'No incidents yet. Suspicious, but congratulations.';
  const s = scenarioFor(incident);
  return `# ${incident.id}: ${s.title}\n\n> PiqueOps simulation. All telemetry is fictional.\n\n**Status:** ${incident.resolved ? 'Resolved' : 'Open — draft postmortem'}\n**Severity:** SEV-${s.severity}\n**Incident commander:** Jake, holding a plate\n**Opened:** ${incident.at}\n${incident.resolved ? `**Resolved:** ${incident.resolvedAt}\n` : ''}\n## What happened\n\n${s.cause}\n\n## Impact\n\n${s.impact}\n\n## ${incident.resolved ? 'Resolution' : 'Proposed resolution'}\n\n${s.resolution}\n\n## What went well\n\nNobody said “let’s hop on a quick call.”\n\n## What went poorly\n\nEverything immediately before this document.\n\n## Action item\n\n- [ ] ${s.action}\n\n**Owner:** Jake\n**Due:** Before the next plate (already overdue)\n\n---\n\nNo individuals were blamed. The bottle knows what it did.\n`;
}
