import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getProfile, getSettings, saveSettings, type Profile, type Role, type Settings } from './api'

type AuthState = {
  loading: boolean
  userId: string | null
  email: string | null
  profile: Profile | null
  role: Role | 'guest'
  settings: Settings
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { email: string; password: string; nickname: string; avatar: string }) => Promise<void>
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
  const [settings, setSettings] = useState<Settings>({ translations_enabled: true, translation_mode: 'on' })

  async function loadFor(uid: string | null, mail: string | null) {
    setUserId(uid)
    setEmail(mail)
    if (uid) {
      const [p, s] = await Promise.all([getProfile(uid), getSettings(uid)])
      setProfile(p)
      setSettings(s)
    } else {
      setProfile(null)
      setSettings({ translations_enabled: true, translation_mode: 'on' })
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
      const { error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { full_name: nickname, avatar } },
      })
      if (error) throw error
      // If email confirmation is off, a session already exists → sign in cleanly.
      if (!(await supabase.auth.getSession()).data.session) {
        await supabase.auth.signInWithPassword({ email: mail, password }).catch(() => {})
      }
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
