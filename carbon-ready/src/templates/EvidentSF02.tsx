import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

// ============================================================
// EVIDENT-SF-02 — official I-REC(E) "SF-02: Production Facility
// Registration" v1.4.1 layout. All static text (Document Control, Contents,
// Introduction, section hints, §1.8 privacy text, SF-02A + SF-02C
// declarations, footer) is transcribed verbatim from
// docs/reference/rec/sf-02-production-facility-registration-v1.4.1.pdf.
// Dynamic values come from the PDD's section_data (see
// data/methodologies/rec-solar.ts for the field keys).
// ============================================================

const DOC_ID = 'EC-IRE-SF02';
const VERSION = '1.4.1';
const RELEASE_DATE = '21 November 2025';

function Check({ on, label }: { on: boolean; label: string }) {
  return <span className="whitespace-nowrap">{on ? '☑' : '☐'} {label}</span>;
}

/** SF-02 footer: Version · Copyright · Page (roman pages hardcode the label; form pages use the CSS counter). */
function Footer({ pageLabel }: { pageLabel?: string }) {
  return (
    <div className="doc-footer mt-4 flex items-center justify-between border-t border-[#e0c98f] pt-2 text-[11px] text-[#333]">
      <span>Version: {VERSION}</span>
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
        <p>SF-02: Production Facility Registration</p>
      </div>
    </div>
  );
}

/** Vertical sidebar repeated on every form page (1/8 – 8/8), per the reference PDF. */
function Sidebar() {
  return (
    <div className="sf02-sidebar absolute left-0 top-0 h-full select-none text-[10px] font-bold tracking-wide text-[#333]">
      --- THIS FORM MUST BE SUBMITTED THROUGH THE EVIDENT REGISTRY---
    </div>
  );
}

/**
 * One numbered form page (1/8 – 8/8): header, sidebar, content, footer with
 * the CSS page counter. Table so header/footer would repeat on overflow —
 * matches the T-VER Page primitive idiom.
 */
