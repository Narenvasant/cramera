/**
 * The causal diagnosis tabs: an experiment's causal answers, its joint probability
 * tree, its causal graph, why each failed run failed, and every run's NEEM, read from
 * the documents the experiment writes while it runs.
 */

import { SidePanel } from '../../panels/panel-host.js';
import { withScene, LIVE_PARAMETER } from '../../core/scene-address.js';

/**
 * The plugin's name, its route segment.
 */
export const PLUGIN = 'causal-diagnosis';

/**
 * How often the runs are read again, in milliseconds.
 */
export const POLL_INTERVAL = 2000;

/**
 * The colours of the causal graph's node kinds, from the viewer's palette.
 */
export const KIND_COLOURS = {
  confounder: 'var(--warning)',
  cause: 'var(--mark-step)',
  effect: 'var(--success)',
  part: 'var(--play)',
};

// %% building elements

/**
 * @param {string} tag The element's tag.
 * @param {string} [className] Its class.
 * @param {string} [text] Its text.
 * @returns {HTMLElement} The element.
 */
export function element(tag, className, text) {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined && text !== null) created.textContent = String(text);
  return created;
}

/**
 * @param {number|null|undefined} probability A probability.
 * @returns {string} It in percent.
 */
export function percent(probability) {
  if (probability === null || probability === undefined) return '–';
  return `${(100 * probability).toFixed(0)}%`;
}

/**
 * @param {number|null|undefined} probability A probability.
 * @param {string} colour The bar's colour.
 * @returns {HTMLElement} A bar as long as the probability, with its value.
 */
export function bar(probability, colour) {
  const row = element('div', 'cd-bar');
  const track = element('div', 'cd-bar-track');
  const fill = element('div', 'cd-bar-fill');
  fill.style.width = `${Math.max(0, Math.min(1, probability ?? 0)) * 100}%`;
  fill.style.background = colour;
  track.append(fill);
  row.append(track, element('span', 'cd-bar-value', percent(probability)));
  return row;
}

/**
 * @param {string} title A section's title.
 * @param {string} [note] A line under it.
 * @returns {HTMLElement} The section's heading.
 */
export function heading(title, note) {
  const block = element('div', 'cd-heading');
  block.append(element('h3', '', title));
  if (note) block.append(element('p', 'cd-muted', note));
  return block;
}

// %% the experiment and its causal answers

/**
 * @param {Object} experiment The experiment document.
 * @returns {HTMLElement} The experiment, its data and every causal answer.
 */
export function experimentView(experiment) {
  const view = element('div', 'cd-view');
  view.append(heading(experiment.title, experiment.summary));
  const dataset = experiment.dataset;
  const stats = element('div', 'cd-stats');
  stats.append(
    stat('Recorded attempts', dataset.attempts),
    stat('Lifted', percent(dataset.successRate)),
    stat('Neighbours per clutter', dataset.neighbourCount),
  );
  view.append(stats);
  for (const environment of dataset.environments) {
    const row = element('div', 'cd-row');
    row.append(
      element('span', 'cd-label', `${environment.environment} (${environment.attempts})`),
      bar(environment.successRate, 'var(--accent)'),
    );
    view.append(row);
  }
  for (const question of experiment.questions) view.append(questionView(question));
  return view;
}

/**
 * @param {string} label What the number is.
 * @param {string|number} value The number.
 * @returns {HTMLElement} A labelled figure.
 */
export function stat(label, value) {
  const block = element('div', 'cd-stat');
  block.append(element('div', 'cd-stat-value', value), element('div', 'cd-muted', label));
  return block;
}

/**
 * @param {Object} question One question with its answer.
 * @returns {HTMLElement} The question and, per region of its cause, the conditioned and
 *   the backdoor-adjusted answer.
 */
export function questionView(question) {
  const card = element('section', 'cd-card');
  card.append(element('div', 'cd-question', question.asked));
  const adjusted = question.adjustedFor.length
    ? `adjusted for ${question.adjustedFor.join(', ')}`
    : 'no adjustment';
  card.append(
    element(
      'p',
      'cd-muted',
      `${question.trainingExamples} attempts · ${adjusted} · largest shift from adjusting ${percent(question.largestShiftFromAdjusting)}`,
    ),
  );
  const legend = element('div', 'cd-legend');
  legend.append(swatch('var(--text-muted)', 'conditioned P(effect | cause)'));
  legend.append(swatch('var(--accent)', 'interventional P(effect | do(cause))'));
  card.append(legend);
  for (const region of question.regions) {
    const row = element('div', 'cd-region');
    row.append(element('div', 'cd-label', region.description));
    row.append(bar(region.conditioned, 'var(--text-muted)'));
    row.append(bar(region.adjusted, 'var(--accent)'));
    card.append(row);
  }
  return card;
}

