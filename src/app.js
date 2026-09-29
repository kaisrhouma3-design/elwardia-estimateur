import { catalog } from './catalog.js';
import { downloadEstimatePdf } from './pdf.js?v=20260929-2252';
import { companyInfo } from './company.js';
import { amountInWords } from './money-words.js';

const STORAGE_KEY = 'elwardia-estimates-v1';
const ACTIVE_KEY = 'elwardia-active-estimate-v1';
const moneyFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const modalRoot = document.querySelector('#modal-root');
const toast = document.querySelector('#toast');
let estimates = [];
let current = null;
let saveTimer = null;
let toastTimer = null;
let catalogFilter = '';

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function round3(n) { return Math.round((Number(n || 0) + Number.EPSILON) * 1000) / 1000; }
function formatMoney(n) { return `${moneyFormat.format(round3(n))} DT`; }
function lineAmounts(line) {
  const ht = round3((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
  const vat = round3(ht * ((Number(line.vat) || 0) / 100));
  return { ht, vat, ttc: round3(ht + vat) };
}
function totalsFor(estimate) {
  return estimate.lines.reduce((sum, line) => {
    const amount = lineAmounts(line);
    sum.ht += amount.ht; sum.vat += amount.vat; sum.ttc += amount.ttc;
    return sum;
  }, { ht: 0, vat: 0, ttc: 0 });
}
function newEstimate(title = 'Nouveau devis', lines = []) {
  const now = new Date().toISOString();
  return { id: uid(), title, project: '', client: '', reference: '', date: new Date().toISOString().slice(0, 10), location: '', retentionEnabled: false, retentionRate: 5, createdAt: now, updatedAt: now, lines: clone(lines) };
}
function modelEstimate() {
  return newEstimate('Bordereau Elwardia — exemple', catalog.map(item => ({ ...clone(item), id: uid() })));
}
function loadSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string' && Array.isArray(item.lines)).map(cleanEstimate) : [];
  } catch { return []; }
}
function cleanEstimate(raw) {
  return {
    id: String(raw.id || uid()), title: String(raw.title || 'Devis sans titre').slice(0, 120),
    project: String(raw.project || '').slice(0, 120), client: String(raw.client || '').slice(0, 120),
    reference: String(raw.reference || '').slice(0, 80), date: String(raw.date || '').slice(0, 10), location: String(raw.location || '').slice(0, 160),
    retentionEnabled: raw.retentionEnabled === true, retentionRate: Number(raw.retentionRate) === 10 ? 10 : 5,
    createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString(),
    lines: raw.lines.slice(0, 1000).map(line => ({
      id: String(line.id || uid()), lot: String(line.lot || '').slice(0, 100), ref: String(line.ref || '').slice(0, 40),
      description: String(line.description || '').slice(0, 1200), unit: String(line.unit || '').slice(0, 30),
      quantity: numericOrNull(line.quantity), unitPrice: numericOrNull(line.unitPrice), vat: numericOrNull(line.vat) ?? 19
    }))
  };
}
function numericOrNull(value) { if (value === '' || value === null || value === undefined) return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function showToast(message) {
  toast.textContent = message; toast.classList.add('is-visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
}
function setSaveStatus(text, kind = '') {
  const element = document.querySelector('#save-status');
  element.classList.toggle('is-saving', kind === 'saving'); element.classList.toggle('is-error', kind === 'error');
  element.lastElementChild.textContent = text;
}
function flushSave() {
  if (!current) return;
  clearTimeout(saveTimer);
  current.updatedAt = new Date().toISOString();
  const index = estimates.findIndex(entry => entry.id === current.id);
  if (index >= 0) estimates[index] = clone(current); else estimates.unshift(clone(current));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estimates));
    localStorage.setItem(ACTIVE_KEY, current.id);
    setSaveStatus(`Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
    document.querySelector('#draft-count').textContent = String(estimates.length);
  } catch {
    setSaveStatus('Espace de stockage indisponible', 'error');
    showToast('La sauvegarde locale a échoué. Exportez ce devis en JSON.');
  }
}
function queueSave() {
  setSaveStatus('Enregistrement…', 'saving');
  clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 250);
}
function renderCompany() {
  document.querySelector('#company-name').textContent = companyInfo.name;
  document.querySelector('#company-address').textContent = companyInfo.address;
  document.querySelector('#company-fiscal-id').textContent = `MF : ${companyInfo.fiscalId}`;
  document.querySelector('#company-phone').textContent = `Tél. : ${companyInfo.phone}`;
  const email = document.querySelector('#company-email');
  email.textContent = companyInfo.email;
  email.href = `mailto:${companyInfo.email}`;
}
function renderMeta() {
  document.querySelectorAll('[data-meta]').forEach(input => { input.value = current[input.dataset.meta] || ''; });
  document.querySelector('#retention-enabled').checked = current.retentionEnabled === true;
  document.querySelector('#retention-rate').value = current.retentionRate === 10 ? '10' : '5';
  document.querySelector('#retention-rate').disabled = current.retentionEnabled !== true;
  document.querySelector('#page-title').textContent = current.title || 'Nouveau devis';
  document.title = `${current.title || 'Nouveau devis'} — Estimateur Elwardia`;
}
function renderLotFilter() {
  const select = document.querySelector('#lot-filter');
  const selected = select.value;
  const lots = [...new Set(current.lines.map(line => line.lot).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  select.innerHTML = '<option value="">Tous les lots</option>' + lots.map(lot => `<option value="${escapeHtml(lot)}">${escapeHtml(lot)}</option>`).join('');
  if (lots.includes(selected)) select.value = selected;
}
function renderLines() {
  const tbody = document.querySelector('#line-rows');
  const q = document.querySelector('#line-search').value.trim().toLocaleLowerCase('fr');
  const lotFilter = document.querySelector('#lot-filter').value;
  const rows = current.lines.filter(line => {
    const searchable = `${line.ref} ${line.lot} ${line.description} ${line.unit}`.toLocaleLowerCase('fr');
    return (!q || searchable.includes(q)) && (!lotFilter || line.lot === lotFilter);
  });
  document.querySelector('#line-count').textContent = current.lines.length;
  document.querySelector('#visible-count').textContent = `${rows.length} prestation${rows.length === 1 ? '' : 's'} affichée${rows.length === 1 ? '' : 's'} sur ${current.lines.length}`;
  const emptyState = document.querySelector('#empty-lines');
  emptyState.hidden = current.lines.length !== 0;
  document.querySelector('.table-scroll').hidden = current.lines.length === 0;
  document.querySelector('#line-rows').closest('table').hidden = current.lines.length === 0;
  if (current.lines.length === 0) {
    tbody.innerHTML = '';
    emptyState.innerHTML = '<div class="empty-mark">▤</div><strong>Aucune prestation dans ce devis</strong><p>Ajoutez une ligne libre ou choisissez un article dans la bibliothèque.</p><button class="button button-primary" type="button" data-action="open-catalog">Ouvrir la bibliothèque</button>';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = rows.length !== 0;
  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyState.innerHTML = '<div class="empty-mark">⌕</div><strong>Aucun résultat</strong><p>Essayez une autre recherche ou changez le filtre de lot.</p>';
    return;
  }
  emptyState.innerHTML = '<div class="empty-mark">▤</div><strong>Aucune prestation dans ce devis</strong><p>Ajoutez une ligne libre ou choisissez un article dans la bibliothèque.</p><button class="button button-primary" type="button" data-action="open-catalog">Ouvrir la bibliothèque</button>';
  tbody.innerHTML = rows.map(line => {
    const amount = lineAmounts(line);
    return `<tr data-row-id="${escapeHtml(line.id)}">
      <td><span class="ref-badge">${escapeHtml(line.ref || 'Libre')}</span></td>
      <td><input class="lot-input" type="text" data-line-id="${escapeHtml(line.id)}" data-field="lot" value="${escapeHtml(line.lot)}" aria-label="Lot" maxlength="100"></td>
      <td><textarea class="description-input" rows="2" data-line-id="${escapeHtml(line.id)}" data-field="description" aria-label="Désignation" maxlength="1200">${escapeHtml(line.description)}</textarea></td>
      <td><input type="text" data-line-id="${escapeHtml(line.id)}" data-field="unit" value="${escapeHtml(line.unit)}" aria-label="Unité" maxlength="30"></td>
      <td><input type="number" min="0" step="0.001" data-line-id="${escapeHtml(line.id)}" data-field="quantity" value="${line.quantity ?? ''}" aria-label="Quantité"></td>
      <td><input type="number" min="0" step="0.001" data-line-id="${escapeHtml(line.id)}" data-field="unitPrice" value="${line.unitPrice ?? ''}" aria-label="Prix unitaire hors taxes"></td>
      <td><input type="number" min="0" max="100" step="0.1" data-line-id="${escapeHtml(line.id)}" data-field="vat" value="${line.vat ?? 19}" aria-label="Taux de TVA en pourcentage"></td>
      <td><span class="money cell-ht">${formatMoney(amount.ht)}</span></td><td><span class="money cell-vat">${formatMoney(amount.vat)}</span></td><td><span class="money total-ttc cell-ttc">${formatMoney(amount.ttc)}</span></td>
      <td><button class="delete-row" type="button" data-action="delete-line" data-line-id="${escapeHtml(line.id)}" aria-label="Supprimer ${escapeHtml(line.ref || 'cette ligne')}" title="Supprimer cette ligne">×</button></td>
    </tr>`;
  }).join('');
}
function renderSummary() {
  const total = totalsFor(current);
  document.querySelector('#total-ht').textContent = formatMoney(total.ht);
  document.querySelector('#total-vat').textContent = formatMoney(total.vat);
  document.querySelector('#total-ttc').textContent = formatMoney(total.ttc);
  const retentionEnabled = current.retentionEnabled === true;
  const retentionRate = current.retentionRate === 10 ? 10 : 5;
  const retention = retentionEnabled ? round3(total.ttc * retentionRate / 100) : 0;
  const netPayable = round3(total.ttc - retention);
  document.querySelector('#retention-rate').disabled = !retentionEnabled;
  document.querySelector('#retention-amount').textContent = formatMoney(retention);
  document.querySelector('#net-payable').textContent = formatMoney(netPayable);
  document.querySelector('#total-amount-words').textContent = amountInWords(total.ttc);
  document.querySelector('#total-amount-words-inline').textContent = `En lettres : ${amountInWords(total.ttc)}`;
  document.querySelector('#amount-closing').textContent = `Arrêté le présent devis à la somme de : ${amountInWords(total.ttc)}`;
  document.querySelector('#signature-amount-words').textContent = amountInWords(total.ttc);
  document.querySelector('#net-amount-words-block').hidden = !retentionEnabled;
  document.querySelector('#net-amount-words').textContent = amountInWords(netPayable);
}
function renderApp() {
  renderCompany(); renderMeta(); renderLotFilter(); renderLines(); renderSummary();
  document.querySelector('#draft-count').textContent = String(estimates.length);
}
function getLine(lineId) { return current.lines.find(line => line.id === lineId); }
function addLine(source = null) {
  const line = source ? { ...clone(source), id: uid() } : { id: uid(), lot: 'Prestation libre', ref: 'Libre', description: '', unit: 'Forfait', quantity: 1, unitPrice: 0, vat: 19 };
  current.lines.push(line); renderApp(); queueSave();
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-line-id="${CSS.escape(line.id)}"][data-field="description"]`);
    input?.focus(); input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
function makeNewEstimate() {
  flushSave(); current = newEstimate(); estimates.unshift(clone(current)); localStorage.setItem(ACTIVE_KEY, current.id);
  flushSave(); renderApp(); closeModal(); showToast('Nouveau devis créé.');
}
function duplicateCurrent() {
  flushSave(); const copy = cleanEstimate({ ...clone(current), id: uid(), title: `Copie de ${current.title || 'Nouveau devis'}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  current = copy; estimates.unshift(clone(copy)); localStorage.setItem(ACTIVE_KEY, current.id); flushSave(); renderApp(); closeModal(); showToast('Une copie de ce devis a été créée.');
}
function resetToTemplate() {
  if (!window.confirm('Remplacer les prestations du devis courant par les 47 lignes de référence du bordereau ?')) return;
  current.lines = catalog.map(item => ({ ...clone(item), id: uid() }));
  document.querySelector('#line-search').value = ''; document.querySelector('#lot-filter').value = '';
  renderApp(); flushSave(); showToast('Exemple du bordereau rechargé.');
}
function closeModal() { modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); }
function openModal(title, subtitle, content, note = '') {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header class="modal-header"><div><span class="section-kicker">ESTIMATEUR ELWARDIA</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Fermer">×</button></header><div class="modal-body">${content}${note ? `<p class="modal-note">${escapeHtml(note)}</p>` : ''}</div></section></div>`;
  document.body.classList.add('modal-open'); modalRoot.querySelector('.modal-close')?.focus();
}
function openCatalog() {
  catalogFilter = '';
  const lots = [...new Set(catalog.map(item => item.lot))];
  const content = `<div class="modal-toolbar"><input id="catalog-search" class="modal-search" type="search" placeholder="Rechercher dans les 47 prestations…" autocomplete="off"><select id="catalog-filter" class="modal-select"><option value="">Tous les lots</option>${lots.map(lot => `<option value="${escapeHtml(lot)}">${escapeHtml(lot)}</option>`).join('')}</select></div><div id="catalog-list" class="catalog-list"></div>`;
  openModal('Bibliothèque des prestations', 'Choisissez un poste pour l’ajouter au devis courant.', content, 'Chaque ajout reprend la quantité et le prix de référence du bordereau. Vous pouvez les ajuster dans votre devis.');
  renderCatalogList();
}
function renderCatalogList() {
  const target = document.querySelector('#catalog-list'); if (!target) return;
  const search = (document.querySelector('#catalog-search')?.value || '').trim().toLocaleLowerCase('fr');
  const lot = document.querySelector('#catalog-filter')?.value || '';
  const results = catalog.filter(item => (!lot || item.lot === lot) && (!search || `${item.ref} ${item.lot} ${item.description} ${item.unit}`.toLocaleLowerCase('fr').includes(search)));
  target.innerHTML = results.length ? results.map(item => `<article class="catalog-item"><div><span class="catalog-ref">${escapeHtml(item.ref)} · ${escapeHtml(item.lot)}</span><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.unit)} · Quantité de référence : ${moneyFormat.format(item.quantity)} · TVA ${item.vat}%</small></div><div class="catalog-item-side"><b>${formatMoney(item.unitPrice)} / unité</b><button class="mini-button" type="button" data-action="add-catalog-line" data-ref="${escapeHtml(item.ref)}">Ajouter</button></div></article>`).join('') : '<div class="modal-empty">Aucune prestation trouvée.</div>';
}
function openDrafts() {
  const content = `<div class="draft-list" id="draft-list"></div><p class="modal-note">Les brouillons sont gardés dans le stockage local de ce navigateur. Pour une sauvegarde externe, exportez chaque devis au format JSON.</p>`;
  openModal('Mes devis', 'Ouvrez, dupliquez ou supprimez vos brouillons enregistrés sur cet appareil.', content);
  renderDraftList();
}
function renderDraftList() {
  const target = document.querySelector('#draft-list'); if (!target) return;
  const sorted = [...estimates].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  target.innerHTML = sorted.length ? sorted.map(entry => {
    const total = totalsFor(entry).ttc;
    const when = entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('fr-FR', { dateStyle:'medium', timeStyle:'short' }) : 'Date inconnue';
    return `<article class="draft-item"><div><span class="catalog-ref">${escapeHtml(entry.reference || 'BROUILLON')} · ${entry.lines.length} ligne${entry.lines.length===1?'':'s'}</span><strong>${escapeHtml(entry.title || 'Devis sans titre')}</strong><small>Modifié le ${escapeHtml(when)}${entry.client ? ` · ${escapeHtml(entry.client)}` : ''}</small><small class="draft-total">${formatMoney(total)} TTC</small></div><div class="draft-actions"><button class="mini-button" type="button" data-action="open-estimate" data-id="${escapeHtml(entry.id)}">Ouvrir</button><button class="mini-button" type="button" data-action="duplicate-estimate" data-id="${escapeHtml(entry.id)}" aria-label="Dupliquer">Copier</button><button class="mini-button delete" type="button" data-action="delete-estimate" data-id="${escapeHtml(entry.id)}" aria-label="Supprimer">Supprimer</button></div></article>`;
  }).join('') : '<div class="modal-empty">Aucun devis enregistré pour le moment.</div>';
}
function openEstimate(id) {
  flushSave(); const found = estimates.find(entry => entry.id === id); if (!found) return;
  current = cleanEstimate(clone(found)); localStorage.setItem(ACTIVE_KEY, current.id); renderApp(); closeModal(); showToast('Devis ouvert.');
}
function duplicateSaved(id) {
  const found = estimates.find(entry => entry.id === id); if (!found) return;
  const copy = cleanEstimate({ ...clone(found), id: uid(), title: `Copie de ${found.title || 'Devis'}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  estimates.unshift(copy); current = copy; flushSave(); renderApp(); openDrafts(); showToast('Une copie a été créée.');
}
function deleteEstimate(id) {
  if (estimates.length <= 1) { showToast('Gardez au moins un devis. Créez-en un autre avant de supprimer celui-ci.'); return; }
  const target = estimates.find(entry => entry.id === id); if (!target) return;
  if (!window.confirm(`Supprimer définitivement « ${target.title} » de cet appareil ?`)) return;
  estimates = estimates.filter(entry => entry.id !== id);
  if (current.id === id) { current = cleanEstimate(clone(estimates[0])); localStorage.setItem(ACTIVE_KEY, current.id); }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estimates)); renderApp(); openDrafts(); showToast('Devis supprimé de cet appareil.');
}
function exportEstimate() {
  flushSave();
  const payload = { application: 'Estimateur Elwardia', version: 1, exportedAt: new Date().toISOString(), estimate: current };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  const base = (current.reference || current.title || 'devis').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').toLowerCase() || 'devis';
  link.href = url; link.download = `${base}.json`; link.click(); URL.revokeObjectURL(url); showToast('Fichier JSON exporté.');
}
async function importEstimate(file) {
  try {
    const payload = JSON.parse(await file.text());
    const raw = payload.estimate || payload;
    if (!raw || !Array.isArray(raw.lines)) throw new Error('invalid');
    const imported = cleanEstimate({ ...raw, id: uid(), title: `Import — ${raw.title || 'Nouveau devis'}` });
    flushSave(); current = imported; estimates.unshift(clone(current)); localStorage.setItem(ACTIVE_KEY, current.id); flushSave(); renderApp(); showToast('Devis importé sur cet appareil.');
  } catch { showToast('Ce fichier JSON ne correspond pas à un devis Elwardia valide.'); }
}
function handleClick(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  switch (action) {
    case 'new-estimate': makeNewEstimate(); break;
    case 'open-drafts': openDrafts(); break;
    case 'open-catalog': openCatalog(); break;
    case 'duplicate': duplicateCurrent(); break;
    case 'add-line': addLine(); break;
    case 'print': flushSave(); window.print(); break;
    case 'pdf': flushSave(); downloadEstimatePdf(current); showToast('Le PDF du devis a été téléchargé.'); break;
    case 'export': exportEstimate(); break;
    case 'import': document.querySelector('#import-file').click(); break;
    case 'reset-template': resetToTemplate(); break;
    case 'close-modal': closeModal(); break;
    case 'backdrop-close': if (event.target === button) closeModal(); break;
    case 'add-catalog-line': {
      const item = catalog.find(entry => entry.ref === button.dataset.ref); if (item) { closeModal(); addLine(item); showToast('Prestation ajoutée au devis.'); } break;
    }
    case 'delete-line': {
      const line = getLine(button.dataset.lineId); if (!line) break;
      if (window.confirm(`Retirer « ${line.description.slice(0, 90)}${line.description.length>90?'…':''} » du devis ?`)) { current.lines = current.lines.filter(entry => entry.id !== line.id); renderApp(); queueSave(); showToast('Ligne supprimée du devis.'); }
      break;
    }
    case 'open-estimate': openEstimate(button.dataset.id); break;
    case 'duplicate-estimate': duplicateSaved(button.dataset.id); break;
    case 'delete-estimate': deleteEstimate(button.dataset.id); break;
    case 'focus-estimate': closeModal(); document.querySelector('#project-heading').scrollIntoView({ behavior:'smooth', block:'center' }); break;
  }
}
function handleInput(event) {
  const el = event.target;
  if (el.matches('[data-meta]')) {
    current[el.dataset.meta] = el.value;
    if (el.dataset.meta === 'title') document.querySelector('#page-title').textContent = el.value || 'Nouveau devis';
    queueSave(); return;
  }
  if (el.matches('[data-line-id][data-field]')) {
    const line = getLine(el.dataset.lineId); if (!line) return;
    line[el.dataset.field] = ['quantity','unitPrice','vat'].includes(el.dataset.field) ? numericOrNull(el.value) : el.value;
    const row = el.closest('tr'); const amount = lineAmounts(line);
    row.querySelector('.cell-ht').textContent = formatMoney(amount.ht);
    row.querySelector('.cell-vat').textContent = formatMoney(amount.vat);
    row.querySelector('.cell-ttc').textContent = formatMoney(amount.ttc);
    renderSummary(); queueSave();
  }
}

document.addEventListener('click', handleClick);
document.addEventListener('input', handleInput);
document.querySelector('#line-search').addEventListener('input', renderLines);
document.querySelector('#lot-filter').addEventListener('change', renderLines);
document.querySelector('#retention-enabled').addEventListener('change', event => {
  current.retentionEnabled = event.target.checked;
  renderSummary(); queueSave();
});
document.querySelector('#retention-rate').addEventListener('change', event => {
  current.retentionRate = Number(event.target.value) === 10 ? 10 : 5;
  renderSummary(); queueSave();
});
modalRoot.addEventListener('input', event => { if (event.target.id === 'catalog-search') renderCatalogList(); });
modalRoot.addEventListener('change', event => { if (event.target.id === 'catalog-filter') renderCatalogList(); });
modalRoot.addEventListener('click', event => { if (event.target.id === 'catalog-list' && event.target.closest('[data-action="add-catalog-line"]')) { /* handled by document listener */ } });
document.querySelector('#import-file').addEventListener('change', async event => {
  const [file] = event.target.files || []; if (file) await importEstimate(file); event.target.value = '';
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modalRoot.innerHTML) closeModal();
  if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); document.querySelector('#line-search').focus(); }
});
window.addEventListener('beforeunload', flushSave);

estimates = loadSaved();
const activeId = localStorage.getItem(ACTIVE_KEY);
current = estimates.find(entry => entry.id === activeId) || estimates[0] || modelEstimate();
if (!estimates.some(entry => entry.id === current.id)) estimates.unshift(clone(current));
localStorage.setItem(STORAGE_KEY, JSON.stringify(estimates));
localStorage.setItem(ACTIVE_KEY, current.id);
renderApp();
setSaveStatus('Enregistré localement');
