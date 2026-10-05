(() => {
  function renderStackedDistributionBar(parent, config = {}) {
    const {title = '', defs = [], countMap = {}, showLegend = true, bare = false, onSelect,
      number = value => String(value), colorFor, semanticDomain, emptyText = 'No records'} = config;
    const card = bare ? parent : parent.createDiv({cls:'noria-distribution-card'});
    if (!bare && title) card.createEl('h3', {text:title});
    const entries = defs.map(def => ({...def, value:Number(countMap[def.key] || 0)})).filter(def => Number.isFinite(def.value) && def.value > 0);
    const total = entries.reduce((sum, def) => sum + def.value, 0);
    if (!total || !Number.isFinite(total)) {card.createDiv({cls:'noria-card-secondary',text:emptyText});return card;}
    const palette = globalThis.dashboardCore?.components?.charts?.chartPalette;
    const colors = ['var(--color-purple)','var(--color-blue)','var(--color-cyan)','var(--color-green)','var(--color-orange)','var(--color-red)'];
    const track = card.createDiv({cls:'noria-distribution-track',attr:{'aria-label':title || 'Composition'}});
    const legend = showLegend ? card.createDiv({cls:'noria-distribution-legend'}) : null;
    for (const [index, def] of entries.entries()) {
      const share = def.value / total, label = def.label ?? def.key;
      const color = colorFor?.(def.key) || (semanticDomain && palette?.distColor?.(semanticDomain,def.key)) || colors[index % colors.length];
      const detail = `${label}: ${number(def.value)} · ${number(share * 100)}%`;
      const segment = track.createEl(onSelect ? 'button' : 'span', {cls:'noria-distribution-segment',attr:{title:detail,'aria-label':detail,...(onSelect?{type:'button'}:{})}});
      segment.style.width = `${share * 100}%`; segment.style.background = color;
      if(onSelect)segment.onclick=()=>onSelect(def.key,segment);
      if (legend) {
        const row = legend.createEl(onSelect ? 'button' : 'div', {cls:'noria-distribution-item',attr:{...(onSelect?{type:'button','aria-label':detail}:{})}});
        const swatch=row.createSpan({cls:'noria-distribution-swatch'});swatch.style.background=color;
        row.createSpan({cls:'noria-distribution-label',text:String(label)});
        row.createSpan({cls:'noria-distribution-value',text:`${number(def.value)} · ${number(share * 100)}%`});
        if(onSelect)row.onclick=()=>onSelect(def.key,row);
      }
    }
    return card;
  }
  if(typeof module !== 'undefined' && module.exports)module.exports={renderStackedDistributionBar};
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components ||= {};root.components.charts ||= {};
  root.components.charts.stackedDistributionBar={renderStackedDistributionBar};
})();
