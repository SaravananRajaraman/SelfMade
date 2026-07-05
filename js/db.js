const DB = {
  getLogs() {
    try { return JSON.parse(localStorage.getItem('selfmade_logs') || '{}') } catch { return {} }
  },
  saveLogs(logs) {
    localStorage.setItem('selfmade_logs', JSON.stringify(logs))
  },
  getHabits() {
    try { return JSON.parse(localStorage.getItem('selfmade_habits') || '[]') } catch { return [] }
  },
  saveHabits(habits) {
    localStorage.setItem('selfmade_habits', JSON.stringify(habits))
  },
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem('selfmade_settings') || 'null') || {
        autoSync: false, spreadsheetId: null, lastSyncedAt: null
      }
    } catch { return { autoSync: false, spreadsheetId: null, lastSyncedAt: null } }
  },
  saveSettings(s) {
    localStorage.setItem('selfmade_settings', JSON.stringify(s))
  },
  getToken() {
    try { return JSON.parse(localStorage.getItem('selfmade_token') || 'null') } catch { return null }
  },
  saveToken(t) {
    localStorage.setItem('selfmade_token', JSON.stringify(t))
  },
  clearToken() {
    localStorage.removeItem('selfmade_token')
  },
  getUserEmail() {
    return localStorage.getItem('selfmade_email') || null
  },
  saveUserEmail(email) {
    localStorage.setItem('selfmade_email', email)
  },
}
