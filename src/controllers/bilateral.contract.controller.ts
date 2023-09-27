import { Request, Response } from 'express';
import Contract from 'models/contract.model';
import { IContract, IContractDB } from 'interfaces/contract.interface';
import contractService from 'services/contract.service';
import pdp, { AuthorizationPolicy } from 'services/pdp.service';
import { logger } from 'utils/logger';
import { ContractSignature } from 'interfaces/schemas.interface';
// Create
export const createContract = async (req: Request, res: Response) => {
  try {
    const contract: IContract = await contractService.genContract(req.body);
    logger.info(contract);
    return res.status(201).json(contract);
  } catch (error) {
    res.status(500).json({
      message: `An error occurred while creating the contract.`,
      error,
    });
  }
};
// Read
export const getContract = async (req: Request, res: Response) => {
  try {
    const contractId: string = req.params.id;
    const contract: IContractDB | null = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found.' });
    }
    return res.json(contract);
  } catch (error) {
    res
      .status(500)
      .json({ error: 'An error occurred while retrieving the contract.' });
  }
};
// Update
export const updateContract = async (req: Request, res: Response) => {
  try {
    const contractId: string = req.params.id;
    const updates: Partial<IContractDB> = req.body;
    const updatedContract: IContractDB | null =
      await Contract.findByIdAndUpdate(contractId, updates, { new: true });
    if (!updatedContract) {
      return res.status(404).json({ error: 'Contract not found.' });
    }
    return res.json(updatedContract);
  } catch (error) {
    res
      .status(500)
      .json({ error: 'An error occurred while updating the contract.' });
  }
};
// Delete
export const deleteContract = async (req: Request, res: Response) => {
  try {
    const contractId: string = req.params.id;
    const deletedContract: IContractDB | null =
      await Contract.findByIdAndDelete(contractId);
    if (!deletedContract) {
      return res.status(404).json({ error: 'Contract not found.' });
    }
    return res.json({ message: 'Contract deleted successfully.' });
  } catch (error) {
    res
      .status(500)
      .json({ error: 'An error occurred while deleting the contract.' });
  }
};

// Todo: move business logic to the appropriate service layer.
// Sign for a given party and signature
export const signContract = async (req: Request, res: Response) => {
  try {
    const contractId: string = req.params.id;
    // Get the signature value and party name from the request body
    const { party, value }: ContractSignature = req.body;
    // Find the contract by its ID and according to the party
    const updatedContract = await Contract.findOneAndUpdate(
      // Condition to find the existing element
      { _id: contractId, 'signatures.party': party },
      {
        // Replace the signature value and mark it as signed
        $set: {
          'signatures.$.value': value,
          'signatures.$.signed': true,
        },
      },
      { new: true },
    );

    if (!updatedContract) {
      // If the party doesn't exist, push it
      const updatedContract: IContract | null =
        await Contract.findByIdAndUpdate(
          contractId,
          {
            $push: {
              signatures: {
                party,
                value,
                signed: true,
              },
            },
          },
          { new: true },
        ).lean();
      if (!updatedContract) {
        logger.error('The contract does not exist.');
        return res.status(404).json({ error: 'The contract does not exist.' });
      }
      logger.info('Updated contract with pushed signature:', updatedContract);
      return res.json(updatedContract);
    }
    logger.info('Updated contract with updated signature:', updatedContract);
    return res.json(updatedContract);
  } catch (error) {
    logger.error('Error signing the contract:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while signing the contract.' });
  }
};
// Check if data is authorized for exploitation based on the contract ?
export const checkDataExploitation = async (req: Request, res: Response) => {
  const contractId = req.params.id;
  // The data to be checked
  const data = req.body;
  try {
    //Retrieve contract data by ID
    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }
    // Retrieve permissions from the contract
    const permissions = contract.permission;
    // Create an authorization policy based on contract permissions
    const policies: AuthorizationPolicy[] =
      contractService.genPolicies(permissions);
    // Use the PDP to evaluate the authorization policy
    pdp.defineReferencePolicies(policies);
    const isAuthorized = pdp.evalPolicy(data.policies);
    if (isAuthorized) {
      return res.status(200).json({ authorized: true });
    } else {
      return res.status(403).json({ authorized: false });
    }
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};