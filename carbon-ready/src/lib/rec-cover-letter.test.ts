import { describe, it, expect } from 'vitest';
import { buildRecCoverLetter } from './rec-cover-letter';

const base = { companyName: '', companyAddress: '', date: '2026-08-14', checkedIds: new Set<string>() };

describe('buildRecCoverLetter', () => {
  it('always contains subject, attention block, STC + SF-01 attachments, and the Others line', () => {
    const letter = buildRecCoverLetter(base);
    expect(letter).toContain('Subject:   Registrant Application');
    expect(letter).toContain('Director, Power Purchase Agreement Division');
    expect(letter).toContain('Electricity Generating Authority of Thailand');
    expect(letter).toContain('1. Standard Terms and Conditions I-REC Registrant in Thailand (STC) Contract (2 Copies)');
    expect(letter).toContain('2. Market Entity Application Form (SF-01)');
    expect(letter).toContain('Others (if any)');
    expect(letter).toContain('Yours sincerely,');
    expect(letter).toContain('Authorized person');
  });

  it('renders [.....] blanks when company name/address are empty', () => {
    const letter = buildRecCoverLetter(base);
    expect(letter).toContain('registrant application for [.....]');
    expect(letter).toContain('Address: [.....]');
  });

  it('interpolates company name and address when provided', () => {
    const letter = buildRecCoverLetter({
      ...base, companyName: 'Rocks Green Energy Co., Ltd.', companyAddress: '99 Moo 1, Ratchaburi 70000',
    });
    expect(letter).toContain('registrant application for Rocks Green Energy Co., Ltd.');
    expect(letter).toContain('Address: 99 Moo 1, Ratchaburi 70000');
    expect(letter).not.toContain('for [.....]');
  });

  it('adds ticked conditional attachments in guide order with running numbers', () => {
    const letter = buildRecCoverLetter({
      ...base, checkedIds: new Set(['financial', 'company-cert', 'pp20']),
    });
    expect(letter).toContain('3. Proof of company registration (Dated within the last 6 months)');
    expect(letter).toContain("4. Company's financial report (Dated within the last 12 months)");
    expect(letter).toContain('5. Copy of the VAT registration certificate (PP20)');
    expect(letter).toContain('6. Others (if any)');
    expect(letter).not.toContain('Power of Attorney');
  });

  it('includes the submission date', () => {
    expect(buildRecCoverLetter(base)).toContain('2026-08-14');
  });
});
