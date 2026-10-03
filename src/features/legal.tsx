import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { StoreProduct } from '../lib/api'
import { LEGAL, isPlaceholder } from '../lib/legal'
import { Button } from '../lib/ui'
import { PriceList } from './shop'

/* ============================================================
   Public pages the payment provider checks: pricing, terms, refunds,
   privacy — plus the footer that links to them from every page.
   Legal texts are in English (the binding version); the rest is translated.
   ============================================================ */

export const PUBLIC_PAGES = ['pricing', 'terms', 'refund', 'privacy'] as const
export type PublicPage = (typeof PUBLIC_PAGES)[number]

export function pageFromPath(path: string): PublicPage | null {
  const p = path.replace(/^\/+|\/+$/g, '')
  return (PUBLIC_PAGES as readonly string[]).includes(p) ? (p as PublicPage) : null
}

/** A seller detail; placeholders are highlighted so they are not published by accident. */
function V({ v }: { v: string | number }) {
  const s = String(v)
  return isPlaceholder(s) ? <mark className="rounded bg-[rgba(214,160,23,.25)] px-1">{s}</mark> : <>{s}</>
}

function Mail() {
  return isPlaceholder(LEGAL.email) ? <V v={LEGAL.email} /> : <a className="text-plum underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
}

export function Footer({ onOpen }: { onOpen: (p: PublicPage) => void }) {
  const { t } = useTranslation()
  const link = (p: PublicPage, label: string) => (
    <a
      href={`/${p}`}
      onClick={(e) => {
        e.preventDefault()
        onOpen(p)
      }}
      className="hover:text-ink"
    >
      {label}
    </a>
  )
  return (
    <footer className="mx-auto max-w-5xl border-t border-line px-6 py-8 font-body text-sm text-mute">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p>
          © {new Date().getFullYear()} {LEGAL.product} · <V v={LEGAL.seller} />
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {link('pricing', t('footer.pricing'))}
          {link('terms', t('footer.terms'))}
          {link('refund', t('footer.refund'))}
          {link('privacy', t('footer.privacy'))}
          <span>
            {t('footer.contact')}: <Mail />
          </span>
        </nav>
      </div>
    </footer>
  )
}

/* ---------------- pricing ---------------- */