/**
 * @param {string} colour A colour.
 * @param {string} text What it stands for.
 * @returns {HTMLElement} A legend entry.
 */
export function swatch(colour, text) {
  const entry = element('span', 'cd-swatch-entry');
  const square = element('span', 'cd-swatch');
  square.style.background = colour;
  entry.append(square, element('span', '', text));
  return entry;
}

// %% the joint probability tree

/**
 * @param {Object} tree The probability tree document.
 * @returns {HTMLElement} The tree: its root and every leaf, with what holds in it and
 *   how often the target came up.
 */
export function treeView(tree) {
  const view = element('div', 'cd-view');
  view.append(
    heading(
      'Joint probability tree',
      `Fitted on the ${tree.attempts} recorded attempts over ${tree.variables.join(', ')}; every leaf holds at least ${tree.minimumSamplesPerLeaf} attempts.`,
    ),
  );
  const root = element('div', 'cd-tree-root');
  root.append(element('div', 'cd-tree-node', `All attempts · ${tree.leaves.length} leaves`));
  const children = element('ul', 'cd-tree');
  for (const leaf of tree.leaves) {
    const item = element('li', 'cd-tree-leaf');
    const card = element('div', 'cd-card');
    const top = element('div', 'cd-row');
    top.append(element('span', 'cd-label', `${percent(leaf.weight)} of attempts`));
    top.append(bar(leaf.liftedProbability, liftColour(leaf.liftedProbability)));
    card.append(top);
    card.append(element('div', 'cd-muted', 'P(lifted) in this leaf'));
    const conditions = element('div', 'cd-conditions');
    for (const condition of leaf.conditions) {
      if (condition.variable === 'lifted') continue;
      const chip = element('span', 'cd-chip');
      chip.append(element('b', '', condition.variable), element('span', '', ` ${condition.values}`));
      conditions.append(chip);
    }
    card.append(conditions);
    item.append(card);
    children.append(item);
  }
  root.append(children);
  view.append(root);
  return view;
}

/**
 * @param {number|null} probability How likely a lift is.
 * @returns {string} Green for likely, amber for even, red for unlikely.
 */
export function liftColour(probability) {
  if (probability === null || probability === undefined) return 'var(--text-faint)';
  if (probability >= 0.7) return 'var(--success)';
  if (probability >= 0.4) return 'var(--warning)';
  return 'var(--danger)';
}

// %% the causal graph

/**
 * @param {Array<Object>} nodes The graph's nodes.
 * @param {Array<Object>} edges Its edges.
 * @returns {Map<string, number>} Every node's layer: how many edges the longest path
 *   into it has.
 */
export function layersOf(nodes, edges) {
  const layer = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      layer.set(edge.target, Math.max(layer.get(edge.target), layer.get(edge.source) + 1));
    }
  }
  return layer;
}

/**
 * @param {Object} graph The causal graph document.
 * @returns {HTMLElement} The graph drawn left to right by layer, with the adjustments
 *   the questions make.
 */
