import { initFilters } from './filters.js';
import { initGraph } from './graph.js';
import { fetchGraph } from './api.js';
import type { Filters } from './types.js';

document.addEventListener('DOMContentLoaded', () => {
  const graphContainer = document.getElementById('graph')!;
  const graph = initGraph(graphContainer);

  const onFilterChange = async (f: Filters) => {
    try {
      const data = await fetchGraph(f);
      graph.update(data, f.granularity);
    } catch (err) {
      console.error('Failed to fetch graph data:', err);
    }
  };

  // initFilters is async (fetches projects), fires onChange when ready
  initFilters(onFilterChange).catch(err => {
    console.error('Failed to initialize filters:', err);
  });
});