export function Pricing({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState<StoreProduct[]>([])
  useEffect(() => {
    api.storeProducts().then(setProducts).catch(() => setProducts([]))
  }, [])
  const card = 'rounded-2xl border border-line bg-paper p-5'
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => unknown
  return (
    <section className="mx-auto max-w-4xl px-6 pb-16">
      <h2 className="font-display text-4xl font-semibold">{t('pricing.title')}</h2>
      <p className="mt-2 max-w-2xl text-mute">{t('pricing.subtitle')}</p>

      <div className={`${card} mt-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl font-semibold">{t('pricing.freeTitle')}</h3>
          <p className="font-display text-2xl font-semibold text-plum">€0</p>
        </div>
        <ul className="mt-3 grid gap-1 text-sm text-ink/80 sm:grid-cols-2">
          {(tt('pricing.freeFeatures', { returnObjects: true }) as string[]).map((f) => (
            <li key={f}>✓ {f}</li>
          ))}
        </ul>
        <Button onClick={onStart} className="mt-4">
          {t('home.start')}
        </Button>
      </div>

      <div className={`${card} mt-4`}>
        <h3 className="font-display text-2xl font-semibold">{t('pricing.coinsTitle')}</h3>
        <p className="mt-2 text-sm text-ink/80">{t('pricing.coinsText')}</p>
        <ul className="mt-2 space-y-1 text-sm text-ink/80">
          {(tt('pricing.coinUses', { returnObjects: true }) as string[]).map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      </div>

      <PriceList products={products} />

      <p className="mt-6 text-xs text-mute">
        {t('pricing.vat')} {t('pricing.processor', { name: LEGAL.processor })}
      </p>
    </section>
  )
}

/* ---------------- legal documents ---------------- */

function Doc({ title, children }: { title: string; children: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  return (
    <article className="mx-auto max-w-3xl px-6 pb-16 text-ink/90 [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
      <h2 className="font-display text-4xl font-semibold">{title}</h2>
      <p className="text-sm text-mute">
        Last updated: <V v={LEGAL.updated} />
      </p>
      {!i18n.language.startsWith('en') && <p className="rounded-xl bg-paper px-4 py-2 text-sm text-mute">{t('legal.englishOnly')}</p>}
      {children}
    </article>
  )
}

const Seller = () => (
  <>
    <V v={LEGAL.seller} />, <V v={LEGAL.address} />
  </>
)

export function Terms() {
  return (
    <Doc title="Terms of Service">
      <p>
        These Terms govern your use of {LEGAL.product} (the “Service”), operated by <Seller /> (“we”, “us”). By creating an account or
        using the Service you agree to these Terms.
      </p>

      <h3>1. The Service</h3>
      <p>
        {LEGAL.product} is an online platform for learning English: lessons, reading and listening practice, a dictionary, flashcards,
        progress tracking and tools for teachers. AI-assisted features (tutor chat, writing and speaking feedback) are added over time.
        Most learning content is free. Some features and virtual items are paid.
      </p>

      <h3>2. Accounts</h3>
      <ul>
        <li>You must give accurate information and keep your login details secure. You are responsible for activity on your account.</li>
        <li>
          Users under {LEGAL.consentAge} may use the Service only with the consent and supervision of a parent or legal guardian, who
          accepts these Terms on the child’s behalf. Only adults may make purchases.
        </li>
        <li>Teachers may create lessons and flashcard sets and assign them to their students. They are responsible for that content.</li>
      </ul>

      <h3>3. Acceptable use</h3>
      <p>
        You must not misuse or try to break the Service or its security, access other users’ data, manipulate scores, coins or rewards
        (for example by automation or by exploiting bugs), upload unlawful, offensive or infringing content, or resell access to the
        Service. We may suspend or close accounts that break these rules.
      </p>

      <h3>4. Coins (in-app credits)</h3>
      <ul>
        <li>Coins are earned by learning (subject to daily limits) or bought in packs.</li>
        <li>Coins can be used only inside the Service, for example for AI features, avatars, frames and streak freezes.</li>
        <li>Coins have no cash value, cannot be exchanged for money and cannot be transferred between accounts unless the Service offers it.</li>
        <li>We may change how many coins features cost or how coins are earned. Coins you have bought are not removed because of such changes.</li>
      </ul>

      <h3>5. Subscriptions</h3>
      <ul>
        <li>Subscriptions renew automatically each month or year and are billed in advance until you cancel.</li>
        <li>You can cancel at any time; access continues until the end of the paid period.</li>
        <li>We will give at least 30 days’ notice of a price change; the new price applies from the next billing period.</li>
      </ul>

      <h3>6. Payments</h3>
      <p>
        Our order process is conducted by our online reseller {LEGAL.processor}. Paddle.com is the Merchant of Record for all our orders.
        Paddle provides all customer service inquiries and handles returns. Their{' '}
        <a className="text-plum underline" href={LEGAL.processorUrl} target="_blank" rel="noreferrer">
          buyer terms
        </a>{' '}
        also apply. Prices are shown in EUR; taxes are added at checkout where they apply.
      </p>

      <h3>7. Refunds</h3>
      <p>
        See our <a className="text-plum underline" href="/refund">Refund Policy</a>.
      </p>

      <h3>8. Content</h3>
      <p>
        The Service and its content belong to us or our licensors; you may use them for personal, non-commercial learning. Content you
        create stays yours; you allow us to store and display it to run the Service.
      </p>

      <h3>9. AI features</h3>
      <p>AI-generated feedback may contain mistakes and does not replace a qualified teacher. Do not submit sensitive personal information to AI features.</p>

      <h3>10. Availability and changes</h3>
      <p>
        We do not guarantee that the Service will be uninterrupted or error-free. We may change features. We will tell you about
        material changes to these Terms in advance.
      </p>

      <h3>11. Liability</h3>
      <p>
        Nothing in these Terms limits liability that cannot be limited by law, including your statutory consumer rights. Otherwise,
        to the extent permitted by law, our total liability is limited to the amount you paid in the 12 months before the claim.
      </p>

      <h3>12. Ending your account</h3>
      <p>You can delete your account at any time. We may suspend access for serious or repeated breaches of these Terms.</p>

      <h3>13. Law</h3>
      <p>
        These Terms are governed by the laws of <V v={LEGAL.country} />. Consumers keep the protection of the mandatory laws of their
        country of residence.
      </p>

      <h3>14. Contact</h3>
      <p>
        <Seller /> · <Mail />
      </p>
    </Doc>
  )
}

export function Refund() {
  return (
    <Doc title="Refund Policy">
      <p>
        Payments are processed by {LEGAL.processor}, our Merchant of Record. Refunds go back to the original payment method.
      </p>

      <h3>14-day money-back guarantee</h3>
      <p>
        If you are not satisfied, you can request a full refund within <b>14 days</b> of any purchase — a coin pack or a subscription
        payment — without giving a reason.
      </p>

      <h3>How to request a refund</h3>
      <ul>
        <li>
          Write to <Mail /> with the email of your account and the order number, or
        </li>
        <li>
          contact Paddle directly at{' '}
          <a className="text-plum underline" href="https://paddle.net" target="_blank" rel="noreferrer">
            paddle.net
          </a>{' '}
          using the details from your receipt.
        </li>
      </ul>

      <h3>What happens after a refund</h3>
      <ul>
        <li>Coins from a refunded pack are removed from your balance.</li>
        <li>A refunded subscription ends immediately, and its benefits stop.</li>
        <li>Coins earned for free (lessons, streaks) are never refundable or exchangeable for money.</li>
      </ul>

      <h3>Cancelling a subscription</h3>
      <p>
        You can cancel at any time from your account or from the link in your receipt. No further payments are taken, and you keep
        access until the end of the paid period.
      </p>

      <h3>Your rights</h3>
      <p>This policy does not limit your rights under consumer law.</p>
    </Doc>
  )
}

export function Privacy() {
  return (
    <Doc title="Privacy Policy">
      <p>
        Controller: <Seller /> · <Mail />. This policy explains what personal data we process, why, and your rights under the GDPR and
        similar laws.
      </p>

      <h3>1. Data we process</h3>
      <ul>
        <li>
          <b>Account:</b> email, password (stored hashed by our authentication provider), nickname, avatar, role. Purpose: running your
          account. Basis: contract.
        </li>
        <li>
          <b>Settings:</b> interface language, English level, preferences. Purpose: personalising the Service. Basis: contract.
        </li>
        <li>
          <b>Learning data:</b> lesson attempts, answers, scores, flashcards, saved words, streaks, coins. Purpose: lessons, grading,
          progress and rewards. Basis: contract.
        </li>
        <li>
          <b>Teacher–student links and assignments</b>, so teachers can assign work and see their students’ progress. Basis: contract.
        </li>
        <li>
          <b>Purchases:</b> product, amount, date, status — never card details. Basis: contract and legal obligation.
        </li>
        <li>
          <b>AI inputs:</b> messages, texts or recordings you submit to AI features, to generate feedback. Basis: contract.
        </li>
        <li>
          <b>Technical data:</b> IP address, browser information, logs, for security and fixing errors. Basis: legitimate interest.
        </li>
      </ul>
      <p>We do not sell personal data and do not use it for advertising.</p>

      <h3>2. Children</h3>
      <p>
        Children under {LEGAL.consentAge} use {LEGAL.product} only with a parent’s or guardian’s consent. We collect only what learning
        needs. Children cannot make purchases. A teacher sees only the progress of students linked to them. Parents can ask us to
        access or delete their child’s data at any time.
      </p>

      <h3>3. Service providers</h3>
      <ul>
        <li>Supabase — database and authentication; data is stored in the United States.</li>
        <li>Vercel — website hosting.</li>
        <li>{LEGAL.processor} — payments, as Merchant of Record, under its own privacy policy.</li>
        <li>Anthropic — AI features, when you use them.</li>
        <li>Google Cloud Text-to-Speech — pronunciation audio (only lesson and word text is sent).</li>
      </ul>
      <p>
        Transfers outside the EU/EEA, including to the United States, are protected by the EU Standard Contractual Clauses or the
        EU–US Data Privacy Framework.
      </p>

      <h3>4. Retention</h3>
      <ul>
        <li>Account and learning data: while your account exists; deleted within 30 days after you delete it.</li>
        <li>Purchase records: as long as tax law requires.</li>
        <li>Technical logs: up to 90 days.</li>
      </ul>

      <h3>5. Your rights</h3>
      <p>
        You can ask to access, correct, delete or export your data, to restrict or object to processing, and to withdraw consent.
        Write to <Mail />. You can also complain to your data protection authority.
      </p>

      <h3>6. Cookies and local storage</h3>
      <p>
        We use only what the Service needs to work — keeping you signed in and remembering your settings. No advertising or tracking
        cookies.
      </p>

      <h3>7. Changes</h3>
      <p>We will tell you in the Service about material changes to this policy.</p>
    </Doc>
  )
}
