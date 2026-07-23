import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KitineraryExtractorService } from '../../../../src/nest/booking-import/kitinerary-extractor.service';

describe('KitineraryExtractorService', () => {
  let service: KitineraryExtractorService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.KITINERARY_SERVICE_URL;
    delete process.env.KITINERARY_EXTRACTOR_PATH;
    service = new KitineraryExtractorService();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('detects remote HTTP microservice availability via KITINERARY_SERVICE_URL', () => {
    process.env.KITINERARY_SERVICE_URL = 'http://kitinerary:3002';
    service.onModuleInit();
    expect(service.isAvailable()).toBe(true);
  });

  it('calls remote HTTP microservice on extract() when KITINERARY_SERVICE_URL is set', async () => {
    process.env.KITINERARY_SERVICE_URL = 'http://kitinerary:3002';
    service.onModuleInit();

    const mockReservations = [{ '@type': 'FlightReservation', flightNumber: 'AB123' }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reservations: mockReservations }),
    } as Response);

    const result = await service.extract(Buffer.from('test pdf content'), 'ticket.pdf');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://kitinerary:3002/extract',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result).toEqual(mockReservations);
  });

  it('throws an error if remote extraction returns non-OK status', async () => {
    process.env.KITINERARY_SERVICE_URL = 'http://kitinerary:3002';
    service.onModuleInit();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    await expect(service.extract(Buffer.from('test'), 'ticket.pdf')).rejects.toThrow(
      'KItinerary microservice HTTP error 500',
    );
  });
});
