// Google Sheets API v4 helpers
// All operations do a full overwrite to keep things simple and conflict-free.

const SYNC = {
  BASE: 'https://sheets.googleapis.com/v4/spreadsheets',

  _headers(token) {
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  },

  async _req(token, method, url, body) {
    const opts = { method, headers: this._headers(token) }
    if (body) opts.body = JSON.stringify(body)
    const resp = await fetch(url, opts)
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Sheets API ${resp.status}: ${text}`)
    }
    return method === 'DELETE' ? null : resp.json()
  },

  // Create a new spreadsheet and return its ID
  async createSpreadsheet(token) {
    const body = {
      properties: { title: 'SelfMade Health Log' },
      sheets: [
        { properties: { title: 'Daily Log' } },
        { properties: { title: 'Habits' } },
      ],
    }
    const data = await this._req(token, 'POST', this.BASE, body)
    return data.spreadsheetId
  },

  // Upload all local data → Sheets (full overwrite)
  async upload(token, spreadsheetId) {
    const logs = DB.getLogs()
    const habits = DB.getHabits()

    // Build habit columns (dynamic)
    const habitCols = habits.map(h => h.name)

    // Build Daily Log rows
    const logRows = [['Date','Water','Steps','No-Sugar','Workout','Breakfast','Lunch','Dinner', ...habitCols]]
    for (const [date, log] of Object.entries(logs).sort()) {
      const row = [
        date,
        log.water || '',
        log.steps || 0,
        log.noSugar ? 'Yes' : 'No',
        log.workout ? 'Yes' : 'No',
        log.breakfast || '',
        log.lunch || '',
        log.dinner || '',
        ...habits.map(h => (log.habits || {})[h.id] !== undefined ? String((log.habits || {})[h.id]) : ''),
      ]
      logRows.push(row)
    }

    // Build Habits rows
    const habitRows = [['ID','Name','Type'], ...habits.map(h => [h.id, h.name, h.type])]

    // Clear then write both sheets
    await this._clearAndWrite(token, spreadsheetId, 'Daily Log', logRows)
    await this._clearAndWrite(token, spreadsheetId, 'Habits', habitRows)
  },

  async _clearAndWrite(token, spreadsheetId, sheet, rows) {
    const range = encodeURIComponent(`${sheet}!A:Z`)
    await this._req(token, 'POST', `${this.BASE}/${spreadsheetId}/values/${range}:clear`, {})
    if (rows.length < 2) return
    await this._req(token, 'PUT',
      `${this.BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      { values: rows }
    )
  },

  // Download from Sheets → local data format
  async download(token, spreadsheetId) {
    const [logData, habitData] = await Promise.all([
      this._req(token, 'GET', `${this.BASE}/${spreadsheetId}/values/${encodeURIComponent('Daily Log!A:Z')}`),
      this._req(token, 'GET', `${this.BASE}/${spreadsheetId}/values/${encodeURIComponent('Habits!A:D')}`),
    ])

    // Parse habits first (need IDs for log parsing)
    const habitRows = (habitData.values || []).slice(1) // skip header
    const habits = habitRows.filter(r => r[0] && r[1]).map(r => ({
      id: r[0],
      name: r[1] || '',
      type: r[2] === 'text' ? 'text' : 'check',
    }))

    // Parse daily logs
    const logRows = (logData.values || [])
    const header = logRows[0] || []
    // Dynamic habit column indices
    const habitStartIdx = 8
    const logs = {}

    for (const row of logRows.slice(1)) {
      const date = row[0]
      if (!date) continue
      const habitValues = {}
      for (let i = habitStartIdx; i < header.length; i++) {
        const habitName = header[i]
        const habit = habits.find(h => h.name === habitName)
        if (habit) {
          const raw = row[i] || ''
          habitValues[habit.id] = habit.type === 'check'
            ? (raw === 'true' || raw === 'Yes')
            : raw
        }
      }
      logs[date] = {
        water: row[1] || '',
        steps: parseInt(row[2] || '0', 10) || 0,
        noSugar: row[3] === 'Yes',
        workout: row[4] === 'Yes',
        breakfast: row[5] || '',
        lunch: row[6] || '',
        dinner: row[7] || '',
        habits: habitValues,
      }
    }

    return { habits, logs }
  },
}