export function graphView(graph) {
  const view = element('div', 'cd-view');
  view.append(heading('Causal graph', 'The causal model the questions assume; arrows point from cause to effect.'));
  const layers = layersOf(graph.nodes, graph.edges);
  const columns = new Map();
  for (const node of graph.nodes) {
    const column = layers.get(node.id);
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  }
  const width = 200;
  const height = 46;
  const columnGap = 70;
  const rowGap = 26;
  const tallest = Math.max(...[...columns.values()].map((column) => column.length));
  const svgWidth = columns.size * (width + columnGap);
  const svgHeight = tallest * (height + rowGap) + rowGap;
  const position = new Map();
  for (const [column, members] of columns) {
    const offset = (svgHeight - members.length * (height + rowGap)) / 2;
    members.forEach((node, row) => {
      position.set(node.id, {
        x: column * (width + columnGap) + 10,
        y: offset + row * (height + rowGap) + rowGap / 2,
      });
    });
  }
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute('class', 'cd-graph');
  const definitions = document.createElementNS(namespace, 'defs');
  const marker = document.createElementNS(namespace, 'marker');
  marker.setAttribute('id', 'cd-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto-start-reverse');
  const tip = document.createElementNS(namespace, 'path');
  tip.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  tip.setAttribute('fill', 'var(--text-muted)');
  marker.append(tip);
  definitions.append(marker);
  svg.append(definitions);
  for (const edge of graph.edges) {
    const from = position.get(edge.source);
    const to = position.get(edge.target);
    const line = document.createElementNS(namespace, 'path');
    const x1 = from.x + width;
    const y1 = from.y + height / 2;
    const x2 = to.x;
    const y2 = to.y + height / 2;
    line.setAttribute('d', `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`);
    line.setAttribute('class', 'cd-edge');
    line.setAttribute('marker-end', 'url(#cd-arrow)');
    svg.append(line);
  }
  for (const node of graph.nodes) {
    const at = position.get(node.id);
    const group = document.createElementNS(namespace, 'g');
    const box = document.createElementNS(namespace, 'rect');
    box.setAttribute('x', at.x);
    box.setAttribute('y', at.y);
    box.setAttribute('width', width);
    box.setAttribute('height', height);
    box.setAttribute('rx', 8);
    box.setAttribute('class', 'cd-node');
    box.setAttribute('stroke', KIND_COLOURS[node.kind] ?? 'var(--border-strong)');
    const label = document.createElementNS(namespace, 'text');
    label.setAttribute('x', at.x + width / 2);
    label.setAttribute('y', at.y + height / 2 + 4);
    label.setAttribute('class', 'cd-node-label');
    label.textContent = node.label;
    group.append(box, label);
    svg.append(group);
  }
  const frame = element('div', 'cd-graph-frame');
  frame.append(svg);
  view.append(frame);
  const legend = element('div', 'cd-legend');
  for (const [kind, colour] of Object.entries(KIND_COLOURS)) legend.append(swatch(colour, kind));
  view.append(legend);
  for (const adjustment of graph.adjustments) {
    const card = element('section', 'cd-card');
    card.append(
      element('div', 'cd-question', `${adjustment.cause} → ${adjustment.effect}: adjust for ${adjustment.adjustedFor.join(', ')}`),
      element('p', 'cd-muted', adjustment.why),
    );
    view.append(card);
  }
  return view;
}

// %% why a run failed

/**
 * @param {Object|null} run The run's entry of the index.
 * @param {Object|null} diagnosis The run's diagnosis document.
 * @returns {HTMLElement} The verdict, the primary cause, the correction and every
 *   factor's interventional chance of the lift.
 */
export function diagnosisView(run, diagnosis) {
  const view = element('div', 'cd-view');
  if (!run) {
    view.append(heading('Diagnosis', 'No run has finished yet.'));
    return view;
  }
  view.append(heading(`Diagnosis of ${run.run}`, `${run.environment} · friction ${Number(run.friction).toFixed(4)} · crowding ${run.crowding ?? '–'}`));
  if (!diagnosis) {
    view.append(element('p', 'cd-muted', 'The run is still going.'));
    return view;
  }
  const banner = element('div', diagnosis.lifted ? 'cd-banner cd-success' : 'cd-banner cd-failure', diagnosis.verdict);
  view.append(banner);
  if (diagnosis.primaryCause) {
    const card = element('section', 'cd-card');
    card.append(element('div', 'cd-question', `Primary cause: ${diagnosis.primaryCause}`));
    card.append(element('p', '', diagnosis.explanation));
    card.append(element('p', 'cd-correction', `Correction: ${diagnosis.correction}`));
    view.append(card);
  }
  view.append(element('h4', '', `Causes of the lift, adjusted for ${diagnosis.adjustedFor.join(', ')}`));
  for (const factor of diagnosis.factors) {
    const card = element('section', 'cd-card');
    card.append(element('div', 'cd-question', `${factor.factor}: ${factor.observed}`));
    const observed = element('div', 'cd-row');
    observed.append(element('span', 'cd-label', 'P(lift | do(observed))'), bar(factor.probability_at_observed, liftColour(factor.probability_at_observed)));
    const best = element('div', 'cd-row');
    best.append(element('span', 'cd-label', `P(lift | do(${factor.best_region}))`), bar(factor.probability_at_best, liftColour(factor.probability_at_best)));
    card.append(observed, best);
    view.append(card);
  }
  if (diagnosis.disturbedNeighbours.length) {
    view.append(element('h4', '', 'Neighbours the fingers shoved aside'));
    for (const neighbour of diagnosis.disturbedNeighbours) {
      view.append(
        element(
          'p',
          'cd-muted',
          `Neighbour ${neighbour.neighbour}, ${neighbour.side} the closing axis, moved ${(100 * neighbour.displacement).toFixed(1)} cm; a neighbour there is disturbed ${percent(neighbour.probabilityDisturbedOnThisSide)} of the time.`,
        ),
      );
    }
  }
  return view;
}

