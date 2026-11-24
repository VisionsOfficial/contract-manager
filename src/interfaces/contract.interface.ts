import mongoose from 'mongoose';
import {
  ContractDocument,
  Contract,
  BilateralContractDocument,
  BilateralContract,
  DSPContractDocument,
  ContractMember,
  ContractServiceOffering,
} from './schemas.interface';

/**
 * Root-level fields added to the Contract schema after `schemas.interface.ts`
 * was last generated. `npm run gen-types` currently fails (mongoose-tsgen 9.5.0
 * against typescript 5.7), so these are declared here by intersection — the same
 * pattern already used for `IContractMember` below. Once the generator works
 * again these become redundant but stay harmless.
 */
export type IContractVersioningFields = {
  version?: string;
  parent?: mongoose.Types.ObjectId | null;
  child?: mongoose.Types.ObjectId | null;
  rootContract?: mongoose.Types.ObjectId | null;
  contractModelVersion?: string;
};

// Type for the generated mongoose contract
export type IContractDB = ContractDocument & IContractVersioningFields;
// Type used for the Contract data manipulation within the API
export type IContract = Contract &
  IContractVersioningFields & {
    permission?: any[];
    prohibition?: any[];
  };

// Type for the generated mongoose bilateral contract
export type IBilateralContractDB = BilateralContractDocument;
// Type used for the Bilateral Contract data manipulation within the API
export type IBilateralContract = BilateralContract;

export type IDSPContractDB = DSPContractDocument;

// Extends the generated ContractMember type with the dataspaceEndpoint field
export type IContractMember = ContractMember & {
  dataspaceEndpoint?: string | null;
};

/**
 * Flattened offering data, sourced from the catalog's ServiceOffering (and the
 * DataResource / SoftwareResource it aggregates) and frozen into the contract.
 *
 * Every field is optional: a legacy contract carries none of them, and an
 * injection must never overwrite an existing value with `undefined`.
 *
 * Enum members are typed as `string` on purpose — the mongoose schema is the
 * single source of truth for the allowed values, and duplicating them here is
 * how the previous hand-written mirror went stale.
 */
export type IContractOfferingFlattenedFields = {
  offerName?: string;
  offerId?: string;
  offerCaption?: string;
  resources?: unknown[];
  dataResources?: unknown[];
  softwareResources?: unknown[];
  packages?: unknown[];
  pricing?: Record<string, unknown>;
  sla?: Record<string, unknown>;
  commitments?: unknown[];
  contractDuration?: Record<string, unknown>;
  terminationForConvenience?: Record<string, unknown>;
  terminationForCause?: Record<string, unknown>;
  penaltiesTerminationLink?: Record<string, unknown>;
  additionalClauses?: Record<string, unknown> | null;
  customFields?: unknown;
};

/** The keys an offering injection is allowed to write, besides `policies`. */
export const CONTRACT_OFFERING_FLATTENED_KEYS: ReadonlyArray<
  keyof IContractOfferingFlattenedFields
> = [
  'offerName',
  'offerId',
  'offerCaption',
  'resources',
  'dataResources',
  'softwareResources',
  'packages',
  'pricing',
  'sla',
  'commitments',
  'contractDuration',
  'terminationForConvenience',
  'terminationForCause',
  'penaltiesTerminationLink',
  'additionalClauses',
  'customFields',
];

/**
 * Reference from a personal-data offering to a service offering processing it.
 * Both values are the self-descriptions used in `serviceOfferings`.
 */
export type IContractPiiAssignment = {
  serviceOffering: string;
  participant?: string;
};

/**
 * A PII assignment as returned when reading a contract: the reference plus the
 * matching entry of `serviceOfferings`, or `null` when it is not in the contract.
 */
export type IPopulatedContractPiiAssignment = IContractPiiAssignment & {
  offering: Record<string, unknown> | null;
};

/**
 * References between contract offerings that `populateOffers` can resolve.
 * A new reference (e.g. a service chain step) only needs a key here and a
 * populator in the contract model.
 */
export type IContractOfferPopulation = 'piiAssignments';

export type IContractStatics = {
  /**
   * Resolves the references between the offerings of a contract against its
   * own serviceOfferings. Every population runs unless some are given.
   * Returns a plain object, whether it receives a document or a lean result.
   */
  populateOffers<T>(contract: T, populations?: IContractOfferPopulation[]): T;
};

// Extends the generated ContractServiceOffering with the flattened catalog data
export type IContractServiceOffering = ContractServiceOffering &
  IContractOfferingFlattenedFields & {
    piiAssignments?: IContractPiiAssignment[];
  };
