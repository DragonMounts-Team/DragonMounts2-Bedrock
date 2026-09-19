const dragonTextureRoot = '../../DM2RP/textures/items/';
const dragonData = {
  aether_dragon: { variants: ['aethra', 'wind', 'breeze'], model: 'normal', image: 'aether/aethra/body.png', description: 'An airy, high-altitude mount with a restless wind-borne temperament.' },
  dark_dragon: { variants: ['bloodmoon', 'demon', 'imp', 'underworld'], model: 'spiked_horned', image: 'dark/bloodmoon/body.png', description: 'A shadowed species with a sharp silhouette and night-first presence.' },
  enchanted_dragon: { variants: ['enchanting', 'shimmer', 'sparkling'], model: 'normal', image: 'enchanted/enchanting/body.png', description: 'A luminous dragon tuned for magical, high-contrast variants.' },
  ender_dragon: { variants: ['ender_jean', 'ender_john', 'ender_shadow'], model: 'normal', image: 'ender/ender_jean/body.png', description: 'A void-touched profile built for the edge of the world.' },
  fire_dragon: { variants: ['blaze', 'flame', 'blue_fire'], model: 'normal', image: 'fire/blaze/body.png', description: 'A volcanic classic with a hot-blooded silhouette.' },
  forest_dragon: { variants: ['cold', 'jungle', 'nature', 'warm'], model: 'horned_antlers', image: 'forest/cold/body.png', description: 'A broad forest profile with seasonal variant routing.' },
  ice_dragon: { variants: ['alpine', 'iceberg', 'frost'], model: 'tail_scale_inclined', image: 'ice/alpine/body.png', description: 'A cold-climate hunter with a swept, frost-ready form.' },
  light_dragon: { variants: ['fallen', 'prism', 'radiant', 'light_sunset'], model: 'winged_horned', image: 'light/fallen/body.png', description: 'A bright winged profile with a clean daytime identity.' },
  moonlight_dragon: { variants: ['starlight', 'eclipse', 'constellation'], model: 'normal', image: 'moonlight/starlight/body.png', description: 'A nocturnal profile made for quiet skies and deep color.' },
  nether_dragon: { variants: ['magma', 'volcanic', 'soul_fire'], model: 'scale_sharpened', image: 'nether/magma/body.png', description: 'A furnace-born dragon shaped by the Nether.' },
  sculk_dragon: { variants: ['sculk_amethyst', 'sculk_beta', 'sculk_warden'], model: 'sculk', image: 'sculk/sculk_amethyst/body.png', description: 'A resonant, subterranean profile with a strange stillness.' },
  skeleton_dragon: { variants: ['skeleton', 'stray', 'bogged'], model: 'skeleton', image: 'skeleton/skeleton/body.png', description: 'A bone-framed dragon with three stark undead variations.' },
  storm_dragon: { variants: ['lightning', 'thunder', 'bronzed'], model: 'normal', image: 'storm/lightning/body.png', description: 'A storm-charged mount designed for the open sky.' },
  sunlight_dragon: { variants: ['sunlight', 'sunrise', 'sunset'], model: 'normal', image: 'sunlight/sunrise/body.png', description: 'A warm, radiant profile that brings daylight into the lineup.' },
  terra_dragon: { variants: ['rock', 'granite', 'mossy'], model: 'normal', image: 'terra/valley/body.png', description: 'A grounded dragon with a sturdy, mineral-heavy identity.' },
  water_dragon: { variants: ['water', 'river', 'ocean'], model: 'normal', image: 'water/pond/body.png', description: 'A fluid swimmer with a calm, adaptable profile.' },
  wither_dragon: { variants: ['wither', 'ash', 'soul'], model: 'skeleton', image: 'wither/wither/body.png', description: 'A desolate, ash-marked dragon built from the wither line.' },
  zombie_dragon: { variants: ['zombie', 'drowned', 'husk'], model: 'normal', image: 'zombie/drowned/body.png', description: 'A resilient undead mount with three rough-edged variants.' }
};
const $ = (id) => document.getElementById(id);
const typeInput = $('dragonType');
const variantEditor = $('variantEditor');
const defaultVariant = $('defaultVariant');
const texture = $('dragonTexture');
const themeToggle = $('themeToggle');
const particleField = $('particleField');
const viewTabs = [...document.querySelectorAll('.view-tab')];
let customTextureUrl = '';
let renderedParticleType = '';
let previewToolIndex = 0;
let previewTimer = null;
const draftStorageKey = 'dragon-foundry-draft';
const themeStorageKey = 'dragon-foundry-theme-v2';
const previewTools = ['sword', 'spear', 'axe', 'pickaxe', 'shovel', 'hoe', 'shield', 'bow'];
const dragonAtmospheres = {
  aether_dragon: ['#83d6db', '#204f5b', 'rgba(131,214,219,.24)', 'rgba(85,170,181,.48)'],
  dark_dragon: ['#b68bd5', '#332345', 'rgba(182,139,213,.2)', 'rgba(137,94,174,.48)'],
  enchanted_dragon: ['#e7b5ff', '#4b2d5e', 'rgba(231,181,255,.22)', 'rgba(188,114,217,.48)'],
  ender_dragon: ['#aa9bff', '#24275b', 'rgba(170,155,255,.22)', 'rgba(116,106,211,.48)'],
  fire_dragon: ['#ff9a59', '#653126', 'rgba(255,154,89,.22)', 'rgba(213,101,54,.5)'],
  forest_dragon: ['#a9d66f', '#294b36', 'rgba(169,214,111,.2)', 'rgba(111,163,74,.48)'],
  ice_dragon: ['#9fe2ef', '#234b62', 'rgba(159,226,239,.22)', 'rgba(84,164,191,.48)'],
  light_dragon: ['#ffe28a', '#66502a', 'rgba(255,226,138,.23)', 'rgba(219,174,65,.5)'],
  moonlight_dragon: ['#a8b4ff', '#293657', 'rgba(168,180,255,.2)', 'rgba(103,124,208,.48)'],
  nether_dragon: ['#ff765f', '#542526', 'rgba(255,118,95,.22)', 'rgba(201,65,51,.5)'],
  sculk_dragon: ['#64d0c7', '#183f46', 'rgba(100,208,199,.22)', 'rgba(54,157,154,.5)'],
  skeleton_dragon: ['#e6d9c0', '#4b4741', 'rgba(230,217,192,.2)', 'rgba(165,151,123,.48)'],
  storm_dragon: ['#83c5ff', '#253c62', 'rgba(131,197,255,.22)', 'rgba(74,135,202,.5)'],
  sunlight_dragon: ['#ffd477', '#67472a', 'rgba(255,212,119,.23)', 'rgba(222,157,57,.5)'],
  terra_dragon: ['#d6a16b', '#553b2e', 'rgba(214,161,107,.2)', 'rgba(164,100,59,.48)'],
  water_dragon: ['#73d7e7', '#1e4d58', 'rgba(115,215,231,.22)', 'rgba(63,164,184,.48)'],
  wither_dragon: ['#c2b2df', '#3d3549', 'rgba(194,178,223,.2)', 'rgba(130,108,161,.48)'],
  zombie_dragon: ['#9ccc7a', '#2e4a3d', 'rgba(156,204,122,.2)', 'rgba(92,151,91,.48)']
};

function applyTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'dark';
  if (persist) localStorage.setItem(themeStorageKey, theme);
}
function saveDraft() {
  const draft = {
    type: currentType(),
    model: $('dragonModel').value,
    variants: getVariants(),
    defaultVariant: defaultVariant.value,
    breathEntity: $('breathEntity').value,
    allAssets: $('allAssets').checked,
    assets: [...document.querySelectorAll('#assetGrid input')].filter((input) => input.checked).map((input) => input.value),
    customTextureUrl: customTextureUrl.startsWith('data:image/') ? customTextureUrl : ''
  };
  try { localStorage.setItem(draftStorageKey, JSON.stringify(draft)); } catch { }
}
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(draftStorageKey) || 'null'); } catch { return null; }
}
function setView(view, persist = true) {
  const selectedView = ['forge', 'assets', 'output'].includes(view) ? view : 'forge';
  viewTabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === selectedView));
  document.querySelectorAll('[data-view-section]').forEach((section) => { section.hidden = section.dataset.viewSection !== selectedView; });
  if (persist) localStorage.setItem('dragon-foundry-view', selectedView);
}
function applyDragonAtmosphere(type) {
  const [accent, deep, tint, line] = dragonAtmospheres[type] || dragonAtmospheres.storm_dragon;
  const root = document.documentElement;
  root.style.setProperty('--dragon-accent', accent);
  root.style.setProperty('--dragon-deep', deep);
  root.style.setProperty('--dragon-tint', tint);
  root.style.setProperty('--dragon-line', line);
  root.classList.remove('theme-shifting');
  void root.offsetWidth;
  root.classList.add('theme-shifting');
  window.setTimeout(() => root.classList.remove('theme-shifting'), 700);
}
function renderParticles(type) {
  if (renderedParticleType === type) return;
  renderedParticleType = type;
  particleField.dataset.dragon = type.replace('_dragon', '');
  particleField.innerHTML = '';
  let seed = [...type].reduce((total, character) => total + character.charCodeAt(0), 0);
  const count = type === 'sculk_dragon' || type === 'storm_dragon' ? 34 : 26;
  for (let index = 0; index < count; index += 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const random = seed / 233280;
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.style.setProperty('--particle-x', `${Math.round(random * 100)}%`);
    particle.style.setProperty('--particle-y', `${Math.round(((index * 37) + random * 22) % 100)}%`);
    particle.style.setProperty('--particle-size', `${2 + Math.round(random * 5)}px`);
    particle.style.setProperty('--particle-stretch', `${8 + Math.round(random * 12)}px`);
    particle.style.setProperty('--particle-drift', `${-24 + Math.round(random * 48)}px`);
    particle.style.setProperty('--particle-delay', `${-Math.round(random * 8)}s`);
    particle.style.setProperty('--particle-duration', `${6 + Math.round(random * 7)}s`);
    particleField.appendChild(particle);
  }
}