// %% every run's NEEM

/**
 * @param {Array<Object>} runs The runs' index.
 * @param {string|null} selected The run shown.
 * @param {function(string): void} select Shows a run.
 * @returns {HTMLElement} The runs, one row each.
 */
export function runList(runs, selected, select) {
  const list = element('div', 'cd-runs');
  for (const run of runs) {
    const row = element('button', `cd-run ${run.run === selected ? 'cd-selected' : ''}`);
    row.type = 'button';
    const state = run.state === 'running' ? 'running…' : run.lifted ? 'lifted' : 'failed';
    const dot = element('span', `cd-dot ${run.state === 'running' ? 'cd-running' : run.lifted ? 'cd-ok' : 'cd-bad'}`);
    row.append(dot, element('span', 'cd-run-name', run.run), element('span', 'cd-muted', state));
    if (run.primaryCause) row.append(element('span', 'cd-chip', run.primaryCause));
    row.addEventListener('click', () => select(run.run));
    list.append(row);
  }
  return list;
}

/**
 * @param {Object} neem A run's NEEM document.
 * @param {string} videoUrl The run's video.
 * @param {function(string): void} replay Replays a recording in the viewer.
 * @returns {HTMLElement} The run's task, parameters, timeline, outcome and video.
 */
export function neemView(neem, videoUrl, replay) {
  const view = element('div', 'cd-neem');
  view.append(heading(`NEEM ${neem.run}`, `${neem.task} · ${neem.robot} · ${neem.simulation}`));
  const parameters = element('div', 'cd-conditions');
  for (const [name, value] of Object.entries(neem.parameters)) {
    const chip = element('span', 'cd-chip');
    chip.append(element('b', '', name), element('span', '', ` ${typeof value === 'number' && !Number.isInteger(value) ? Number(value).toFixed(3) : value}`));
    parameters.append(chip);
  }
  view.append(parameters);
  if (neem.videoFrames) {
    const video = element('video', 'cd-video');
    video.src = videoUrl;
    video.controls = true;
    video.muted = true;
    view.append(video);
  }
  if (neem.recording) {
    const button = element('button', 'cd-button', 'Replay this run in the 3D view');
    button.type = 'button';
    button.addEventListener('click', () => replay(neem.recording));
    view.append(button);
  }
  if (neem.outcome) {
    view.append(element('p', '', `Outcome: ${neem.outcome.lifted ? 'lifted' : 'not lifted'}, target rose ${(100 * neem.outcome.liftHeight).toFixed(1)} cm.`));
  }
  if (neem.motionFailure) view.append(element('p', 'cd-failure-text', `Motion failure: ${neem.motionFailure}`));
  view.append(element('h4', '', 'Timeline'));
  const timeline = element('ol', 'cd-timeline');
  for (const event of neem.events) {
    const item = element('li', event.event === 'started' ? 'cd-started' : 'cd-ended');
    item.append(element('span', 'cd-time', `${Number(event.time).toFixed(2)} s`), element('span', '', `${event.node} ${event.event}`));
    timeline.append(item);
  }
  view.append(timeline);
  return view;
}

// %% styles

/**
 * The plugin's styles, from the viewer's palette so both themes apply.
 */
