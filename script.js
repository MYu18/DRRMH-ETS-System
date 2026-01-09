(function () {
  'use strict';

  // ---------- Config / storage keys ----------
  const DEFAULT_SPEED_KMH = 30;
  const KEY_ACTIVE_LOCATION = 'ets_active_location_v2';
  const KEY_SCENARIOS = 'ets_scenarios_v2';
  const KEY_AUTOSAVE = 'ets_autosave_current_v2';
  const KEY_LOGGED_IN = 'ets_logged_in';
  const KEY_USERNAME = 'ets_username';
  const AUTOSAVE_DELAY = 800; // ms
  const ETA_UPDATE_INTERVAL = 10_000; // ms
  const CSV_PATH = './resources.csv'; // auto-load path

  // ---------- Supabase Configuration ----------
  const SUPABASE_URL = 'https://lqewapijqycrfgbsgxwe.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_HiicAKRYHQi2GvTLF1hbnA_PzRs18EO';
  
  // Initialize Supabase client
  let supabase = null;
  if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

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

  // ---------- Login/Logout Logic ----------
  async function checkLoginStatus() {
    if (!supabase) {
      showLoginPage();
      return;
    }

    // Check for existing user session in localStorage
    const userId = load(KEY_LOGGED_IN, null);
    const userEmail = load(KEY_USERNAME, null);
    
    if (userId && userEmail) {
      // Verify user still exists in database
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data && !error) {
        showMainApp();
        initializeApp();
        return;
      }
    }
    
    showLoginPage();
  }

  function showLoginPage() {
    const loginPage = $('#loginPage');
    const mainApp = $('#mainApp');
    if (loginPage) loginPage.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
  }

  function showMainApp() {
    const loginPage = $('#loginPage');
    const mainApp = $('#mainApp');
    if (loginPage) loginPage.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
  }

  async function handleLogin() {
    const usernameInput = $('#loginUsername');
    const passwordInput = $('#loginPassword');
    const errorDiv = $('#loginError');
    
    const email = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
      errorDiv.textContent = 'Please enter both email and password';
      errorDiv.classList.remove('hidden');
      return;
    }

    if (!supabase) {
      errorDiv.textContent = 'Database connection error. Please try again later.';
      errorDiv.classList.remove('hidden');
      return;
    }

    try {
      // Query users table for matching email and password
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (error || !data) {
        errorDiv.textContent = 'Invalid email or password';
        errorDiv.classList.remove('hidden');
      } else {
        // Save user session
        save(KEY_LOGGED_IN, data.id);
        save(KEY_USERNAME, data.email);
        errorDiv.classList.add('hidden');
        showMainApp();
        initializeApp();
      }
    } catch (err) {
      errorDiv.textContent = 'Login failed. Please try again.';
      errorDiv.classList.remove('hidden');
    }
  }

  async function handleSignup() {
    const emailInput = $('#signupEmail');
    const passwordInput = $('#signupPassword');
    const confirmInput = $('#signupPasswordConfirm');
    const errorDiv = $('#signupError');
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const confirm = confirmInput.value.trim();
    
    if (!email || !password || !confirm) {
      errorDiv.textContent = 'Please fill in all fields';
      errorDiv.classList.remove('hidden');
      return;
    }

    if (password !== confirm) {
      errorDiv.textContent = 'Passwords do not match';
      errorDiv.classList.remove('hidden');
      return;
    }

    if (password.length < 6) {
      errorDiv.textContent = 'Password must be at least 6 characters';
      errorDiv.classList.remove('hidden');
      return;
    }

    if (!supabase) {
      errorDiv.textContent = 'Database connection error. Please try again later.';
      errorDiv.classList.remove('hidden');
      return;
    }

    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .single();

      if (existingUser) {
        errorDiv.textContent = 'Email already registered';
        errorDiv.classList.remove('hidden');
        return;
      }

      // Extract name from email (part before @)
      const name = email.split('@')[0];

      // Insert new user into users table
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            name: name,
            email: email,
            password: password,
            isadmin: false
          }
        ])
        .select()
        .single();

      if (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
      } else {
        errorDiv.classList.add('hidden');
        alert('Account created successfully! You can now sign in.');
        toggleToLogin();
        // Pre-fill email in login form
        const loginEmail = $('#loginUsername');
        if (loginEmail) loginEmail.value = email;
      }
    } catch (err) {
      errorDiv.textContent = 'Signup failed. Please try again.';
      errorDiv.classList.remove('hidden');
    }
  }

  async function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;
    
    save(KEY_LOGGED_IN, null);
    save(KEY_USERNAME, '');
    showLoginPage();
    
    // Clear forms
    const usernameInput = $('#loginUsername');
    const passwordInput = $('#loginPassword');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
  }

  function toggleToSignup() {
    const loginForm = $('.login-form:not(#signupForm)');
    const signupForm = $('#signupForm');
    const loginError = $('#loginError');
    if (loginError) loginError.classList.add('hidden');
    if (loginForm) loginForm.classList.add('hidden');
    if (signupForm) signupForm.classList.remove('hidden');
  }

  function toggleToLogin() {
    const loginForm = $('.login-form:not(#signupForm)');
    const signupForm = $('#signupForm');
    const signupError = $('#signupError');
    if (signupError) signupError.classList.add('hidden');
    if (signupForm) signupForm.classList.add('hidden');
    if (loginForm) loginForm.classList.remove('hidden');
  }

  // ---------- DOM refs ----------
  const refs = {
    csvUpload: $('#csvUpload'),
    csvStatus: $('#csvStatus'),
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
    logoutBtn: $('#logoutBtn'),
    autosaveBadge: $('#autosaveBadge'),
    scenariosList: $('#scenariosList'),
    chartStatus: $('#chartStatus'),
    chartQty: $('#chartQty'),
    chartCategories: $('#chartCategories'),
    summaryPanel: $('#summaryPanel'),
    summaryToggleBtn: $('#summaryToggleBtn'),
    resourcesUploadContainer: document.querySelector('.csv-controls') || null,
    startTimeLabel: $('#startTimeLabel'),
    endTimeLabel: $('#endTimeLabel'),
    loginBtn: $('#loginBtn'),
    loginUsername: $('#loginUsername'),
    loginPassword: $('#loginPassword')
  };

  // ---------- In-memory state ----------
  let resourceSets = []; // csv only; not stored to localStorage
  let activeLocationName = load(KEY_ACTIVE_LOCATION, null); // name only
  let autosaveTimer = null;
  let scenarios = load(KEY_SCENARIOS, []) || [];

  let chartCompletedPending = null;
  let chartEtaStatus = null;
  let chartCats = null;


  // Scenario-level timing
  let startTime = null;
  let endTime = null;

  function updateTimeLabels() {
    if (refs.startTimeLabel) refs.startTimeLabel.textContent = startTime || '--:--';
    if (refs.endTimeLabel) refs.endTimeLabel.textContent = endTime || '--:--';
  }

  // ---------- Location select ----------
  function ensureLocationSelect() {
    let existing = document.getElementById('locationSelect');
    if (existing) return existing;

    if (!refs.resourcesUploadContainer) return null;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginLeft = '8px';

    const select = document.createElement('select');
    select.id = 'locationSelect';
    select.className = 'select-inline';
    select.setAttribute('aria-label', 'Select Location');

    wrapper.appendChild(select);
    refs.resourcesUploadContainer.appendChild(wrapper);
    return select;
  }

  const locationSelectEl = ensureLocationSelect();

  // ---------- CSV parsing ----------
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

  // ---------- CSV status ----------
  function showCSVStatus(msg, isError = false) {
    if (refs.csvFileName) {
      refs.csvFileName.textContent = msg;
      refs.csvFileName.style.color = isError ? '#b22222' : '#6b6b6b';
    }
  }

  // ---------- Load CSV ----------
  async function loadCSVFromPath(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error('Fetch failed');
      const text = await res.text();
      applyCSVText(text, path);
      return true;
    } catch (e) {
      console.warn('resources.csv auto-load failed:', e);
      showCSVStatus('no csv file uploaded', true);
      return false;
    }
  }

  function applyCSVText(csvText, filename = 'resources.csv') {
    const parsed = parseCSV(csvText);
    const resourceArr = csvRecordsToResourceSets(parsed.records);
    resourceSets = resourceArr;
    updateLocationSelect();
    showCSVStatus(`Loaded ${resourceSets.length} location(s) from ${filename}`, false);

    if (activeLocationName && !resourceSets.find(rs => rs.name === activeLocationName)) {
      activeLocationName = resourceSets[0]?.name || null;
      save(KEY_ACTIVE_LOCATION, activeLocationName);
    }
    if (!activeLocationName && resourceSets.length) {
      activeLocationName = resourceSets[0].name;
      save(KEY_ACTIVE_LOCATION, activeLocationName);
    }
    reflectActiveLocationInUI();
    renderSummaryPanel();
  }

  function handleCSVUploadFile(file) {
    if (!file) return;
    showCSVStatus(`loading ${file.name} ...`, false);
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

  // ---------- Location select ----------
  function updateLocationSelect() {
    if (!locationSelectEl) return;
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

    if (activeLocationName && resourceSets.find(rs => rs.name === activeLocationName)) {
      locationSelectEl.value = activeLocationName;
    } else if (resourceSets.length) {
      activeLocationName = resourceSets[0].name;
      locationSelectEl.value = activeLocationName;
      save(KEY_ACTIVE_LOCATION, activeLocationName);
    }
  }

  function reflectActiveLocationInUI() {
    if (locationSelectEl && activeLocationName) locationSelectEl.value = activeLocationName;
    updateAllResourceBadges();
    $$('#requestTable tbody tr.request-row').forEach(tr => {
      refreshRowCategoryOptions(tr);
    });
    renderSummaryPanel();
  }

  function getActiveResourceSet() {
    if (!activeLocationName) return null;
    return resourceSets.find(rs => rs.name === activeLocationName) || null;
  }

  // ---------- Category / Source ----------
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

  // ---------- Rows ----------
  function createRequestRow(pre = {}) {
    const tbody = refs.requestTableBody;
    if (!tbody) return null;
    const tr = document.createElement('tr');
    tr.className = 'request-row';
    tr.dataset.partials = JSON.stringify(pre.partials || []);
    tr.dataset.doneTime = pre.doneTime || '';
    tr.innerHTML = `
      <td style="width:110px">
        <button class="toggle-partials small-ghost" title="Show partial deliveries">▶</button>
        <div class="small request-time">${pre.time || nowHM()}</div>
      </td>
      <td contenteditable="true" class="item-cell" data-placeholder="Item">${pre.item || ''}</td>
      <td contenteditable="true" class="qty-cell" data-placeholder="0">${pre.qty || ''}</td>
      <td><select class="category-select select-inline"></select></td>
      <td><select class="source-select select-inline" disabled></select></td>
      <td contenteditable="true" class="remarks-cell" data-placeholder="Remarks">${pre.remarks || ''}</td>
      <td contenteditable="true" class="est-min" data-placeholder="0">${pre.estMin || ''}</td>
      <td contenteditable="true" class="eta" data-placeholder="--:--">${pre.eta || ''}</td>
      <td><button class="delete-btn btn small-ghost">✕</button></td>
      <td class="checkbox-col">
        <input type="checkbox" class="done-checkbox" ${pre.done ? 'checked' : ''}>
        <div class="done-time small">${pre.doneTime || ''}</div>
      </td>
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

    // numeric-only Qty and Est
    const qtyCell = tr.querySelector('.qty-cell');
    const estCell = tr.querySelector('.est-min');

    function enforceNumeric(cell) {
      const cleaned = cell.textContent.replace(/[^\d]/g, '');
      if (cell.textContent !== cleaned) cell.textContent = cleaned;
    }

    qtyCell.addEventListener('input', () => {
      enforceNumeric(qtyCell);
      scheduleAutosave();
      renderSummaryPanel();
    });
    estCell.addEventListener('input', () => {
      enforceNumeric(estCell);
      const v = estCell.textContent.trim();
      if (v && !isNaN(Number(v))) {
        tr.querySelector('.eta').textContent = minutesToETA(Number(v));
      }
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
      const doneTimeEl = tr.querySelector('.done-time');
      if (doneCb.checked) {
        setDoneState(tr, true);
        if (!tr.dataset.doneTime) {
          const t = nowHM();
          tr.dataset.doneTime = t;
          if (doneTimeEl) doneTimeEl.textContent = t; // <-- timestamp shown in UI
        }
      } else {
        setDoneState(tr, false);
        tr.dataset.doneTime = '';
        if (doneTimeEl) doneTimeEl.textContent = '';
      }
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
        r.innerHTML = `
          <td contenteditable="true" class="p-qty">${p.qty}</td>
          <td contenteditable="true" class="p-time">${p.time}</td>
          <td contenteditable="true" class="p-notes">${p.notes || ''}</td>
          <td><button class="btn small delete-partial">✕</button></td>`;
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
    const doneTimeEl = tr.querySelector('.done-time');
    if (qty > 0 && total >= qty) {
      if (!tr.classList.contains('done-row')) {
        setDoneState(tr, true);
        if (!tr.dataset.doneTime) {
          const t = nowHM();
          tr.dataset.doneTime = t;
          if (doneTimeEl) doneTimeEl.textContent = t;
        }
      }
    } else {
      setDoneState(tr, false);
      tr.dataset.doneTime = '';
      if (doneTimeEl) doneTimeEl.textContent = '';
    }
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
    const nowHMDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    const oneMinBefore = new Date(etaDate.getTime() - 60000);
    if (nowHMDate.getTime() >= etaDate.getTime()) tr.classList.add('eta-due');
    else if (nowHMDate.getTime() === oneMinBefore.getTime()) tr.classList.add('eta-approach');
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
      doneTime: tr.dataset.doneTime || tr.querySelector('.done-time')?.textContent.trim() || '',
      partials: JSON.parse(tr.dataset.partials || '[]'),
      resourceLocation: activeLocationName || null
    }));
  }

  // ---------- scenario persistence ----------
  function getCurrentScenarioObject() {
    const incidentVal = (refs.incidentType && refs.incidentType.value === 'Other')
      ? (refs.incidentTypeOther?.value || 'Other')
      : (refs.incidentType?.value || '');
    return {
      name: (refs.scenarioName?.value?.trim()) || 'Untitled scenario',
      createdAt: Date.now(),
      grandTable: serializeGrandTable(),
      requests: serializeRequestRows(),
      incidentType: incidentVal,
      resourceLocation: activeLocationName || null,
      startTime,
      endTime
    };
  }
  
  async function saveScenarioToSupabase(scenario, finished = false) {
    if (!supabase) return;

    const userId = load(KEY_LOGGED_IN);
    if (!userId) return;

    // 1. Save scenario
    const { data: scenarioRow, error } = await supabase
      .from('scenarios')
      .insert({
        user_id: userId,
        name: scenario.name,
        incident_type: scenario.incidentType,
        resource_location: scenario.resourceLocation,
        start_time: scenario.startTime,
        end_time: scenario.endTime,
        finished
      })
      .select()
      .single();

    if (error || !scenarioRow) {
      console.error('Supabase scenario save failed:', error);
      return;
    }

    // 2. Save requests
    for (const r of scenario.requests) {
      const { data: requestRow } = await supabase
        .from('requests')
        .insert({
          scenario_id: scenarioRow.id,
          time: r.time,
          item: r.item,
          qty: Number(r.qty) || 0,
          category: r.category,
          source: r.source,
          remarks: r.remarks,
          est_min: Number(r.estMin) || 0,
          eta: r.eta,
          done: r.done,
          done_time: r.doneTime,
          resource_location: r.resourceLocation
        })
        .select()
        .single();

      if (!requestRow) continue;

      // 3. Save partials
      for (const p of (r.partials || [])) {
        await supabase.from('partials').insert({
          request_id: requestRow.id,
          qty: Number(p.qty) || 0,
          time: p.time,
          notes: p.notes
        });
      }
    }
  }

  async function loadScenariosFromSupabase() {
    if (!supabase) return [];

    const userId = load(KEY_LOGGED_IN);
    if (!userId) return [];

    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }

    return data;
  }

  async function loadScenarioFromSupabase(scenarioId) {
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', scenarioId)
      .single();

    if (!scenario) return;

    const { data: requests } = await supabase
      .from('requests')
      .select('*')
      .eq('scenario_id', scenarioId);

    for (const r of (requests || [])) {
      const { data: partials } = await supabase
        .from('partials')
        .select('*')
        .eq('request_id', r.id);

      r.partials = partials || [];
    }

    loadScenarioToUI({
      ...scenario,
      requests
    });

    switchToPage('grandPage');
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

  async function renderScenariosList() {
    const container = refs.scenariosList;
    if (!container) return;

    container.innerHTML = '';

    const dbScenarios = await loadScenariosFromSupabase();

    if (!dbScenarios.length) {
      container.innerHTML = '<div class="small">No saved scenarios</div>';
      return;
    }

    dbScenarios.forEach(s => {
      const el = document.createElement('div');
      el.className = 'scenario-entry';
      el.innerHTML = `
        <div>
          <div style="font-weight:700">${s.name}</div>
          <div class="meta">
            Created: ${new Date(s.created_at).toLocaleString()}
            ${s.finished ? '• Finished' : ''}
          </div>
        </div>
        <button class="btn load-scn" data-id="${s.id}">Open</button>
      `;
      container.appendChild(el);
    });

    $$('.load-scn', container).forEach(btn => {
      btn.addEventListener('click', () => {
        loadScenarioFromSupabase(btn.dataset.id);
      });
    });
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
      toast(`Referenced resource location "${scn.resourceLocation}" not found in CSV. Select another location.`);
    }
    reflectActiveLocationInUI();

    startTime = scn.startTime || null;
    endTime = scn.endTime || null;
    updateTimeLabels();

    applyGrandTable(scn.grandTable || []);
    (scn.requests || []).forEach(r => addRequestRow(r));
    updateAllResourceBadges();
    scheduleAutosave();
    toast('Scenario loaded');
  }

  // ---------- Autosave ----------
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
    if (refs.csvStatus) {
      const prev = $('#__small_toast');
      if (prev) prev.remove();
      const n = document.createElement('div');
      n.id = '__small_toast';
      n.textContent = msg;
      n.style.fontSize = '13px';
      n.style.color = '#111';
      n.style.marginLeft = '10px';
      refs.csvStatus.appendChild(n);
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
        const nowHMDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
        const oneBefore = new Date(etaDate.getTime() - 60000);
        if (nowHMDate.getTime() >= etaDate.getTime()) late++;
        else if (nowHMDate.getTime() === oneBefore.getTime()) approaching++;
        else ontime++;
      }
    });
    return { totalRequests, totalQty, completed, pending: totalRequests - completed, ontime, approaching, late };
  }

  function renderAnalyticsCharts(options = {}) {
  const { instantForPDF = false } = options;
  const s = computeSummary();

  // ---- Completed vs Pending ----
  const cpCtx = document.getElementById('chartCompletedPending')?.getContext('2d');
  if (cpCtx) {
    if (chartCompletedPending) chartCompletedPending.destroy();

    chartCompletedPending = new Chart(cpCtx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending'],
        datasets: [{
          data: [s.completed, s.pending],
          backgroundColor: ['#6b6bd1', '#c9c9c9']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: instantForPDF ? false : { duration: 700 }
      }
    });
  }

  // ---- ETA Status ----
  const etaCtx = document.getElementById('chartEtaStatus')?.getContext('2d');
  if (etaCtx) {
    if (chartEtaStatus) chartEtaStatus.destroy();

    chartEtaStatus = new Chart(etaCtx, {
      type: 'doughnut',
      data: {
        labels: ['On Time', 'Approaching', 'Late'],
        datasets: [{
          data: [s.ontime, s.approaching, s.late],
          backgroundColor: ['#4bbf4b', '#ffb86b', '#ff6b6b']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: instantForPDF ? false : { duration: 700 }
      }
    });
  }

  // ---- Categories ----
  if (refs.chartCategories) {
    const counts = {};
    $$('#requestTable tbody tr.request-row').forEach(tr => {
      const cat = tr.querySelector('.category-select')?.value || 'Unspecified';
      counts[cat] = (counts[cat] || 0) + (Number(tr.querySelector('.qty-cell')?.textContent) || 1);
    });

    if (chartCats) chartCats.destroy();
    chartCats = new Chart(refs.chartCategories.getContext('2d'), {
      type: 'pie',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: Object.keys(counts).map((_, i) =>
            `hsl(${(i * 55) % 360} 70% 50%)`
          )
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: instantForPDF ? false : { duration: 700 }
      }
    });
  }

  // ---- Total Quantity display ----
  const qtyEl = document.getElementById('totalQtyValue');
  if (qtyEl) qtyEl.textContent = s.totalQty || 0;
}


  // ---------- Export PDF (Analytics screenshot + labeled tables + ICP + RR log + partials) ----------
  function exportToPDF(data) {
    const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
    if (!jsPDFCtor) {
      alert("PDF export requires jsPDF.");
      return;
    }

    const doc = new jsPDFCtor({ unit: "pt", format: "letter" });
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;

    const hasAutoTable = typeof doc.autoTable === 'function';

    // --- C option for analytics capture: re-render charts with animation disabled
    const captureAnalytics = () =>
      new Promise((resolve) => {
        const analyticsSection = document.getElementById("analyticsPage");
        if (!analyticsSection || !window.html2canvas) {
          resolve(null);
          return;
        }

        // remember currently visible section
        const currentSection = document.querySelector('.view-section:not(.hidden)');
        const currentId = currentSection ? currentSection.id : null;

        const wasHidden = analyticsSection.classList.contains("hidden");
        if (wasHidden) analyticsSection.classList.remove("hidden");

        if (currentId !== 'analyticsPage') {
          switchToPage('analyticsPage');
        }

        // render charts instantly (no animation) for crisp screenshot
        renderAnalyticsCharts({ instantForPDF: true });

        // small safety delay so html2canvas sees final pixels
        setTimeout(() => {
          window
            .html2canvas(analyticsSection, { scale: 2, useCORS: true })
            .then((canvas) => {
              // restore previous view
              if (currentId && currentId !== 'analyticsPage') {
                switchToPage(currentId);
              } else if (wasHidden) {
                analyticsSection.classList.add("hidden");
              }
              resolve(canvas);
            })
            .catch(() => {
              if (currentId && currentId !== 'analyticsPage') {
                switchToPage(currentId);
              } else if (wasHidden) {
                analyticsSection.classList.add("hidden");
              }
              resolve(null);
            });
        }, 300);
      });

    captureAnalytics().then((canvas) => {
      let y = margin;

      if (canvas) {
        const imgData = canvas.toDataURL("image/png");
        const imgW = contentWidth;
        const imgH = (canvas.height * imgW) / canvas.width;
        doc.addImage(imgData, "PNG", margin, y, imgW, imgH);
        y += imgH + 16;

        // labeled numeric tables under analytics (C3 option)
        const summary = computeSummary();
        const catCounts = {};
        (data.requests || []).forEach(r => {
          const cat = r.category || 'Unspecified';
          const qty = Number(r.qty) || 0;
          catCounts[cat] = (catCounts[cat] || 0) + qty;
        });

        if (hasAutoTable) {
          doc.autoTable({
            startY: y,
            head: [["Status", "Count"]],
            body: [
              ["On time", summary.ontime],
              ["Approaching", summary.approaching],
              ["Late", summary.late],
              ["Completed", summary.completed],
              ["Pending", summary.pending]
            ],
            theme: "grid",
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [128, 0, 0], textColor: 255, fontStyle: "bold" },
            margin: { left: margin, right: margin },
            tableWidth: contentWidth
          });

          y = doc.lastAutoTable.finalY + 10;

          const catLabels = Object.keys(catCounts);
          if (catLabels.length) {
            const catBody = catLabels.map(k => [k, catCounts[k]]);
            doc.autoTable({
              startY: y,
              head: [["Category", "Total Qty"]],
              body: catBody,
              theme: "grid",
              styles: { fontSize: 9, cellPadding: 3 },
              headStyles: { fillColor: [128, 0, 0], textColor: 255, fontStyle: "bold" },
              margin: { left: margin, right: margin },
              tableWidth: contentWidth
            });
            y = doc.lastAutoTable.finalY + 10;
          }
        }

        doc.addPage();
        y = margin;
      }

      // --- Incident Command Post Team table (page 2+)
      doc.setFontSize(18);
      doc.text("Incident Command Post Team", margin, y);
      y += 20;

      if (hasAutoTable) {
        doc.autoTable({
          startY: y,
          head: [["Role", "Assignment"]],
          body: (data.grandTable || []).map((r) => [
            r.role,
            r.assignment || "",
          ]),
          theme: "grid",
          styles: { fontSize: 10, cellPadding: 4 },
          headStyles: {
            fillColor: [128, 0, 0],
            textColor: 255,
            fontStyle: "bold",
          },
          margin: { left: margin, right: margin },
          tableWidth: contentWidth,
        });

        y = doc.lastAutoTable.finalY + 25;
      } else {
        doc.setFontSize(10);
        (data.grandTable || []).forEach(r => {
          const line = `${r.role}: ${r.assignment || ''}`;
          const split = doc.splitTextToSize(line, contentWidth);
          doc.text(split, margin, y);
          y += split.length * 12;
        });
        y += 20;
      }

      // --- Resource Request Log table
      doc.setFontSize(16);
      doc.text("Resource Request Log", margin, y);
      y += 16;

      doc.setFontSize(12);
      doc.text(`Start Time: ${data.startTime || "--:--"}`, margin, y);
      doc.text(`End Time: ${data.endTime || "--:--"}`, margin + 200, y);
      y += 14;

      const reqs = data.requests || [];

      const rrBody = reqs.map((r) => [
        r.time || '',
        r.item || '',
        r.qty || '',
        r.category || '',
        r.source || '',
        r.remarks || '',
        r.estMin || '',
        r.eta || '',
        r.done ? "Completed" : "Pending",
        r.doneTime || ''
      ]);

      if (hasAutoTable) {
        doc.autoTable({
          startY: y,
          head: [[
            "Time",
            "Item",
            "Qty",
            "Category",
            "Source",
            "Remarks",
            "Est (min)",
            "ETA",
            "Status",
            "Done Time"
          ]],
          body: rrBody,
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [128, 0, 0], textColor: 255, fontStyle: "bold" },
          margin: { left: margin, right: margin },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: 40 },
            2: { cellWidth: 30 },
            6: { cellWidth: 40 },
            7: { cellWidth: 40 },
            8: { cellWidth: 55 },
            9: { cellWidth: 55 },
          }
        });
        y = doc.lastAutoTable.finalY + 20;
      } else {
        doc.setFontSize(9);
        rrBody.forEach(r => {
          const line = r.join(' | ');
          const split = doc.splitTextToSize(line, contentWidth);
          if (y + split.length * 11 > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(split, margin, y);
          y += split.length * 11;
        });
        y += 16;
      }

      // --- Partial Deliveries list
      doc.setFontSize(14);
      if (y > pageHeight - margin - 40) {
        doc.addPage();
        y = margin;
      }
      doc.text("Partial Deliveries", margin, y);
      y += 12;

      doc.setFontSize(11);
      let anyPartials = false;

      reqs.forEach((r, idx) => {
        const itemName = r.item || `Item ${idx + 1}`;
        (r.partials || []).forEach((p) => {
          anyPartials = true;
          const line = `• ${p.time || '--:--'} — ${p.qty || ''} unit(s) of ${itemName}${p.notes ? " — " + p.notes : ""}`;
          const wrapped = doc.splitTextToSize(line, contentWidth);

          if (y + wrapped.length * 12 > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }

          doc.text(wrapped, margin, y);
          y += wrapped.length * 12;
        });
      });

      if (!anyPartials) {
        doc.text("No partial deliveries recorded.", margin, y);
      }

      const safeName = (data.name || "scenario")
        .replace(/\s+/g, "_")
        .replace(/[^\w\-_.]/g, "");

      doc.save(
        `${safeName}_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.pdf`
      );
    });
  }

  // ---------- Page switching ----------
  function switchToPage(pageId) {
    ['analyticsPage', 'scenariosPage', 'grandPage'].forEach(pid => {
      const el = document.getElementById(pid);
      if (el) el.classList.add('hidden');
    });
    const show = document.getElementById(pageId);
    if (show) show.classList.remove('hidden');

    [refs.navAnalytics, refs.navScenarios, refs.navOngoing].forEach(n => n && n.classList.remove('active'));
    if (pageId === 'analyticsPage') refs.navAnalytics && refs.navAnalytics.classList.add('active');
    if (pageId === 'scenariosPage') refs.navScenarios && refs.navScenarios.classList.add('active');
    if (pageId === 'grandPage') refs.navOngoing && refs.navOngoing.classList.add('active');

    const topActions = $('#topActions');
    if (topActions) topActions.style.display = 'flex';

    if (pageId === 'analyticsPage') renderAnalyticsCharts();
    if (pageId === 'scenariosPage') renderScenariosList();
    if (pageId === 'grandPage') {
      ensureGrandTableDefaults();
      updateAllResourceBadges();
      renderSummaryPanel();
    }
  }

  // ---------- Summary panel ----------
  function renderSummaryPanel() {
    const s = computeSummary();
    if (!refs.summaryPanel) { renderAnalyticsCharts(); return; }
    const fill = (sel, v) => {
      const el = refs.summaryPanel.querySelector(sel);
      if (el) el.textContent = v;
    };
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

  // Trim empty contenteditable on blur so placeholder shows nicely
  document.addEventListener("blur", e => {
    if (e.target.matches("[contenteditable]")) {
      e.target.textContent = e.target.textContent.trim();
      if (!e.target.textContent) e.target.innerHTML = "";
    }
  }, true);

  // ---------- Initialize App (called after login) ----------
  function initializeApp() {
    const autosaved = load(KEY_AUTOSAVE, null);
    if (autosaved) {
      loadScenarioToUI(autosaved);
      toast('Restored autosave');
    } else {
      ensureGrandTableDefaults();
      updateTimeLabels();
    }

    // initial CSV auto-load
    (async function initialLoad() {
      await loadCSVFromPath(CSV_PATH);
      const storedActive = load(KEY_ACTIVE_LOCATION, null);
      if (storedActive) activeLocationName = storedActive;

      updateLocationSelect();
      reflectActiveLocationInUI();

      renderResourceDependentUI();
      renderScenariosList();
      updateAllResourceBadges();
      switchToPage('analyticsPage');
    })();
  }

  function renderResourceDependentUI() {
    $$('#requestTable tbody tr.request-row').forEach(tr => refreshRowCategoryOptions(tr));
    renderSummaryPanel();
  }

  function applyGrandTable(data = []) {
    ensureGrandTableDefaults();
    const rows = Array.from(refs.grandTableBody.querySelectorAll('tr'));
    rows.forEach((r, i) => {
      r.children[1].textContent = data[i]?.assignment || '';
    });
  }

  // ---------- UI bindings ----------
  
  // Login page bindings
  if (refs.loginBtn) {
    refs.loginBtn.addEventListener('click', handleLogin);
  }
  
  if (refs.loginPassword) {
    refs.loginPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }

  // Signup page bindings
  const signupBtn = $('#signupBtn');
  const signupPassword = $('#signupPassword');
  const toggleSignup = $('#toggleSignup');
  const toggleLogin = $('#toggleLogin');

  if (signupBtn) {
    signupBtn.addEventListener('click', handleSignup);
  }

  if (signupPassword) {
    signupPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSignup();
    });
  }

  if (toggleSignup) {
    toggleSignup.addEventListener('click', (e) => {
      e.preventDefault();
      toggleToSignup();
    });
  }

  if (toggleLogin) {
    toggleLogin.addEventListener('click', (e) => {
      e.preventDefault();
      toggleToLogin();
    });
  }

  // Logout button
  if (refs.logoutBtn) {
    refs.logoutBtn.addEventListener('click', handleLogout);
  }

  refs.navAnalytics && refs.navAnalytics.addEventListener('click', () => switchToPage('analyticsPage'));
  refs.navScenarios && refs.navScenarios.addEventListener('click', () => switchToPage('scenariosPage'));
  refs.navOngoing && refs.navOngoing.addEventListener('click', () => switchToPage('grandPage'));

  if (refs.csvUpload) {
    refs.csvUpload.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) handleCSVUploadFile(f);
    });
  }

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
    if (!startTime) {
      startTime = nowHM();
      updateTimeLabels();
    }
    addRequestRow();
    scheduleAutosave();
    renderSummaryPanel();
  });

  // Save / Finish / New / Export
  refs.saveBtn && refs.saveBtn.addEventListener('click', () => saveScenarioToList(false));

  refs.finishBtn && refs.finishBtn.addEventListener('click', async () => {
    endTime = nowHM();
    updateTimeLabels();

    const scenario = getCurrentScenarioObject();

    // Save to Supabase (final copy)
    await saveScenarioToSupabase(scenario, true);

    // Keep localStorage version
    saveScenarioToList(true);
  });


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
    startTime = null;
    endTime = null;
    updateTimeLabels();
    applyGrandTable([]);
    scheduleAutosave();
    renderSummaryPanel();
  });

  refs.exportBtn && refs.exportBtn.addEventListener('click', () => exportToPDF(getCurrentScenarioObject()));

  if (refs.incidentType && refs.incidentTypeOther) {
    refs.incidentType.addEventListener('change', () => {
      if (refs.incidentType.value === 'Other') refs.incidentTypeOther.classList.remove('hidden');
      else { refs.incidentTypeOther.classList.add('hidden'); refs.incidentTypeOther.value = ''; }
      scheduleAutosave();
    });
  }

  // summary toggle button behavior
  const panelWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 320;
  function setSummaryTogglePosition(open) {
    const btn = refs.summaryToggleBtn;
    if (!btn) return;
    if (open) {
      btn.style.right = (panelWidth + 8) + 'px';
      btn.textContent = '◀';
    } else {
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
    setSummaryTogglePosition(false);
  }

  // global autosave on input (ignore anything inside modals)
  document.addEventListener('input', (e) => {
    if (e.target.closest('.modal')) return;
    scheduleAutosave();
    if (e.target.closest('#requestTable')) renderSummaryPanel();
  });

  // ---------- Check login status on load ----------
  checkLoginStatus();

  // expose small debug API
  window.ETS = {
    addRequestRow,
    loadCSVFromPath,
    resourceSets,
    getActiveResourceSet: () => getActiveResourceSet(),
    saveScenarioToList,
    loadScenarioToUI,
    exportToPDF
  };

})();
