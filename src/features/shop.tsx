import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { CoinEntry, ShopItem, StoreProduct, Wallet } from '../lib/api'
import { Avatar, FRAMES, PREMIUM_AVATARS, avatarLabel } from '../lib/avatars'

/* ============================================================
   Coins: balance and streak in the header, the shop, the history.
   ============================================================ */

/** 🔥 streak · 🪙 balance — opens the shop. */
export function WalletChip({ wallet, onClick }: { wallet: Wallet; onClick: () => void }) {
  const { t } = useTranslation()
  const streak = api.liveStreak(wallet)
  return (
    <button
      onClick={onClick}
      title={t('shop.title')}
      className="flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 font-body text-sm font-semibold transition-colors hover:border-lavender"
    >
      <span className={streak && api.learnedToday(wallet) ? '' : 'opacity-50'} aria-label={t('shop.streakDays', { n: streak })}>
        🔥 {streak}
      </span>
      <span aria-label={t('shop.coins', { n: wallet.balance })}>🪙 {wallet.balance}</span>
    </button>
  )
}

/** "+15 🪙" after a lesson. */
export function EarnedBadge({ coins }: { coins: number }) {
  const { t } = useTranslation()
  if (coins <= 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(214,160,23,.15)] px-3 py-1 text-sm font-semibold text-[#9a6b00]">
      +{coins} 🪙 <span className="font-normal">{t('shop.earned')}</span>
    </span>
  )
}

const eur = (cents: number, lang: string) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(cents / 100)

