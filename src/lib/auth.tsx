import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { claimAdmin, getProfile, getSettings, saveSettings, type Profile, type Role, type Settings } from './api'

type AuthState = {
  loading: boolean
  userId: string | null
  email: string | null
  profile: Profile | null
  role: Role | 'guest'
  settings: Settings
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { email: string; password: string; nickname: string; avatar: string }) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  updateSettings: (s: Partial<Settings>) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings>({ translations_enabled: true, translation_mode: 'on', english_level: 'A1' })

  async function loadFor(uid: string | null, mail: string | null) {
    setUserId(uid)
    setEmail(mail)
    if (uid) {
      // The profile is created by a DB trigger right after signup; on a brand-new
      // account the row can lag a beat, so retry once before giving up.
      let p = await getProfile(uid)
      if (!p) {
        await new Promise((r) => setTimeout(r, 500))
        p = await getProfile(uid)
      }
      // Admin self-heal: if this account's email matches the configured
      // ADMIN_EMAIL, the server promotes it to admin (safe, checked server-side).
      if (!p || p.role !== 'admin') {
        const promoted = await claimAdmin().catch(() => false)
        if (promoted) p = (await getProfile(uid)) ?? p
      }
      // A valid session must never be treated as a guest: fall back to a minimal
      // profile so the user stays authenticated even if the read is delayed.
      setProfile(
        p ?? { id: uid, full_name: mail?.split('@')[0] ?? '', role: 'student', avatar: 'cat', teacher_request: 'none' },
      )
      setSettings(await getSettings(uid))
    } else {
      setProfile(null)
      setSettings({ translations_enabled: true, translation_mode: 'on', english_level: 'A1' })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      await loadFor(data.session?.user.id ?? null, data.session?.user.email ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      loadFor(session?.user.id ?? null, session?.user.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    loading,
    userId,
    email,
    profile,
    role: profile?.role ?? 'guest',
    settings,
    async signIn(mail, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
      if (error) throw error
    },
    async signUp({ email: mail, password, nickname, avatar }) {
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { full_name: nickname, avatar } },
      })
      if (error) throw error

      // Case A — "Confirm email" is OFF: signUp returns a live session immediately.
      if (data.session) {
        await loadFor(data.session.user.id, data.session.user.email ?? mail)
        return { needsConfirmation: false }
      }

      // Case B — no session was returned. This usually means email confirmation
      // is required. Try an immediate password sign-in; it succeeds only when
      // confirmation is actually off (e.g. session just wasn't echoed back).
      const { data: signedIn } = await supabase.auth
        .signInWithPassword({ email: mail, password })
        .catch(() => ({ data: { session: null } }) as any)
      if (signedIn?.session) {
        await loadFor(signedIn.session.user.id, signedIn.session.user.email ?? mail)
        return { needsConfirmation: false }
      }

      // Genuinely needs email confirmation — report it instead of pretending success.
      return { needsConfirmation: true }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
    async refresh() {
      if (userId) await loadFor(userId, email)
    },
    async updateSettings(s) {
      if (!userId) return
      const next = { ...settings, ...s }
      setSettings(next)
      await saveSettings(userId, s)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
