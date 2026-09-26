import i18n from './index'

/** A user-facing, translated message for an error from Supabase or the network. */
export function errorMessage(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string; status?: number }
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  const key =
    code === 'invalid_credentials' || msg.includes('invalid login credentials')
      ? 'errors.invalidCredentials'
      : code === 'user_already_exists' || msg.includes('already registered')
        ? 'errors.userExists'
        : code === 'weak_password' || msg.includes('password should')
          ? 'errors.weakPassword'
          : code === 'email_not_confirmed' || msg.includes('not confirmed')
            ? 'errors.emailNotConfirmed'
            : code === 'validation_failed' || msg.includes('invalid email') || msg.includes('unable to validate email')
              ? 'errors.invalidEmail'
              : code.startsWith('over_') || err.status === 429
                ? 'errors.tooManyRequests'
                : code === '42501' || msg.includes('row-level security')
                  ? 'errors.notAllowed'
                  : msg.includes('failed to fetch') || msg.includes('network')
                    ? 'errors.network'
                    : 'errors.generic'
  return i18n.t(key as never) as string
}
