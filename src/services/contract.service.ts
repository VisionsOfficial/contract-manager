import mongoose, { Types } from 'mongoose';

import { IContract, IContractDB } from 'interfaces/contract.interface';
import ContractModel from '../models/contract.model';
import { logger } from 'utils/logger';
import {
  ContractDataProcessing,
  ContractDataProcessingDocument,
  ContractDocument,
  ContractMember,
  ContractServiceOffering,
  ContractServiceOfferingDocument,
  ContractServiceOfferingPolicyDocument,
} from 'interfaces/schemas.interface';
import { IPolicyInjection } from 'interfaces/policy.interface';
import { genPolicyFromRule } from './policy/utils';
import pdp from 'services/policy/pdp.service';

// Ecosystem Contract Service
let Contract: mongoose.Model<IContractDB>;
export class ContractService {
  private static instance: ContractService;

  private constructor() {}

  public static async getInstance(): Promise<ContractService> {
    if (!ContractService.instance) {
      Contract = await ContractModel.getModel();
      ContractService.instance = new ContractService();
    }
    return ContractService.instance;
  }

  // Generate a contract based on the contract data
  public async genContract(
    contractData: IContract,
    role?: string,
  ): Promise<IContract> {
    try {
      const { permission, prohibition, ...rest } = contractData;
      const rolesAndObligations = role
        ? [
            {
              role,
              policies: [
                {
                  permission: permission || [],
                  prohibition: prohibition || [],
                },
              ],
            },
          ]
        : [];
      const newContract = new Contract({
        ...rest,
        rolesAndObligations,
      });
      return newContract.save() as Promise<IContract>;
    } catch (error: any) {
      logger.error('[Contract/Service, genContract]:', error);
      throw error;
    }
  }

  // get contract
  public async getContract(contractId: string): Promise<IContractDB | null> {
    try {
      const contract = await Contract.findById(contractId)
        .select('-jsonLD')
        .lean();
      return contract;
    } catch (error) {
      logger.error('[Contract/Service, getContract]:', error);
      throw error;
    }
  }

