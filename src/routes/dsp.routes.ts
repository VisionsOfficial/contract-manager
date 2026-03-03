import {
  createDSPContract,
  getDSPContract,
  getContracts,
  updateDSPContract,
  deleteDSPContract,
  getAllDspContractForParticipant,
} from 'controllers/dsp.controller';
import express, { Router } from 'express';

const router: Router = express.Router();

router.get('/dsp/:id', getDSPContract);
router.get('/dsp/all/', getContracts);
router.get('/dsp/all/:id', getAllDspContractForParticipant);
router.post('/dsp/', createDSPContract);
router.put('/dsp/:id', updateDSPContract);
router.delete('/dsp/:id', deleteDSPContract);

export default router;
