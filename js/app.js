const BUILD = '2025-07-05.1'

// ── Utility ──────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function emptyDay() {
  return { water: '', steps: 0, noSugar: false, workout: false, breakfast: '', lunch: '', dinner: '', habits: {} }
}

// ── App ───────────────────────────────────────────────────────────────────────

const App = {
  state: {
    tab: 'today',
    today: null,
    habits: [],
    settings: {},
    authStatus: null,
    userEmail: null,
    syncing: false,
    syncMsg: null,
    histYear: new Date().getFullYear(),
    histMonth: new Date().getMonth(),
    newHabitName: '',
    newHabitType: 'check',
    viewingDate: null,
    viewingDayData: null,
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init() {
    this.state.habits = DB.getHabits()
    this.state.settings = DB.getSettings()
    this.state.userEmail = DB.getUserEmail()

    const token = DB.getToken()
    if (token && token.expires_at > Date.now()) {
      this.state.authStatus = 'connected'
    }

    const logs = DB.getLogs()
    this.state.today = logs[todayKey()] || emptyDay()

    this.render()
    AUTH.init()
  },

  // ── State ──────────────────────────────────────────────────────────────────

  setState(updates) {
    Object.assign(this.state, updates)
    this.render()
  },

  saveToday() {
    const logs = DB.getLogs()
    logs[todayKey()] = this.state.today
    DB.saveLogs(logs)
  },

  savePastDay() {
    const logs = DB.getLogs()
    logs[this.state.viewingDate] = this.state.viewingDayData
    DB.saveLogs(logs)
  },

  // ── Tab routing ────────────────────────────────────────────────────────────

  switchTab(tab) {
    if (this.state.tab === tab) {
      if (tab === 'history' && this.state.viewingDate) {
        this.setState({ viewingDate: null, viewingDayData: null })
      }
      return
    }
    this.state.tab = tab
    this.state.syncMsg = null
    this.state.viewingDate = null
    this.state.viewingDayData = null
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab)
    })
    document.getElementById('content').innerHTML = this.renderTab()
    this.afterRender()
  },

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    document.getElementById('content').innerHTML = this.renderTab()
    this.afterRender()
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.state.tab)
    })
  },

  renderTab() {
    switch (this.state.tab) {
      case 'today':   return this.renderToday()
      case 'history': return this.renderHistory()
      case 'habits':  return this.renderHabits()
      case 'sync':    return this.renderSync()
      default:        return this.renderToday()
    }
  },

  afterRender() {},

  // ── Progress helpers ───────────────────────────────────────────────────────

  progressStats(day) {
    day = day || this.state.today
    const habits = this.state.habits
    let done = 0, total = 0

    total++; if (day.water) done++
    total++; if (day.steps > 0) done++
    total++; if (day.noSugar) done++
    total++; if (day.workout) done++
    total++; if (day.breakfast) done++
    total++; if (day.lunch) done++
    total++; if (day.dinner) done++

    for (const h of habits) {
      total++
      const val = day.habits[h.id]
      if (h.type === 'check' && val) done++
      else if (h.type === 'text' && val && val.trim()) done++
    }

    const pct = total > 0 ? done / total : 0
    return { done, total, pct }
  },

  progressMsg(pct) {
    if (pct >= 1) return 'Perfect day! Well done.'
    if (pct >= 0.75) return 'Almost there — keep going!'
    if (pct >= 0.4) return 'Making progress. Keep it up!'
    if (pct > 0) return 'Good start — keep going!'
    return 'Start strong today!'
  },

  updateProgressRing(day) {
    const { pct } = this.progressStats(day)
    const pctLabel = Math.round(pct * 100) + '%'
    const ringOffset = (213.6 * (1 - pct)).toFixed(1)
    const msg = this.progressMsg(pct)

    const circle = document.querySelector('[data-ring-progress]')
    if (circle) circle.setAttribute('stroke-dashoffset', ringOffset)
    const ringCenter = document.querySelector('[data-ring-pct]')
    if (ringCenter) ringCenter.textContent = pctLabel
    const msgEl = document.querySelector('[data-progress-msg]')
    if (msgEl) msgEl.textContent = msg
  },

  scoreDay(log) {
    if (!log) return null
    const anyLogged =
      log.water || log.steps > 0 || log.noSugar || log.workout ||
      log.breakfast || log.lunch || log.dinner ||
      Object.values(log.habits || {}).some(v => v)
    if (!anyLogged) return null

    const isGreat =
      log.water && log.steps > 0 && (log.noSugar || log.workout) &&
      log.breakfast && log.lunch
    return isGreat ? 'great' : 'partial'
  },

  calcStreak() {
    const logs = DB.getLogs()
    let streak = 0
    const d = new Date()
    d.setHours(0, 0, 0, 0)

    for (let i = 0; i < 365; i++) {
      const key = dateKey(d)
      const score = this.scoreDay(logs[key])
      if (!score) break
      streak++
      d.setDate(d.getDate() - 1)
    }
    return streak
  },

  getCalendarCells(year, month) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = todayKey()
    const logs = DB.getLogs()
    const cells = []

    for (let i = 0; i < firstDay; i++) cells.push({ empty: true })

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const key = dateKey(date)
      const isPast = date <= today
      const isToday = key === todayStr
      const score = isPast ? this.scoreDay(logs[key]) : null

      let bg = 'transparent', color = '#B0B0A8', ring = ''
      if (isPast || isToday) {
        if (score === 'great') { bg = '#2A6FDB'; color = '#fff' }
        else if (score === 'partial') { bg = '#C6D8F6'; color = '#1A1A1A' }
        else { bg = '#E7E7E3'; color = '#8A8A85' }
      }
      if (isToday) ring = `0 0 0 2px #2A6FDB`

      cells.push({ label: d, bg, color, ring, key, clickable: isPast || isToday })
    }
    return cells
  },

  monthStats(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const logs = DB.getLogs()
    let great = 0, logged = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(new Date(year, month, d))
      const score = this.scoreDay(logs[key])
      if (score === 'great') { great++; logged++ }
      else if (score === 'partial') logged++
    }
    return { great, logged }
  },

  // ── Shared day fields renderer ─────────────────────────────────────────────
  // prefix '' = today actions, prefix 'Past' = past-day actions

  renderDayFields(day, prefix, dateLabel) {
    const habits = this.state.habits
    const { pct } = this.progressStats(day)
    const msg = this.progressMsg(pct)
    const pctLabel = Math.round(pct * 100) + '%'
    const ringOffset = (213.6 * (1 - pct)).toFixed(1)

    const waterLabel = day.water ? day.water.replace('L', ' L') : '— L'
    const noSugarOn = day.noSugar
    const workoutOn = day.workout

    const habitRows = habits.map(h => {
      const val = day.habits[h.id]
      if (h.type === 'check') {
        const on = !!val
        return `
          <div class="habit-row" onclick="App.toggle${prefix}Habit('${h.id}')">
            <div style="font-size:15px;font-weight:700;">${escHtml(h.name)}</div>
            <div class="chk ${on ? 'on' : ''}">
              ${on ? '<span class="mi fill" style="font-size:15px">check</span>' : ''}
            </div>
          </div>`
      }
      return `
        <div class="habit-row-text">
          <div style="font-size:15px;font-weight:700;">${escHtml(h.name)}</div>
          <input type="text" value="${escHtml(val || '')}" placeholder="Write it down…"
                 oninput="App.on${prefix}HabitText('${h.id}', this.value)">
        </div>`
    }).join('')

    const habitsSection = habits.length > 0 ? `
      <div class="card" style="margin-top:12px;padding:0;overflow:hidden;">
        <div style="padding:14px 16px 4px;display:flex;align-items:center;gap:7px;">
          <span class="mi" style="font-size:19px;color:var(--accent)">task_alt</span>
          <span class="section-label">My habits</span>
        </div>
        ${habitRows}
      </div>` : `
      <div class="empty-state" style="margin-top:12px;">
        <span class="mi">task_alt</span>
        No habits yet. Add some on the Habits tab.
      </div>`

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <div style="font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;">${escHtml(dateLabel)}</div>
          <div class="page-title">SelfMade</div>
          <div style="font-size:14px;color:var(--accent);font-weight:700;max-width:180px;" data-progress-msg>${escHtml(msg)}</div>
        </div>
        <div class="ring-wrap">
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="34" fill="none" stroke="#E4E4E0" stroke-width="9"/>
            <circle cx="42" cy="42" r="34" fill="none" stroke="var(--accent)" stroke-width="9"
                    stroke-linecap="round" stroke-dasharray="213.6" stroke-dashoffset="${ringOffset}"
                    transform="rotate(-90 42 42)" style="transition:stroke-dashoffset 0.4s;"
                    data-ring-progress/>
          </svg>
          <div class="ring-center" data-ring-pct>${pctLabel}</div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:18px;">
        <!-- Water -->
        <div class="card" style="display:flex;flex-direction:column;gap:9px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span class="mi" style="font-size:19px;color:var(--accent)">water_drop</span>
            <span class="section-label">Water</span>
          </div>
          <div class="sora" style="font-size:23px;font-weight:800;color:var(--accent);">${waterLabel}</div>
          <select onchange="App.set${prefix}Field('water', this.value)">
            <option value="" ${!day.water ? 'selected' : ''}>Log intake…</option>
            ${['2L','2.5L','3L','3.5L','4L','4.5L','5L'].map(v =>
              `<option value="${v}" ${day.water === v ? 'selected' : ''}>${v.replace('L', ' L')}</option>`
            ).join('')}
          </select>
        </div>

        <!-- Steps -->
        <div class="card" style="display:flex;flex-direction:column;gap:9px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span class="mi" style="font-size:19px;color:var(--accent)">directions_walk</span>
            <span class="section-label">Steps</span>
          </div>
          <div class="sora" style="font-size:23px;font-weight:800;font-variant-numeric:tabular-nums;">
            ${day.steps.toLocaleString()}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn-icon" style="flex:1;height:34px;border-radius:10px;background:var(--input);color:var(--text);"
                    onclick="App.adjust${prefix}Steps(-1000)">
              <span class="mi">remove</span>
            </button>
            <button class="btn-icon" style="flex:1;height:34px;border-radius:10px;background:var(--accent);color:#fff;"
                    onclick="App.adjust${prefix}Steps(1000)">
              <span class="mi">add</span>
            </button>
          </div>
        </div>

        <!-- No-sugar -->
        <div class="toggle-card ${noSugarOn ? 'on' : ''}" onclick="App.toggle${prefix}('noSugar')">
          <div class="toggle-card-top">
            <span class="mi" style="font-size:22px;color:var(--accent)">cookie</span>
            <div class="chk ${noSugarOn ? 'on' : ''}">
              ${noSugarOn ? '<span class="mi fill" style="font-size:17px">check</span>' : ''}
            </div>
          </div>
          <div style="font-size:15px;font-weight:800;">No-sugar day</div>
          <div style="font-size:12px;color:var(--muted);font-weight:600;">Zero added sugar</div>
        </div>

        <!-- Workout -->
        <div class="toggle-card ${workoutOn ? 'on' : ''}" onclick="App.toggle${prefix}('workout')">
          <div class="toggle-card-top">
            <span class="mi" style="font-size:22px;color:var(--accent)">exercise</span>
            <div class="chk ${workoutOn ? 'on' : ''}">
              ${workoutOn ? '<span class="mi fill" style="font-size:17px">check</span>' : ''}
            </div>
          </div>
          <div style="font-size:15px;font-weight:800;">Workout</div>
          <div style="font-size:12px;color:var(--muted);font-weight:600;">Any training counts</div>
        </div>
      </div>

      <!-- Meals -->
      <div class="card" style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span class="mi" style="font-size:19px;color:var(--accent)">restaurant</span>
          <span class="section-label">Meals</span>
        </div>
        <input type="text" value="${escHtml(day.breakfast)}" placeholder="Breakfast — what did you eat?"
               oninput="App.on${prefix}Meal('breakfast', this.value)">
        <input type="text" value="${escHtml(day.lunch)}" placeholder="Lunch — what did you eat?"
               oninput="App.on${prefix}Meal('lunch', this.value)">
        <input type="text" value="${escHtml(day.dinner)}" placeholder="Dinner — what did you eat?"
               oninput="App.on${prefix}Meal('dinner', this.value)">
      </div>

      ${habitsSection}`
  },

  // ── TODAY tab ──────────────────────────────────────────────────────────────

  renderToday() {
    const today = new Date()
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }).toUpperCase()
    return this.renderDayFields(this.state.today, '', dateStr)
  },

  // ── TODAY actions ──────────────────────────────────────────────────────────

  setField(field, value) {
    this.state.today[field] = value
    this.saveToday()
    this.render()
  },

  toggle(field) {
    this.state.today[field] = !this.state.today[field]
    this.saveToday()
    this.render()
  },

  adjustSteps(delta) {
    this.state.today.steps = Math.max(0, this.state.today.steps + delta)
    this.saveToday()
    this.render()
  },

  onMeal(field, value) {
    this.state.today[field] = value
    this.saveToday()
    this.updateProgressRing(this.state.today)
  },

  toggleHabit(id) {
    this.state.today.habits[id] = !this.state.today.habits[id]
    this.saveToday()
    this.render()
  },

  onHabitText(id, value) {
    this.state.today.habits[id] = value
    this.saveToday()
    this.updateProgressRing(this.state.today)
  },

  // ── PAST DAY actions (history detail view) ─────────────────────────────────

  setPastField(field, value) {
    this.state.viewingDayData[field] = value
    this.savePastDay()
    this.render()
  },

  togglePast(field) {
    this.state.viewingDayData[field] = !this.state.viewingDayData[field]
    this.savePastDay()
    this.render()
  },

  adjustPastSteps(delta) {
    this.state.viewingDayData.steps = Math.max(0, this.state.viewingDayData.steps + delta)
    this.savePastDay()
    this.render()
  },

  onPastMeal(field, value) {
    this.state.viewingDayData[field] = value
    this.savePastDay()
    this.updateProgressRing(this.state.viewingDayData)
  },

  togglePastHabit(id) {
    this.state.viewingDayData.habits[id] = !this.state.viewingDayData.habits[id]
    this.savePastDay()
    this.render()
  },

  onPastHabitText(id, value) {
    this.state.viewingDayData.habits[id] = value
    this.savePastDay()
    this.updateProgressRing(this.state.viewingDayData)
  },

  // ── HISTORY tab ────────────────────────────────────────────────────────────

  renderHistory() {
    if (this.state.viewingDate) return this.renderDayDetail()
    return this.renderCalendar()
  },

  renderCalendar() {
    const { histYear: year, histMonth: month } = this.state
    const streak = this.calcStreak()
    const streakLabel = streak === 1 ? '1 day' : `${streak} day`
    const { great, logged } = this.monthStats(year, month)

    const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const cells = this.getCalendarCells(year, month)

    const dayHeaders = weekdays.map(w =>
      `<div style="height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--muted);">${w}</div>`
    ).join('')

    const dayCells = cells.map(c => {
      if (c.empty) return `<div></div>`
      if (c.clickable) {
        return `<div class="cal-cell" onclick="App.selectCalendarDay('${c.key}')"
          style="background:${c.bg};color:${c.color};${c.ring ? `box-shadow:${c.ring};` : ''}cursor:pointer;">${c.label}</div>`
      }
      return `<div class="cal-cell" style="background:${c.bg};color:${c.color};">${c.label}</div>`
    }).join('')

    const now = new Date()
    const canNext = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth())

    return `
      <div class="page-title">History</div>

      <div class="streak-banner" style="margin-top:14px;">
        <span class="mi fill" style="font-size:28px;color:#fff;">local_fire_department</span>
        <div>
          <div class="sora" style="font-size:20px;font-weight:800;">${streakLabel} streak</div>
          <div style="font-size:13px;font-weight:600;opacity:0.85;">
            ${streak > 0 ? 'Keep it alive — log today!' : 'Start a streak — log something today!'}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;padding:18px 12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <button onclick="App.histNav(-1)" style="width:36px;height:36px;border-radius:50%;border:none;background:var(--input);cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <span class="mi">chevron_left</span>
          </button>
          <div class="sora" style="font-size:15px;font-weight:800;">${monthName}</div>
          <button onclick="App.histNav(1)" ${!canNext ? 'disabled style="opacity:0.3;cursor:default;"' : ''} style="width:36px;height:36px;border-radius:50%;border:none;background:var(--input);cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <span class="mi">chevron_right</span>
          </button>
        </div>
        <div class="cal-grid">${dayHeaders}${dayCells}</div>
        <div style="margin-top:14px;text-align:center;font-size:12px;color:var(--muted);font-weight:600;">
          Tap a day to view or edit
        </div>
        <div style="margin-top:14px;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);font-weight:700;">
            <div class="leg-dot" style="background:#2A6FDB;"></div>Great day
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);font-weight:700;">
            <div class="leg-dot" style="background:#C6D8F6;"></div>Partial
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);font-weight:700;">
            <div class="leg-dot" style="background:#E7E7E3;"></div>Missed
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:12px;">
        <div class="card" style="display:flex;flex-direction:column;gap:2px;">
          <div class="sora" style="font-size:24px;font-weight:800;color:var(--accent);">${great}</div>
          <div style="font-size:12px;color:var(--muted);font-weight:700;">great days this month</div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:2px;">
          <div class="sora" style="font-size:24px;font-weight:800;">${logged}</div>
          <div style="font-size:12px;color:var(--muted);font-weight:700;">days logged</div>
        </div>
      </div>`
  },

  selectCalendarDay(key) {
    if (key === todayKey()) {
      this.switchTab('today')
      return
    }
    const logs = DB.getLogs()
    const dayData = logs[key] ? { ...logs[key] } : emptyDay()
    if (!dayData.habits) dayData.habits = {}
    this.setState({ viewingDate: key, viewingDayData: dayData })
  },

  renderDayDetail() {
    const key = this.state.viewingDate
    const data = this.state.viewingDayData
    const [y, m, d] = key.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const dateStr = dateObj.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }).toUpperCase()

    return `
      <button onclick="App.backToCalendar()" style="display:flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--accent);font-size:14px;font-weight:800;cursor:pointer;padding:0;margin-bottom:16px;font-family:inherit;-webkit-tap-highlight-color:transparent;">
        <span class="mi" style="font-size:20px;">arrow_back</span> History
      </button>
      ${this.renderDayFields(data, 'Past', dateStr)}`
  },

  backToCalendar() {
    this.setState({ viewingDate: null, viewingDayData: null })
  },

  histNav(dir) {
    let { histYear, histMonth } = this.state
    histMonth += dir
    if (histMonth < 0) { histMonth = 11; histYear-- }
    if (histMonth > 11) { histMonth = 0; histYear++ }
    const now = new Date()
    if (histYear > now.getFullYear() || (histYear === now.getFullYear() && histMonth > now.getMonth())) return
    this.setState({ histYear, histMonth })
  },

  // ── HABITS tab ─────────────────────────────────────────────────────────────

  renderHabits() {
    const habits = this.state.habits
    const { newHabitName, newHabitType } = this.state

    const habitList = habits.length > 0 ? habits.map((h, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;${i > 0 ? 'border-top:1px solid var(--divider);' : ''}">
        <div>
          <div style="font-size:15px;font-weight:800;">${escHtml(h.name)}</div>
          <div style="font-size:12px;color:var(--muted);font-weight:600;">${h.type === 'check' ? 'Checkbox' : 'Text entry'}</div>
        </div>
        <button class="btn-icon" style="background:#FDE8E6;color:#B03020;flex-shrink:0;"
                onclick="App.removeHabit('${h.id}')">
          <span class="mi" style="font-size:17px;">delete</span>
        </button>
      </div>
    `).join('') : `
      <div style="padding:20px 16px;font-size:14px;color:var(--muted);font-weight:600;">
        No habits yet. Add one below.
      </div>`

    return `
      <div class="page-title">Habits</div>
      <div style="font-size:13px;color:var(--muted);font-weight:600;margin-top:4px;">
        Add or remove what you track. New habits appear on Today.
      </div>

      <div class="card" style="margin-top:16px;padding:0;overflow:hidden;">
        ${habitList}

        <div style="padding:16px;background:#FBFBFA;border-top:1px solid var(--divider);">
          <div class="section-label" style="margin-bottom:10px;">New habit</div>
          <input type="text" value="${escHtml(newHabitName)}" placeholder="e.g. Read 20 minutes"
                 oninput="App.onNewHabitName(this.value)"
                 onkeydown="if(event.key==='Enter')App.addHabit()">
          <div class="pill-group" style="margin-top:8px;">
            <button class="pill-btn ${newHabitType === 'check' ? 'on' : ''}" onclick="App.setHabitType('check')">Checkbox</button>
            <button class="pill-btn ${newHabitType === 'text' ? 'on' : ''}" onclick="App.setHabitType('text')">Text entry</button>
          </div>
          <button class="btn-primary" style="margin-top:10px;" onclick="App.addHabit()">
            <span class="mi fill" style="font-size:19px;">add</span> Add habit
          </button>
        </div>
      </div>`
  },

  onNewHabitName(value) {
    this.state.newHabitName = value
  },

  setHabitType(type) {
    this.setState({ newHabitType: type })
  },

  addHabit() {
    const name = this.state.newHabitName.trim()
    if (!name) return
    const habit = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      type: this.state.newHabitType,
    }
    const habits = [...this.state.habits, habit]
    DB.saveHabits(habits)
    this.setState({ habits, newHabitName: '', newHabitType: 'check' })
  },

  removeHabit(id) {
    const habits = this.state.habits.filter(h => h.id !== id)
    DB.saveHabits(habits)
    const today = this.state.today
    delete today.habits[id]
    this.saveToday()
    this.setState({ habits })
  },

  // ── SYNC tab ───────────────────────────────────────────────────────────────

  renderSync() {
    const { authStatus, userEmail, settings, syncing, syncMsg } = this.state
    const connected = authStatus === 'connected'
    const needsClientId = AUTH.CLIENT_ID === 'YOUR_CLIENT_ID_HERE'

    const lastSync = settings.lastSyncedAt
      ? new Date(settings.lastSyncedAt).toLocaleString()
      : 'Never'

    const syncMsgHtml = syncMsg ? `
      <div class="sync-msg ${syncMsg.type}">${escHtml(syncMsg.text)}</div>` : ''

    const setupBox = `
      <div class="setup-box" style="margin-top:12px;">
        <h3>⚙️ Set up Google Sync</h3>
        <ol>
          <li>Go to <strong>console.cloud.google.com</strong> → New project → name it <code>SelfMade</code></li>
          <li>APIs &amp; Services → Library → search <strong>Google Sheets API</strong> → Enable</li>
          <li>OAuth consent screen → External → add scope <code>spreadsheets</code> → add your email as test user</li>
          <li>Credentials → <strong>Create OAuth client ID</strong> → Web application</li>
          <li>Authorized JavaScript origins: <code>${escHtml(location.origin)}</code></li>
          <li>Copy the <strong>Client ID</strong> → open <code>js/auth.js</code> → replace <code>YOUR_CLIENT_ID_HERE</code></li>
          <li>Reload the app and tap <strong>Connect Google</strong></li>
        </ol>
      </div>`

    const connectedCard = `
      <div class="card" style="display:flex;align-items:center;gap:14px;">
        <div class="g-icon-circle">
          <span class="mi fill" style="font-size:22px;">cloud_done</span>
        </div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:800;">Google account</div>
          <div style="font-size:13px;color:var(--muted);font-weight:600;">
            ${escHtml(userEmail || 'Connected')}
          </div>
        </div>
        <div style="width:10px;height:10px;border-radius:50%;background:#1F8A5B;flex-shrink:0;"></div>
      </div>

      <div class="card" style="margin-top:12px;padding:0;overflow:hidden;">
        <div class="row-sep" style="border-bottom:1px solid var(--divider);">
          <div>
            <div style="font-size:15px;font-weight:800;">Auto-sync</div>
            <div style="font-size:12px;color:var(--muted);font-weight:600;">Upload when back online</div>
          </div>
          <button class="t-switch ${settings.autoSync ? 'on' : 'off'}" onclick="App.toggleAutoSync()"></button>
        </div>
        <div class="row-sep">
          <div>
            <div style="font-size:15px;font-weight:800;">Last synced</div>
            <div style="font-size:12px;color:var(--muted);font-weight:600;">${lastSync}</div>
          </div>
          <div style="font-size:13px;font-weight:800;color:${connected ? 'var(--accent)' : 'var(--muted)'};">
            ${connected ? 'Ready' : '—'}
          </div>
        </div>
      </div>

      <button class="btn-primary" style="margin-top:16px;height:52px;font-size:16px;border-radius:14px;"
              onclick="App.doSync('upload')" ${syncing ? 'disabled' : ''}>
        ${syncing ? '<div class="spinner"></div> Syncing…' : '<span class="mi" style="font-size:21px;">cloud_upload</span> Upload to Sheets'}
      </button>
      <button class="btn-primary" style="margin-top:8px;height:52px;font-size:16px;border-radius:14px;background:#F2F2EF;color:var(--text);"
              onclick="App.doSync('download')" ${syncing ? 'disabled' : ''}>
        ${syncing ? '' : '<span class="mi" style="font-size:21px;color:var(--accent);">cloud_download</span> Download from Sheets'}
      </button>
      <button onclick="App.disconnectGoogle()" style="margin-top:12px;width:100%;border:none;background:transparent;color:var(--muted);font-size:13px;font-weight:700;cursor:pointer;padding:8px;">
        Disconnect Google account
      </button>`

    const disconnectedCard = `
      <div class="card" style="display:flex;align-items:center;gap:14px;">
        <div class="g-icon-circle" style="background:var(--input);color:var(--muted);">
          <span class="mi" style="font-size:22px;">cloud_off</span>
        </div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:800;">Not connected</div>
          <div style="font-size:13px;color:var(--muted);font-weight:600;">Connect your Google account to sync</div>
        </div>
      </div>
      ${needsClientId ? setupBox : `
      <button class="btn-primary" style="margin-top:16px;height:52px;font-size:16px;border-radius:14px;"
              onclick="AUTH.connect()">
        <span class="mi fill" style="font-size:21px;">account_circle</span> Connect Google
      </button>`}`

    return `
      <div class="page-title">Sync</div>
      <div style="font-size:13px;color:var(--muted);font-weight:600;margin-top:4px;">
        Everything is stored on your device — works fully offline. Sync uploads your log to Google Sheets.
      </div>

      <div style="margin-top:16px;">
        ${connected ? connectedCard : disconnectedCard}
      </div>

      ${syncMsgHtml}

      ${_installPrompt ? `
      <button class="btn-primary" style="margin-top:16px;height:52px;font-size:16px;border-radius:14px;background:#1A1A1A;"
              onclick="App.installPWA()">
        <span class="mi fill" style="font-size:21px;">install_mobile</span> Add to Home Screen
      </button>` : `
      <div style="margin-top:16px;text-align:center;font-size:12px;color:var(--muted);font-weight:600;">
        Installable as a PWA — add to home screen, log offline, sync later.
      </div>`}

      <div style="margin-top:24px;text-align:center;font-size:11px;color:var(--muted);font-weight:700;letter-spacing:0.05em;">
        BUILD ${escHtml(BUILD)}
      </div>`
  },

  toggleAutoSync() {
    const settings = { ...this.state.settings, autoSync: !this.state.settings.autoSync }
    DB.saveSettings(settings)
    this.setState({ settings })
  },

  async doSync(direction) {
    this.setState({ syncing: true, syncMsg: null })
    try {
      let token = AUTH.getToken()
      if (!token) {
        this.setState({ syncing: false, syncMsg: { type: 'err', text: 'Token expired. Please reconnect Google.' } })
        return
      }

      let { spreadsheetId } = this.state.settings
      if (!spreadsheetId) {
        spreadsheetId = await SYNC.createSpreadsheet(token)
        const settings = { ...this.state.settings, spreadsheetId }
        DB.saveSettings(settings)
        this.state.settings = settings
      }

      if (direction === 'upload') {
        await SYNC.upload(token, spreadsheetId)
      } else {
        const data = await SYNC.download(token, spreadsheetId)
        if (data.habits) { DB.saveHabits(data.habits); this.state.habits = data.habits }
        if (data.logs) {
          DB.saveLogs(data.logs)
          const todayLog = data.logs[todayKey()]
          this.state.today = todayLog || emptyDay()
        }
      }

      const settings = { ...this.state.settings, lastSyncedAt: Date.now() }
      DB.saveSettings(settings)
      this.setState({
        syncing: false,
        settings,
        syncMsg: { type: 'ok', text: direction === 'upload' ? '✓ Uploaded to Google Sheets.' : '✓ Data downloaded from Google Sheets.' }
      })
    } catch (err) {
      console.error(err)
      this.setState({ syncing: false, syncMsg: { type: 'err', text: 'Sync failed: ' + err.message } })
    }
  },

  async installPWA() {
    if (!_installPrompt) return
    _installPrompt.prompt()
    await _installPrompt.userChoice
    _installPrompt = null
    this.render()
  },

  disconnectGoogle() {
    AUTH.disconnect()
    const settings = { ...this.state.settings, spreadsheetId: null }
    DB.saveSettings(settings)
    this.setState({ authStatus: null, userEmail: null, settings })
  },
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

let _installPrompt = null

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  _installPrompt = e
  App.render()
})

window.addEventListener('appinstalled', () => {
  _installPrompt = null
  App.render()
})

document.addEventListener('DOMContentLoaded', () => App.init())
