import AppError from '../../errorHelpers/AppError';

type StoredDiscount = { percentOff: number | null; amountOff: number | null };
type DiscountPatch = { percentOff?: number | null; amountOff?: number | null; currency?: string };

/** Translate editor amounts in major units while keeping discount columns exclusive. */
export function couponDiscountPatch(payload: Record<string, unknown>, current?: StoredDiscount): DiscountPatch {
  const patch: DiscountPatch = {};
  if (payload.currency !== undefined || !current) {
    const currency = payload.currency === undefined ? 'usd' : payload.currency;
    if (typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency.trim())) {
      throw new AppError(400, 'Currency must be a three-letter code.');
    }
    patch.currency = currency.trim().toLowerCase();
  }

  if (current && payload.discountType === undefined && payload.percentOff === undefined && payload.amountOff === undefined) {
    return patch;
  }
  const discountType = payload.discountType === undefined
    ? (current?.percentOff === null ? 'FIXED' : 'PERCENT')
    : payload.discountType;
  if (discountType !== 'PERCENT' && discountType !== 'FIXED') {
    throw new AppError(400, 'Discount type must be PERCENT or FIXED.');
  }

  if (discountType === 'PERCENT') {
    const percentOff = payload.percentOff === undefined ? current?.percentOff : payload.percentOff;
    if (typeof percentOff !== 'number' || !Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) {
      throw new AppError(400, 'Percent discount must be a whole number between 1 and 100.');
    }
    patch.percentOff = percentOff;
    patch.amountOff = null;
  } else {
    const amountOff = payload.amountOff === undefined
      ? (current?.amountOff == null ? undefined : current.amountOff / 100)
      : payload.amountOff;
    const minorUnits = typeof amountOff === 'number' ? Math.round(amountOff * 100) : NaN;
    if (typeof amountOff !== 'number' || !Number.isFinite(amountOff) || minorUnits < 1 || minorUnits > 2_147_483_647) {
      throw new AppError(400, 'Fixed discount must be a positive amount within the supported range.');
    }
    patch.amountOff = minorUnits;
    patch.percentOff = null;
  }
  return patch;
}
