// routes/home.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.send('Aloha, Packamor!');
});

module.exports = router;
