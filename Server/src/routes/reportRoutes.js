const router=require('express').Router();
const {protect}=require('../middleware/auth');
const {requestExport,download}=require('../controllers/reportController');
router.use(protect);
router.post('/json',requestExport('json'));
router.post('/csv',requestExport('csv'));
router.post('/summary',requestExport('summary'));
router.get('/download/:id',download);
module.exports=router;
