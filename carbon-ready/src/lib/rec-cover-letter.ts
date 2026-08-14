// EGAT registrant-submission cover letter — structure and English wording
// transcribed from the official example in the EGAT I-REC Process Guide V15
// page 5 (docs/reference/rec/). Unknown values render as [.....] blanks —
// never invent data on the user's behalf (real-data-only policy).

export interface CoverLetterInput {
  companyName: string;
  companyAddress: string;
  date: string; // rendered as-is
  /** Ticked phase-1 checklist item ids from src/data/rec-guide.ts. */
  checkedIds: ReadonlySet<string>;
}

const BLANK = '[.....]';

// Conditional attachment lines in Process Guide order; STC + SF-01 always lead.
const CONDITIONAL_ATTACHMENTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'company-cert', label: 'Proof of company registration (Dated within the last 6 months)' },
  { id: 'poa', label: 'Power of Attorney' },
  { id: 'id-copy', label: 'Copy of passport/ID card of authorized person(s)' },
  { id: 'boj34', label: 'Company Seal/Stamp Registration (BOJ.3/BOJ.4)' },
  { id: 'boj5', label: "Copy of List of shareholder's names (BOJ.5)" },
  { id: 'financial', label: "Company's financial report (Dated within the last 12 months)" },
  { id: 'pp20', label: 'Copy of the VAT registration certificate (PP20)' },
];

export function buildRecCoverLetter(input: CoverLetterInput): string {
  const name = input.companyName.trim() || BLANK;
  const address = input.companyAddress.trim() || BLANK;

  const attachmentLines = [
    'Standard Terms and Conditions I-REC Registrant in Thailand (STC) Contract (2 Copies)',
    'Market Entity Application Form (SF-01)',
    ...CONDITIONAL_ATTACHMENTS.filter((a) => input.checkedIds.has(a.id)).map((a) => a.label),
    'Others (if any) ................',
  ];
  const attachment = attachmentLines.map((l, i) => `  ${i + 1}. ${l}`).join('\n');

  return `No. ${BLANK}
${address}

${input.date}

Subject:   Registrant Application
Attention: Director, Power Purchase Agreement Division
           Electricity Generating Authority of Thailand

Attachment:
${attachment}

    I am writing to submit my registrant application for ${name}, which is the renewable energy producer or authorized person. Address: ${address}.

    I am pleased to attach herewith the STC contract and related documents for your consideration and approval.

    Please feel free to contact me if you need any further information or questions.

Yours sincerely,



(       Name Surname       )
Position
Authorized person
`;
}
