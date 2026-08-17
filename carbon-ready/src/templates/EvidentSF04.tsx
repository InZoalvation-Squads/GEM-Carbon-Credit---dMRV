import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

// ============================================================
// EVIDENT-SF-04 — official I-REC(E) "SF-04: Issue Request"
// v1.2.1 layout. All static text (Document Control, Contents,
// Introduction, section hints, §1.5 auditor preamble, §1.6 hint,
// SF-04A declaration paragraphs, footer) is transcribed verbatim
// from docs/reference/rec/sf-04-issue-request-v1.2.1.pdf. Note: the
// cover/Document Control pages print "Version: 1.2.1" but the
// form-page footers (pages 1-5 of the PDF) print "Version: 1.2" —
// both strings are kept exactly as printed.
// Dynamic values come from the RecIssueRequest (see
// src/types/index.ts RecIssueRequest / RecFacilitySnapshot).
// ============================================================

const DOC_ID = 'EC-IRE-SF04';
const VERSION = '1.2.1';
const FORM_PAGE_VERSION = '1.2';
const RELEASE_DATE = '21 November 2025';

function Check({ on, label }: { on: boolean; label: string }) {
  return <span className="whitespace-nowrap">{on ? '☑' : '☐'} {label}</span>;
}

/** SF-04 footer: Version · Copyright · Page (roman pages hardcode the label; form pages use the CSS counter and the "1.2" form-page version string). */
function Footer({ pageLabel, formPage }: { pageLabel?: string; formPage?: boolean }) {
  return (
    <div className="doc-footer mt-4 flex items-center justify-between border-t border-[#e0c98f] pt-2 text-[11px] text-[#333]">
      <span>Version: {formPage ? FORM_PAGE_VERSION : VERSION}</span>
      <span>Copyright © Evident Ev Limited</span>
      {pageLabel ? <span>Page {pageLabel}</span> : <span className="pageno" />}
    </div>
  );
}

function HeaderBox() {
  return (
    <div className="flex items-start justify-between">
      <div className="text-xl font-extrabold tracking-tight">Ev.</div>
      <div className="text-right leading-snug">
        <p className="font-bold">Evident . I-REC Code for Electricity</p>
        <p>SF-04: Issue Request</p>
      </div>
    </div>
  );
}

/** Vertical sidebar repeated on every form page (1/5 – 5/5), per the reference PDF. */
function Sidebar() {
  return (
    <div className="sf04-sidebar absolute left-0 top-0 h-full select-none text-[10px] font-bold tracking-wide text-[#333]">
      --- THIS FORM MUST BE SUBMITTED THROUGH THE EVIDENT REGISTRY---
    </div>
  );
}

/**
 * One numbered form page (1/5 – 5/5): header, sidebar, content, footer with
 * the CSS page counter. Table so header/footer would repeat on overflow —
 * matches the SF-02 Page primitive idiom.
 */
function Page({ children }: { children: ReactNode }) {
  return (
    <table className="doc-page page-frame">
      <thead>
        <tr><td><HeaderBox /></td></tr>
      </thead>
      <tbody>
        <tr><td><Sidebar /><div className="sf04-content">{children}</div></td></tr>
      </tbody>
      <tfoot>
        <tr><td><Footer formPage /></td></tr>
      </tfoot>
    </table>
  );
}

/** A roman-numbered front-matter page (Document Control / Contents / Introduction) — footer is hardcoded, not the counter. */
function FrontPage({ pageLabel, children }: { pageLabel: string; children: ReactNode }) {
  return (
    <table className="doc-page page-frame front-page">
      <thead>
        <tr><td><HeaderBox /></td></tr>
      </thead>
      <tbody>
        <tr><td><div className="sf04-content">{children}</div></td></tr>
      </tbody>
      <tfoot>
        <tr><td><Footer pageLabel={pageLabel} /></td></tr>
      </tfoot>
    </table>
  );
}

function SectionHead({ no, title, hint }: { no: string; title: string; hint?: string }) {
  return (
    <div className="doc-table w-full">
      <div className="section-head-row border border-[#333] px-2 py-1 font-bold">{no}&emsp;{title}</div>
      {hint && <div className="section-hint-row border border-t-0 border-[#333] px-2 py-1 italic">{hint}</div>}
    </div>
  );
}

