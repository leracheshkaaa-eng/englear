/* ============================================================
   Seller details shown on the legal pages, the pricing page and the footer.
   One place to edit: Paddle checks that these match the seller account.
   Values in [brackets] are placeholders and are highlighted on the pages.
   ============================================================ */
export const LEGAL = {
  product: 'Englear',
  seller: '[Seller full legal name]',
  country: '[Country]',
  address: '[City, Country]',
  email: '[support email]',
  updated: '[date]',
  /** Age from which a person may use the Service without a parent's consent. */
  consentAge: 16,
  /** Merchant of Record that processes payments. */
  processor: 'Paddle.com',
  processorUrl: 'https://www.paddle.com/legal/checkout-buyer-terms',
}

export const isPlaceholder = (v: string) => v.startsWith('[')
