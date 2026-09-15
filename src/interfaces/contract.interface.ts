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
  pricing?: Record<string, unknown>;
  sla?: Record<string, unknown>;
  commitments?: unknown[];
  contractDuration?: Record<string, unknown>;
  terminationForConvenience?: Record<string, unknown>;
  terminationForCause?: Record<string, unknown>;
  penaltiesTerminationLink?: Record<string, unknown>;
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
  'pricing',
  'sla',
  'commitments',
  'contractDuration',
  'terminationForConvenience',
  'terminationForCause',
  'penaltiesTerminationLink',
  'customFields',
];

// Extends the generated ContractServiceOffering with the flattened catalog data
export type IContractServiceOffering = ContractServiceOffering &
  IContractOfferingFlattenedFields;

/**
 * One step of a service chain. `participant` and `service` are the catalog
 * URLs used by the Data Processing Chain Protocol at exchange time; they are
 * kept for backward compatibility with existing contracts and orchestrator
 * payloads.
 *
 * `params`, `configuration` and `incentivePoints` are read as-is by deployed
 * connectors and must survive a round trip untouched.
 *
 * `serviceOffering` is the strong, typed link to the offering this step runs:
 * it stores the `_id` Mongoose generates on the matching subdocument in
 * `contract.serviceOfferings`, not the catalog id — two contracts referencing
 * the same catalog offering hold distinct subdocuments. Callers never send it,
 * the contract service fills it from `service` on every chain write. It is
 * `null` on legacy steps that predate this field, resolve those with
 * `resolveServiceChainOffering`.
 */
export type IContractServiceChainStep = {
  participant?: string;
  service?: string;
  serviceOffering?: mongoose.Types.ObjectId | null;
  params?: string;
  configuration?: string;
  incentivePoints?: number;
  pre?: unknown[];
};

export type IContractServiceChain = {
  catalogId?: string;
  serviceChainId?: string;
  services: IContractServiceChainStep[];
};

/**
 * Resolves the `serviceOfferings` subdocument a service chain step refers to.
 *
 * Tries the typed `serviceOffering` id first (fast, unambiguous). Falls back to
 * matching `step.service` against `offering.serviceOffering` (the catalog URL)
 * for contracts created before the link existed.
 */
export function resolveServiceChainOffering(
  contract: Pick<IContract, 'serviceOfferings'>,
  step: IContractServiceChainStep,
): IContractServiceOffering | undefined {
  const offerings = (contract.serviceOfferings ?? []) as Array<
    IContractServiceOffering & { _id?: mongoose.Types.ObjectId }
  >;

  if (step.serviceOffering) {
    const byId = offerings.find((offering) =>
      offering._id?.equals(step.serviceOffering as mongoose.Types.ObjectId),
    );
    if (byId) {
      return byId;
    }
  }

  return offerings.find(
    (offering) => offering.serviceOffering === step.service,
  );
}