  // get policies for a given participant and service offering
  public async getPolicyForServiceOffering(
    contractId: string,
    participantId: string,
    serviceOfferingId: string,
  ): Promise<any | null> {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) {
        return null;
      }
      const serviceOffering = contract.serviceOfferings.find((offering) => {
        return (
          offering.participant === participantId &&
          offering.serviceOffering === serviceOfferingId
        );
      });
      if (!serviceOffering) {
        return null;
      }
      const policies = serviceOffering.policies;
      return policies;
    } catch (error) {
      throw error;
    }
  }

  // update contract
  public async updateContract(
    contractId: string,
    updates: Partial<IContractDB>,
  ): Promise<IContractDB | null> {
    try {
      const updatedContract = await Contract.findByIdAndUpdate(
        contractId,
        updates,
        {
          new: true,
          select: '-jsonLD',
        },
      ).lean();
      return updatedContract;
    } catch (error) {
      logger.error('[Contract/Service, updateContract]:', error);
      throw error;
    }
  }
  // delete contract
  public async deleteContract(contractId: string): Promise<void> {
    try {
      const deletedContract =
        await Contract.findByIdAndDelete(contractId).select('-jsonLD');
      if (!deletedContract) {
        throw new Error('Contract not found.');
      }
    } catch (error) {
      logger.error('[Contract/Service, deleteContract]:', error);
      throw error;
    }
  }
  // Sign contract
  public async signContract(
    contractId: string,
    inputSignature: ContractMember,
  ): Promise<IContract> {
    try {
      // Find the contract by its ID
      const contract = await Contract.findById(contractId, {
        // Exclude unnecessary metadata
        _id: 0,
        __v: 0,
        jsonLD: 0,
      }).lean();
      if (!contract) {
        throw new Error('Contract does not exist.');
      }
      // Check if the current participant exists
      const currentMember = contract.members.find(
        (member) => member.participant === inputSignature.participant,
      );
      if (currentMember) {
        // Update the signature of an existing member
        currentMember.signature = inputSignature.signature;
      } else {
        // Add a new signature if it doesn't exist
        contract.members.push(inputSignature);
      }
      const orchestratorHasSigned = contract.members.find(
        (member) => member.role === 'orchestrator',
      );
      // Check if both parties have signed, including the orchestrator
      const totalMembers = contract.members.length;
      if (totalMembers >= 2 && orchestratorHasSigned) {
        // Set the contract status to 'signed' if there are
        // at least two parties and the orchestrator has signed
        contract.status = 'signed';
      }
      // Update the contract in the database
      const updatedContract = await Contract.findByIdAndUpdate(
        contractId,
        contract,
        { new: true, _id: 0, __v: 0, jsonLD: 0 },
      );
      if (!updatedContract) {
        throw new Error('Error occurred while updating contract signature.');
      }
      return updatedContract.toObject();
    } catch (error) {
      logger.error('[Contract/Service, signContract]:', error);
      throw error;
    }
  }

  // Revoke a signature
  public async revokeSignatureService(
    contractId: string,
    did: string,
  ): Promise<IContract> {
    try {
      // Find the contract by ID
      const contract = await Contract.findById(contractId).select('-jsonLD');
      // Check if the contract exists
      if (!contract) {
        throw new Error('Contract not found');
      }
      // Find the signature in the signatures array
      const index = contract.members.findIndex(
        (member) => member.participant === did,
      );
      // Check if the signature was found
      if (index === -1) {
        throw new Error('Member signature not found');
      }
      // Retrieve the signature from the signatures array
      const revoked = contract.members[index];
      // Move the signature from the signatures array to the revokedMembers array
      contract.members.splice(index, 1);
      contract.revokedMembers.push(revoked);
      // Set the contract status to 'revoked'
      contract.status = 'revoked';
      // Save the changes to the database
      await contract.save();
      // Return the updated contract
      return contract;
    } catch (error) {
      logger.error('[Contract/Service, revokeSignatureService]:', error);
      throw error;
    }
  }

  public async checkExploitationByRole(
    contractId: string,
    data: any,
    sessionId: string,
    role: string,
  ): Promise<boolean> {
    try {
      const contract = await Contract.findById(contractId).lean();
      if (!contract || !contract.rolesAndObligations) {
        return false;
      }
      const rao = contract.rolesAndObligations.find(
        (entry) => entry.role === role,
      );
      if (!rao?.policies) {
        return false;
      }
      const permission = rao.policies
        .flatMap((policy) => policy.permission || [])
        .concat(data.policy?.permission || []);
      const prohibition = rao.policies
        .flatMap((policy) => policy.prohibition || [])
        .concat(data.policy?.prohibition || []);
      return await pdp.isAuthorised(
        { permission, prohibition },
        sessionId,
        data.policy,
      );
    } catch (error) {
      logger.error('[Contract/Service, checkExploitationByRole]:', error);
      throw error;
    }
  }

  // Get ecosystem contracts for a specific DID with optional filter
  public async getContractsFor(
    _did: string,
    hasSigned?: boolean,
  ): Promise<IContractDB[]> {
    try {
      let did;
      try {
        const buff = Buffer.from(_did, 'base64');
        did = buff.toString();
      } catch (error: any) {
        throw new Error(error.message);
      }
      const filter: Record<string, any> = {};
      if (hasSigned) {
        // Participant must appear in signatures
        filter.members = { $elemMatch: { participant: did } };
      } else if (hasSigned === false) {
        // Participant must not appear in signatures
        filter.members = { $not: { $elemMatch: { participant: did } } };
      }
      const contracts = await Contract.find(filter).select('-jsonLD');
      return contracts;
    } catch (error: any) {
      logger.error('[Contract/Service, getContractsFor]:', error);
      throw new Error(
        `Error while retrieving ecosystem contracts: ${error.message}`,
      );
    }
  }
  // Get all contracts
  public async getContracts(status?: string): Promise<IContractDB[]> {
    try {
      let filter: any = {};
      if (status) {
        if (!status.startsWith('not')) {
          filter.status = status;
        } else {
          filter = {
            status: {
              $ne: status.substring(3).toLowerCase(),
            },
          };
        }
      }
      const contracts = await Contract.find(filter).select('-jsonLD');
      return contracts;
    } catch (error: any) {
      logger.error('[Contract/Service, getContracts]:', error);
      throw new Error(`Error while retrieving contracts: ${error.message}`);
    }
  }

  // public async addPoliciesForRoles(
  //   contractId: string,
  //   data: { roles: string[]; policies: IPolicyInjection[] }[],
  // ): Promise<IContractDB | null> {
  //   try {
  //     const contract = await Contract.findById(contractId);
  //     if (!contract) {
  //       throw new Error('Contract not found');
  //     }
  //     for (const entry of data) {
  //       try {
  //         const roles = entry.roles;
  //         const policies = entry.policies;
  //         if (!roles || !Array.isArray(roles) || roles.length === 0) {
  //           throw new Error('Roles are not defined or empty');
  //         }
  //         for (const role of roles) {
  //           let roleIndex = contract.rolesAndObligations.findIndex(
  //             (roleEntry) => roleEntry.role === role,
  //           );
  //           if (roleIndex === -1) {
  //             contract.rolesAndObligations.push({
  //               role,
  //               policies: [],
  //             });
  //             roleIndex = contract.rolesAndObligations.length - 1;
  //           }
  //           const roleEntry = contract.rolesAndObligations[roleIndex];
  //           for (const injection of policies) {
  //             try {
  //               const policy = await genPolicyFromRule(injection);
  //               roleEntry.policies.push({
  //                 description: policy.description,
  //                 permission: policy.permission || [],
  //                 prohibition: policy.prohibition || [],
  //               });
  //             } catch (error) {
  //               logger.error('[Contract/Service, addPoliciesForRoles]:', error);
  //               throw error;
  //             }
  //           }
  //         }
  //       } catch (error) {
  //         logger.error('[Contract/Service, addPoliciesForRoles]:', error);
  //         throw error;
  //       }
  //     }
  //     const updatedContract = await contract.save();
  //     return updatedContract;
  //   } catch (error: any) {
  //     logger.error('[Contract/Service, addPoliciesForRoles]:', error);
  //     throw error;
  //   }
  // }
  //
  public async addPoliciesForRoles(
    contractId: string,
    data: { roles: string[]; policies: IPolicyInjection[] }[],
  ): Promise<IContractDB | null> {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      for (const entry of data) {
        await ContractService.processEntry(contract, entry);
      }

      const updatedContract = await contract.save();
      return updatedContract;
    } catch (error: any) {
      logger.error('[Contract/Service, addPoliciesForRoles]:', error);
      throw error;
    }
  }

  private static async processEntry(
    contract: IContractDB,
    entry: { roles: string[]; policies: IPolicyInjection[] },
  ) {
    const { roles, policies } = entry;
    ContractService.validateRoles(roles);

    for (const role of roles) {
      await ContractService.processRole(contract, role, policies);
    }
  }

  private static validateRoles(roles: string[]) {
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      throw new Error('Roles are not defined or empty');
    }
  }

  private static async processRole(
    contract: IContractDB,
    role: string,
    policies: IPolicyInjection[],
  ) {
    let roleIndex = contract.rolesAndObligations.findIndex(
      (roleEntry) => roleEntry.role === role,
    );

    if (roleIndex === -1) {
      contract.rolesAndObligations.push({ role, policies: [] });
      roleIndex = contract.rolesAndObligations.length - 1;
    }

    const roleEntry = contract.rolesAndObligations[roleIndex];

    for (const injection of policies) {
      try {
        const policy = await genPolicyFromRule(injection);
        roleEntry.policies.push({
          description: policy.description,
          permission: policy.permission || [],
          prohibition: policy.prohibition || [],
        });
      } catch (error) {
        logger.error('[Contract/Service, addPoliciesForRoles]:', error);
        throw error;
      }
    }
  }
  //

  public async addPoliciesForRole(
    contractId: string,
    data: { role: string; policies: IPolicyInjection[] },
  ): Promise<IContractDB | null> {
    try {
      const role = data.role;
      if (!role) {
        throw new Error('Role is not defined');
      }
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }
      for (const injection of data.policies) {
        try {
          let roleIndex = contract.rolesAndObligations.findIndex(
            (roleEntry) => roleEntry.role === role,
          );
          if (roleIndex === -1) {
            contract.rolesAndObligations.push({
              role,
              policies: [],
            });
            roleIndex = contract.rolesAndObligations.length - 1;
          }
          const roleEntry = contract.rolesAndObligations[roleIndex];
          const policy = await genPolicyFromRule(injection);
          roleEntry.policies.push({
            description: policy.description,
            permission: policy.permission || [],
            prohibition: policy.prohibition || [],
          });
        } catch (error) {
          logger.error('[Contract/Service, addPoliciesForRole]:', error);
          throw error;
        }
      }
      const updatedContract = await contract.save();
      return updatedContract;
    } catch (error: any) {
      logger.error('[Contract/Service, addPoliciesForRole]:', error);
      throw error;
    }
  }
  //
  public async addPolicies(
    contractId: string,
    injections: IPolicyInjection[],
  ): Promise<IContractDB | null> {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }
      for (const injection of injections) {
        try {
          const role = injection.role;
          let roleIndex = contract.rolesAndObligations.findIndex(
            (entry) => entry.role === role,
          );
          if (roleIndex === -1) {
            contract.rolesAndObligations.push({
              role,
              policies: [],
            });
            roleIndex = contract.rolesAndObligations.length - 1;
          }
          const roleEntry = contract.rolesAndObligations[roleIndex];
          const policy = await genPolicyFromRule(injection);
          roleEntry.policies.push({
            description: policy.description,
            permission: policy.permission || [],
            prohibition: policy.prohibition || [],
          });
        } catch (error) {
          logger.error('[Contract/Service, addPolicies]:', error);
          throw error;
        }
      }
      const updatedContract = await contract.save();
      return updatedContract;
    } catch (error: any) {
      logger.error('[Contract/Service, addPolicies]:', error);
      throw error;
    }
  }
  //
  public async addPolicy(
    contractId: string,
    injection: IPolicyInjection,
  ): Promise<IContractDB | null> {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }
      const role = injection.role;
      let roleIndex = contract.rolesAndObligations.findIndex(
        (entry) => entry.role === role,
      );
      if (roleIndex === -1) {
        contract.rolesAndObligations.push({
          role,
          policies: [],
        });
        roleIndex = contract.rolesAndObligations.length - 1;
      }
      const roleEntry = contract.rolesAndObligations[roleIndex];
      const policy = await genPolicyFromRule(injection);
      roleEntry.policies.push({
        description: policy.description,
        permission: policy.permission || [],
        prohibition: policy.prohibition || [],
      });
      const updatedContract = await contract.save();
      return updatedContract;
    } catch (error) {
      logger.error('[Contract/Service, addPolicy]:', error);
      throw error;
    }
  }

  public async addOfferingPolicies(
    contractId: string,
    serviceOffering: string,
    participant: string,
    injections: IPolicyInjection[],
  ): Promise<IContractDB | null> {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      let offering = contract.serviceOfferings.find(
        (entry: ContractServiceOffering) =>
          entry.serviceOffering === serviceOffering &&
          entry.participant === participant,
      );

      if (!offering) {
        offering = {
          participant: participant,
          serviceOffering: serviceOffering,
          policies:
            [] as unknown as Types.DocumentArray<ContractServiceOfferingPolicyDocument>,
        } as ContractServiceOfferingDocument;
        contract.serviceOfferings.push(offering);
        offering =
          contract.serviceOfferings[contract.serviceOfferings.length - 1];
      }

      offering.policies.push(
        ...(await Promise.all(
          injections.map(async (injection) => {
            try {
              const policy = await genPolicyFromRule(injection);
              return {
                description: policy.description,
                permission: policy.permission || [],
                prohibition: policy.prohibition || [],
              };
            } catch (error) {
              logger.error('[Contract/Service, addOfferingPolicies]:', error);
              throw error;
            }
          }),
        )),
      );

      const updatedContract = await contract.save();
      return updatedContract;
    } catch (error: any) {
      logger.error('[Contract/Service, addOfferingPolicies]:', error);
      throw error;
    }
  }

  public async removeOfferingPolicies(
    contractId: string,
    offeringId: string,
    participantId: string,
  ): Promise<IContractDB | null> {
    try {
      const contract: ContractDocument | null =
        await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }
      let offeringIndex = contract.serviceOfferings.findIndex(
        (entry: ContractServiceOffering) =>
          (entry.serviceOffering.includes(offeringId) ||
            entry.serviceOffering === offeringId) &&
          (entry.participant.includes(participantId) ||
            entry.participant === participantId),
      );
      if (offeringIndex !== -1) {
        const offering: ContractServiceOffering =
          contract.serviceOfferings[offeringIndex];
        offering.policies = [];
      } else {
        return contract;
      }
      const updatedContract = await contract.save();
      return updatedContract;
    } catch (error: any) {
      logger.error('[Contract/Service, removeOfferingPolicies]:', error);
      throw error;
    }
  }

  // get data processings
  public async getDataProcessings(
    contractId: string,
  ): Promise<ContractDataProcessing[]> {
    try {
      const contract = await Contract.findById(contractId).lean();
      if (contract) {
        return contract.dataProcessings;
      } else {
        throw new Error('Contract not found');
      }
    } catch (error) {
      throw error;
    }
  }

  // update data processings
  public async writeDataProcessings(
    contractId: string,
    processings: ContractDataProcessing[],
  ): Promise<ContractDataProcessing[]> {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }
      contract.set('dataProcessings', processings);
      await contract.save();
      return contract.dataProcessings;
    } catch (error) {
      throw error;
    }
  }
  /*
  public async writeDataProcessings(
    contractId: string,
    processings: ContractDataProcessing[],
  ): Promise<ContractDataProcessing[]> {
    try {
      const contract = await Contract.findById(contractId);
      if (contract) {
        contract.dataProcessings =
          processings as Types.Array<ContractDataProcessingDocument>;
        await contract.save();
        return contract.dataProcessings;
      } else {
        throw new Error('Contract not found');
      }
    } catch (error) {
      throw error;
    }
  }
  */

  public async insertDataProcessing(
    contractId: string,
    processing: ContractDataProcessing,
  ): Promise<ContractDataProcessing> {
    try {
      const contract = await Contract.findById(contractId);
      if (contract) {
        if (
          !contract.dataProcessings.find(
            (element) => element.catalogId === processing.catalogId,
          )
        ) {
          processing.status = 'active';
          contract.dataProcessings.push(processing);
        } else {
          throw new Error('data');
        }
        await contract.save();
        return processing;
      } else {
        throw new Error('Contract not found');
      }
    } catch (error) {
      throw error;
    }
  }

  public async updateDataProcessing(
    contractId: string,
    processingId: string,
    processing: ContractDataProcessing,
  ): Promise<ContractDataProcessing[]> {
    try {
      const contract = await Contract.findById(contractId);
      if (contract) {
        const existingProcessing = contract.dataProcessings.find(
          (item) =>
            item.catalogId.toString() === processingId &&
            item.status === 'active',
        );
        if (existingProcessing) {
          existingProcessing.status = 'inactive';
          processing.status = 'active';
          contract.dataProcessings.push(processing);
          await contract.save();
          return contract.dataProcessings;
        } else {
          throw new Error('Processing not found in the contract');
        }
      } else {
        throw new Error('Contract not found');
      }
    } catch (error) {
      throw error;
    }
  }

  public async removeDataProcessing(
    contractId: string,
    processingId: string,
  ): Promise<ContractDataProcessing> {
    try {
      const contract = await Contract.findById(contractId);
      if (contract) {
        const processing = contract.dataProcessings.find(
          (item) =>
            item._id.toString() === processingId && item.status === 'active',
        );
        if (processing) {
          processing.status = 'inactive';
          await contract.save();
          return processing;
        } else {
          throw new Error('Index out of bounds');
        }
      } else {
        throw new Error('Contract not found');
      }
    } catch (error) {
      throw error;
    }
  }

  public async deleteDataProcessing(
    contractId: string,
    processing: ContractDataProcessing,
  ): Promise<ContractDataProcessing> {
    try {
      const contract = await Contract.findById(contractId);
      if (contract) {
        const initialLength = contract.dataProcessings.length;
        contract.dataProcessings = contract.dataProcessings.filter(
          (item) =>
            item.catalogId !== processing.catalogId &&
            item.infrastructureServices !== processing.infrastructureServices,
        ) as Types.DocumentArray<ContractDataProcessingDocument>;
        if (contract.dataProcessings.length !== initialLength) {
          await contract.save();
          return processing;
        } else {
          throw new Error('Processing not found in the contract');
        }
      } else {
        throw new Error('Contract not found');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Removes the service offering's presence from all contracts.
   *
   * This is useful when a service offering is removed from the catalog.
   */
  public async removeOfferingFromContracts(serviceOfferingId: string) {
    const contractsToUpdate = await Contract.find({
      'serviceOfferings.serviceOffering': serviceOfferingId,
    });

    const updatedResult = await Contract.updateMany(
      { 'serviceOfferings.serviceOffering': serviceOfferingId },
      { $pull: { serviceOfferings: { serviceOffering: serviceOfferingId } } },
    );

    // Remove offering from policies
    const promises = contractsToUpdate.map((contract) => {
      const participant = contract.serviceOfferings.find(
        (so) => so.serviceOffering === serviceOfferingId,
      )?.participant;

      if (!participant) {
        return Promise.resolve();
      }

      return this.removeOfferingPolicies(
        contract._id?.toString(),
        serviceOfferingId,
        participant,
      );
    });

    await Promise.all(promises);
    return updatedResult.modifiedCount;
  }

  private convertContract(contract: IContractDB): any {
    return {};
  }
}

// export default ContractService.getInstance();
