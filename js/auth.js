// Google Identity Services — token client (no backend / no client secret needed)
// Replace YOUR_CLIENT_ID_HERE with your Google Cloud OAuth 2.0 Web client ID.

const AUTH = {
  CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
  _client: null,

  init() {
    if (this.CLIENT_ID === 'YOUR_CLIENT_ID_HERE') return

    const gisReady = () => {
      this._client = google.accounts.oauth2.initTokenClient({
        client_id: this.CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
        callback: resp => this._handleToken(resp),
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

  async _handleToken(resp) {
    if (resp.error) {
      App.setState({ authStatus: null, syncMsg: { type: 'err', text: 'Google sign-in failed: ' + resp.error } })
      return
    }

    const token = {
      access_token: resp.access_token,
      expires_at: Date.now() + (resp.expires_in * 1000),
    }
    DB.saveToken(token)

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

    App.setState({ authStatus: 'connected', userEmail: DB.getUserEmail() })
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