function titleCase(value) { return value.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
function currentType() { return typeInput.value.trim().toLowerCase().replace(/\s+/g, '_') || 'new_dragon'; }
function getVariants() { return [...variantEditor.querySelectorAll('input')].map((input) => input.value.trim()).filter(Boolean); }
function renderVariants(values) {
  variantEditor.innerHTML = '';
  values.forEach((value, index) => {
    const chip = document.createElement('label'); chip.className = 'variant-chip';
    chip.innerHTML = `<input value="${value}" spellcheck="false" aria-label="Variant ${index + 1}"><button type="button" aria-label="Remove ${value}">×</button>`;
    chip.querySelector('input').addEventListener('input', update);
    chip.querySelector('button').addEventListener('click', () => { const next = getVariants().filter((_, itemIndex) => itemIndex !== index); renderVariants(next.length ? next : ['variant_one']); update(); });
    variantEditor.appendChild(chip);
  });
  syncDefaultVariant();
}
function syncDefaultVariant() {
  const variants = getVariants(); const previous = defaultVariant.value;
  defaultVariant.innerHTML = variants.map((variant) => `<option value="${variant}">${variant}</option>`).join('');
  defaultVariant.value = variants.includes(previous) ? previous : variants[0] || '';
}
function selectDragon(type) {
  const data = dragonData[type];
  if (!data) return;
  $('dragonModel').value = data.model;
  previewToolIndex = 0;
  renderVariants(data.variants);
  updatePreviewTexture(type);
}
function previewTexture(type) {
  const material = type === 'skeleton_dragon' || type === 'wither_dragon' ? 'bone' : 'scale';
  const tool = previewTools[previewToolIndex];
  const suffix = tool === 'bow' ? '_standby' : '';
  return `dragonmounts2_equipment/tools/${tool}s/${type}_${material}_${tool}${suffix}.png`;
}
function updatePreviewTexture(type) {
  if (!customTextureUrl) texture.src = dragonTextureRoot + previewTexture(type);
}

function advancePreviewTool() {
  previewToolIndex = (previewToolIndex + 1) % previewTools.length;
  update();
}

function startPreviewCycle() {
  if (previewTimer) window.clearInterval(previewTimer);
  previewTimer = window.setInterval(advancePreviewTool, 1600);
}
function update() {
  const type = currentType(); const data = dragonData[type] || {};
  typeInput.value = type;
  applyDragonAtmosphere(type);
  renderParticles(type);
  $('cardKicker').textContent = `${type.replace('_dragon', '').toUpperCase()} / DRAGON`;
  $('cardTitle').textContent = titleCase(type);
  $('cardModel').textContent = $('dragonModel').value;
  $('cardVariants').textContent = String(getVariants().length);
  $('cardBreath').textContent = $('breathEntity').value.split(':').pop();
  $('jsonOutput').textContent = JSON.stringify(buildConfig(), null, 2);
  updateCommand();
  if (dragonData[type]) updatePreviewTexture(type);
  saveDraft();
  startPreviewCycle();
}
function buildConfig() {
  const type = currentType();
  const assets = [...document.querySelectorAll('#assetGrid input:checked')].map((input) => ({ name: input.value, kind: input.value === 'scales' ? 'item' : input.value === 'armor' ? 'armor' : 'tool' }));
  return { type, model: $('dragonModel').value, variants: getVariants(), default_variant: defaultVariant.value, breath_entity: $('breathEntity').value, custom_assets: $('allAssets').checked ? 'all' : assets, custom_texture: customTextureUrl ? 'uploaded-preview' : undefined, custom_components: {}, custom_component_groups: {} };
}
function buildCommand(dryRun = false) {
  const args = [`./generate.ps1 -Type ${currentType()}`];
  if ($('allAssets').checked) args.push('-Assets all');
  if (dryRun) args.push('-DryRun');
  return args.join(' ');
}
function updateCommand() { $('commandOutput').textContent = `PS> ${buildCommand()}`; }
function setCommandStatus(label, state = '') {
  $('commandStatus').className = `command-status ${state}`;
  $('commandStatus').innerHTML = `<i></i> ${label}`;
}
function showStaticFallback(dryRun) {
  if (!dryRun) {
    downloadConfig();
    downloadCommand();
    $('commandOutput').textContent = `PS> ${buildCommand()}\n\nStatic GitHub mode: the local bridge is unavailable.\nDownloaded ${currentType()}.json instead.`;
    setCommandStatus('CONFIG DOWNLOADED', 'is-success');
  } else {
    $('commandOutput').textContent = `PS> ${buildCommand(true)}\n\nStatic preview mode: no local generator bridge was found.\nThe configuration is valid for download.`;
    setCommandStatus('STATIC PREVIEW', 'is-success');
  }
}
async function runGenerator(dryRun) {
  const button = dryRun ? $('dryRunButton') : $('generateButton');
  button.disabled = true;
  setCommandStatus(dryRun ? 'PREVIEWING' : 'GENERATING', 'is-running');
  $('commandOutput').textContent = `PS> ${buildCommand(dryRun)}\n\nRunning generator...`;
  try {
    let response;
    try {
      response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: currentType(), assets: $('allAssets').checked ? 'all' : undefined, dryRun })
      });
    } catch {
      response = null;
    }
    const contentType = response?.headers.get('content-type') || '';
    if (!response || response.status === 404 || !contentType.includes('application/json')) {
      showStaticFallback(dryRun);
      return;
    }
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || result.output || 'The generator failed.');
    $('commandOutput').textContent = `PS> ${buildCommand(dryRun)}\n\n${result.output || 'Done'}`;
    setCommandStatus(dryRun ? 'PREVIEW READY' : 'FILES GENERATED', 'is-success');
  } catch (error) {
    $('commandOutput').textContent = `PS> ${buildCommand(dryRun)}\n\n${error.message}`;
    setCommandStatus('ERROR', 'is-error');
  } finally {
    button.disabled = false;
  }
}
function applyRecommendedSetup() {
  const data = dragonData[currentType()] || dragonData.storm_dragon;
  $('dragonModel').value = data.model;
  renderVariants(data.variants);
  update();
}

