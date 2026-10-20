import supertest from 'supertest';
import { expect } from 'chai';
import app from 'server';
import Contract from 'models/contract.model';
import { config } from 'config/config';
import { ContractService } from 'services/contract.service';

const SERVER_PORT = 9999;

const PROVIDER = 'https://catalog/participants/provider';
const PROCESSOR = 'https://catalog/participants/processor';
const DATA_OFFERING = 'https://catalog/serviceofferings/data';
const SERVICE_A = 'https://catalog/serviceofferings/service-a';
const SERVICE_B = 'https://catalog/serviceofferings/service-b';

describe('PII assignments of contract offerings', () => {
  let server: any;
  let authTokenCookie: any;
  let contractId: string;

  before(async () => {
    server = await app.startServer(config.mongo.testUrl);
    await new Promise((resolve) => {
      server.listen(SERVER_PORT, () => resolve(true));
    });
    await Contract.deleteMany({});

    const authResponse = await supertest(app.router).get('/ping');
    authTokenCookie = authResponse.headers['set-cookie'];

    const contractService = await ContractService.getInstance();
    const contract = await contractService.genContract({
      ecosystem: 'ecosystem',
      orchestrator: PROVIDER,
      serviceOfferings: [
        {
          participant: PROVIDER,
          serviceOffering: DATA_OFFERING,
          offerName: 'learners',
          policies: [],
        },
        {
          participant: PROCESSOR,
          serviceOffering: SERVICE_A,
          offerName: 'matching',
          policies: [],
        },
      ],
    } as any);
    contractId = String((contract as any)._id);
  });

  after(async () => {
    await Contract.deleteMany({});
    server.close();
  });

  it('should replace the PII assignments of an offering', async () => {
    const response = await supertest(app.router)
      .put(`/contracts/${contractId}/offerings/pii-assignments`)
      .set('Cookie', authTokenCookie)
      .send({
        serviceOffering: DATA_OFFERING,
        participant: PROVIDER,
        piiAssignments: [
          { serviceOffering: SERVICE_A, participant: PROCESSOR },
          { serviceOffering: SERVICE_B, participant: PROCESSOR },
        ],
      });

    expect(response.status).to.equal(200);

    const stored = await Contract.findById(contractId).lean();
    const offering: any = stored?.serviceOfferings.find(
      (entry: any) => entry.serviceOffering === DATA_OFFERING,
    );
    // Only references are persisted, never a copy of the offering
    expect(offering.piiAssignments).to.deep.equal([
      { serviceOffering: SERVICE_A, participant: PROCESSOR },
      { serviceOffering: SERVICE_B, participant: PROCESSOR },
    ]);
  });

  it('should populate the references when reading the contract', async () => {
    const response = await supertest(app.router)
      .get(`/contracts/${contractId}`)
      .set('Cookie', authTokenCookie);

    expect(response.status).to.equal(200);
    const offering = response.body.serviceOfferings.find(
      (entry: any) => entry.serviceOffering === DATA_OFFERING,
    );
    const [resolved, orphan] = offering.piiAssignments;

    expect(resolved.serviceOffering).to.equal(SERVICE_A);
    expect(resolved.offering.offerName).to.equal('matching');
    expect(resolved.offering).to.not.have.property('piiAssignments');
    // A reference to an offering absent from the contract is kept as is
    expect(orphan.serviceOffering).to.equal(SERVICE_B);
    expect(orphan.offering).to.equal(null);
  });

  it('should populate the references in the contracts list', async () => {
    const response = await supertest(app.router)
      .get('/contracts/all/')
      .set('Cookie', authTokenCookie);

    expect(response.status).to.equal(200);
    const offering = response.body.contracts[0].serviceOfferings.find(
      (entry: any) => entry.serviceOffering === DATA_OFFERING,
    );
    expect(offering.piiAssignments[0].offering.offerName).to.equal('matching');
  });

  it('should populate the offers of a lean contract through the model', async () => {
    const stored = await Contract.findById(contractId).lean();

    const populated: any = Contract.populateOffers(stored);
    const offering = populated.serviceOfferings.find(
      (entry: any) => entry.serviceOffering === DATA_OFFERING,
    );
    expect(offering.piiAssignments[0].offering.offerName).to.equal('matching');

    // Only the requested populations run
    const unpopulated: any = Contract.populateOffers(stored, []);
    const reference = unpopulated.serviceOfferings.find(
      (entry: any) => entry.serviceOffering === DATA_OFFERING,
    ).piiAssignments[0];
    expect(reference).to.not.have.property('offering');
  });

  it('should clear the PII assignments with an empty list', async () => {
    const response = await supertest(app.router)
      .put(`/contracts/${contractId}/offerings/pii-assignments`)
      .set('Cookie', authTokenCookie)
      .send({
        serviceOffering: DATA_OFFERING,
        participant: PROVIDER,
        piiAssignments: [],
      });

    expect(response.status).to.equal(200);
    const offering = response.body.contract.serviceOfferings.find(
      (entry: any) => entry.serviceOffering === DATA_OFFERING,
    );
    expect(offering.piiAssignments).to.deep.equal([]);
  });

  it('should return 404 for an offering absent from the contract', async () => {
    const response = await supertest(app.router)
      .put(`/contracts/${contractId}/offerings/pii-assignments`)
      .set('Cookie', authTokenCookie)
      .send({
        serviceOffering: 'https://catalog/serviceofferings/unknown',
        participant: PROVIDER,
        piiAssignments: [],
      });

    expect(response.status).to.equal(404);
  });

  it('should return 404 for an unknown contract', async () => {
    const response = await supertest(app.router)
      .put('/contracts/000000000000000000000000/offerings/pii-assignments')
      .set('Cookie', authTokenCookie)
      .send({
        serviceOffering: DATA_OFFERING,
        participant: PROVIDER,
        piiAssignments: [],
      });

    expect(response.status).to.equal(404);
  });

  it('should return 400 for an invalid payload', async () => {
    const response = await supertest(app.router)
      .put(`/contracts/${contractId}/offerings/pii-assignments`)
      .set('Cookie', authTokenCookie)
      .send({ serviceOffering: DATA_OFFERING, piiAssignments: 'nope' });

    expect(response.status).to.equal(400);
  });
});
