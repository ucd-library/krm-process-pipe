const router = require('express').Router();

router.use('/_/task-graph', require('./task-graph'));

module.exports = router;