export const STYLES = `
.cd-view, .cd-neem { display: flex; flex-direction: column; gap: 10px; padding: 12px; color: var(--text); font-family: var(--font); font-size: 13px; }
.cd-heading h3 { margin: 0 0 4px; font-size: 15px; }
.cd-muted { color: var(--text-muted); margin: 0; font-size: 12px; }
.cd-stats { display: flex; gap: 10px; }
.cd-stat { flex: 1; background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; }
.cd-stat-value { font-size: 20px; font-weight: 600; color: var(--accent); }
.cd-card { background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.cd-question { font-weight: 600; }
.cd-row, .cd-region { display: grid; grid-template-columns: minmax(90px, 40%) 1fr; gap: 8px; align-items: center; }
.cd-region { grid-template-columns: minmax(90px, 30%) 1fr 1fr; }
.cd-label { color: var(--text-muted); font-family: var(--mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.cd-bar { display: flex; align-items: center; gap: 6px; }
.cd-bar-track { flex: 1; height: 8px; background: var(--surface-sunken); border-radius: 4px; overflow: hidden; }
.cd-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
.cd-bar-value { font-family: var(--mono); font-size: 11px; width: 36px; text-align: right; }
.cd-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--text-muted); }
.cd-swatch-entry { display: inline-flex; align-items: center; gap: 4px; }
.cd-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.cd-tree { list-style: none; margin: 0 0 0 10px; padding: 0 0 0 14px; border-left: 1px solid var(--border-strong); display: flex; flex-direction: column; gap: 8px; }
.cd-tree-leaf { position: relative; }
.cd-tree-leaf::before { content: ""; position: absolute; left: -14px; top: 18px; width: 12px; border-top: 1px solid var(--border-strong); }
.cd-tree-node { display: inline-block; margin-bottom: 8px; padding: 6px 10px; border: 1px solid var(--accent); border-radius: var(--radius); color: var(--accent); }
.cd-conditions { display: flex; flex-wrap: wrap; gap: 4px; }
.cd-chip { background: var(--control); border: 1px solid var(--control-border); border-radius: 10px; padding: 1px 8px; font-size: 11px; color: var(--control-text); }
.cd-graph-frame { overflow-x: auto; background: var(--surface-sunken); border-radius: var(--radius); padding: 6px; }
.cd-graph { width: 100%; min-width: 520px; height: auto; }
.cd-node { fill: var(--surface-raised); stroke-width: 2; }
.cd-node-label { fill: var(--text); font-size: 11px; text-anchor: middle; font-family: var(--font); }
.cd-edge { fill: none; stroke: var(--text-muted); stroke-width: 1.5; }
.cd-banner { padding: 10px; border-radius: var(--radius); font-weight: 600; }
.cd-success { background: rgb(75 211 138 / 0.15); color: var(--success); border: 1px solid var(--success); }
.cd-failure { background: rgb(255 107 139 / 0.12); color: var(--danger); border: 1px solid var(--danger); }
.cd-correction { color: var(--accent); font-weight: 600; margin: 0; }
.cd-failure-text { color: var(--danger); }
.cd-runs { display: flex; flex-direction: column; gap: 4px; padding: 12px 12px 0; }
.cd-run { display: flex; gap: 8px; align-items: center; background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 8px; color: var(--text); cursor: pointer; text-align: left; font: inherit; }
.cd-run.cd-selected { border-color: var(--accent); }
.cd-run-name { font-family: var(--mono); }
.cd-dot { width: 8px; height: 8px; border-radius: 50%; }
.cd-ok { background: var(--success); } .cd-bad { background: var(--danger); } .cd-running { background: var(--warning); animation: cd-pulse 1s infinite; }
@keyframes cd-pulse { 50% { opacity: 0.3; } }
.cd-video { width: 100%; border-radius: var(--radius); background: #000; }
.cd-button { background: var(--accent); color: var(--accent-text); border: none; border-radius: var(--radius); padding: 6px 10px; cursor: pointer; font-weight: 600; }
.cd-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.cd-timeline li { display: grid; grid-template-columns: 60px 1fr; gap: 6px; padding: 2px 6px; border-left: 2px solid var(--border-strong); }
.cd-timeline li.cd-started { border-left-color: var(--mark-step); }
.cd-timeline li.cd-ended { border-left-color: var(--success); color: var(--text-muted); }
.cd-time { font-family: var(--mono); color: var(--text-faint); }
`;

// %% the panels

/**
 * The panel each value of the page's `tab` parameter opens.
 */
export const TAB_PANELS = {
  answers: PLUGIN,
  tree: `${PLUGIN}-tree`,
  graph: `${PLUGIN}-graph`,
  diagnosis: `${PLUGIN}-diagnosis`,
  neems: `${PLUGIN}-neems`,
};

/**
 * Reads an experiment's documents and keeps the five tabs up to date.
 */
export class CausalDiagnosisTabs {
  /**
   * @param {Object} context The plugin context the viewer gives.
   */
  constructor(context) {
    this.context = context;
    this.experiment = null;
    this.selectedRun = null;
    this.runsSignature = '';
    this.panels = {
      experiment: element('div', 'cd-panel'),
      tree: element('div', 'cd-panel'),
      graph: element('div', 'cd-panel'),
      diagnosis: element('div', 'cd-panel'),
      neems: element('div', 'cd-panel'),
    };
  }

