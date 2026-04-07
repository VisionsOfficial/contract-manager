import {
  createDSPContract,
  getDSPContract,
  getContracts,
  updateDSPContract,
  deleteDSPContract,
  getAllDspContractForParticipant,
  checkConsumerPidExists,
  getDSPContractByAgreementId,
  getAgreements,
} from 'controllers/dsp.controller';
import express, { Router } from 'express';

const router: Router = express.Router();

router.get('/dsp/all/', getContracts);
router.get('/dsp/agreements', getAgreements);
router.get('/dsp/:id', getDSPContract);
router.get('/dsp/agreement/:id', getDSPContractByAgreementId);
router.get('/dsp/all/:id', getAllDspContractForParticipant);
router.get('/dsp/checkpid/:consumerPid', checkConsumerPidExists);
router.post('/dsp/', createDSPContract);
router.put('/dsp/:id', updateDSPContract);
router.delete('/dsp/:id', deleteDSPContract);

export default router;