/** Two-column bordered row: bold label on the left, value on the right. */
function Row({ label, hint, children, labelWidth = 'w-64' }: { label: string; hint?: string; children?: ReactNode; labelWidth?: string }) {
  return (
    <div className="doc-row flex border border-t-0 border-[#333]">
      <div className={`${labelWidth} shrink-0 border-r border-[#333] px-2 py-1.5 font-bold`}>
        {label}
        {hint && <div className="mt-0.5 text-[11px] font-normal italic text-[#555]">{hint}</div>}
      </div>
      <div className="flex-1 px-2 py-1.5">{children}</div>
    </div>
  );
}

/** DD | MM | YYYY cells; grey placeholder text when the ISO date is blank. */
function DateCells({ iso }: { iso: unknown }) {
  // slice(0, 10): tolerate full ISO datetimes (e.g. submitted_at) — the
  // form's DD cell must never show a time suffix.
  const parts = typeof iso === 'string' && iso ? iso.slice(0, 10).split('-') : null; // [YYYY, MM, DD]
  const [yyyy, mm, dd] = parts ?? [undefined, undefined, undefined];
  const cell = (val: string | undefined, placeholder: string) => (
    <div className="flex-1 border-r border-[#333] px-2 py-1.5 last:border-r-0">
      {val ?? <span className="text-[#999]">{placeholder}</span>}
    </div>
  );
  return (
    <div className="flex">
      {cell(dd, 'DD')}
      {cell(mm, 'MM')}
      {cell(yyyy, 'YYYY')}
    </div>
  );
}

/** MWh as individual digit boxes: integer digits | separator | up to 6 decimals. */
function DigitGrid({ value, testId }: { value: unknown; testId?: string }) {
  const n = value === undefined || value === null || value === '' ? null : Number(value);
  const str = n === null || Number.isNaN(n) ? '' : String(n);
  const [intPart, decPart = ''] = str.split('.');
  const intDigits = (intPart || '').padStart(5, ' ').split('');
  const decDigits = decPart.padEnd(6, ' ').slice(0, 6).split('');
  const box = (ch: string, key: string) => (
    <div key={key} className="digit-box flex h-7 w-6 shrink-0 items-center justify-center border border-[#333] text-center">
      {ch.trim() || ' '}
    </div>
  );
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex items-center justify-between">
        <span />
        <span className="font-bold">MWh</span>
        <span className="italic text-[#555]">up to 6 decimal places</span>
      </div>
      <div className="flex items-stretch">
        {intDigits.map((c, i) => box(c, `i${i}`))}
        <div className="mx-1 flex items-center px-1 text-lg font-bold">.</div>
        {decDigits.map((c, i) => box(c, `d${i}`))}
      </div>
    </div>
  );
}

