import axios from 'axios';

export class TrackingService {
  private static instance: TrackingService;

  public static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  public static async contractVerification(
    contractId: string,
    participantId: string,
  ) {
    if (process.env.USE_ACTION_TRACKING === 'true') {
      console.log('contractVerification : ', contractId, participantId);
      const route = `${process.env.CATALOG_URL}/tracking/contract-verification`;
      console.log('Route : ', route);
      const response = await axios.post(
        `${process.env.CATALOG_URL}/tracking/contract-verification`,
        { contractId, participantId },
      );
      console.log('response : ', response.status);
      console.log('response : ', response.data);
    }
  }
}
