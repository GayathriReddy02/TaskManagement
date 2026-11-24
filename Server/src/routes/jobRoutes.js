const router=require('express').Router();
const {protect}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const {getJob,publicJob,listJobs}=require('../services/jobService');
router.use(protect);
router.get('/',asyncHandler(async(req,res)=>res.json(await listJobs(req.user,req.query))));
router.get('/:id',asyncHandler(async(req,res)=>res.json({job:publicJob(await getJob(req.params.id,req.user),req.user)})));
module.exports=router;