export function EvidentSF04({ recIssueId: recIssueIdProp }: { recIssueId?: string } = {}) {
  const params = useParams();
  const recIssueId = recIssueIdProp ?? params.id;
  const rec = useStore((s) => s.recIssues.find((r) => r.id === recIssueId));

  if (!rec) {
    return <EmptyState title="Issue request not found" hint="This document does not exist." />;
  }

  const snap = rec.facility_snapshot;
  const str = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v));
  const isNormal = rec.request_type === 'Normal';

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/rec-issuance">
          <Button variant="ghost"><ArrowLeft size={16} /> Back to REC Issuance</Button>
        </Link>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
      </div>

      <div className="sf04-doc bg-white p-8 text-[13px] leading-relaxed text-black shadow print:p-0 print:shadow-none">

        {/* ============ Cover ============ */}
        <section className="doc-page cover-page">
          <div className="cover-panel relative overflow-hidden bg-[#f5efe6] p-10" style={{ borderRadius: '0 0 40% 0 / 0 0 12% 0' }}>
            <p className="text-5xl font-extrabold text-[#2b2320]">Evident<span className="ml-1">.</span></p>
            <p className="mt-4 text-3xl font-extrabold text-[#a9a29a]">I-REC Code for Electricity</p>
            <p className="mt-2 text-xl font-bold text-[#2b2320]">SF-04: Issue Request</p>
            <div className="mt-24 space-y-1 text-[13px]">
              <p>Version: {VERSION}</p>
              <p>Release Date: {RELEASE_DATE}</p>
            </div>
          </div>
        </section>

        {/* ============ Document Control (Page I/III) ============ */}
        <FrontPage pageLabel="I/III">
          <p className="text-[20px] font-bold">Document Control</p>
          <table className="doc-table mt-3 w-full">
            <tbody>
              <tr><td className="w-44 font-bold">Document ID</td><td>{DOC_ID}</td></tr>
              <tr>
                <td className="font-bold">Document Name</td>
                <td>Evident. I-REC Code for Electricity<br />SF-04: Issue Request</td>
              </tr>
              <tr><td className="font-bold">Version</td><td>{VERSION}</td></tr>
            </tbody>
          </table>
          <table className="doc-table mt-3 w-full">
            <tbody>
              <tr><td className="w-44 font-bold">Author</td><td>Evident</td></tr>
              <tr><td className="font-bold">Owner</td><td>Evident Ev Limited</td></tr>
              <tr><td className="font-bold">Authoriser</td><td>Evident</td></tr>
            </tbody>
          </table>
          <table className="doc-table mt-3 w-full">
            <tbody>
              <tr><td className="w-44 font-bold">Release Date</td><td>{RELEASE_DATE}</td></tr>
            </tbody>
          </table>
          <p className="mt-6 text-[18px] font-bold">Copyright</p>
          <p>This document is Copyright © Evident Ev Limited</p>
        </FrontPage>

        {/* ============ Contents (Page II/III) ============ */}
        <FrontPage pageLabel="II/III">
          <p className="text-[20px] font-bold">Contents</p>
          <div data-testid="toc" className="mt-3 space-y-1.5">
            {[
              ['1', 'INTRODUCTION', 'III'],
              ['1.1', 'SF-04: Issue Request', '1'],
              ['1.2', 'Registrant and Facility Details', '1'],
              ['1.3', 'Production Details', '1'],
              ['1.4', 'Energy Sources', '2'],
              ['1.5', 'Production Auditor', '2'],
              ['1.6', 'Receiving Account Details', '2'],
              ['1.7', 'SF-04A: Issuing Declaration', '3'],
              ['1.8', 'SF-04B: Production Group Statement', '3'],
              ['1.9', 'SF-04C: Fuel Consumption Statement', '5'],
              ['1.10', 'Production Auditor', '5'],
            ].map(([no, title, page]) => (
              <div key={no} className="flex items-baseline gap-2">
                <span className="w-10 shrink-0">{no}</span>
                <span className="flex-1 border-b border-dotted border-[#999]">{title}</span>
                <span>{page}</span>
              </div>
            ))}
          </div>
        </FrontPage>

        {/* ============ Introduction (Page III/III) ============ */}
        <FrontPage pageLabel="III/III">
          <p className="text-[20px] font-bold">1. Introduction</p>
          <div className="mt-3 space-y-3">
            <p>
              The following multi-part form included within this document is to be used by all Registrants for
              submitting Issue Requests for I-REC(E). Evident reserves the right to request further
              information in addition to that requested in this form where, in its reasonable opinion, such
              information is required to establish the eligibility, configuration, operation, volume of energy
              produced, ownership, or attribute rights of the Production Facility.
            </p>
            <p>
              The completed form should be attached to an Issue Request within the Evident Registry. Where
              an online system is available for Issue Request submission within the Evident Registry that
              system may, at the sole discretion of the responsible Issuer, be used to replace the
              requirement to submit form <em>SF-04: Issue Request</em> through the Evident Registry.
            </p>
            <p>
              Form <em>SF-04A: Issuing Declaration</em> shall be submitted with all Issue Requests.
            </p>
            <p>
              Form <em>SF-04B: Production Group Statement</em> shall be submitted only for Issue Requests of
              Production Groups.
            </p>
            <p>
              Form <em>SF-04C: Fuel Consumption Statement</em> shall be submitted for every Issue Request where the
              Production Facility uses multiple fuels.
            </p>
            <p>
              Issuers may, at their discretion, require completion of this form, or a translation, in another
              language <strong>in addition to English</strong>.
            </p>
            <p>
              This document is correct at the date of issue, however Evident may change the information
              requirements without notice where necessary for compliance with national legislation or to
              preserve the integrity for the I-REC(E) market.
            </p>
          </div>
        </FrontPage>

        {/* ============ Form page 1/5 — §1.1 + §1.2 + §1.3 ============ */}
        <Page>
          <SectionHead no="1.1" title="SF-04: Issue Request" hint="Complete all fields." />
          <Row label="Date" labelWidth="w-64"><DateCells iso={rec.submitted_at} /></Row>
          <Row label="Request type" hint="(please select)">
            <div className="flex flex-wrap gap-x-2">
              <Check on={isNormal} label="Normal" /> /
              <Check on={!isNormal} label="Self consumption" />
            </div>
          </Row>

          <div className="mt-4">
            <SectionHead no="1.2" title="Registrant and Facility Details" hint="Complete all fields. IDs, codes, and names should be as displayed in the Evident Registry." />
            <Row label="Organisation ID/code">{str(snap.evident_org_id)}</Row>
            <Row label="Organisation name">{str(snap.organisation_name)}</Row>
            <Row label="Facility ID/code">{str(rec.facility_id)}</Row>
            <Row label="Facility name">{str(snap.facility_name)}</Row>
            <Row label="Requested Labels" hint="(only Labels recoded against the Facility registration are permitted)">{str(rec.requested_labels)}</Row>
          </div>

          <div className="mt-4">
            <SectionHead no="1.3" title="Production Details" hint="Complete all fields." />
            <Row label="Period start date"><DateCells iso={rec.period_start} /></Row>
            <Row label="Period end date"><DateCells iso={rec.period_end} /></Row>
            <Row label="Total production during period">
              <DigitGrid value={rec.total_production_mwh} testId="mwh-grid" />
            </Row>
            <Row label="I-REC(E) applied for" hint="(if blank the above amount will be issued on approval)">
              <DigitGrid value={rec.applied_mwh} />
            </Row>
            <div className="border border-t-0 border-[#333] px-2 py-1.5 italic">
              Unless explicitly confirmed otherwise, I-REC(E) for multi-fuel generators shall only be issued for that portion of electricity
              production derived from renewable sources.
            </div>
          </div>
        </Page>

        {/* ============ Form page 2/5 — §1.4 + §1.5 + §1.6 ============ */}
        <Page>
          <SectionHead no="1.4" title="Energy Sources" hint="Complete all fields - please refer to SD 02: Technologies and Fuels." />
          <div className="doc-row flex border border-t-0 border-[#333] font-bold">
            <div className="w-64 shrink-0 border-r border-[#333] px-2 py-1.5">
              Fuel
              <div className="mt-0.5 text-[11px] font-normal italic text-[#555]">(please list all possible fuels if Production Facility is a multi-fuel generator and also complete SF-04C: Fuel Consumption Statement)</div>
            </div>
            <div className="flex flex-1">
              <div className="w-1/3 border-r border-[#333] px-2 py-1.5">Code(s)</div>
              <div className="flex-1 px-2 py-1.5">Description(s)</div>
            </div>
          </div>
          <div className="doc-row flex border border-t-0 border-[#333]">
            <div className="w-64 shrink-0 border-r border-[#333] px-2 py-1.5" />
            <div className="flex flex-1">
              <div className="w-1/3 border-r border-[#333] px-2 py-1.5">{str(snap.fuel_code)}</div>
              <div className="flex-1 px-2 py-1.5">{str(snap.fuel_description)}</div>
            </div>
          </div>
          <div className="doc-row flex border border-t-0 border-[#333] font-bold">
            <div className="w-64 shrink-0 border-r border-[#333] px-2 py-1.5">Technology</div>
            <div className="flex flex-1">
              <div className="w-1/3 border-r border-[#333] px-2 py-1.5">Code</div>
              <div className="flex-1 px-2 py-1.5">Description</div>
            </div>
          </div>
          <div className="doc-row flex border border-t-0 border-[#333]">
            <div className="w-64 shrink-0 border-r border-[#333] px-2 py-1.5" />
            <div className="flex flex-1">
              <div className="w-1/3 border-r border-[#333] px-2 py-1.5">{str(snap.technology_code)}</div>
              <div className="flex-1 px-2 py-1.5">{str(snap.technology_description)}</div>
            </div>
          </div>

          <div className="mt-4">
            <SectionHead no="1.5" title="Production Auditor" hint="Complete all fields if a Production Auditor has reviewed the information for this Issue Request." />
            <div className="border border-t-0 border-[#333] px-2 py-1.5">
              The undersigned Production Auditor has reviewed this Issue Request and has no material reason to
              doubt the correctness of the evidence to support the measured volume.
            </div>
            <Row label="Organisation name" />
            <Row label="Signature" />
            <Row label="Name" hint="(BLOCK CAPITALS)" />
            <Row label="Date"><DateCells iso={undefined} /></Row>
          </div>

          <div className="mt-4">
            <SectionHead no="1.6" title="Receiving Account Details" hint="Complete all fields. IDs, codes, and names should be as displayed in the Evident Registry." />
            <Row label="Receiving organisation name" hint="(Participant, Platform Operator, or self-consumption)">{str(rec.receiving_org_name)}</Row>
            <Row label="Account ID/code">{str(rec.receiving_account_id)}</Row>
          </div>
        </Page>

        {/* ============ SF-04A — always shown ============ */}
        <Page>
          <SectionHead no="1.7" title="SF-04A: Issuing Declaration" />
          <div className="space-y-2 border border-t-0 border-[#333] px-2 py-1.5 italic">
            <p>
              If not submitted as part of SF-04: Issue Request, for example if all Issue Request data is submitted via an online form,
              this Issuing Declaration should be copied onto the Registrant&rsquo;s headed paper, completed and signed by an authorised
              representative of the Registrant. It can be scanned and submitted electronically to the Issuer. An Issuer may accept a
              company stamp as an alternative to an authorised representative&rsquo;s signature.
            </p>
          </div>
          <div className="space-y-3 border border-t-0 border-[#333] px-2 py-1.5">
            <p>
              In signing, the Registrant agrees to be subject to the I-REC Code for Electricity and warrants that the
              energy for which I-REC(E) certificates are being sought has not and will not be submitted for any other
              energy attribute tracking methodology, emissions reduction certificate, or carbon offset.
            </p>
            <p>
              The Registrant also warrants that, to the best of their knowledge, the production and/or consumption
              attributes contained within any I-REC(E) certificate issued in association with this request (including all
              rights to the specific electricity and/or emissions for the reporting of any indirect carbon accounting
              purposes) are not delivered to any other body (directly or in-directly) without the component I-REC(E)
              certificate. This includes but is not limited to electricity supply companies or national governments.
            </p>
          </div>
          <Row label="Signature" />
          <Row label="Name" hint="(BLOCK CAPITALS)" />
          <Row label="Date"><DateCells iso={undefined} /></Row>
        </Page>
      </div>

      <style>{`
        .sf04-doc { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; counter-reset: sf04page; }
        .sf04-doc .doc-page:not(.cover-page):not(.front-page) { counter-increment: sf04page; }
        .sf04-doc .pageno::after { content: counter(sf04page) "/5"; }
        .sf04-doc .doc-table { border-collapse: collapse; width: 100%; }
        .sf04-doc .doc-table td, .sf04-doc .doc-table th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
        .sf04-doc .page-frame { width: 100%; border-collapse: collapse; }
        .sf04-doc .page-frame > thead > tr > td,
        .sf04-doc .page-frame > tbody > tr > td,
        .sf04-doc .page-frame > tfoot > tr > td {
          border: 0;
          padding: 0 2px 0 0;
          vertical-align: top;
        }
        .sf04-doc .doc-page { margin-bottom: 2rem; position: relative; }
        .sf04-doc .sf04-content { position: relative; margin-top: 12px; padding-left: 24px; }
        .sf04-doc .sf04-sidebar {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          position: absolute;
          left: -4px;
          top: 0;
        }
        .sf04-doc .cover-panel { min-height: 400px; }
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { background: white; }
          .sf04-doc .doc-page { break-after: page; margin-bottom: 0; }
          .sf04-doc .doc-page:last-child { break-after: auto; }
          .sf04-doc .page-frame { height: 265mm; }
          .sf04-doc .doc-row { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
