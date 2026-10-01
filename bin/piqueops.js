#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { randomInt } from 'node:crypto';
import { SOURCE, STEPS, scaledIngredients, shoppingList, formatQuantity } from '../docs/recipe.js';
import { VERSION, SCENARIOS, createKitchen, activeIncident, scenarioFor, deployBatch, triggerIncident, resolveIncident, postmortem } from '../docs/kitchen.js';

const help = `PiqueOps — actual sauce, excessive project management

Usage: node bin/piqueops.js [command] [options]

Commands:
  recipe       The actual recipe, scaled to your ambition
  shopping     A grocery list without a purchase order
  status       Inspect the condiment infrastructure (default)
  deploy       Promote a batch from staging spoon to production plate
  incident     Page the only person who can open the jar
  postmortem   Explain why the plate experienced downtime

Options:
  --scale N        Recipe multiplier: 0.5, 1, 2, or 3 (recipe / shopping)
  --metric         Convert liquids to mL (recipe / shopping)
  --heat N         Heat of a deployment, 1000–100000 SHU (default: 5800)
  --scenario ID    Incident scenario (incident / postmortem)
  --json           Machine-readable, emotionally unreadable
  --markdown       Export a postmortem as Markdown
  --help, -h       Reduce time to condiment
  --version, -v    Show the version

Scenarios: ${SCENARIOS.map(s => s.id).join(', ')}

Examples:
  node bin/piqueops.js recipe --scale 2
  node bin/piqueops.js shopping --scale 0.5 --metric
  node bin/piqueops.js deploy --heat 96000
  node bin/piqueops.js incident --scenario cap-lock --json
  node bin/piqueops.js postmortem --scenario unbounded-pour --markdown

Recipe and shopping quantities come from the credited recipe. The four
operations commands are independent simulations. No network requests or file writes.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      heat: { type: 'string' }, scenario: { type: 'string' },
      scale: { type: 'string' }, metric: { type: 'boolean' },
      json: { type: 'boolean' }, markdown: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }
    }
  });
  const command = positionals[0] ?? 'status';
  if (values.help || command === 'help') console.log(help);
  else if (values.version) console.log(VERSION);
  else {
    if (positionals.length > 1) throw new Error('One incident at a time, please. Supply one command.');
    if (!['recipe', 'shopping', 'status', 'deploy', 'incident', 'postmortem'].includes(command)) throw new Error(`Unknown command: ${command}`);
    const practical = ['recipe', 'shopping'].includes(command);
    if ((values.scale !== undefined || values.metric) && !practical) throw new Error('--scale and --metric are available for recipe and shopping.');
    if (values.json && values.markdown) throw new Error('Choose --json or --markdown. Even enterprise software has limits.');
    if (values.markdown && command !== 'postmortem') throw new Error('--markdown is available for postmortems.');
    if (values.heat !== undefined && command !== 'deploy') throw new Error('--heat is available for deployments.');
    if (values.scenario && !['incident', 'postmortem'].includes(command)) throw new Error('--scenario is available for incidents and postmortems.');
    if (values.scenario && !SCENARIOS.some(s => s.id === values.scenario)) throw new Error(`Unknown scenario: ${values.scenario}`);
    if (practical) {
      const scale = values.scale === undefined ? 1 : Number(values.scale);
      const ingredients = scaledIngredients(scale, values.metric);
      if (values.json) console.log(JSON.stringify({ command, scale, metricLiquids: !!values.metric, source: SOURCE, ingredients: command === 'shopping' ? ingredients.filter(i => !i.pantry) : ingredients, ...(command === 'recipe' ? { steps: STEPS, storage: 'Keep the soak and finished sauce refrigerated. Not a canning recipe.' } : {}) }, null, 2));
      else if (command === 'shopping') console.log(shoppingList(scale, values.metric));
      else console.log(`PIQUEOPS / THE ACTUAL RECIPE\n${formatQuantity(scale)}× batch · For meat, rice, and beans.\n\n${ingredients.map(i => `${i.quantity} ${i.name}`).join('\n')}\n\nWater for simmering: enough to cover the vegetables.\n${values.metric ? 'Liquids use rounded US-cup conversions; solid measures stay as published.\n' : ''}\n${STEPS.map((s, i) => `${i + 1}. ${s.title}\n${s.text}`).join('\n\n')}\n\nCool hot ingredients as needed; follow your blender’s warm-liquid instructions.\nKeep the soak and sauce refrigerated. This is not a canning recipe.\n\n${SOURCE.credit}\n${SOURCE.url}`);
    } else {
    const heat = values.heat === undefined ? 5800 : Number(values.heat);
    if (values.heat !== undefined && !/^\d+$/.test(values.heat)) throw new Error('Heat must be a whole number between 1000 and 100000.');
    const scenarioId = values.scenario ?? SCENARIOS[randomInt(SCENARIOS.length)].id;
    let kitchen = createKitchen();
    if (command === 'deploy') kitchen = deployBatch(kitchen, heat);
    if (command === 'incident' || command === 'postmortem') kitchen = triggerIncident(kitchen, scenarioId);
    if (command === 'postmortem') kitchen = resolveIncident(kitchen);
    const incident = kitchen.incidents[0];
    const scenario = scenarioFor(incident);
    let report;
    if (command === 'status') report = {
      title: 'ALL SYSTEMS SPICY',
      fields: {
        Service: 'pique-production', Region: 'kitchen-counter-1',
        Replicas: '1 jar. We discussed 2 in planning.',
        Heat: `${kitchen.current.heat.toLocaleString('en-US')} SHU`,
        Uptime: '99.99% (the other 0.01% was lunch)',
        Throughput: '3 plates / minute', 'Operational maturity': '0%. Unchanged since inception.',
        'Open incidents': 'None. Suspicious.', 'On-call': 'Jake. It is always Jake.'
      },
      footer: 'Your condiment infrastructure is someone else’s problem. Yours.'
    };
    if (command === 'deploy') report = {
      title: activeIncident(kitchen) ? 'DEPLOYMENT DEGRADED: plate-production' : 'DEPLOYMENT COMPLETE: plate-production',
      fields: {
        '01 / Build': 'Compiled peppers. Resolved vinegar dependency.',
        '02 / Unit tests': 'Spoon test passed. Spoon requests PTO.',
        '03 / Canary': heat > 50000 ? 'Canary spoon has lost the ability to speak.' : 'Canary spoon reports acceptable regret.',
        '04 / Approval': 'Jake approved Jake’s change.',
        '05 / Rollout': `${kitchen.current.id} promoted at ${heat.toLocaleString('en-US')} SHU.`,
        '06 / Observability': activeIncident(kitchen) ? `${incident.id}: ${scenario.title}.` : 'Monitoring forehead perspiration.',
        'Rollback plan': 'Extra rice. Also the disaster recovery plan.'
      },
      footer: activeIncident(kitchen) ? 'Lunch has been impacted. An incident has been opened.' : 'Deployment successful. Stakeholders may now eat.'
    };
    if (command === 'incident') report = {
      title: `${incident.id} / SEV-${scenario.severity}: ${scenario.title.toUpperCase()}`,
      fields: {
        Status: 'Investigating, with mouth open', 'Incident commander': 'Jake, holding a plate',
        Impact: scenario.impact, 'Proposed resolution': scenario.resolution,
        'Next update': 'After everyone stops asking if it is spicy.'
      },
      footer: 'Acknowledged by Jake. Escalated to Jake. Resolved by future Jake.'
    };
    if (command === 'postmortem') report = {
      title: 'BLAMELESS POSTMORTEM',
      fields: {
        Incident: scenario.title, 'Root cause': scenario.cause, Impact: scenario.impact,
        Resolution: scenario.resolution, 'What went well': 'Nobody said “let’s hop on a quick call.”',
        'What went poorly': 'Everything immediately before this document.',
        'Action item': scenario.action, Owner: 'Jake', 'Due date': 'Before the next plate (already overdue)'
      },
      footer: 'No individuals were blamed. The bottle knows what it did.'
    };
    if (values.markdown) console.log(postmortem(incident));
    else if (values.json) console.log(JSON.stringify({ simulation: true, command, ...report, kitchen }, null, 2));
    else {
      const rule = '─'.repeat(70);
      console.log(`\n  PIQUEOPS / CONDIMENT RELIABILITY ENGINEERING\n  ${rule}\n\n  ${report.title}\n`);
      for (const [label, value] of Object.entries(report.fields)) console.log(`  ${label}\n    ${value}\n`);
      console.log(`  ${rule}\n  ${report.footer}\n`);
    }
    }
  }
} catch (error) {
  console.error(`PiqueOps: ${error.message}\nRun with --help for usage.`);
  process.exitCode = 2;
}