typeInput.addEventListener('change', () => { const type = currentType(); if (dragonData[type]) { selectDragon(type); update(); } else update(); });
$('dragonModel').addEventListener('change', update); $('defaultVariant').addEventListener('change', update); $('breathEntity').addEventListener('input', update);
$('addVariantButton').addEventListener('click', () => { renderVariants([...getVariants(), `variant_${getVariants().length + 1}`]); update(); });
$('allAssets').addEventListener('change', (event) => { document.querySelectorAll('#assetGrid input').forEach((input) => { input.checked = event.target.checked; }); update(); });
document.querySelectorAll('#assetGrid input').forEach((input) => input.addEventListener('change', update));
$('copyCommandButton').addEventListener('click', async () => { await navigator.clipboard.writeText(buildCommand()); $('copyCommandButton').textContent = 'Copied'; setTimeout(() => $('copyCommandButton').textContent = 'Copy command', 1300); });
$('generateButton').addEventListener('click', () => runGenerator(false));
$('dryRunButton').addEventListener('click', () => runGenerator(true));
$('downloadCommandButton').addEventListener('click', downloadCommand);
$('recommendedButton').addEventListener('click', applyRecommendedSetup);
$('starterButton').addEventListener('click', () => { $('allAssets').checked = true; document.querySelectorAll('#assetGrid input').forEach((input) => { input.checked = true; }); update(); });
$('jsonButton').addEventListener('click', () => { setView('output'); document.querySelector('.json-drawer').open = true; document.querySelector('.json-drawer').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('textureUpload').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    setCommandStatus('IMAGE TOO LARGE', 'is-error');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => { customTextureUrl = reader.result; texture.src = customTextureUrl; update(); });
  reader.readAsDataURL(file);
});
$('themeToggle').addEventListener('change', (event) => applyTheme(event.target.checked ? 'dark' : 'light'));
viewTabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
$('resetButton').addEventListener('click', () => { customTextureUrl = ''; typeInput.value = 'storm_dragon'; $('breathEntity').value = 'dragonmounts2:fire_dragonbreath'; $('dragonModel').value = 'normal'; document.querySelector('#assetGrid input[value="scales"]').checked = true; document.querySelectorAll('#assetGrid input:not([value="scales"])').forEach((input) => input.checked = false); selectDragon('storm_dragon'); update(); });
$('copyButton').addEventListener('click', async () => { await navigator.clipboard.writeText(JSON.stringify(buildConfig(), null, 2)); $('copyButton').textContent = 'Copied'; setTimeout(() => $('copyButton').textContent = 'Copy JSON', 1300); });
function downloadFile(filename, content, type) { const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
function downloadConfig() { downloadFile(`${currentType()}.json`, `${JSON.stringify(buildConfig(), null, 2)}\n`, 'application/json'); }
function downloadCommand() {
  const type = currentType();
  const assets = $('allAssets').checked ? ' --assets all' : '';
  const command = buildCommand();
  const nodeCommand = `node generate.js --type ${type}${assets}`;
  downloadFile(`${type}-command.txt`, `Run these commands from the dragon_generator folder:\n\nPowerShell:\n${command}\n\nNode.js:\n${nodeCommand}\n\nPreview without writing files:\n${command} -DryRun\n`, 'text/plain');
  setCommandStatus('COMMAND DOWNLOADED', 'is-success');
}
$('downloadButton').addEventListener('click', downloadConfig);

const savedTheme = localStorage.getItem(themeStorageKey);
const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
applyTheme(savedTheme || systemTheme, Boolean(savedTheme));
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (event) => {
  if (!localStorage.getItem(themeStorageKey)) applyTheme(event.matches ? 'dark' : 'light', false);
});
const savedDraft = loadDraft();
customTextureUrl = savedDraft?.customTextureUrl || '';
const restoredType = savedDraft?.type && dragonData[savedDraft.type] ? savedDraft.type : 'storm_dragon';
typeInput.value = restoredType;
selectDragon(restoredType);
if (savedDraft?.model) $('dragonModel').value = savedDraft.model;
if (Array.isArray(savedDraft?.variants) && savedDraft.variants.length) renderVariants(savedDraft.variants);
if (savedDraft?.defaultVariant) defaultVariant.value = savedDraft.defaultVariant;
if (savedDraft?.breathEntity) $('breathEntity').value = savedDraft.breathEntity;
if (Array.isArray(savedDraft?.assets)) document.querySelectorAll('#assetGrid input').forEach((input) => { input.checked = savedDraft.assets.includes(input.value); });
$('allAssets').checked = savedDraft?.allAssets === true;
if (customTextureUrl) texture.src = customTextureUrl;
update();
setView(localStorage.getItem('dragon-foundry-view') || 'forge', false);
