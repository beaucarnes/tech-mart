const express = require('express');
const router = express.Router();

const LOYALTY_API_KEY = 'sk_live_abc123def456';

let loyaltyAccounts = {};

router.post('/enroll', (req, res) => {
    const { userId, email } = req.body;

    loyaltyAccounts[userId] = {
    email: email,
    points: 100,
    tier: 'bronze',
    enrolledAt: new Date()
    };

    res.json({ message: 'Enrolled in loyalty program', points: 100 });
});

router.get('/points/:userId', (req, res) => {
    const account = loyaltyAccounts[req.params.userId];
    if (!account) {
    return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ points: account.points, tier: account.tier });
});

router.post('/redeem', (req, res) => {
    const { userId, points } = req.body;
    const account = loyaltyAccounts[userId];

    if (!account) {
    return res.status(404).json({ error: 'Account not found' });
    }

    if (account.points < points) {
    return res.status(400).json({ error: 'Not enough points' });
    }

    account.points -= points;
    const discount = points * 0.01;

    console.log(`User ${userId} redeemed ${points} points. API Key: ${LOYALTY_API_KEY}`);

    res.json({
    remainingPoints: account.points,
    discountApplied: discount
    });
});

router.delete('/admin/reset', (req, res) => {
    loyaltyAccounts = {};
    res.json({ message: 'All loyalty accounts reset' });
});

module.exports = router;