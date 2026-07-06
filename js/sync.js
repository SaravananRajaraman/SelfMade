// Google Sheets API v4 helpers
// All operations do a full overwrite to keep things simple and conflict-free.

const SYNC = {
  BASE: 'https://sheets.googleapis.com/v4/spreadsheets',
  DRIVE: 'https://www.googleapis.com/drive/v3/files',
  SHEET_TITLE: 'SelfMade Health Log',

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

  // Find the sheet this app created (on any device) so we never make a
  // second one. drive.file scope only exposes files created by this app.
  async findSpreadsheet(token) {
    const q = encodeURIComponent(
      `name = '${this.SHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
    )
    let data
    try {
      data = await this._req(token, 'GET',
        `${this.DRIVE}?q=${q}&orderBy=createdTime&fields=files(id,name)&pageSize=5`)
    } catch (err) {
      // Don't fall through to createSpreadsheet — that would duplicate sheets
      throw new Error('Could not look up your sheet. Enable the "Google Drive API" in your Google Cloud project, then reconnect. (' + err.message + ')')
    }
    return (data.files && data.files.length) ? data.files[0].id : null
  },

  // Create a new spreadsheet and return its ID
  async createSpreadsheet(token) {
    const body = {
      properties: { title: this.SHEET_TITLE },
      sheets: [
        { properties: { title: 'Daily Log' } },
        { properties: { title: 'Habits' } },
      ],
    }
    const data = await this._req(token, 'POST', this.BASE, body)
    return data.spreadsheetId
  },

  FIXED_COLS: ['Date','Water','Steps','No-Sugar','Workout','Protein','Sleep','Breakfast','Lunch','Dinner'],

  // Upload all local data → Sheets (full overwrite)
  async upload(token, spreadsheetId) {
    const logs = DB.getLogs()
    const habits = DB.getHabits()

    // Build habit columns (dynamic)
    const habitCols = habits.map(h => h.name)

    // Build Daily Log rows
    const logRows = [[...this.FIXED_COLS, ...habitCols]]
    for (const [date, log] of Object.entries(logs).sort()) {
      const row = [
        date,
        log.water || '',
        log.steps || 0,
        log.noSugar ? 'Yes' : 'No',
        log.workout ? 'Yes' : 'No',
        log.protein ? 'Yes' : 'No',
        log.sleep ? 'Yes' : 'No',
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

    // Parse daily logs. Columns are looked up by header name so sheets
    // written before Protein/Sleep existed still parse correctly.
    const logRows = (logData.values || [])
    const header = logRows[0] || []
    const fixed = new Set(this.FIXED_COLS)
    const col = name => header.indexOf(name)
    const idx = {
      water: col('Water'), steps: col('Steps'), noSugar: col('No-Sugar'),
      workout: col('Workout'), protein: col('Protein'), sleep: col('Sleep'),
      breakfast: col('Breakfast'), lunch: col('Lunch'), dinner: col('Dinner'),
    }
    const cell = (row, i) => i >= 0 ? (row[i] || '') : ''
    const logs = {}

    for (const row of logRows.slice(1)) {
      const date = row[0]
      if (!date) continue
      const habitValues = {}
      for (let i = 1; i < header.length; i++) {
        if (fixed.has(header[i])) continue
        const habit = habits.find(h => h.name === header[i])
        if (habit) {
          const raw = row[i] || ''
          habitValues[habit.id] = habit.type === 'check'
            ? (raw === 'true' || raw === 'Yes')
            : raw
        }
      }
      logs[date] = {
        water: cell(row, idx.water),
        steps: parseInt(cell(row, idx.steps) || '0', 10) || 0,
        noSugar: cell(row, idx.noSugar) === 'Yes',
        workout: cell(row, idx.workout) === 'Yes',
        protein: cell(row, idx.protein) === 'Yes',
        sleep: cell(row, idx.sleep) === 'Yes',
        breakfast: cell(row, idx.breakfast),
        lunch: cell(row, idx.lunch),
        dinner: cell(row, idx.dinner),
        habits: habitValues,
      }
    }

    return { habits, logs }
  },
}
