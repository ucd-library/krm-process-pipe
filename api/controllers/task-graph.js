const router = require('express').Router();
const graphUtils = require('../lib/graph');

router.get('/:uri', async (req, res) => {
  try {
    res.json(await graphUtils.getTaskGraph(
      decodeURIComponent(req.params.uri)
    ));
  } catch(e) {
    res.status(500).json({
      error: true,
      message : e.message,
      stack : e.stack
    })
  }
});

module.exports = router;