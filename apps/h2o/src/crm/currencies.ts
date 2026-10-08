/**
 * ISO 4217 currencies a deal value can be recorded in, with each currency's minor-unit digits. A deal value is checked
 * against this list (three arbitrary letters are not a currency) and its precision is the currency's own: whole yen,
 * cents for dollars, three decimals for dinars. Funds and precious-metal codes are left out on purpose.
 */
const BY_DIGITS: Record<number, string> = {
  0: 'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF',
  2: 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CNY COP CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD UZS VES WST XCD YER ZAR ZMW ZWG',
  3: 'BHD IQD JOD KWD LYD OMR TND',
}

export const CURRENCY_DIGITS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(Object.entries(BY_DIGITS).flatMap(([digits, codes]) => codes.split(' ').map((c) => [c, Number(digits)]))),
)

export const CURRENCY_CODES: readonly string[] = Object.freeze(Object.keys(CURRENCY_DIGITS).sort())

export const isCurrency = (code: unknown): code is string => typeof code === 'string' && Object.hasOwn(CURRENCY_DIGITS, code)
