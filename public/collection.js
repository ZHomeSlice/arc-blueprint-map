const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const buttons = [...document.querySelectorAll('[data-filter]')];
const response = await fetch('/collection-data.json');
if (!response.ok) throw new Error('Could not load blueprint collection');
const blueprints = await response.json();
let filter = 'all';

function render() {
  const query = search.value.trim().toLowerCase();
  grid.replaceChildren();
  for (const blueprint of blueprints) {
    if (filter === 'missing' && blueprint.obtained) continue;
    if (filter === 'obtained' && !blueprint.obtained) continue;
    if (!blueprint.name.toLowerCase().includes(query)) continue;
    const card = document.createElement('article');
    card.className = `card ${blueprint.obtained ? 'obtained' : 'missing'}`;
    const position = document.createElement('small');
    position.textContent = `#${blueprint.slot} · row ${blueprint.row}, column ${blueprint.column}`;
    const image = document.createElement('img');
    image.src = blueprint.icon; image.alt = ''; image.loading = 'lazy';
    const name = document.createElement('strong'); name.textContent = blueprint.name;
    const status = document.createElement('span');
    status.className = 'badge'; status.textContent = blueprint.obtained ? 'Found ✓' : 'Missing';
    card.append(position, image, name, status); grid.append(card);
  }
}

search.addEventListener('input', render);
for (const button of buttons) button.addEventListener('click', () => {
  filter = button.dataset.filter;
  buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  render();
});
render();
