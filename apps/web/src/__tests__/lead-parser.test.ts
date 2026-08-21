import { describe, it, expect, vi } from 'vitest';
import {
  parseRawLeadContent,
  parseLeadFile,
  combineLeadSources,
  MAX_LEAD_FILE_SIZE_BYTES,
} from '../lib/lead-parser.js';
import { createCampaign } from '../lib/api-client.js';

describe('CSV/TXT Lead Parser & Email Detection Test Suite', () => {
  // Helper to create fake browser File objects in HappyDOM / Node
  const createMockFile = (name: string, content: string, size = content.length): File => {
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], name, { type: 'text/plain' });
    if (size !== content.length) {
      Object.defineProperty(file, 'size', { value: size });
    }
    return file;
  };

  // Requirement 1: TXT file with valid emails -> correct number detected
  it('1. TXT file with valid emails: extracts correct number of detected emails', () => {
    const txtContent = `
      lead1@example.com
      lead2@company.org
      lead3@domain.co.uk
    `;
    const result = parseRawLeadContent(txtContent, 'leads.txt');
    expect(result.totalDetected).toBe(3);
    expect(result.validEmails).toEqual([
      'lead1@example.com',
      'lead2@company.org',
      'lead3@domain.co.uk',
    ]);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.invalidEntries).toBe(0);
  });

  // Requirement 2: CSV containing emails -> emails extracted correctly
  it('2. CSV containing emails: extracts emails accurately from arbitrary CSV columns', () => {
    const csvContent = `
"First Name","Last Name","Email","Phone"
"Alice","Smith","alice.smith@acme.com","555-0100"
"Bob","Jones","bob_jones123@sub.domain.net","555-0101"
"Charlie","Brown","charlie+filter@mail.io","555-0102"
    `;
    const result = parseRawLeadContent(csvContent, 'contacts.csv');
    expect(result.totalDetected).toBe(3);
    expect(result.validEmails).toContain('alice.smith@acme.com');
    expect(result.validEmails).toContain('bob_jones123@sub.domain.net');
    expect(result.validEmails).toContain('charlie+filter@mail.io');
  });

  // Requirement 3: Duplicate emails -> deduplicated
  it('3. Duplicate emails: removes duplicate emails and records duplicates count', () => {
    const content = `
      user@example.com
      User@Example.com
      USER@EXAMPLE.COM
      other@domain.com
      other@domain.com
    `;
    const result = parseRawLeadContent(content);
    expect(result.totalDetected).toBe(2);
    expect(result.validEmails).toEqual(['user@example.com', 'other@domain.com']);
    expect(result.duplicatesRemoved).toBe(3);
  });

  // Requirement 4: Invalid email entries -> excluded and counted
  it('4. Invalid email entries: ignores malformed email tokens and increments invalidEntries count', () => {
    const content = `
      valid.one@example.com
      not-an-email
      invalid@
      @domain.com
      broken@domain..com
      valid.two@example.com
    `;
    const result = parseRawLeadContent(content);
    expect(result.validEmails).toEqual(['valid.one@example.com', 'valid.two@example.com']);
    expect(result.totalDetected).toBe(2);
    expect(result.invalidEntries).toBeGreaterThanOrEqual(2);
  });

  // Requirement 5: Mixed CSV/TXT content -> valid emails extracted
  it('5. Mixed CSV/TXT content: handles comma, semicolon, whitespace and irregular delimiters', () => {
    const content = `
      first@test.com, second@test.com; third@test.com
      "fourth@test.com", "fifth@test.com"
      Random text with sixth@test.com embedded inside a sentence.
    `;
    const result = parseRawLeadContent(content);
    expect(result.totalDetected).toBe(6);
    expect(result.validEmails).toEqual([
      'first@test.com',
      'second@test.com',
      'third@test.com',
      'fourth@test.com',
      'fifth@test.com',
      'sixth@test.com',
    ]);
  });

  // Requirement 6: Unsupported file extension -> validation error
  it('6. Unsupported file extension: returns descriptive error for non-csv/non-txt files', async () => {
    const file = createMockFile('leads.pdf', 'some binary content');
    const response = await parseLeadFile(file);
    expect(response.success).toBe(false);
    expect(response.error).toContain('Unsupported file format');
    expect(response.error).toContain('.csv or .txt');
  });

  // Requirement 7: Oversized file -> validation error
  it('7. Oversized file: returns validation error when file exceeds 5MB size limit', async () => {
    const oversizedBytes = MAX_LEAD_FILE_SIZE_BYTES + 1024;
    const file = createMockFile('massive_leads.csv', 'test@example.com', oversizedBytes);
    const response = await parseLeadFile(file);
    expect(response.success).toBe(false);
    expect(response.error).toContain('too large');
    expect(response.error).toContain('5 MB');
  });

  // Requirement 8: Upload + manually entered recipients -> combined and deduplicated
  it('8. Upload + manually entered recipients: combines sources and removes duplicates across both', () => {
    const uploadedEmails = ['lead1@test.com', 'lead2@test.com', 'common@test.com'];
    const manualInput = 'lead3@test.com, common@test.com, manual4@test.com';

    const result = combineLeadSources(manualInput, uploadedEmails);
    expect(result.totalCount).toBe(5);
    expect(result.finalEmails).toEqual([
      'lead1@test.com',
      'lead2@test.com',
      'common@test.com',
      'lead3@test.com',
      'manual4@test.com',
    ]);
    expect(result.duplicatesRemoved).toBe(1); // common@test.com deduplicated
  });

  // Requirement 9: Zero valid emails -> schedule is prevented
  it('9. Zero valid emails: combineLeadSources yields 0 count preventing submission', () => {
    const result = combineLeadSources('invalid-email, no-domain@');
    expect(result.totalCount).toBe(0);
    expect(result.finalEmails).toHaveLength(0);
  });

  // Requirement 10: Existing campaign scheduling calls API correctly with combined recipients
  it('10. API Client Integration: createCampaign sends combined recipients array properly', async () => {
    const mockResponse = {
      success: true,
      campaign: {
        id: 'camp-999',
        subject: 'Product Launch',
        totalCount: 2,
        status: 'SCHEDULED',
      },
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const payload = {
      subject: 'Product Launch',
      body: 'Welcome to our platform!',
      startAt: new Date(Date.now() + 3600000).toISOString(),
      delayBetweenEmailsMs: 2000,
      hourlyLimit: 100,
      recipients: ['alice@example.com', 'bob@example.com'],
    };

    const res = await createCampaign(payload);
    expect(res).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/campaigns'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  });
});
