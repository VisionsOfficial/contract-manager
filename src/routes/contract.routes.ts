import express, { Router } from 'express';
import {
  createContract,
  getContract,
  getODRLContract,
  updateContract,
  signContract,
  checkDataExploitation,
  getContracts,
  getContractsFor,
  revokeContractSignature,
  injectPolicy,
  injectPolicies,
} from '../controllers/contract.controller';

// Ecosystem Contract Routes
const router: Router = express.Router();
router.get('/contracts/all/', getContracts);
router.get('/contracts/for/:did', getContractsFor);
router.post('/contracts/', createContract);
router.get('/contracts/:id', getContract);
router.get('/contracts/odrl/:id', getODRLContract);
router.put('/contracts/:id', updateContract);
router.put('/contracts/sign/:id', signContract);
router.delete('/contracts/sign/revoke/:id/:did', revokeContractSignature);
router.post('/contracts/check-exploitability/:id', checkDataExploitation);
router.post('/contracts/policy/:id', injectPolicy);
router.post('/contracts/policies/:id', injectPolicies);

export default router;