export function Shop({ wallet, onWallet }: { wallet: Wallet; onWallet: (w: Wallet) => void }) {
  const { t, i18n } = useTranslation()
  const { userId, profile, refresh } = useAuth()
  const [items, setItems] = useState<ShopItem[]>([])
  const [owned, setOwned] = useState<string[]>([])
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [history, setHistory] = useState<CoinEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    if (!userId) return
    const [it, own, pr, h, w] = await Promise.all([
      api.shopItems().catch(() => []),
      api.myItems(userId).catch(() => []),
      api.storeProducts().catch(() => []),
      api.coinHistory(userId, 30).catch(() => []),
      api.myWallet(userId).catch(() => wallet),
    ])
    setItems(it)
    setOwned(own)
    setProducts(pr)
    setHistory(h)
    onWallet(w)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function buy(item: ShopItem) {
    setBusy(item.code)
    setMsg(null)
    try {
      onWallet(await api.buyItem(item.code))
      setMsg({ ok: true, text: t('shop.bought') })
      await load()
    } catch (e) {
      const hint = (e as { hint?: string }).hint
      setMsg({ ok: false, text: hint ? t(`shop.errors.${hint}`, { defaultValue: t('shop.errors.generic') }) : t('shop.errors.generic') })
    } finally {
      setBusy(null)
    }
  }

  async function wear(patch: { avatar?: string; frame?: string | null }) {
    if (!userId) return
    setBusy('wear')
    try {
      await api.updateProfile(userId, patch)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const streak = api.liveStreak(wallet)
  const freeze = items.find((i) => i.kind === 'streak_freeze')
  const avatars = items.filter((i) => i.kind === 'avatar')
  const frames = items.filter((i) => i.kind === 'frame')
  const price = (p: number) => (
    <span className="font-body font-semibold">
      {p} 🪙
    </span>
  )
  const card = 'rounded-2xl border border-line bg-paper p-4'
  // keys built at runtime (plan names / feature lists)
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => unknown

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">{t('shop.title')}</h2>

      {/* balance + streak */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className="text-sm text-mute">{t('shop.balance')}</p>
          <p className="font-display text-4xl font-semibold text-plum">🪙 {wallet.balance}</p>
          <p className="mt-1 text-xs text-mute">{t('shop.earnedToday', { n: wallet.earned_day === new Date().toISOString().slice(0, 10) ? wallet.earned_today : 0, limit: api.DAILY_EARN_LIMIT })}</p>
        </div>
        <div className={card}>
          <p className="text-sm text-mute">{t('shop.streak')}</p>
          <p className="font-display text-4xl font-semibold text-plum">🔥 {streak}</p>
          <p className="mt-1 text-xs text-mute">
            {api.learnedToday(wallet) ? t('shop.streakDone') : t('shop.streakTodo')} · {t('shop.best', { n: wallet.best_streak })}
          </p>
        </div>
        <div className={card}>
          <p className="text-sm text-mute">{t('shop.howToEarn')}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink/80">
            <li>{t('shop.rules.lesson')}</li>
            <li>{t('shop.rules.teacher')}</li>
            <li>{t('shop.rules.cards')}</li>
            <li>{t('shop.rules.streak')}</li>
          </ul>
        </div>
      </div>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? 'text-[var(--color-good)]' : 'text-warn'}`}>{msg.text}</p>}

      {/* for coins */}
      <h3 className="mt-10 mb-3 font-display text-2xl font-semibold">{t('shop.forCoins')}</h3>
      {freeze && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="font-semibold">🧊 {t('shop.freeze')}</p>
            <p className="text-sm text-mute">{t('shop.freezeHint', { n: wallet.freezes })}</p>
          </div>
          <div className="flex items-center gap-3">
            {price(freeze.price)}
            <Button onClick={() => buy(freeze)} disabled={busy !== null || wallet.freezes >= 2 || wallet.balance < freeze.price}>
              {t('shop.buy')}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-6 mb-2 font-semibold">{t('shop.avatarsTitle')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {avatars.map((it) => {
          const id = it.code.replace(/^avatar_/, '')
          if (!PREMIUM_AVATARS.some((a) => a.id === id)) return null
          const have = owned.includes(it.code)
          const worn = profile?.avatar === id
          return (
            <div key={it.code} className={`${card} flex flex-col items-center gap-2 text-center`}>
              <Avatar id={id} size={64} frame={profile?.frame} />
              <p className="text-sm font-semibold">{avatarLabel(id)}</p>
              {have ? (
                worn ? (
                  <Badge>{t('shop.worn')}</Badge>
                ) : (
                  <Button variant="soft" onClick={() => wear({ avatar: id })} disabled={busy !== null}>
                    {t('shop.wear')}
                  </Button>
                )
              ) : (
                <>
                  {price(it.price)}
                  <Button onClick={() => buy(it)} disabled={busy !== null || wallet.balance < it.price}>
                    {t('shop.buy')}
                  </Button>
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 mb-2 font-semibold">{t('shop.frames')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {frames.map((it) => {
          if (!FRAMES[it.code]) return null
          const have = owned.includes(it.code)
          const worn = profile?.frame === it.code
          return (
            <div key={it.code} className={`${card} flex flex-col items-center gap-2 text-center`}>
              <Avatar id={profile?.avatar} size={56} frame={it.code} />
              <p className="text-sm font-semibold">{t(`shop.frameNames.${it.code}`, { defaultValue: it.code })}</p>
              {have ? (
                <Button variant="soft" onClick={() => wear({ frame: worn ? null : it.code })} disabled={busy !== null}>
                  {worn ? t('shop.takeOff') : t('shop.wear')}
                </Button>
              ) : (
                <>
                  {price(it.price)}
                  <Button onClick={() => buy(it)} disabled={busy !== null || wallet.balance < it.price}>
                    {t('shop.buy')}
                  </Button>
                </>
              )}
            </div>
          )
        })}
      </div>

      <PriceList products={products} />

      {/* history */}
      <h3 className="mt-10 mb-3 font-display text-2xl font-semibold">{t('shop.history')}</h3>
      {history.length === 0 ? (
        <p className="text-mute">{t('shop.noHistory')}</p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-paper">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                {t(`shop.kinds.${h.kind}`, { defaultValue: h.kind })}
                {typeof h.meta.capped_from === 'number' && <span className="text-mute"> · {t('shop.capped')}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-mute">{new Date(h.created_at).toLocaleDateString(i18n.language)}</span>
                <b className={h.amount > 0 ? 'text-[var(--color-good)]' : 'text-warn'}>
                  {h.amount > 0 ? '+' : ''}
                  {h.amount}
                </b>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Coin packs and subscriptions with prices (shop and the public pricing page). */
export function PriceList({ products }: { products: StoreProduct[] }) {
  const { t, i18n } = useTranslation()
  const packs = products.filter((p) => p.kind === 'coins')
  const plans = products.filter((p) => p.kind === 'subscription')
  const card = 'rounded-2xl border border-line bg-paper p-4'
  // keys built at runtime (plan names / feature lists)
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => unknown
  return (
    <>
      <h3 className="mt-10 mb-1 font-display text-2xl font-semibold">{t('shop.buyCoins')}</h3>
      <p className="mb-3 text-sm text-mute">{t('shop.paymentsSoon')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {packs.map((p) => (
          <div key={p.code} className={`${card} flex flex-col items-center gap-2 text-center`}>
            <p className="font-display text-3xl font-semibold text-plum">🪙 {p.coins}</p>
            {typeof p.data.bonus_pct === 'number' && <Badge>+{p.data.bonus_pct as number}%</Badge>}
            <p className="font-semibold">{eur(p.price_cents, i18n.language)}</p>
            <Button disabled>{t('shop.soon')}</Button>
          </div>
        ))}
      </div>

      <h3 className="mt-10 mb-3 font-display text-2xl font-semibold">{t('shop.plans')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((p) => {
          const plan = (p.data.plan as string) ?? 'plus'
          return (
            <div key={p.code} className={`${card} flex flex-col gap-2`}>
              <p className="font-display text-xl font-semibold">{tt(`shop.planNames.${plan}`) as string}</p>
              <p className="font-semibold text-plum">
                {eur(p.price_cents, i18n.language)} / {t(p.interval === 'year' ? 'shop.year' : 'shop.month')}
              </p>
              <ul className="space-y-1 text-sm text-ink/80">
                {(tt(`shop.planFeatures.${plan}`, { returnObjects: true }) as string[]).map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Button disabled className="mt-auto">
                {t('shop.soon')}
              </Button>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-mute">{t('shop.adultsOnly')}</p>
    </>
  )
}
