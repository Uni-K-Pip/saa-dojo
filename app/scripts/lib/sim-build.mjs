// シナリオの検査と、アプリで使うデータの組み立て。
import { effectiveStatus } from '../../../scripts/lib/catalog.mjs';
import { materialStatuses, selectMaterials } from '../../../scripts/lib/material-status.mjs';
import { checkSimFiles, simContext } from '../../../scripts/lib/sim.mjs';
import { SIMULATORS } from '../../../scripts/lib/sims/index.mjs';

function visibleFacts(parsed) {
  const links = new Map();
  if (!parsed.registry) return links;
  const referenced = new Set(parsed.sims.flatMap(({ data }) => Array.isArray(data?.factRefs) ? data.factRefs : []));
  const hidden = (id, kind, data) => {
    const { status } = effectiveStatus(parsed.catalogStatus, id, kind, data);
    return status === 'needs-fix' || status === 'rejected';
  };
  for (const { data: entry } of parsed.catalogEntries) {
    const facts = entry.facts.filter(({ id }) => referenced.has(id));
    if (!facts.length || hidden(entry.id, 'entry', entry)) continue;
    for (const fact of facts) {
      if (hidden(fact.id, 'fact', fact)) continue;
      const slug = fact.id.split('.')[1];
      links.set(fact.id, { title: fact.title, href: `#/services/${entry.id}?f=${encodeURIComponent(slug)}` });
    }
  }
  return links;
}

export function checkSimsForBuild(parsed) {
  if (!parsed.sims?.length) return { items: [], issues: [], facts: new Map() };
  const facts = visibleFacts(parsed);
  const { items, issues } = checkSimFiles(parsed.sims ?? [], {
    ...simContext(parsed),
    factHref: (id) => facts.get(id)?.href,
  });
  return { items, issues, facts };
}

export function buildSimOutputs(parsed, { includeUnverified = false } = {}) {
  const { items: checked, facts } = parsed.checkedSims ?? checkSimsForBuild(parsed);
  const { shown, excluded } = selectMaterials(materialStatuses(parsed.materialStatus, 'sims', checked), checked, includeUnverified);
  const details = new Map(checked.map((item) => [item.data.id, item]));
  const lessonTitles = new Map(parsed.lessons.map(({ data }) => [data.id, data.title]));
  const items = shown.map(({ data, status }) => {
    const { sim, texts } = details.get(data.id);
    return {
      id: data.id,
      sim,
      title: data.title,
      status,
      ...texts,
      config: data.config,
      toggles: data.toggles,
      references: [
        ...data.factRefs.flatMap((id) => facts.has(id) ? [facts.get(id)] : []),
        ...data.lessonRefs.map((id) => ({ title: lessonTitles.get(id), href: `#/lessons/${id}` })),
      ],
    };
  });
  const index = SIMULATORS.flatMap(({ id, name, description, engine }) => {
    const scenarios = items.filter(({ sim }) => sim === id).map(({ id, title, status }) => ({ id, title, status }));
    return scenarios.length ? [{ id, name, description, notCovered: engine.NOT_COVERED, scenarios }] : [];
  });
  return { items, index, excluded };
}
