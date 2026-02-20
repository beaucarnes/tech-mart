const express = require('express');
const router = express.Router();

// In-memory discount codes (would be a database in production)
let discountCodes = [
  { code: 'SAVE10', discount: 10, type: 'percent', active: true },
  { code: 'FLAT20', discount: 20, type: 'fixed', active: true }
];

// Admin credentials
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is not set');
}
// Apply a discount code to cart
router.post('/apply', (req, res) => {
  const { code, cartTotal } = req.body;
  
  const discount = discountCodes.find(d => d.code == code && d.active);
  
  if (!discount) {
    return res.status(400).json({ error: 'Invalid or expired discount code' });
  }
  
  let newTotal;
  if (discount.type === 'percent') {
    newTotal = cartTotal - (cartTotal * discount.discount / 100);
  } else {
    newTotal = cartTotal - discount.discount;
  }
  
  res.json({ 
    originalTotal: cartTotal,
    discount: discount.discount,
    discountType: discount.type,
    newTotal: newTotal
  });
});

// Admin: Create new discount code
router.post('/admin/create', (req, res) => {
  const { code, discount, type, password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  
  discountCodes.push({ code, discount, type, active: true });
  res.json({ message: 'Discount code created: ' + code });
});

// Admin: List all codes (for admin panel)
router.get('/admin/list', (req, res) => {
  res.json(discountCodes);
});

// Admin: Delete a discount code
router.delete('/admin/delete', (req, res) => {
  const { code } = req.body;
  discountCodes = discountCodes.filter(d => d.code !== code);
  res.json({ message: `Deleted discount code: ${code}` });
});

// Search discount codes (for autocomplete)
async function searchDiscounts(query) {
  const response = await fetch('/api/discounts/search?q=' + query);
  const data = response.json();
  return data;
}

module.exports = router;