function Page({ children }: { children: ReactNode }) {
  return (
    <table className="doc-page page-frame">
      <thead>
        <tr><td><HeaderBox /></td></tr>
      </thead>
      <tbody>
        <tr><td><Sidebar /><div className="sf02-content">{children}</div></td></tr>
      </tbody>
      <tfoot>
        <tr><td><Footer /></td></tr>
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
        <tr><td><div className="sf02-content">{children}</div></td></tr>
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
  // slice(0, 10): tolerate full ISO datetimes (e.g. pdd.submitted_at) — the
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

/** Installed capacity as individual digit boxes: integer digits | separator | up to 6 decimals, "MW" + hint labels. */
function DigitGrid({ value }: { value: unknown }) {
  const n = value === undefined || value === null || value === '' ? null : Number(value);
  const str = n === null || Number.isNaN(n) ? '' : String(n);
  const [intPart, decPart = ''] = str.split('.');
  const intDigits = (intPart || '').padStart(5, ' ').split('');
  const decDigits = decPart.padEnd(6, ' ').slice(0, 6).split('');
  const box = (ch: string, key: string) => (
    <div key={key} className="digit-box flex h-7 w-6 shrink-0 items-center justify-center border border-[#333] text-center">
      {ch.trim() || ' '}
    </div>
  );
  return (
    <div data-testid="capacity-grid">
      <div className="mb-1 flex items-center justify-between">
        <span />
        <span className="font-bold">MW</span>
        <span className="italic text-[#555]">Up to 6 decimal places</span>
      </div>
      <div className="flex items-stretch">
        {intDigits.map((c, i) => box(c, `i${i}`))}
        <div className="mx-1 flex items-center px-1 text-lg font-bold">.</div>
        {decDigits.map((c, i) => box(c, `d${i}`))}
      </div>
    </div>
  );
}

export function EvidentSF02({ pddId: pddIdProp }: { pddId?: string } = {}) {
  const params = useParams();
  const pddId = pddIdProp ?? params.pddId;
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));

  if (!pdd || !project) {
    return <EmptyState title="PDD not found" hint="This document does not exist." />;
  }

  const d = pdd.section_data as Record<string, unknown>;
  const str = (k: string) => {
    const v = d[k];
    return v === undefined || v === null || v === '' ? '' : String(v);
  };
  const sel = (k: string, option: string) => d[k] === option;
  const orgName = str('organisation_name');
  const facilityName = str('facility_name');
  const isOwner = str('registrant_is_owner') === 'Yes';

  return (
    <div className="mx-auto max-w-4xl rounded-sheet border border-rule bg-surface print:border-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3 print:hidden">
        <h1 className="w-full text-xl font-semibold text-ink">SF-02</h1>
        <LinkButton to={`/registration/${pdd.id}/document`} variant="ghost"><ArrowLeft size={16} /> Back to document</LinkButton>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
      </div>

      <div className="sf02-doc bg-white p-8 text-[13px] leading-relaxed text-black shadow print:p-0 print:shadow-none">

        {/* ============ Cover ============ */}
        <section className="doc-page cover-page">
          <div className="cover-panel relative overflow-hidden bg-[#f5efe6] p-10" style={{ borderRadius: '0 0 40% 0 / 0 0 12% 0' }}>
            <p className="text-5xl font-extrabold text-[#2b2320]">Evident<span className="ml-1">.</span></p>
            <p className="mt-4 text-3xl font-extrabold text-[#a9a29a]">I-REC Code for Electricity</p>
            <p className="mt-2 text-xl font-bold text-[#2b2320]">SF-02: Production Facility Registration</p>
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
                <td>Evident. I-REC Code for Electricity<br />SF-02: Production Facility Registration</td>
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
              ['1.', 'INTRODUCTION', 'III'],
              ['1.1', 'SF-02: Production Facility Registration', '1'],
              ['1.2', 'Registrant Contact Details', '1'],
              ['1.3', 'Production Facility Details', '2'],
              ['1.4', 'Energy Sources', '3'],
              ['1.5', 'Business Details', '4'],
              ['1.6', 'Verification Agent', '4'],
              ['1.7', 'Additional Information', '4'],
              ['1.8', 'Confirmation Signature', '5'],
              ['1.9', "SF-02A: Registrant's Declaration", '5'],
              ['1.10', 'SF-02B: Production Group Template', '7'],
              ['1.11', "SF-02C: Owner's Declaration", '8'],
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
              The following multi-part form included within this document is to be used by all Registrants
              wishing to register Production Facilities. Evident reserves the right to request further
              information in addition to that requested in this form where, in its reasonable opinion, such
              information is required to establish the eligibility, configuration, operation, ownership, or
              attribute rights of the Production Facility.
            </p>
            <p>
              The completed form should be attached to a Production Facility registration within the
              Evident Registry. Where an online system is available for Production Facility registration within the
              Evident Registry that system may, at the sole discretion of the responsible Issuer, be used to
              replace the requirement to submit form <em>SF-02: Production Facility Registration</em> through the
              Evident Registry.
            </p>
            <p>
              Form <em>SF-02A: Registrant&rsquo;s Declaration</em> shall be submitted with all registrations.
            </p>
            <p>
              Form <em>SF-02B: Production Group Template</em> shall be submitted only for registrations of Production
              Groups.
            </p>
            <p>
              Form <em>SF-02C: Owner&rsquo;s Declaration</em> shall be submitted for every registration where the Registrant
              is not the Facility Owner.
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

        {/* ============ Form page 1/8 — §1.1 + §1.2 ============ */}
        <Page>
          <SectionHead no="1.1" title="SF-02: Production Facility Registration" hint="Complete all fields." />
          <Row label="Date" labelWidth="w-64"><DateCells iso={pdd.submitted_at} /></Row>
          <Row label="Registration type" hint="(please select one)">
            <div className="flex flex-wrap gap-x-2">
              <Check on={sel('registration_type', 'New')} label="New" /> /
              <Check on={sel('registration_type', 'Change of details')} label="Change of details" /> /
              <Check on={sel('registration_type', 'Renewal')} label="Renewal" /> /
              <Check on={sel('registration_type', 'Transfer')} label="Transfer" />
            </div>
          </Row>
          <Row
            label="Submitter status"
            hint="(please confirm and, if yes, provide evidence and completed SF-02C: Owner's Declaration with your submission)"
          >
            <div className="flex items-center justify-between">
              <span>Is the Registrant also the owner of the Production Facility?</span>
              <div className="flex gap-2">
                <Check on={sel('registrant_is_owner', 'Yes')} label="Yes" />
                <Check on={sel('registrant_is_owner', 'No')} label="No" />
              </div>
            </div>
          </Row>

          <div className="mt-4">
            <SectionHead no="1.2" title="Registrant Contact Details" hint="Complete all fields." />
            <Row label="Organisation ID/code" hint="(as displayed in the Evident Registry)">{str('evident_org_id')}</Row>
            <Row label="Organisation name">{orgName}</Row>
            <Row label="Contact person">{str('contact_person')}</Row>
            <Row label="Business address" hint="(including postal or zip code)"><span className="whitespace-pre-wrap">{str('business_address')}</span></Row>
            <Row label="Country">{str('registrant_country')}</Row>
            <Row label="e-mail">{str('registrant_email')}</Row>
            <Row label="Telephone">{str('registrant_phone')}</Row>
            <Row label="Additional Contact(s)" hint="If applicable – please provide details of any other person(s) we may contact">{str('additional_contacts')}</Row>
          </div>
        </Page>

        {/* ============ Form page 2/8 — §1.3 (facility) ============ */}
        <Page>
          <SectionHead no="1.3" title="Production Facility Details" hint="Complete all fields." />
          <Row label="Facility name">{facilityName}</Row>
          <Row label="Facility address" hint="(including postal or zip code)"><span className="whitespace-pre-wrap">{str('facility_address')}</span></Row>
          <Row label="Country">{str('facility_country')}</Row>
          <Row label="Latitude" hint="(±n.nnnnnn)">{str('latitude')}</Row>
          <Row label="Longitude" hint="(±n.nnnnnn)">{str('longitude')}</Row>
          <Row label="Installed capacity"><DigitGrid value={d.installed_capacity_mw} /></Row>
          <Row label="Meter or Measurement ID(s)" hint="(Serial number of the meter which measures generation/export by the production facility)">{str('meter_ids')}</Row>
          <Row label="Number of generating units" hint="(E.g., number of inverters for solar facility, number of wind turbine generators for wind facility, etc.)">{str('generating_units')}</Row>
          <Row label="Commissioning date"><DateCells iso={project.commission_date} /></Row>
          <Row label="Owner of the network to which the Production Device is connected and the voltage of that connection">{str('network_owner_voltage')}</Row>
          <Row label="If the Production Device is not connected directly to the grid, specify the circumstances, and additional relevant meter registration numbers">{str('non_grid_details')}</Row>
        </Page>

        {/* ============ Form page 3/8 — §1.3 continued + §1.4 ============ */}
        <Page>
          <Row label="Expected form of volume evidence" hint="(if other please specify)">
            <div className="flex flex-wrap gap-x-2">
              <Check on={sel('volume_evidence_form', 'Metering data')} label="Metering data" /> /
              <Check on={sel('volume_evidence_form', 'Contract sales invoice')} label="Contract sales invoice" /> /
              <Check on={sel('volume_evidence_form', 'Other')} label="Other" />
              {sel('volume_evidence_form', 'Other') && <span className="ml-2">{str('volume_evidence_other')}</span>}
            </div>
          </Row>
          <Row label="Is there an on-site (captive) consumer present?" hint="(if yes please provide details)">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Check on={sel('onsite_consumer', 'Yes')} label="Yes" />
                <Check on={sel('onsite_consumer', 'No')} label="No" />
              </div>
              <span>{str('onsite_consumer_details')}</span>
            </div>
          </Row>
          <Row label="Auxiliary/standby energy sources present?" hint="(if yes please provide details)">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Check on={sel('aux_energy_sources', 'Yes')} label="Yes" />
                <Check on={sel('aux_energy_sources', 'No')} label="No" />
              </div>
              <span>{str('aux_energy_details')}</span>
            </div>
          </Row>
          <Row label="Please give details of how the site can import electricity by means other than through the meter(s) specified above">{str('import_routes')}</Row>
          <Row label="Requested effective date of registration:" hint="(in line with the Residual Mix Deadline and no earlier than the commissioning date)">
            <DateCells iso={d.effective_reg_date} />
          </Row>

          <div className="mt-4">
            <SectionHead no="1.4" title="Energy Sources" hint="Complete all fields - please refer to SD 02: Technologies and Fuels." />
            <div className="doc-row flex border border-t-0 border-[#333] font-bold">
              <div className="w-64 shrink-0 border-r border-[#333] px-2 py-1.5">
                Fuel
                <div className="mt-0.5 text-[11px] font-normal italic text-[#555]">(please list all possible fuels if Production Facility is a multi-fuel generator)</div>
              </div>
              <div className="flex flex-1">
                <div className="w-1/3 border-r border-[#333] px-2 py-1.5">Code</div>
                <div className="flex-1 px-2 py-1.5">Description</div>
              </div>
            </div>
            <div className="doc-row flex border border-t-0 border-[#333]">
              <div className="w-64 shrink-0 border-r border-[#333] px-2 py-1.5" />
              <div className="flex flex-1">
                <div className="w-1/3 border-r border-[#333] px-2 py-1.5">{str('fuel_code')}</div>
                <div className="flex-1 px-2 py-1.5">{str('fuel_description')}</div>
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
                <div className="w-1/3 border-r border-[#333] px-2 py-1.5">{str('technology_code')}</div>
                <div className="flex-1 px-2 py-1.5">{str('technology_description')}</div>
              </div>
            </div>
          </div>
        </Page>

        {/* ============ Form page 4/8 — §1.5-1.8 ============ */}
        <Page>
          <SectionHead no="1.5" title="Business Details" hint="Complete all required fields." />
          <Row label="Please give details (including registration id) of any carbon offset or energy tracking scheme for which the Production Facility is registered. State 'None' if that is the case">{str('other_schemes')}</Row>
          <Row label="Please identify any Labelling Scheme(s) for which the Production Facility is accredited">{str('labelling_schemes')}</Row>
          <Row label="Has the Production Facility ever received public (government) funding (e.g. Feed in Tariff)?">
            <div className="flex flex-wrap gap-x-2">
              <Check on={sel('public_funding', 'No')} label="No" /> /
              <Check on={sel('public_funding', 'Investment')} label="Investment" /> /
              <Check on={sel('public_funding', 'Production')} label="Production" />
            </div>
          </Row>
          <Row label="(if public (government) funding has been received when did/will it finish?)"><DateCells iso={d.funding_end_date} /></Row>

          <div className="mt-4">
            <SectionHead no="1.6" title="Verification Agent" hint="Complete if required." />
            <Row label="Name of proposed Verification Agent" hint="(if not the Issuer)">{str('verification_agent_name')}</Row>
          </div>

          <div className="mt-4">
            <SectionHead no="1.7" title="Additional Information" hint="Please use this field to provide any further information you feel relevant to this registration" />
            <div className="min-h-[60px] border border-t-0 border-[#333] px-2 py-1.5">{str('additional_info')}</div>
          </div>

          <div className="mt-4">
            <SectionHead no="1.8" title="Confirmation Signature" hint="Complete all fields." />
            <div className="space-y-2 border border-t-0 border-[#333] px-2 py-1.5">
              <p>
                By submitting this form I confirm acceptance of Evident&rsquo;s Privacy Policy, as published on
                https://evident.global/privacy-policy and any such policies as published by the responsible Issuer.
              </p>
              <p>
                I acknowledge and agree that the information provided will be used by Evident for the purpose of
                providing services relating to I-REC Electricity certificates and that Evident may share this information
                with other organisations as may be necessary for the provision of these services.
              </p>
            </div>
            <Row label="Signature" />
            <Row label="Name" hint="(BLOCK CAPITALS)" />
            <Row label="Date"><DateCells iso={undefined} /></Row>
          </div>
        </Page>

        {/* ============ SF-02A — always shown ============ */}
        <Page>
          <SectionHead no="1.9" title="SF-02A: Registrant's Declaration" />
          <div className="space-y-2 border border-t-0 border-[#333] px-2 py-1.5 italic">
            <p>
              If not submitted with SF-02: Production Facility Registration, for example if all registration data is submitted via an
              online form, this Registrant&rsquo;s Declaration should be copied onto the Registrant&rsquo;s headed paper, completed and signed by
              an authorised representative of the Registrant. It can be scanned and submitted electronically to the Issuer. An Issuer
              may accept a company stamp as an alternative to an authorised representative&rsquo;s signature.
            </p>
            <p>Text within [square brackets] should be replaced with the appropriate content.</p>
          </div>
          <div className="space-y-3 border border-t-0 border-[#333] px-2 py-1.5">
            <p>
              On behalf of the Registrant, {orgName || '[insert Registrant organisation name here]'}, I agree to be subject to the I-REC
              Code for Electricity and warrant that the information contained in this application is truthful and
              exhaustive.
            </p>
            <p>
              Any planned changes concerning the information given in this form will be announced in advance to
              the Facility Verifier (if any) and the Issuer. Any unplanned changes will be reported to the Facility
              Verifier (if any) and the Issuer at the first possible occasion.
            </p>
            <p>
              The Production Facility Owner and the Registrant as their agent accept the possibility of unannounced
              control and auditing visits to their own premises and/or the premises of the Production Facility, as
              prescribed in the I-REC Code for Electricity.
            </p>
            <p>
              I confirm that all necessary permissions of the Production Facility Owner have been granted to the
              Registrant and we therefore undertake that, for the same units of electrical energy, our organisation
              will not receive or apply for any certificates or other instruments representing the associated
              renewable or carbon attributes or the calculated displacement (&lsquo;offset&rsquo;) of these attributes from the
              electricity production. We also, to the best of our knowledge, have the right to separate renewable
              attributes from the associated physical electricity generation and are not required by legislation or
              contract to retain these attributes for any reason.
            </p>
          </div>
          <Row label="Signature" />
          <Row label="Name" hint="(BLOCK CAPITALS)" />
          <Row label="Date"><DateCells iso={undefined} /></Row>
        </Page>

        {/* ============ SF-02C — only when registrant is not the owner ============ */}
        {!isOwner && (
          <Page>
            <SectionHead no="1.11" title="SF-02C: Owner's Declaration" />
            <div className="space-y-2 border border-t-0 border-[#333] px-2 py-1.5 italic">
              <p>
                The Production Facility Owner shall, if not the Registrant, be required to submit a declaration confirming that the
                Registrant has been assigned the rights to register the Production Facility. The following approved text should be copied
                onto the Production Facility Owner&rsquo;s headed paper, completed and signed by an officer of the Production Facility Owner.
                It can be scanned and submitted electronically to the Issuer. An Issuer may accept a company stamp as an alternative to
                an authorised representative&rsquo;s signature.
              </p>
              <p>Text within [square brackets] should be replaced with the appropriate content.</p>
            </div>
            <div className="space-y-3 border border-t-0 border-[#333] px-2 py-1.5">
              <p>
                To:&emsp;Evident<br />
                &emsp;&emsp;&emsp;400 Springvale Road<br />
                &emsp;&emsp;&emsp;Sheffield<br />
                &emsp;&emsp;&emsp;S10 1LP<br />
                &emsp;&emsp;&emsp;United Kingdom
              </p>
              <p>Date: [insert date here]</p>
              <p className="font-bold underline">Declaration of Attribute Generation and Ownership</p>
              <p>
                Please accept this letter as granting {orgName || '[insert Registrant organisation name here]'} the exclusive right to act
                in respect of trading all renewable energy attributes (representing the environmental, economic, and
                social benefits associated with the generation of electricity) including all associated carbon attributes
                with {facilityName || '[insert Production Facility name here]'} from [insert Effective Registration Date here] until [further
                notice/[insert end date here]]. The rights to these attributes are in our exclusive ownership at the time
                of signing.
              </p>
              <p>
                We understand that the attributes associated with renewable electricity generation are different and
                distinct from instruments that may be granted under an emissions reduction scheme that have been
                calculated as displacement (&lsquo;offset&rsquo;) against a business as usual case.
              </p>
              <p>
                In granting this permission we accept that the ownership of the associated renewable and carbon
                attributes from the generation of electricity may be passed to [insert Registrant company name here]
                in the form of I REC(E)s as defined in the I-REC Code for Electricity. We have received, or will receive,
                valuable consideration for the delivery of these attributes. We therefore undertake that, for the same
                units of electrical energy, our organisation will not receive or apply for any certificates or other
                instruments representing the associated renewable or carbon attributes or the calculated
                displacement (&lsquo;offset&rsquo;) of these attributes from the electricity production. We also, to the best of our
                knowledge, have the right to separate renewable attributes from the associated physical electricity
                generation and are not required by legislation or contract to retain these attributes for any reason.
              </p>
              <p>Yours sincerely,</p>
              <p className="mt-6">On behalf of [insert owner name here]</p>
            </div>
          </Page>
        )}
      </div>

      <style>{`
        .sf02-doc { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; counter-reset: sf02page; }
        .sf02-doc .doc-page:not(.cover-page):not(.front-page) { counter-increment: sf02page; }
        .sf02-doc .pageno::after { content: counter(sf02page) "/8"; }
        .sf02-doc .doc-table { border-collapse: collapse; width: 100%; }
        .sf02-doc .doc-table td, .sf02-doc .doc-table th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
        .sf02-doc .page-frame { width: 100%; border-collapse: collapse; }
        .sf02-doc .page-frame > thead > tr > td,
        .sf02-doc .page-frame > tbody > tr > td,
        .sf02-doc .page-frame > tfoot > tr > td {
          border: 0;
          padding: 0 2px 0 0;
          vertical-align: top;
        }
        .sf02-doc .doc-page { margin-bottom: 2rem; position: relative; }
        .sf02-doc .sf02-content { position: relative; margin-top: 12px; padding-left: 24px; }
        .sf02-doc .sf02-sidebar {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          position: absolute;
          left: -4px;
          top: 0;
        }
        .sf02-doc .cover-panel { min-height: 400px; }
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { background: white; }
          .sf02-doc .doc-page { break-after: page; margin-bottom: 0; }
          .sf02-doc .doc-page:last-child { break-after: auto; }
          .sf02-doc .page-frame { height: 265mm; }
          .sf02-doc .doc-row { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
