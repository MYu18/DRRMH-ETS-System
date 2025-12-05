// script.js
// LocalStorage: active location, saved scenarios, autosave scenario only.
// No resource-set creation or editing in UI. Upload allowed to replace in-memory resources.

(function () {
  'use strict';

  // ---------- Config / storage keys ----------
  const DEFAULT_SPEED_KMH = 30;
  const KEY_ACTIVE_LOCATION = 'ets_active_location_v2';
  const KEY_SCENARIOS = 'ets_scenarios_v2';
  const KEY_AUTOSAVE = 'ets_autosave_current_v2';
  const AUTOSAVE_DELAY = 800; // ms
  const ETA_UPDATE_INTERVAL = 10_000; // ms
  const CSV_PATH = './resources.csv'; // auto-load path

  // ---------- Helpers ----------
  const $ = (s, ctx = document) => (ctx || document).querySelector(s);
  const $$ = (s, ctx = document) => Array.from((ctx || document).querySelectorAll(s));
  const nowHM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const minutesToETA = (mins) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + Number(mins || 0));
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const parseHM = (str) => {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  };
  const distanceKmToMinutes = (km) => Math.round((Number(km) / DEFAULT_SPEED_KMH) * 60);
  const formatDateMMDDYYYY = (dt = new Date()) => {
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('save err', e); } }
  function load(k, fallback = null) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } }

  // ---------- DOM refs ----------
  const refs = {
    csvUpload: $('#csvUpload'),
    csvFileName: $('#csvFileName'),
    navAnalytics: $('#navAnalytics'),
    navScenarios: $('#navScenarios'),
    navOngoing: $('#navOngoing'),
    analyticsPage: $('#analyticsPage'),
    scenariosPage: $('#scenariosPage'),
    grandPage: $('#grandPage'),
    scenarioName: $('#scenarioName'),
    incidentType: $('#incidentType'),
    incidentTypeOther: $('#incidentTypeOther'),
    grandTableBody: $('#grandTableBody'),
    requestTableBody: $('#requestTableBody'),
    addRowBtn: $('#addRowBtn'),
    saveBtn: $('#saveBtn'),
    finishBtn: $('#finishBtn'),
    createNewBtn: $('#createNewBtn'),
    exportBtn: $('#exportBtn'),
    autosaveBadge: $('#autosaveBadge'),
    scenariosList: $('#scenariosList'),
    chartStatus: $('#chartStatus'),
    chartQty: $('#chartQty'),
    chartCategories: $('#chartCategories'),
    summaryPanel: $('#summaryPanel'),
    summaryToggleBtn: $('#summaryToggleBtn'),
    // NOTICE: point to the visible CSV controls container so JS can inject the dropdown
    resourcesUploadContainer: document.querySelector('.csv-controls') || null
  };

  // ---------- In-memory resource sets (populated from CSV) ----------
  // Structure: [{ name: 'UPM', createdAt: 0, categories: { 'Police Station': [{name, km}, ...], ... } }, ...]
  let resourceSets = []; // do NOT persist this to localStorage (single source: CSV file)
  let activeLocationName = load(KEY_ACTIVE_LOCATION, null); // store only name
  let autosaveTimer = null;
  let scenarios = load(KEY_SCENARIOS, []) || [];

  // charts
  let chartStatus = null, chartQty = null, chartCats = null;

  // create a small UI place for location choice (insert after CSV UI)
  function ensureLocationSelect() {
    // If a select exists anywhere, use it (safe)
    let existing = document.getElementById('locationSelect');
    if (existing) return existing;

    // otherwise, insert inside resourcesUploadContainer (CSV controls)
    if (!refs.resourcesUploadContainer) return null;

    // create wrapper, select + warn
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginLeft = '8px';

    const select = document.createElement('select');
    select.id = 'locationSelect';
    select.className = 'select-inline';
    select.setAttribute('aria-label', 'Select Location');
    select.style.minWidth = '180px';

    const warn = document.createElement('div');
    warn.id = 'locationWarn';
    warn.className = 'small';
    warn.style.color = '#b22222';
    warn.style.marginLeft = '6px';
    warn.style.fontWeight = 600;
    warn.style.fontSize = '12px';

    wrapper.appendChild(select);
    wrapper.appendChild(warn);
    refs.resourcesUploadContainer.appendChild(wrapper);
    return select;
  }

  const locationSelectEl = ensureLocationSelect();
  const locationWarnEl = $('#locationWarn');

  // ---------- CSV parsing ----------
  // Tolerant CSV parser (handles quoted fields). Expected columns:
  // LocationName,Category,EntryName,KM
  function parseCSV(csvText) {
    const rows = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const ch = csvText[i];
      if (ch === '"') {
        if (csvText[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === '\n' && !inQuotes) {
        rows.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.length) rows.push(cur);

    const parsed = rows.map(r => {
      const out = [];
      let token = '';
      let q = false;
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '"' && r[i + 1] === '"') { token += '"'; i++; continue; }
        if (ch === '"') { q = !q; continue; }
        if (ch === ',' && !q) { out.push(token); token = ''; continue; }
        token += ch;
      }
      out.push(token);
      return out.map(s => s?.trim?.());
    });

    const header = parsed.shift() || [];
    const cols = header.map(h => (h || '').replace(/\uFEFF/g, '').trim());
    const records = parsed.map(r => {
      const obj = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i] || `col${i}`] = (r[i] !== undefined) ? r[i] : '';
      }
      return obj;
    });
    return { cols, records };
  }

  // Convert parsed CSV to resourceSets array
  function csvRecordsToResourceSets(records) {
    const map = {};
    records.forEach(rec => {
      const keys = Object.keys(rec);
      const lc = {};
      keys.forEach(k => { lc[k.toLowerCase()] = k; });

      const locKey = lc['locationname'] || lc['location'] || lc['site'] || keys[0];
      const catKey = lc['category'] || lc['type'] || keys[1];
      const entryKey = lc['entryname'] || lc['name'] || keys[2];
      const kmKey = lc['km'] || lc['distance'] || keys[3];

      const locationName = (rec[locKey] || '').trim() || 'Unknown';
      const category = (rec[catKey] || '').trim() || 'Unspecified';
      const entryName = (rec[entryKey] || '').trim() || '';
      const km = parseFloat((rec[kmKey] || '').replace(/[^\d.-]/g, '')) || 0;

      if (!entryName) return;
      if (!map[locationName]) {
        map[locationName] = { name: locationName, createdAt: Date.now(), categories: {} };
      }
      if (!map[locationName].categories[category]) map[locationName].categories[category] = [];
      map[locationName].categories[category].push({ name: entryName, km });
    });

    return Object.keys(map).map(k => map[k]);
  }

  // ---------- Load CSV (auto) ----------
  async function loadCSVFromPath(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error('Fetch failed');
      const text = await res.text();
      applyCSVText(text, path);
      return true;
    } catch (e) {
      console.warn('resources.csv auto-load failed:', e);
      showCSVStatus(`resources.csv not found (you can upload one)`, true);
      return false;
    }
  }

  // ---------- Apply CSV text (from auto-load or upload) ----------
  function applyCSVText(csvText, filename = 'resources.csv') {
    const parsed = parseCSV(csvText);
    const resourceArr = csvRecordsToResourceSets(parsed.records);
    resourceSets = resourceArr;
    updateLocationSelect();
    showCSVStatus(`Loaded ${resourceSets.length} location(s) from ${filename}`, false);

    if (activeLocationName && !resourceSets.find(rs => rs.name === activeLocationName)) {
      if (activeLocationName === 'UPM') {
        showCSVStatus(`UPM resource set not found in CSV. Please modify CSV containing this location.`, true);
      } else {
        activeLocationName = resourceSets[0]?.name || null;
        save(KEY_ACTIVE_LOCATION, activeLocationName);
      }
    }
    if (!activeLocationName && resourceSets.length) {
      activeLocationName = resourceSets[0].name;
      save(KEY_ACTIVE_LOCATION, activeLocationName);
    }
    reflectActiveLocationInUI();
    renderSummaryPanel();
  }

  // ---------- CSV upload handler ----------
  function handleCSVUploadFile(file) {
    if (!file) return;
    refs.csvFileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        applyCSVText(String(e.target.result), file.name);
      } catch (err) {
        console.error('CSV parse error', err);
        showCSVStatus('CSV parse error — check formatting', true);
      }
    };
    reader.readAsText(file);
  }

  // ---------- UI: show CSV status / warnings ----------
  function showCSVStatus(msg, isError = false) {
    if (refs.csvFileName) {
      refs.csvFileName.textContent = msg;
      refs.csvFileName.style.color = isError ? '#b22222' : '#6b6b6b';
    }
    if (locationWarnEl) {
      if (isError && msg && msg.toLowerCase().includes('upm')) locationWarnEl.textContent = 'UPM resource set not found in CSV. Please modify CSV containing this location.';
      else locationWarnEl.textContent = '';
    }
  }

  // ---------- Update location select UI ----------
  function updateLocationSelect() {
    if (!locationSelectEl) return;
    // clear
    locationSelectEl.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '-- Choose location set --';
    locationSelectEl.appendChild(ph);

    resourceSets.forEach(rs => {
      const opt = document.createElement('option');
      opt.value = rs.name;
      opt.textContent = rs.name;
      locationSelectEl.appendChild(opt);
    });

    // restore active location if present in resourceSets
    if (activeLocationName && resourceSets.find(rs => rs.name === activeLocationName)) {
      locationSelectEl.value = activeLocationName;
    } else {
      if (resourceSets.length) {
        activeLocationName = resourceSets[0].name;
        locationSelectEl.value = activeLocationName;
        save(KEY_ACTIVE_LOCATION, activeLocationName);
      }
    }
  }

  function reflectActiveLocationInUI() {
    if (!locationSelectEl) return;
    if (activeLocationName) locationSelectEl.value = activeLocationName;
    if (!resourceSets.find(rs => rs.name === 'UPM')) {
      if (locationWarnEl) locationWarnEl.textContent = 'UPM resource set not found in CSV. Please modify CSV containing this location.';
    } else {
      if (locationWarnEl) locationWarnEl.textContent = '';
    }
    updateAllResourceBadges();
    $$('#requestTable tbody tr.request-row').forEach(tr => {
      refreshRowCategoryOptions(tr);
    });
    renderSummaryPanel();
  }

  // ---------- Helpers to get active resource set object ----------
  function getActiveResourceSet() {
    if (!activeLocationName) return null;
    return resourceSets.find(rs => rs.name === activeLocationName) || null;
  }

  // ---------- Populate category and source selects for a given row ----------
  function refreshRowCategoryOptions(tr) {
    const rset = getActiveResourceSet();
    const catSelect = tr.querySelector('.category-select');
    const srcSelect = tr.querySelector('.source-select');
    if (!catSelect || !srcSelect) return;

    const prevCat = catSelect.value;
    const prevSrc = srcSelect.value;

    catSelect.innerHTML = '';
    srcSelect.innerHTML = '';
    if (!rset) {
      catSelect.appendChild(new Option('--No resources--', ''));
      catSelect.disabled = true;
      srcSelect.appendChild(new Option('--No resources--', ''));
      srcSelect.disabled = true;
      return;
    }

    catSelect.appendChild(new Option('-- Category --', ''));
    Object.keys(rset.categories || {}).forEach(c => catSelect.appendChild(new Option(c, c)));
    catSelect.disabled = false;

    if (prevCat) {
      catSelect.value = prevCat;
      populateSourceOptionsForRow(tr, prevCat, srcSelect, rset);
      if (prevSrc) srcSelect.value = prevSrc;
    } else {
      srcSelect.appendChild(new Option('-- Source --', ''));
      srcSelect.disabled = true;
    }
  }

  function populateSourceOptionsForRow(tr, categoryValue, targetSelect, rset) {
    targetSelect.innerHTML = '';
    if (!categoryValue || !rset) {
      targetSelect.appendChild(new Option('-- Source --', ''));
      targetSelect.disabled = true;
      return;
    }
    const list = (rset.categories[categoryValue] || []);
    targetSelect.appendChild(new Option('-- Source --', ''));
    list.forEach(s => {
      const opt = new Option(`${s.name} (${s.km} km)`, s.name);
      opt.dataset.km = s.km;
      targetSelect.appendChild(opt);
    });
    targetSelect.disabled = false;
  }

  // ---------- Row creation ----------
  function createRequestRow(pre = {}) {
    const tbody = refs.requestTableBody;
    if (!tbody) return null;
    const tr = document.createElement('tr');
    tr.className = 'request-row';
    tr.dataset.partials = JSON.stringify(pre.partials || []);
    tr.innerHTML = `
      <td style="width:110px">
        <button class="toggle-partials small-ghost" title="Show partial deliveries">▶</button>
        <div class="small request-time">${pre.time || nowHM()}</div>
      </td>
      <td contenteditable="true" class="item-cell">${pre.item || ''}</td>
      <td contenteditable="true" class="qty-cell">${pre.qty || ''}</td>
      <td><select class="category-select select-inline"></select></td>
      <td><select class="source-select select-inline" disabled></select></td>
      <td contenteditable="true" class="remarks-cell">${pre.remarks || ''}</td>
      <td contenteditable="true" class="est-min">${pre.estMin || ''}</td>
      <td contenteditable="true" class="eta">${pre.eta || ''}</td>
      <td><button class="delete-btn btn small-ghost">✕</button></td>
      <td class="checkbox-col"><input type="checkbox" class="done-checkbox" ${pre.done ? 'checked' : ''}></td>
      <td class="rsrc-badge-col"><span class="resource-active-badge"></span></td>
    `;

    const partialRow = document.createElement('tr');
    partialRow.className = 'partial-row hidden';
    partialRow.innerHTML = `
      <td colspan="11">
        <div class="partial-wrapper">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:700">Partial Deliveries</div>
            <div><button class="add-partial-btn btn small">Add Partial Delivery</button></div>
          </div>
          <div class="partial-list"></div>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
    tbody.appendChild(partialRow);

    refreshRowCategoryOptions(tr);

    if (pre.category) {
      setTimeout(() => {
        const catSel = tr.querySelector('.category-select');
        const srcSel = tr.querySelector('.source-select');
        catSel.value = pre.category;
        populateSourceOptionsForRow(tr, pre.category, srcSel, getActiveResourceSet());
        if (pre.source) srcSel.value = pre.source;
      }, 0);
    }

    const catSelect = tr.querySelector('.category-select');
    const srcSelect = tr.querySelector('.source-select');
    catSelect.addEventListener('change', () => {
      populateSourceOptionsForRow(tr, catSelect.value, srcSelect, getActiveResourceSet());
      scheduleAutosave();
      renderSummaryPanel();
    });
    srcSelect.addEventListener('change', () => {
      computeEstFromSource(tr);
      scheduleAutosave();
      renderSummaryPanel();
    });

    tr.querySelector('.est-min').addEventListener('input', () => {
      const v = tr.querySelector('.est-min').textContent.trim();
      if (!v || isNaN(Number(v))) return;
      tr.querySelector('.eta').textContent = minutesToETA(Number(v));
      updateETAStylesForRow(tr);
      scheduleAutosave();
      renderSummaryPanel();
    });

    tr.querySelector('.delete-btn').addEventListener('click', () => {
      if (!confirm('Delete this request row?')) return;
      tr.remove();
      partialRow.remove();
      scheduleAutosave();
      renderSummaryPanel();
    });

    const doneCb = tr.querySelector('.done-checkbox');
    doneCb.addEventListener('change', () => {
      setDoneState(tr, doneCb.checked);
      scheduleAutosave();
      renderSummaryPanel();
    });

    tr.querySelector('.toggle-partials').addEventListener('click', () => {
      const hidden = partialRow.classList.toggle('hidden');
      tr.querySelector('.toggle-partials').textContent = hidden ? '▶' : '▾';
      tr.querySelector('.toggle-partials').classList.toggle('rotate90');
    });

    const renderPartials = () => {
      const listEl = partialRow.querySelector('.partial-list');
      listEl.innerHTML = '';
      const partials = JSON.parse(tr.dataset.partials || '[]');
      if (!partials.length) { listEl.innerHTML = '<div class="small">No partial deliveries recorded.</div>'; return; }
      const table = document.createElement('table');
      table.className = 'partial-table';
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr><th>Qty</th><th>Time</th><th>Notes</th><th>Action</th></tr>`;
      table.appendChild(thead);
      const tb = document.createElement('tbody');
      partials.forEach((p, idx) => {
        const r = document.createElement('tr');
        r.innerHTML = `<td contenteditable="true" class="p-qty">${p.qty}</td><td contenteditable="true" class="p-time">${p.time}</td><td contenteditable="true" class="p-notes">${p.notes || ''}</td><td><button class="btn small delete-partial">✕</button></td>`;
        r.querySelector('.delete-partial').addEventListener('click', () => {
          partials.splice(idx, 1);
          tr.dataset.partials = JSON.stringify(partials);
          renderPartials();
          scheduleAutosave();
          autoCompleteFromPartials(tr);
          renderSummaryPanel();
        });
        ['.p-qty', '.p-time', '.p-notes'].forEach(sel => {
          r.querySelector(sel).addEventListener('input', () => {
            partials[idx] = {
              qty: r.querySelector('.p-qty').textContent.trim(),
              time: r.querySelector('.p-time').textContent.trim(),
              notes: r.querySelector('.p-notes').textContent.trim()
            };
            tr.dataset.partials = JSON.stringify(partials);
            scheduleAutosave();
            autoCompleteFromPartials(tr);
            renderSummaryPanel();
          });
        });
        tb.appendChild(r);
      });
      table.appendChild(tb);
      listEl.appendChild(table);
    };

    partialRow.querySelector('.add-partial-btn').addEventListener('click', () => {
      const parts = JSON.parse(tr.dataset.partials || '[]');
      parts.push({ qty: '1', time: nowHM(), notes: '' });
      tr.dataset.partials = JSON.stringify(parts);
      renderPartials();
      if (partialRow.classList.contains('hidden')) {
        partialRow.classList.remove('hidden');
        tr.querySelector('.toggle-partials').textContent = '▾';
      }
      scheduleAutosave();
      autoCompleteFromPartials(tr);
      renderSummaryPanel();
    });

    renderPartials();

    $$('[contenteditable="true"], select, input', tr).forEach(el => {
      const ev = (el.tagName.toLowerCase() === 'select' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(ev, () => {
        scheduleAutosave();
        renderSummaryPanel();
      });
    });

    updateResourceBadge(tr);
    updateETAStylesForRow(tr);
    if (pre.done) setDoneState(tr, true);

    return { tr, partialRow };
  }

  function addRequestRow(pre = {}) { return createRequestRow(pre); }

  // ---------- compute ETA from source ----------
  function computeEstFromSource(row) {
    const sel = row.querySelector('.source-select').selectedOptions[0];
    if (!sel || !sel.dataset.km) return;
    const km = parseFloat(sel.dataset.km);
    if (isNaN(km)) return;
    const mins = distanceKmToMinutes(km);
    row.querySelector('.est-min').textContent = mins;
    row.querySelector('.eta').textContent = minutesToETA(mins);
    updateETAStylesForRow(row);
  }

  // ---------- done & partial helpers ----------
  function setDoneState(tr, done) {
    if (!tr) return;
    if (done) {
      tr.classList.add('done-row');
      $$('.item-cell, .qty-cell, .remarks-cell, .est-min, .eta', tr).forEach(c => c.setAttribute('contenteditable', 'false'));
    } else {
      tr.classList.remove('done-row');
      $$('.item-cell, .qty-cell, .remarks-cell, .est-min, .eta', tr).forEach(c => c.setAttribute('contenteditable', 'true'));
    }
    const cb = tr.querySelector('.done-checkbox');
    if (cb) cb.checked = done;
  }
  function autoCompleteFromPartials(tr) {
    const qty = Number(tr.querySelector('.qty-cell')?.textContent.trim()) || 0;
    const partials = JSON.parse(tr.dataset.partials || '[]');
    const total = partials.reduce((s, p) => s + (Number(p.qty) || 0), 0);
    if (qty > 0 && total >= qty) setDoneState(tr, true);
    else setDoneState(tr, false);
  }
  function updateResourceBadge(tr) {
    const badge = tr.querySelector('.resource-active-badge');
    if (!badge) return;
    badge.textContent = activeLocationName || 'No resources';
  }

  // ---------- ETA style helpers ----------
  function updateETAStylesForRow(tr) {
    if (!tr) return;
    tr.classList.remove('eta-approach', 'eta-due');
    const etaText = tr.querySelector('.eta')?.textContent?.trim();
    const etaDate = parseHM(etaText);
    if (!etaDate) return;
    const now = new Date();
    const nowHM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    const oneMinBefore = new Date(etaDate.getTime() - 60000);
    if (nowHM.getTime() >= etaDate.getTime()) tr.classList.add('eta-due');
    else if (nowHM.getTime() === oneMinBefore.getTime()) tr.classList.add('eta-approach');
  }
  function updateAllETAStyles() {
    $$('#requestTable tbody tr.request-row').forEach(tr => {
      if (tr.classList.contains('done-row')) { tr.classList.remove('eta-approach', 'eta-due'); return; }
      updateETAStylesForRow(tr);
    });
  }
  setInterval(updateAllETAStyles, ETA_UPDATE_INTERVAL);

  // ---------- serialization ----------
  function serializeGrandTable() {
    const tbody = refs.grandTableBody;
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).map(r => ({
      role: r.children[0].textContent.trim(),
      assignment: r.children[1].textContent.trim()
    }));
  }
  function serializeRequestRows() {
    return $$('#requestTable tbody tr.request-row').map(tr => ({
      time: tr.querySelector('.request-time')?.textContent || '',
      item: tr.querySelector('.item-cell')?.textContent || '',
      qty: tr.querySelector('.qty-cell')?.textContent || '',
      category: tr.querySelector('.category-select')?.value || '',
      source: tr.querySelector('.source-select')?.value || '',
      remarks: tr.querySelector('.remarks-cell')?.textContent || '',
      estMin: tr.querySelector('.est-min')?.textContent || '',
      eta: tr.querySelector('.eta')?.textContent || '',
      done: tr.classList.contains('done-row'),
      partials: JSON.parse(tr.dataset.partials || '[]'),
      resourceLocation: activeLocationName || null
    }));
  }

  // ---------- scenario persistence ----------
  function getCurrentScenarioObject() {
    const incidentVal = (refs.incidentType && refs.incidentType.value === 'Other') ? (refs.incidentTypeOther?.value || 'Other') : (refs.incidentType?.value || '');
    return {
      name: (refs.scenarioName?.value?.trim()) || 'Untitled scenario',
      createdAt: Date.now(),
      grandTable: serializeGrandTable(),
      requests: serializeRequestRows(),
      incidentType: incidentVal,
      resourceLocation: activeLocationName || null
    };
  }

  function saveScenarioToList(finished = false, overrideName = null) {
    const obj = getCurrentScenarioObject();
    obj.finished = finished;
    if (overrideName) obj.name = overrideName;
    const existing = scenarios.findIndex(s => s.name === obj.name);
    if (existing >= 0) scenarios[existing] = obj;
    else scenarios.push(obj);
    save(KEY_SCENARIOS, scenarios);
    toast(`Scenario ${finished ? 'finished and ' : ''}saved`);
    renderScenariosList();
  }

  function renderScenariosList() {
    const container = refs.scenariosList;
    if (!container) return;
    container.innerHTML = '';
    if (!scenarios.length) { container.innerHTML = '<div class="small">No saved scenarios</div>'; return; }
    scenarios.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'scenario-entry';
      el.innerHTML = `
        <div>
          <div style="font-weight:700">${s.name}</div>
          <div class="meta">Created: ${new Date(s.createdAt).toLocaleString()} ${s.finished ? '• Finished' : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn load-scn" data-idx="${i}">Open</button>
          <button class="btn delete-scn" data-idx="${i}">Delete</button>
        </div>
      `;
      container.appendChild(el);
    });

    $$('.load-scn', container).forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.dataset.idx);
      const ans = confirm('Load scenario and save the current work?');
      if (ans) {
        const dateStr = formatDateMMDDYYYY(new Date());
        const curName = refs.scenarioName?.value?.trim() || 'Untitled scenario';
        saveScenarioToList(false, `${curName} (${dateStr})`);
      }
      loadScenarioToUI(scenarios[idx]);
      switchToPage('grandPage');
    }));
    $$('.delete-scn', container).forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.dataset.idx);
      if (!confirm('Delete scenario?')) return;
      scenarios.splice(idx, 1);
      save(KEY_SCENARIOS, scenarios);
      renderScenariosList();
    }));
  }

  function loadScenarioToUI(scn = {}) {
    if (refs.requestTableBody) refs.requestTableBody.innerHTML = '';
    if (refs.scenarioName) refs.scenarioName.value = scn.name || '';
    if (refs.incidentType && refs.incidentTypeOther) {
      const presets = ['Fire', 'Earthquake', 'Flood', 'Typhoon', 'Mass casualty'];
      if (scn.incidentType && presets.includes(scn.incidentType)) {
        refs.incidentType.value = scn.incidentType;
        refs.incidentTypeOther.value = ''; refs.incidentTypeOther.classList.add('hidden');
      } else if (scn.incidentType) {
        refs.incidentType.value = 'Other';
        refs.incidentTypeOther.classList.remove('hidden'); refs.incidentTypeOther.value = scn.incidentType;
      } else {
        refs.incidentType.value = '';
        refs.incidentTypeOther.classList.add('hidden'); refs.incidentTypeOther.value = '';
      }
    }
    if (scn.resourceLocation && resourceSets.find(rs => rs.name === scn.resourceLocation)) {
      activeLocationName = scn.resourceLocation;
      save(KEY_ACTIVE_LOCATION, activeLocationName);
    } else if (scn.resourceLocation && !resourceSets.find(rs => rs.name === scn.resourceLocation)) {
      if (scn.resourceLocation === 'UPM') {
        showCSVStatus('UPM resource set not found in CSV. Please modify CSV containing this location.', true);
      } else {
        toast(`Referenced resource location "${scn.resourceLocation}" not found in CSV. Please select another location.`);
      }
    }
    reflectActiveLocationInUI();

    applyGrandTable(scn.grandTable || []);
    (scn.requests || []).forEach(r => addRequestRow(r));
    updateAllResourceBadges();
    scheduleAutosave();
    toast('Scenario loaded');
  }

  // ---------- Autosave (scenario only) ----------
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const obj = getCurrentScenarioObject();
      save(KEY_AUTOSAVE, obj);
      save(KEY_ACTIVE_LOCATION, activeLocationName);
      showAutosave(`Autosaved ${new Date().toLocaleTimeString()}`);
    }, AUTOSAVE_DELAY);
  }
  window.addEventListener('beforeunload', () => {
    try {
      save(KEY_AUTOSAVE, getCurrentScenarioObject());
      save(KEY_ACTIVE_LOCATION, activeLocationName);
    } catch (e) { /* ignore */ }
  });

  function showAutosave(msg) {
    if (refs.autosaveBadge) {
      refs.autosaveBadge.textContent = msg;
      setTimeout(() => { if (refs.autosaveBadge) refs.autosaveBadge.textContent = `Autosaved ${new Date().toLocaleTimeString()}`; }, 1400);
    }
  }
  function toast(msg) {
    if (refs.csvFileName) {
      const prev = $('#__small_toast');
      if (prev) prev.remove();
      const n = document.createElement('div');
      n.id = '__small_toast';
      n.textContent = msg;
      n.style.fontSize = '13px';
      n.style.color = '#111';
      n.style.marginLeft = '10px';
      refs.csvFileName.parentElement.appendChild(n);
      setTimeout(() => n.remove(), 2200);
    }
  }

  // ---------- Analytics / summary ----------
  function computeSummary() {
    const rows = $$('#requestTable tbody tr.request-row');
    const totalRequests = rows.length;
    let totalQty = 0, completed = 0, ontime = 0, approaching = 0, late = 0;
    rows.forEach(tr => {
      const q = Number(tr.querySelector('.qty-cell')?.textContent.trim()) || 0;
      totalQty += q;
      if (tr.classList.contains('done-row')) completed++;
      const eta = tr.querySelector('.eta')?.textContent?.trim();
      const etaDate = parseHM(eta);
      if (etaDate) {
        const now = new Date();
        const nowHM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
        const oneBefore = new Date(etaDate.getTime() - 60000);
        if (nowHM.getTime() >= etaDate.getTime()) late++;
        else if (nowHM.getTime() === oneBefore.getTime()) approaching++;
        else ontime++;
      }
    });
    return { totalRequests, totalQty, completed, pending: totalRequests - completed, ontime, approaching, late };
  }

  function renderAnalyticsCharts() {
    if (!refs.chartStatus || !refs.chartQty) return;
    const s = computeSummary();
    const ctx1 = refs.chartStatus.getContext('2d');
    const ctx2 = refs.chartQty.getContext('2d');

    if (chartStatus) chartStatus.destroy();
    if (chartQty) chartQty.destroy();

    chartStatus = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['On time', 'Approaching', 'Late', 'Completed', 'Pending'],
        datasets: [{
          data: [s.ontime, s.approaching, s.late, s.completed, s.pending],
          backgroundColor: ['#4bbf4b', '#ffb86b', '#ff6b6b', '#6b6bd1', '#c9c9c9']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    chartQty = new Chart(ctx2, {
      type: 'bar',
      data: { labels: ['Qty'], datasets: [{ label: 'Quantity', data: [s.totalQty], backgroundColor: ['#b22222'] }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    if (refs.chartCategories) {
      const counts = {};
      $$('#requestTable tbody tr.request-row').forEach(tr => {
        const cat = tr.querySelector('.category-select')?.value || 'Unspecified';
        counts[cat] = (counts[cat] || 0) + (Number(tr.querySelector('.qty-cell')?.textContent) || 1);
      });
      const labels = Object.keys(counts);
      const data = labels.map(l => counts[l]);
      if (chartCats) chartCats.destroy();
      chartCats = new Chart(refs.chartCategories.getContext('2d'), {
        type: 'pie',
        data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => `hsl(${(i * 55) % 360} 70% 50%)`) }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }

  // ---------- Export PDF ----------
  function exportToPDF(data) {
    const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
    if (!jsPDFCtor) { alert('PDF export requires jsPDF library.'); return; }
    const doc = new jsPDFCtor({ unit: 'pt', format: 'letter' });

    // Capture header as image using html2canvas
    const headerNode = document.querySelector('header');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;

    const createTimeline = (requests) => {
      // Build timeline array: each entry => { time: 'HH:MM', lines: [main line, partial lines...] }
      const timeline = [];
      requests.forEach(req => {
        const mainText = `${req.time || ''} | ${req.qty || ''} x ${req.item || ''} | ${req.category || ''} | ${req.source || ''} | ETA ${req.eta || ''}`;
        const partialLines = (req.partials || []).map((p, i) => `    • Partial ${i + 1}: ${p.qty} units @ ${p.time}${p.notes ? ' — ' + p.notes : ''}`);
        timeline.push({ time: req.time || '00:00', lines: [mainText, ...partialLines] });
      });
      // Sort by time lexicographically (HH:MM works)
      timeline.sort((a, b) => a.time.localeCompare(b.time));
      return timeline;
    };

    // Use html2canvas to capture header
    if (window.html2canvas) {
      html2canvas(headerNode, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const imgW = contentWidth;
        const imgH = (canvas.height * imgW) / canvas.width;

        let y = margin;
        doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
        y += imgH + 12;

        // Scenario and grand table
        doc.setFontSize(12);
        doc.text(`Scenario: ${data.name || 'Untitled'}`, margin, y);
        y += 18;

        doc.setFontSize(11);
        doc.text('Grand Scenario Table', margin, y);
        y += 14;
        (data.grandTable || []).forEach(r => {
          const line = `${r.role}: ${r.assignment || ''}`;
          const split = doc.splitTextToSize(line, contentWidth);
          doc.text(split, margin, y);
          y += (split.length * 12);
          if (y > pageHeight - margin - 40) { doc.addPage(); y = margin; }
        });

        y += 8;
        doc.setFontSize(12);
        doc.text('Resource Request Timeline', margin, y);
        y += 14;

        // Build timeline and print
        const timeline = createTimeline(data.requests || []);
        doc.setFontSize(10);
        timeline.forEach(entry => {
          entry.lines.forEach((ln, idx) => {
            const parts = doc.splitTextToSize(ln, contentWidth);
            doc.text(parts, margin, y);
            y += parts.length * 12;
            if (y > pageHeight - margin - 20) { doc.addPage(); y = margin; }
          });
        });

        // Summary
        y += 8;
        if (y > pageHeight - margin - 60) { doc.addPage(); y = margin; }
        doc.setFontSize(11);
        const totalRequests = (data.requests || []).length;
        const totalQty = (data.requests || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
        const completed = (data.requests || []).filter(r => r.done).length;
        doc.text('Summary:', margin, y); y += 14;
        doc.setFontSize(10);
        doc.text(`Total requests: ${totalRequests}`, margin, y); y += 12;
        doc.text(`Total qty requested: ${totalQty}`, margin, y); y += 12;
        doc.text(`Completed: ${completed}`, margin, y); y += 12;
        doc.text(`Resource set: ${data.resourceLocation || '—'}`, margin, y); y += 12;

        const nameSafe = (data.name || 'scenario').replace(/\s+/g, '_').replace(/[^\w\-_.]/g, '');
        doc.save(`${nameSafe}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.pdf`);
      }).catch(err => {
        console.error('html2canvas error', err);
        alert('Failed to capture header screenshot; exporting plaintext instead.');
        exportPlainPDF(doc, data, margin);
      });
    } else {
      // html2canvas not available -> fallback to plaintext export
      exportPlainPDF(doc, data, margin);
    }

    function exportPlainPDF(doc, data, margin) {
      let y = margin;
      doc.setFontSize(16); doc.text('MISSION DISPATCH — ETS Resource Allocation', margin, y);
      y += 20; doc.setFontSize(12); doc.text(`Scenario: ${data.name}`, margin, y);
      y += 18; doc.setFontSize(11); doc.text('Grand Scenario Table', margin, y); y += 14;
      (data.grandTable || []).forEach(r => { doc.text(`${r.role}: ${r.assignment || ''}`, margin + 8, y); y += 12; if (y > 700) { doc.addPage(); y = margin; } });
      y += 6; doc.text('Resource Request Log', margin, y); y += 14;
      (data.requests || []).forEach(req => {
        const summary = `${req.time || ''} | ${req.qty || ''} x ${req.item || ''} | ${req.category || ''} | ${req.source || ''} | ETA ${req.eta || ''}`;
        doc.text(summary, margin, y); y += 12;
        (req.partials || []).forEach((p, i) => { doc.text(`  • Partial ${i+1}: ${p.qty} units @ ${p.time} ${p.notes || ''}`, margin + 14, y); y += 10; });
        if (y > 750) { doc.addPage(); y = margin; }
      });
      y += 12;
      const totalRequests = (data.requests || []).length;
      const totalQty = (data.requests || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const completed = (data.requests || []).filter(r => r.done).length;
      doc.text('Summary:', margin, y); y += 12;
      doc.text(`Total requests: ${totalRequests}`, margin, y); y += 12;
      doc.text(`Total qty requested: ${totalQty}`, margin, y); y += 12;
      doc.text(`Completed: ${completed}`, margin, y); y += 12;
      doc.setFontSize(10); doc.text(`Resource set: ${data.resourceLocation || '—'}`, margin, y);
      doc.save(`${(data.name || 'scenario').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`);
    }
  }

  // ---------- Page switching ----------
  function switchToPage(pageId) {
    ['analyticsPage', 'scenariosPage', 'grandPage'].forEach(pid => { const el = $(`#${pid}`); if (el) el.classList.add('hidden'); });
    const show = $(`#${pageId}`);
    if (show) show.classList.remove('hidden');

    [refs.navAnalytics, refs.navScenarios, refs.navOngoing].forEach(n => n && n.classList.remove('active'));
    if (pageId === 'analyticsPage') refs.navAnalytics && refs.navAnalytics.classList.add('active');
    if (pageId === 'scenariosPage') refs.navScenarios && refs.navScenarios.classList.add('active');
    if (pageId === 'grandPage') refs.navOngoing && refs.navOngoing.classList.add('active');

    const topActions = $('#topActions');
    if (topActions) topActions.style.display = (pageId === 'grandPage') ? 'flex' : 'none';

    if (pageId === 'analyticsPage') renderAnalyticsCharts();
    if (pageId === 'scenariosPage') renderScenariosList();
    if (pageId === 'grandPage') {
      ensureGrandTableDefaults();
      updateAllResourceBadges();
      renderSummaryPanel();
    }
  }

  // ---------- Summary panel render ----------
  function renderSummaryPanel() {
    const s = computeSummary();
    if (!refs.summaryPanel) { renderAnalyticsCharts(); return; }
    const fill = (sel, v) => { const el = refs.summaryPanel.querySelector(sel); if (el) el.textContent = v; };
    fill('#sumTotalRequests', s.totalRequests || 0);
    fill('#sumTotalQty', s.totalQty || 0);
    fill('#sumCompleted', s.completed || 0);
    fill('#sumPending', s.pending || 0);
    fill('#etaOnTime', s.ontime || 0);
    fill('#etaApproach', s.approaching || 0);
    fill('#etaLate', s.late || 0);
    const pct = s.totalRequests ? Math.round((s.completed / s.totalRequests) * 100) : 0;
    const bar = refs.summaryPanel.querySelector('#progressBar');
    const pctEl = refs.summaryPanel.querySelector('#progressPct');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    renderAnalyticsCharts();
  }

  // ---------- Helpers ----------
  function updateAllResourceBadges() {
    $$('#requestTable tbody tr.request-row').forEach(tr => updateResourceBadge(tr));
  }

 function ensureGrandTableDefaults() { 
    const tbody = refs.grandTableBody;
    if (!tbody) return;
    if (tbody.children.length) return;
    const roles = ['Incident Commander', 'Operations Head', 'Liaison', 'Logistics', 'Finance', 'Planning', 'PIO'];
    roles.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = 
            `<td>${r}</td>
            <td contenteditable="true" data-placeholder="Type here."></td>`;
        tbody.appendChild(tr);
    });
}

document.addEventListener("blur", e => {
  if (e.target.matches("[contenteditable]")) {
    e.target.textContent = e.target.textContent.trim();
    if (!e.target.textContent) e.target.innerHTML = ""; // makes it truly empty
  }
}, true);


  // ---------- UI bindings ----------
  refs.navAnalytics && refs.navAnalytics.addEventListener('click', () => switchToPage('analyticsPage'));
  refs.navScenarios && refs.navScenarios.addEventListener('click', () => switchToPage('scenariosPage'));
  refs.navOngoing && refs.navOngoing.addEventListener('click', () => switchToPage('grandPage'));

  // CSV upload handling
  if (refs.csvUpload) {
    refs.csvUpload.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) handleCSVUploadFile(f);
    });
  }

  // Location select change
  if (locationSelectEl) {
    locationSelectEl.addEventListener('change', (e) => {
      const val = e.target.value;
      activeLocationName = val || null;
      save(KEY_ACTIVE_LOCATION, activeLocationName);
      reflectActiveLocationInUI();
    });
  }

  // Add row
  refs.addRowBtn && refs.addRowBtn.addEventListener('click', () => {
    addRequestRow();
    scheduleAutosave();
    renderSummaryPanel();
  });

  // Save/finish/new/export
  refs.saveBtn && refs.saveBtn.addEventListener('click', () => saveScenarioToList(false));
  refs.finishBtn && refs.finishBtn.addEventListener('click', () => saveScenarioToList(true));
  refs.createNewBtn && refs.createNewBtn.addEventListener('click', () => {
    const resp = confirm('Save current scenario and start a new one?');
    if (resp) {
      const currentName = refs.scenarioName?.value?.trim() || 'Untitled scenario';
      saveScenarioToList(false, `${currentName} (${formatDateMMDDYYYY()})`);
    }
    if (refs.scenarioName) refs.scenarioName.value = '';
    if (refs.incidentType) refs.incidentType.value = '';
    if (refs.incidentTypeOther) { refs.incidentTypeOther.value = ''; refs.incidentTypeOther.classList.add('hidden'); }
    if (refs.requestTableBody) refs.requestTableBody.innerHTML = '';
    applyGrandTable([]);
    scheduleAutosave();
    renderSummaryPanel();
  });
  refs.exportBtn && refs.exportBtn.addEventListener('click', () => exportToPDF(getCurrentScenarioObject()));

  // incident other
  if (refs.incidentType && refs.incidentTypeOther) {
    refs.incidentType.addEventListener('change', () => {
      if (refs.incidentType.value === 'Other') refs.incidentTypeOther.classList.remove('hidden');
      else { refs.incidentTypeOther.classList.add('hidden'); refs.incidentTypeOther.value = ''; }
      scheduleAutosave();
    });
  }

  // summary toggle behavior (closed = at right edge; open = placed left-of-panel)
  const panelWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 320;
  function setSummaryTogglePosition(open) {
    const btn = refs.summaryToggleBtn;
    if (!btn) return;
    if (open) {
      // move button to left of the open panel (further left by panel width + 8px)
      btn.style.right = (panelWidth + 8) + 'px';
      btn.textContent = '◀';
    } else {
      // closed: sit at right edge (8px)
      btn.style.right = '8px';
      btn.textContent = '▸';
    }
  }

  if (refs.summaryToggleBtn && refs.summaryPanel) {
    refs.summaryToggleBtn.addEventListener('click', () => {
      const open = refs.summaryPanel.classList.toggle('open');
      if (open) {
        refs.summaryPanel.classList.remove('hidden');
        setSummaryTogglePosition(true);
        refs.summaryToggleBtn.setAttribute('aria-expanded', 'true');
      } else {
        refs.summaryPanel.classList.add('hidden');
        setSummaryTogglePosition(false);
        refs.summaryToggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
    // initialize position
    setSummaryTogglePosition(false);
  }

  // global autosave on input (ignore inside dynamic areas)
  document.addEventListener('input', (e) => {
    if (e.target.closest('.modal')) return;
    scheduleAutosave();
    if (e.target.closest('#requestTable')) renderSummaryPanel();
  });

  // ---------- restore autosave if present ----------
  const autosaved = load(KEY_AUTOSAVE, null);
  if (autosaved) {
    loadScenarioToUI(autosaved);
    toast('Restored autosave');
  } else {
    ensureGrandTableDefaults();
  }

  // ---------- initial CSV auto-load (Option A) ----------
  (async function initialLoad() {
    const ok = await loadCSVFromPath(CSV_PATH);
    const storedActive = load(KEY_ACTIVE_LOCATION, null);
    if (storedActive) activeLocationName = storedActive;

    updateLocationSelect();
    reflectActiveLocationInUI();

    renderResourceDependentUI();
    renderScenariosList();
    updateAllResourceBadges();
    switchToPage('analyticsPage');
  })();

  // helper to render any UI elements that depend on resources present
  function renderResourceDependentUI() {
    $$('#requestTable tbody tr.request-row').forEach(tr => refreshRowCategoryOptions(tr));
    renderSummaryPanel();
  }

  // ---------- utility: apply grand table ----------
  function applyGrandTable(data = []) {
    ensureGrandTableDefaults();
    const rows = Array.from(refs.grandTableBody.querySelectorAll('tr'));
    rows.forEach((r, i) => {
      r.children[1].textContent = data[i]?.assignment || '';
    });
  }

  // ---------- utility: update resource badges for all rows ----------
  function updateAllResourceBadges() {
    $$('#requestTable tbody tr.request-row').forEach(tr => updateResourceBadge(tr));
  }

  // expose small debug API for testing
  window.ETS = {
    addRequestRow,
    loadCSVFromPath,
    resourceSets,
    getActiveResourceSet: () => getActiveResourceSet(),
    saveScenarioToList,
    loadScenarioToUI,
    exportToPDF
  };

  // ---------- End of IIFE ----------
})();
