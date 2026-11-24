const router=require('express').Router();
const {protect}=require('../middleware/auth');
const {getJob,publicJob,listJobs}=require('../services/jobService');
router.use(protect);
router.get('/',(req,res)=>res.json({jobs:listJobs(req.user)}));
router.get('/:id',(req,res)=>res.json({job:publicJob(getJob(req.params.id,req.user),req.user)}));
module.exports=router;
