const crypto = require('crypto');
const express = require('express');
const { roundPrice } = require('./utils');

const router = express.Router();

const VALID_TYPES = new Set(['percent', 'fixed']);
const CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;

/**
 * Create an in-memory discount store keyed by normalized uppercase code.
 * In production, replace this Map with a database-backed repository.
 */
const discountStore = new Map(
  [
    {
      code: 'SAVE10',
      type: 'percent',
      discount: 10,
      active: true,
      minOrderAmount: 0,
      maxDiscount: null,
      expiresAt: null,
      maxUses: null,
      uses: 0,
      description: '10% off your entire order',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
    },
    {
      code: 'FLAT20',
      type: 'fixed',
      discount: 20,
      active: true,
      minOrderAmount: 0,
      maxDiscount: null,
      expiresAt: null,
      maxUses: null,
      uses: 0,
      description: '$20 off your order',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
    },
    {
      code: 'WELCOME15',
      type: 'percent',
      discount: 15,
      active: true,
      minOrderAmount: 50,
      maxDiscount: 30,
      expiresAt: null,
      maxUses: null,
      uses: 0,
      description: '15% off orders $50+ (up to $30 discount)',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
    }
  ].map((entry) => [entry.code, entry])
);

/**
 * Parse a strict finite number from a number or non-empty numeric string.
 * Rejects booleans, null, empty strings, and arrays that Number() coerces to 0/1.
 */
function parseFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/**
 * Normalize a promo code string to trimmed uppercase, or return empty string if invalid.
 */
function normalizeCode(rawCode) {
  return typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
}

/**
 * Compare two secrets in constant time by hashing both values first so length mismatches
 * never short-circuit or throw.
 */
function timingSafeEqualString(provided, expected) {
  const providedHash = crypto.createHash('sha256').update(String(provided)).digest();
  const expectedHash = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

/**
 * Middleware enforcing admin authentication for management routes.
 * Reads ADMIN_PASSWORD lazily per request so importing the router never crashes startup.
 */
function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: 'Admin authentication is not configured' });
  }

  const authHeader = req.get('authorization');
  const bearerToken =
    authHeader && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
  const provided = req.get('x-admin-password') ?? bearerToken ?? req.body?.password;

  if (typeof provided !== 'string' || !provided || !timingSafeEqualString(provided, adminPassword)) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  return next();
}

/**
 * Check whether a discount code is expired or has exhausted its usage cap.
 */
function getAvailabilityError(discount, now = Date.now()) {
  if (!discount.active) {
    return 'Invalid or inactive discount code';
  }
  if (discount.expiresAt && now > Date.parse(discount.expiresAt)) {
    return 'Discount code has expired';
  }
  if (discount.maxUses !== null && discount.uses >= discount.maxUses) {
    return 'Discount code usage limit reached';
  }
  return null;
}

/**
 * Compute discount amount and updated cart total, or return a validation error message.
 */
function applyDiscountToTotal(discount, total) {
  const availabilityError = getAvailabilityError(discount);
  if (availabilityError) {
    return { error: availabilityError };
  }

  if (!VALID_TYPES.has(discount.type)) {
    return { error: 'Invalid discount type' };
  }
  if (!Number.isFinite(discount.discount) || discount.discount <= 0) {
    return { error: 'Invalid discount amount' };
  }
  if (discount.type === 'percent' && discount.discount > 100) {
    return { error: 'Invalid discount amount' };
  }
  if (total < discount.minOrderAmount) {
    return {
      error: `Minimum order amount of $${roundPrice(discount.minOrderAmount).toFixed(2)} required`
    };
  }

  let rawDiscount =
    discount.type === 'percent' ? (total * discount.discount) / 100 : discount.discount;

  if (discount.type === 'percent' && discount.maxDiscount !== null) {
    rawDiscount = Math.min(rawDiscount, discount.maxDiscount);
  }

  const discountAmount = roundPrice(Math.min(rawDiscount, total));
  const newTotal = Math.max(0, roundPrice(total - discountAmount));

  return { discountAmount, newTotal };
}

/**
 * Validate and normalize incoming discount creation/update payloads.
 */
function parseDiscountPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!CODE_PATTERN.test(code)) {
      errors.push('Code must be 2-32 characters (A-Z, 0-9, _, -)');
    } else {
      data.code = code;
    }
  }

  if (!partial || body.type !== undefined) {
    if (!VALID_TYPES.has(body.type)) {
      errors.push('Type must be "percent" or "fixed"');
    } else {
      data.type = body.type;
    }
  }

  if (!partial || body.discount !== undefined) {
    const amount = parseFiniteNumber(body.discount);
    const effectiveType = data.type ?? body.existingType;
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push('Discount must be a positive number');
    } else if (effectiveType === 'percent' && amount > 100) {
      errors.push('Percent discount cannot exceed 100');
    } else {
      data.discount = roundPrice(amount);
    }
  } else if (partial && data.type === 'percent' && body.existingDiscount > 100) {
    errors.push('Percent discount cannot exceed 100');
  }

  if (body.minOrderAmount !== undefined) {
    const minOrderAmount = parseFiniteNumber(body.minOrderAmount);
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
      errors.push('minOrderAmount must be a non-negative number');
    } else {
      data.minOrderAmount = roundPrice(minOrderAmount);
    }
  } else if (!partial) {
    data.minOrderAmount = 0;
  }

  if (body.maxDiscount !== undefined) {
    if (body.maxDiscount === null) {
      data.maxDiscount = null;
    } else {
      const maxDiscount = parseFiniteNumber(body.maxDiscount);
      if (!Number.isFinite(maxDiscount) || maxDiscount <= 0) {
        errors.push('maxDiscount must be a positive number or null');
      } else {
        data.maxDiscount = roundPrice(maxDiscount);
      }
    }
  } else if (!partial) {
    data.maxDiscount = null;
  }

  if (body.maxUses !== undefined) {
    if (body.maxUses === null) {
      data.maxUses = null;
    } else {
      const maxUses = parseFiniteNumber(body.maxUses);
      if (!Number.isInteger(maxUses) || maxUses <= 0) {
        errors.push('maxUses must be a positive integer or null');
      } else {
        data.maxUses = maxUses;
      }
    }
  } else if (!partial) {
    data.maxUses = null;
  }

  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === '') {
      data.expiresAt = null;
    } else {
      const parsedDate = Date.parse(body.expiresAt);
      if (Number.isNaN(parsedDate)) {
        errors.push('expiresAt must be a valid ISO date string or null');
      } else {
        data.expiresAt = new Date(parsedDate).toISOString();
      }
    }
  } else if (!partial) {
    data.expiresAt = null;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      errors.push('active must be a boolean');
    } else {
      data.active = body.active;
    }
  } else if (!partial) {
    data.active = true;
  }

  if (body.description !== undefined) {
    data.description = typeof body.description === 'string' ? body.description.trim() : '';
  } else if (!partial) {
    data.description = '';
  }

  return errors.length > 0 ? { error: errors.join('; ') } : { value: data };
}

/**
 * Strip internal fields before exposing discount records on public endpoints.
 */
function toPublicSummary(discount) {
  return {
    code: discount.code,
    type: discount.type,
    discount: discount.discount,
    minOrderAmount: discount.minOrderAmount,
    maxDiscount: discount.maxDiscount,
    expiresAt: discount.expiresAt,
    description: discount.description
  };
}

/**
 * Shared handler for deleting a discount code via route param or request body.
 */
function handleDeleteDiscount(req, res) {
  const code = normalizeCode(req.params.code ?? req.body?.code);
  if (!code) {
    return res.status(400).json({ error: 'Discount code is required' });
  }

  if (!discountStore.has(code)) {
    return res.status(404).json({ error: `Discount code not found: ${code}` });
  }

  discountStore.delete(code);
  return res.json({ message: `Deleted discount code: ${code}` });
}

// POST /api/discounts/apply — Validate and apply a promo code to a cart total
router.post('/apply', (req, res) => {
  const { code: rawCode, cartTotal, redeem = false } = req.body ?? {};
  const code = normalizeCode(rawCode);
  const total = parseFiniteNumber(cartTotal);

  if (!code) {
    return res.status(400).json({ error: 'Discount code is required' });
  }
  if (!Number.isFinite(total) || total < 0) {
    return res.status(400).json({ error: 'Invalid cart total' });
  }

  const discount = discountStore.get(code);
  if (!discount) {
    return res.status(400).json({ error: 'Invalid or expired discount code' });
  }

  const result = applyDiscountToTotal(discount, roundPrice(total));
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  if (redeem === true) {
    discount.uses += 1;
  }

  return res.json({
    code: discount.code,
    description: discount.description,
    originalTotal: roundPrice(total),
    discount: discount.discount,
    discountType: discount.type,
    discountAmount: result.discountAmount,
    newTotal: result.newTotal
  });
});

// GET /api/discounts/search?q=... — Search active, non-expired public discount codes
router.get('/search', (req, res) => {
  const query = normalizeCode(req.query.q ?? '');
  const now = Date.now();

  const results = Array.from(discountStore.values())
    .filter((discount) => !getAvailabilityError(discount, now))
    .filter(
      (discount) =>
        !query ||
        discount.code.includes(query) ||
        discount.description.toUpperCase().includes(query)
    )
    .map(toPublicSummary);

  return res.json({ results, total: results.length });
});

// Admin: Create new discount code
router.post('/admin/create', requireAdmin, (req, res) => {
  const parsed = parseDiscountPayload(req.body ?? {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  if (discountStore.has(parsed.value.code)) {
    return res.status(409).json({ error: `Discount code already exists: ${parsed.value.code}` });
  }

  const newDiscount = {
    ...parsed.value,
    uses: 0,
    createdAt: new Date().toISOString()
  };
  discountStore.set(newDiscount.code, newDiscount);

  return res.status(201).json({
    message: `Discount code created: ${newDiscount.code}`,
    discount: newDiscount
  });
});

// Admin: List all discount codes
router.get('/admin/list', requireAdmin, (req, res) => {
  return res.json(Array.from(discountStore.values()));
});

// Admin: Update an existing discount code
router.patch('/admin/:code', requireAdmin, (req, res) => {
  const code = normalizeCode(req.params.code);
  const existing = discountStore.get(code);
  if (!existing) {
    return res.status(404).json({ error: `Discount code not found: ${code}` });
  }

  const body = {
    ...(req.body ?? {}),
    existingType: req.body?.type ?? existing.type,
    existingDiscount: existing.discount
  };
  delete body.code;

  const parsed = parseDiscountPayload(body, { partial: true });
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const updated = { ...existing, ...parsed.value, updatedAt: new Date().toISOString() };
  discountStore.set(code, updated);

  return res.json({ message: `Updated discount code: ${code}`, discount: updated });
});

// Admin: Delete a discount code (supports both body and URL param)
router.delete('/admin/delete', requireAdmin, handleDeleteDiscount);
router.delete('/admin/:code', requireAdmin, handleDeleteDiscount);

module.exports = router;
