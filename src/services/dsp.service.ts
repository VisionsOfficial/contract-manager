import { logger } from 'utils/logger';
import DSPModel from 'models/dsp.model';
import { IDSPContract } from 'interfaces/schemas.interface';
import { IDSPContractDB } from 'interfaces/contract.interface';

export class DSPService {
  private static instance: DSPService;

  private constructor() {}

  public static async getInstance(): Promise<DSPService> {
    if (!DSPService.instance) {
      DSPService.instance = new DSPService();
    }
    return DSPService.instance;
  }

  public async genContract(contractData: IDSPContract): Promise<IDSPContract> {
    try {
      const date = new Date();

      const newCNPContract = new DSPModel({
        ...contractData,
        createdAt: date,
        updatedAt: date,
      });

      return newCNPContract.save() as Promise<IDSPContract>;
    } catch (error: any) {
      logger.error('[DSPService] Error generating CNP contract:', error);
      throw error;
    }
  }

  public async getContract(contractId: string): Promise<IDSPContractDB | null> {
    try {
      return await DSPModel.findById(contractId).lean();
    } catch (error) {
      logger.error('[DSPService, getContract]:', error);
      throw error;
    }
  }

  public async updateContract(
    contractId: string,
    updates: Partial<IDSPContract>,
  ): Promise<IDSPContractDB | null> {
    try {
      const updatedContract = await DSPModel.findOneAndUpdate(
        { contractDefinitionId: contractId },
        updates,
        { new: true },
      ).lean();

      return updatedContract;
    } catch (error) {
      logger.error('[DSPService, updateContract]:', error);
      throw error;
    }
  }

  public async deleteContract(contractId: string): Promise<void> {
    try {
      const deletedContract = await DSPModel.findOneAndDelete({
        contractDefinitionId: contractId,
      });
      if (!deletedContract) {
        throw new Error(`CNP Contract with ID ${contractId} not found`);
      }
    } catch (error) {
      logger.error('[DSPService, deleteContract]:', error);
      throw error;
    }
  }

  public async getContracts(): Promise<IDSPContractDB[]> {
    try {
      const contracts = await DSPModel.find().lean();
      return contracts;
    } catch (error: any) {
      logger.error('[DSPService, getContracts]:', error);
      throw new Error(`Error while retrieving contracts: ${error.message}`);
    }
  }

  public async getAllDspContractForParticipant(
    participantId: string,
  ): Promise<IDSPContractDB[]> {
    try {
      const contracts = await DSPModel.find({
        consumerPid: { $regex: `^${participantId}-` },
        providerPid: { $regex: `^${participantId}-` },
      }).lean();
      return contracts;
    } catch (error: any) {
      logger.error('[DSPService, getAllDspContractForParticipant]:', error);
      throw new Error(
        `Error while retrieving participant ${participantId} contracts: ${error.message}`,
      );
    }
  }
}
