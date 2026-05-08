/**
 * Utility functions for TechMart
 */

/**
 * Round price to 2 decimal places to avoid floating point issues
 * e.g., 79.99 * 3 = 239.96999... → 239.97
 */
function roundPrice(price) {
  return Math.round(price * 100) / 100;
}

/**
 * Calculate cart total with proper rounding
 */
function calculateCartTotal(items) {
  return roundPrice(
    items.reduce((sum, item) => sum + roundPrice(item.price * item.quantity), 0)
  );
}

/**
 * Format price for display
 */
function formatPrice(price) {
  return `$${roundPrice(price).toFixed(2)}`;
}

module.exports = { roundPrice, calculateCartTotal, formatPrice };
