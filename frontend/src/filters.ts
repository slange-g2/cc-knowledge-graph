import type { Filters } from './types.js';
import { fetchProjects } from './api.js';

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function defaultDateStart(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultDateEnd(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function initFilters(onChange: (f: Filters) => void): Promise<void> {
  const controls = document.getElementById('controls')!;

  let projects: string[] = [];
  let checkedProjects: Set<string> = new Set();
  let dateStart = defaultDateStart();
  let dateEnd = defaultDateEnd();
  let topic = '';
  let granularity: 'day' | 'week' | 'month' = 'week';

  function getFilters(): Filters {
    return {
      projects: Array.from(checkedProjects),
      dateStart,
      dateEnd,
      topic,
      granularity,
    };
  }

  function fire() {
    onChange(getFilters());
  }

  const debouncedFire = debounce(fire, 300);

  // --- Projects ---
  const projectSection = document.createElement('div');
  projectSection.className = 'section';
  const projectLabel = document.createElement('span');
  projectLabel.className = 'section-label';
  projectLabel.textContent = 'Projects:';
  projectSection.appendChild(projectLabel);

  try {
    projects = await fetchProjects();
  } catch {
    projects = [];
  }

  checkedProjects = new Set(projects);

  projects.forEach(p => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = p;
    cb.addEventListener('change', () => {
      if (cb.checked) checkedProjects.add(p);
      else checkedProjects.delete(p);
      fire();
    });
    label.appendChild(cb);
    label.append(' ' + p);
    projectSection.appendChild(label);
  });

  // --- Date range ---
  const dateSection = document.createElement('div');
  dateSection.className = 'section';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'section-label';
  dateLabel.textContent = 'Date:';
  dateSection.appendChild(dateLabel);

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.value = dateStart;
  startInput.addEventListener('change', () => {
    dateStart = startInput.value;
    fire();
  });

  const sep = document.createElement('span');
  sep.textContent = '→';

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.value = dateEnd;
  endInput.addEventListener('change', () => {
    dateEnd = endInput.value;
    fire();
  });

  dateSection.appendChild(startInput);
  dateSection.appendChild(sep);
  dateSection.appendChild(endInput);

  // --- Topic search ---
  const topicSection = document.createElement('div');
  topicSection.className = 'section';
  const topicLabel = document.createElement('span');
  topicLabel.className = 'section-label';
  topicLabel.textContent = 'Topic:';
  topicSection.appendChild(topicLabel);

  const topicInput = document.createElement('input');
  topicInput.type = 'text';
  topicInput.placeholder = 'Filter by topic...';
  topicInput.style.width = '160px';
  topicInput.addEventListener('input', () => {
    topic = topicInput.value;
    debouncedFire();
  });
  topicSection.appendChild(topicInput);

  // --- Granularity ---
  const granSection = document.createElement('div');
  granSection.className = 'section';
  const granLabel = document.createElement('span');
  granLabel.className = 'section-label';
  granLabel.textContent = 'Group:';
  granSection.appendChild(granLabel);

  (['day', 'week', 'month'] as const).forEach(g => {
    const label = document.createElement('label');
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = 'granularity';
    rb.value = g;
    rb.checked = g === granularity;
    rb.addEventListener('change', () => {
      if (rb.checked) {
        granularity = g;
        fire();
      }
    });
    label.appendChild(rb);
    label.append(' ' + g);
    granSection.appendChild(label);
  });

  controls.appendChild(projectSection);
  controls.appendChild(dateSection);
  controls.appendChild(topicSection);
  controls.appendChild(granSection);

  // Fire initial
  fire();
}