  /**
   * @param {string} path A route below the plugin's prefix.
   * @returns {string} Its address.
   */
  url(path) {
    return this.context.api.url(`/api/plugins/${PLUGIN}/${path}`);
  }

  /**
   * @param {string} path A document of the experiment.
   * @returns {Promise<Object|null>} The document, or null where none was written.
   */
  async document(path) {
    const response = await fetch(this.url(`files/${this.experiment}/${path}`), { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  }

  /**
   * Add the tabs and start reading.
   */
  async start() {
    const style = element('style');
    style.textContent = STYLES;
    document.head.append(style);
    this.context.panels.add(new SidePanel(PLUGIN, 'Causal answers', this.panels.experiment));
    this.context.panels.add(new SidePanel(`${PLUGIN}-tree`, 'Probability tree', this.panels.tree));
    this.context.panels.add(new SidePanel(`${PLUGIN}-graph`, 'Causal graph', this.panels.graph));
    this.context.panels.add(new SidePanel(`${PLUGIN}-diagnosis`, 'Diagnosis', this.panels.diagnosis));
    this.context.panels.add(new SidePanel(`${PLUGIN}-neems`, 'NEEMs', this.panels.neems));
    const asked = TAB_PANELS[new URL(window.location.href).searchParams.get('tab')];
    if (asked) this.context.panels.show(asked);
    const listed = await fetch(this.url('experiments'), { cache: 'no-store' }).then((response) => response.json());
    const named = new URL(window.location.href).searchParams.get('experiment');
    this.experiment = named ?? listed.experiments[0] ?? null;
    if (!this.experiment) {
      for (const panel of Object.values(this.panels)) panel.replaceChildren(element('p', 'cd-muted', 'No experiment has written its documents yet.'));
      return;
    }
    await this.showAnalysis();
    await this.showRuns();
    window.setInterval(() => this.showRuns(), POLL_INTERVAL);
  }

  /**
   * Show the documents written once per experiment.
   */
  async showAnalysis() {
    const [experiment, tree, graph] = await Promise.all([
      this.document('experiment.json'),
      this.document('probability_tree.json'),
      this.document('causal_graph.json'),
    ]);
    if (experiment) this.panels.experiment.replaceChildren(experimentView(experiment));
    if (tree) this.panels.tree.replaceChildren(treeView(tree));
    if (graph) this.panels.graph.replaceChildren(graphView(graph));
  }

  /**
   * Show the runs, the selected one's NEEM and the diagnosis of the newest finished
   * run, or of the selected one.
   */
  async showRuns() {
    const index = await this.document('runs/index.json');
    const runs = index?.runs ?? [];
    const signature = JSON.stringify(runs) + this.selectedRun;
    if (signature === this.runsSignature) return;
    this.runsSignature = signature;
    const finished = runs.filter((run) => run.state === 'finished');
    const shown = runs.find((run) => run.run === this.selectedRun) ?? finished[finished.length - 1] ?? null;
    const diagnosis = shown && shown.state === 'finished' ? await this.document(`runs/${shown.run}/diagnosis.json`) : null;
    this.panels.diagnosis.replaceChildren(diagnosisView(shown, diagnosis));
    const neems = element('div');
    neems.append(heading('NEEMs', 'One narrative per run: what was tried, what happened step by step, and what came of it.'));
    neems.firstChild.style.padding = '12px 12px 0';
    neems.append(runList(runs, shown?.run ?? null, (run) => {
      this.selectedRun = run;
      this.showRuns();
    }));
    if (shown && shown.state === 'finished') {
      const neem = await this.document(`runs/${shown.run}/neem.json`);
      if (neem) neems.append(neemView(neem, this.url(`files/${this.experiment}/runs/${shown.run}/video.mp4`), (bundle) => this.replay(bundle)));
    }
    this.panels.neems.replaceChildren(neems);
  }

  /**
   * @param {string} bundle A recording's name.
   */
  replay(bundle) {
    const address = withScene(window.location.href, bundle);
    address.searchParams.delete(LIVE_PARAMETER);
    window.open(address.toString(), '_blank');
  }
}

/**
 * @param {Object} context The plugin context the viewer gives.
 */
export function register(context) {
  new CausalDiagnosisTabs(context).start();
}
