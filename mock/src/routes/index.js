const express = require('express');
const router = express.Router();

// Mount all mock route modules
router.use(require('./models'));
router.use(require('./debates'));
router.use(require('./turns'));
router.use(require('./verdicts'));

module.exports = router;
