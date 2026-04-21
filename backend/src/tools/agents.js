/**
 * tools/agents.js — Agent management tools
 *
 * Changes:
 *   - list_agents: includes Brain as first entry (with _isBrain flag)
 *   - update_agent: handles agent_id "brain" → saves skills to brain-config in Supabase
 *   - Brain skills are loaded at startup and injected into BRAIN_SYSTEM at chat time
 */

const logger = require('../logger');
const { TOOL_CONSTANTS } = require('../constants');

async function list_agents() {
  const agents  = require('../agents');
  const brain   = require('../brain');
  const config  = brain.getConfig();

  const all = agents.getAll();

  // Always include Brain as first entry so orchestrator can update its own skills
  const brainEntry = {
    id:          'brain',
    name:        'Brain',
    description: 'Central AI orchestrator. Has tools, MCP access, and global skills.',
    provider:    'copilot',
    model:       config.model,
    active:      config.available,
    skills:      brain.getSkills(),   // persistent skills stored separately
    _isBrain:    true,
  };

  return {
    total: all.length + 1,
    agents: [brainEntry, ...all.map(a => ({
      id:          a.id,
      name:        a.name,
      provider:    a.provider,
      model:       a.model,
      active:      a.active,
      description: a.description || '',
      skills_count: (a.skills || []).length,
      has_context: !!(a.contextNotes?.trim()),
    }))],
    note: 'Brain (id: "brain") is the orchestrator. Use update_agent to add skills to it.',
  };
}

async function update_agent({ agent_id, ...updates }) {
  // ── Special case: updating Brain itself ──────────────────────────────────────
  if (agent_id === 'brain') {
    const brain = require('../brain');

    if (updates.model) {
      brain.setModel(updates.model);
    }

    if (updates.skills !== undefined) {
      await brain.setSkills(updates.skills);
    }

    // Partial skill update helpers
    if (updates._add_skills) {
      const current = brain.getSkills();
      const merged  = [...new Set([...current, ...updates._add_skills])];
      await brain.setSkills(merged);
    }

    const config = brain.getConfig();
    return {
      ok: true,
      id: 'brain',
      name: 'Brain',
      model: config.model,
      skills: brain.getSkills(),
      message: `Brain updated: ${Object.keys(updates).join(', ')}.`,
    };
  }

  // ── Normal agents ────────────────────────────────────────────────────────────
  const agents = require('../agents');
  const agent  = agents.getById(agent_id);
  if (!agent) return { error: `Agent not found: ${agent_id}. Use list_agents to check IDs.` };

  const clean   = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  const updated = agents.update(agent_id, clean);

  return {
    ok: true,
    id: updated.id,
    name: updated.name,
    message: `Agent "${updated.name}" updated: ${Object.keys(clean).join(', ')}.`,
  };
}

async function call_agent({ agent_id, task }) {
  const agents = require('../agents');
  const agent  = agents.getById(agent_id);
  if (!agent) return { error: `Agent '${agent_id}' not found. Use list_agents to see available agents.` };
  if (!agent.active) return { error: `Agent '${agent_id}' is disabled.` };

  return new Promise((resolve) => {
    let result = '';
    const timeout = setTimeout(() => {
      resolve({ agent: agent.name, response: result || '(timeout)', partial: true });
    }, TOOL_CONSTANTS.PIPELINE_STEP_TIMEOUT_MS);

    agents.runAgent({
      agentId:  agent_id,
      userInput: task,
      onToken:  (t) => { result += t; },
      onDone:   (content) => { clearTimeout(timeout); resolve({ agent: agent.name, response: content }); },
      onError:  (e) => { clearTimeout(timeout); resolve({ agent: agent.name, error: e.message }); },
    });
  });
}

async function manage_agent({ agent_id, action }) {
  const agents = require('../agents');
  const agent  = agents.getById(agent_id);
  if (!agent) return { error: `Agent not found: ${agent_id}` };
  agents.update(agent_id, { active: action === 'enable' });
  return { ok: true, agent: agent.name, status: action === 'enable' ? 'enabled' : 'disabled' };
}

async function run_pipeline({ mode, steps }) {
  const agents = require('../agents');

  const runStep = (step, prevOutputs = []) => {
    let task = step.task;
    prevOutputs.forEach((r, i) => {
      const out = typeof r === 'object'
        ? JSON.stringify(r).slice(0, TOOL_CONSTANTS.ERROR_OUTPUT_PREVIEW_LENGTH)
        : String(r);
      task = task.replace(`{step_${i}}`, out);
    });

    return new Promise((resolve) => {
      let result = '';
      const agent = agents.getById(step.agent_id);
      if (!agent) { resolve({ agent: step.agent_id, error: 'Agent not found' }); return; }
      if (!agent.active) { resolve({ agent: step.agent_id, error: 'Agent disabled' }); return; }

      const timeout = setTimeout(() => {
        resolve({ agent: agent.name, response: result || '(timeout)', partial: true });
      }, TOOL_CONSTANTS.PIPELINE_STEP_TIMEOUT_MS);

      agents.runAgent({
        agentId:   step.agent_id,
        userInput: task,
        onToken:   (t) => { result += t; },
        onDone:    (content) => { clearTimeout(timeout); resolve({ agent: agent.name, response: content }); },
        onError:   (e) => { clearTimeout(timeout); resolve({ agent: agent.name, error: e.message }); },
      });
    });
  };

  if (mode === 'parallel') {
    return { mode: 'parallel', results: await Promise.all(steps.map(s => runStep(s))) };
  }
  const results = [];
  for (const step of steps) {
    const r = await runStep(step, results.map(r => r.response || r.error));
    results.push(r);
  }
  return { mode: 'sequential', results };
}

async function create_agent({ name, description, provider, model, systemPrompt, skills, apiKey }) {
  const agents = require('../agents');

  if (!name || !provider || !model || !systemPrompt) {
    return { error: 'Missing required: name, provider, model, systemPrompt' };
  }
  const existing = agents.getAll().find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return { error: `Agent "${name}" already exists (id: ${existing.id}). Use update_agent to modify.` };
  }

  const agent = agents.create({
    name, description: description || '', provider, model, systemPrompt,
    skills: Array.isArray(skills) ? skills : [],
    apiKey: apiKey || '',
    autoUpdateContext: false,
  });

  logger.info('tools', `Agent created: "${agent.name}" (${agent.id})`);
  return {
    ok: true, id: agent.id, name: agent.name, provider: agent.provider, model: agent.model,
    message: `Agent "${agent.name}" created! Select it in the Chat dropdown to use.`,
  };
}

module.exports = {
  list_agents, call_agent, manage_agent, run_pipeline, create_agent, update_agent,
};