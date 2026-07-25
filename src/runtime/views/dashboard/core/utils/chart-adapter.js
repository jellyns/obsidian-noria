(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.utils = root.utils || {};

  function renderDistribution(parent, config) {
    const fn = root.components?.charts?.stackedDistributionBar?.renderStackedDistributionBar;
    if (typeof fn !== "function") return null;
    return fn(parent, config || {});
  }

  function renderStripHeat(parent, config) {
    const fn = root.components?.charts?.stripHeatSeries?.renderStripHeatSeries;
    if (typeof fn !== "function") return null;
    return fn(parent, config || {});
  }

  function renderDualAxis(parent, config) {
    const fn = root.components?.charts?.dualAxisSvgChart?.renderDualAxisSvg;
    if (typeof fn !== "function") return null;
    return fn(parent, config || {});
  }

  root.utils.chartAdapter = {
    renderDistribution,
    renderStripHeat,
    renderDualAxis
  };
})();
