// Google Identity Services — token client (no backend / no client secret needed)
// Replace YOUR_CLIENT_ID_HERE with your Google Cloud OAuth 2.0 Web client ID.

const AUTH = {
  CLIENT_ID: '967954261282-q9v8gat87qacqfm33f5tj7mhvbm2jvd0.apps.googleusercontent.com',
  _client: null,
  _refreshResolve: null,

  init() {
    if (!this.CLIENT_ID || this.CLIENT_ID === 'YOUR_CLIENT_ID_HERE') return

    const gisReady = () => {
      this._client = google.accounts.oauth2.initTokenClient({
        client_id: this.CLIENT_ID,
        // drive.file lets the app find the sheet it created on another
        // device, so every device syncs to the same spreadsheet.
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        callback: resp => this._handleToken(resp),
        error_callback: () => this._settle(null),
      })
    }

    if (window.google && window.google.accounts) {
      gisReady()
    } else {
      // Load GIS script dynamically
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.onload = gisReady
      document.head.appendChild(s)
    }
  },

  connect() {
    if (!this._client) {
      alert('Google auth not ready. If you just set your CLIENT_ID, reload the page first.')
      return
    }
    this._client.requestAccessToken()
  },

  // Resolve a pending refresh() promise. Returns true if one was pending
  // (i.e. this token round-trip was a background refresh, not a user connect).
  _settle(tokenOrNull) {
    const resolve = this._refreshResolve
    this._refreshResolve = null
    if (resolve) { resolve(tokenOrNull); return true }
    return false
  },

  // Ask GIS for a fresh access token. Works silently when the user has an
  // active Google session and prior consent; otherwise the popup may be
  // blocked outside a user gesture — we time out and resolve null.
  refresh() {
    return new Promise(resolve => {
      if (!this._client) return resolve(null)
      this._refreshResolve = resolve
      setTimeout(() => { if (this._refreshResolve === resolve) this._settle(null) }, 10000)
      try {
        this._client.requestAccessToken({ prompt: '' })
      } catch (_) {
        this._settle(null)
      }
    })
  },

  // Returns a usable access token, refreshing if the stored one is expired.
  async getValidToken() {
    const t = DB.getToken()
    if (t && t.expires_at > Date.now() + 60 * 1000) return t.access_token
    // GIS script may still be loading right after app start
    for (let i = 0; i < 10 && !this._client; i++) {
      await new Promise(r => setTimeout(r, 300))
    }
    return this.refresh()
  },

  async _handleToken(resp) {
    if (resp.error) {
      const wasRefresh = this._settle(null)
      if (!wasRefresh) {
        App.setState({ authStatus: null, syncMsg: { type: 'err', text: 'Google sign-in failed: ' + resp.error } })
      }
      return
    }

    const token = {
      access_token: resp.access_token,
      expires_at: Date.now() + (resp.expires_in * 1000),
    }
    DB.saveToken(token)
    const wasRefresh = this._settle(resp.access_token)

    // Fetch user email
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + resp.access_token }
      })
      if (r.ok) {
        const info = await r.json()
        DB.saveUserEmail(info.email || '')
        App.state.userEmail = info.email || ''
      }
    } catch (_) {}

    if (wasRefresh && App.state.authStatus === 'connected') {
      // Silent refresh — don't re-render (the user may be mid-typing)
      return
    }
    App.setState({ authStatus: 'connected', userEmail: DB.getUserEmail() })
    App.onConnected()
  },

  getToken() {
    const t = DB.getToken()
    if (!t || t.expires_at < Date.now()) return null
    return t.access_token
  },

  disconnect() {
    const t = DB.getToken()
    if (t && window.google && google.accounts) {
      google.accounts.oauth2.revoke(t.access_token, () => {})
    }
    DB.clearToken()
    DB.saveUserEmail('')
  },
}
