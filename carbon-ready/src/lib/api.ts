import { useStore } from '../store';
import { parseAndValidateCsv } from './csv';
import { calculateCarbon } from './calc';
import { locationToCountryCode } from './geo';
import { toast } from '../components/layout/Toast';
import { formatNumber } from './format';
import { serverMode, pddsApi, credentialsApi, verificationsApi, recIssuesApi } from './server-api';
import { issueCredential, buildPddSubject, buildApprovalSubject, mintGuardianToken, projectTopicId } from './guardian';
import { PDD_REGISTRATION_SCHEMA_V1, MRV_APPROVAL_SCHEMA_V1 } from './guardian-schema';
import { issuerIdentity } from './identity';
import type {
  Project, EmissionFactor, MonitoringRecord, CsvValidationResult, UUID,
  EvidenceFile, VerificationRequest, EvidenceCategory,
  Methodology, ProjectDesignDocument, GuardianToken, RecIssueRequest,
  RecIssueDraftPatch,
} from '../types';

const tick = <T>(value: T, ms = 120): Promise<T> =>
  new Promise((res) => setTimeout(() => res(value), ms));

export const api = {
  async listProjects(): Promise<Project[]> {
    return tick(useStore.getState().projects);
  },
  async getProject(id: UUID): Promise<Project | undefined> {
    return tick(useStore.getState().projects.find((p) => p.id === id));
  },
  // `await` on the store write actions: in server mode they return a promise
  // carrying the SERVER entity (typed as the demo shape — see dual() in
  // src/store/index.ts); awaiting is a no-op for the plain demo value.
  async createProject(input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id' | 'lifecycle_stage'>): Promise<Project> {
    const project = await useStore.getState().createProject(input);
    toast.success('Project created', project.name);
    return tick(project);
  },
  async updateProject(id: UUID, patch: Partial<Project>): Promise<Project | undefined> {
    const project = await useStore.getState().updateProject(id, patch);
    toast.success('Project updated', project?.name);
    return tick(project);
  },

  async uploadMonitoringCsv(project_id: UUID, csvText: string): Promise<CsvValidationResult & { uploaded_at: string }> {
    const state = useStore.getState();
    const existing = state.records.filter((r) => r.project_id === project_id).map((r) => r.record_date);
    const result = parseAndValidateCsv(csvText, existing);
    if (result.accepted.length > 0) {
      // Server mode: resolves after the POST + stamped-row re-fetch land.
      await state.addMonitoringRecords(project_id, result.accepted);
    }
    // No-op in server mode — the server audits CSV_UPLOADED transactionally.
    state.audit_write('CSV_UPLOADED', 'monitoring', project_id, {
      accepted: result.accepted.length,
      rejected: result.rejected.length,
    });
    if (result.accepted.length === 0) {
      toast.error('No rows imported', `${result.rejected.length} row(s) rejected — check the file format.`);
    } else {
      toast.success(
        `${result.accepted.length} record(s) imported`,
        result.rejected.length ? `${result.rejected.length} row(s) rejected.` : 'All rows passed validation.',
      );
    }
    return tick({ ...result, uploaded_at: new Date().toISOString() });
  },

  async listMonitoring(project_id: UUID): Promise<MonitoringRecord[]> {
    return tick(useStore.getState().records.filter((r) => r.project_id === project_id));
  },

  async calculate(project_id: UUID, range?: { from?: string; to?: string }) {
    const state = useStore.getState();
    const project = state.projects.find((p) => p.id === project_id);
    if (!project) throw new Error('Project not found');
    const pdd = state.pddByProject(project_id);
    const methodology = state.methodologies.find((m) => m.id === pdd?.methodology_id);
    const calculation = methodology?.calculation;
    const country = locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
    const factors = state.factors.filter((f) => f.country === country);
    const records = state.records.filter((r) => r.project_id === project_id);
    const result = calculateCarbon(records, factors, range, calculation);
    state.audit_write('CALCULATION_EXECUTED', 'calculation', project_id, {
      emission_factor_id: result.emission_factor_id,
      generation_kwh: result.totals.generation_kwh,
      reduction_kgco2e: result.totals.reduction_kgco2e,
    });
    toast.success('Calculation complete', `${formatNumber(result.totals.reduction_tco2e, 2)} tCO₂e reduction`);
    return tick(result);
  },

  async listFactors(): Promise<EmissionFactor[]> {
    return tick(useStore.getState().factors);
  },
  async addFactor(input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>): Promise<EmissionFactor> {
    const factor = await useStore.getState().addEmissionFactor(input);
    toast.success('Emission factor added', `${factor.country} · ${factor.source} v${factor.version}`);
    return tick(factor);
  },

  // ---------------- Sprint 2: Evidence ----------------
  async listEvidence(project_id: UUID): Promise<EvidenceFile[]> {
    return tick(useStore.getState().evidence.filter((e) => e.project_id === project_id));
  },
  async uploadEvidence(
    project_id: UUID,
    input: { file_name: string; kind: EvidenceFile['kind']; file_size: number; category: EvidenceCategory; description?: string; content_hash?: string }
  ): Promise<EvidenceFile> {
    const file = useStore.getState().uploadEvidence(project_id, input);
    toast.success('Evidence uploaded', file.file_name);
    return tick(file);
  },
  async replaceEvidence(evidence_id: UUID, input: { file_name?: string; file_size: number; content_hash?: string }): Promise<EvidenceFile | undefined> {
    const file = useStore.getState().replaceEvidence(evidence_id, input);
    toast.success('New version uploaded', file ? `${file.file_name} · v${file.version_number}` : undefined);
    return tick(file);
  },
  async archiveEvidence(evidence_id: UUID): Promise<void> {
    useStore.getState().archiveEvidence(evidence_id);
    toast.info('Evidence archived');
    return tick(undefined);
  },

  // ---------------- Sprint 2: Verification ----------------
  async listVerifications(): Promise<VerificationRequest[]> {
    return tick(useStore.getState().verifications);
  },
  async getVerification(id: UUID): Promise<VerificationRequest | undefined> {
    return tick(useStore.getState().verifications.find((v) => v.id === id));
  },
  async requestVerification(input: {
    project_id: UUID; monitoring_period_start: string; monitoring_period_end: string;
    reduction_kgco2e: number; factors_snapshot: string; evidence_ids: UUID[];
  }): Promise<void> {
    if (serverMode()) {
      const created = await verificationsApi.create(input);
      useStore.getState().applyServerVerification(await verificationsApi.submit(created.id));
      toast.success('Verification requested', 'Package submitted to the review queue.');
      return;
    }
    const created = useStore.getState().createVerification(input);
    useStore.getState().submitVerification(created.id);
    toast.success('Verification requested', 'Package submitted to the review queue.');
    return tick(undefined);
  },

  async submitVerification(id: UUID): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerVerification(await verificationsApi.submit(id));
      toast.success('Verification submitted', 'Sent to the review queue.');
      return;
    }
    useStore.getState().submitVerification(id);
    toast.success('Verification submitted', 'Sent to the review queue.');
    return tick(undefined);
  },
  async startReview(id: UUID): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerVerification(await verificationsApi.startReview(id));
      toast.info('Review started');
      return;
    }
    useStore.getState().startReview(id);
    toast.info('Review started');
    return tick(undefined);
  },
  async requestRevision(id: UUID, summary: string): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerVerification(await verificationsApi.requestRevision(id, summary));
      toast.info('Revision requested', 'Returned to the project owner.');
      return;
    }
    useStore.getState().requestRevision(id, summary);
    toast.info('Revision requested', 'Returned to the project owner.');
    return tick(undefined);
  },
  async approveVerification(id: UUID, note?: string): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerVerification(await verificationsApi.approve(id, note));
      toast.success('Verification approved', 'Package locked and hash-sealed.');
      return;
    }
    useStore.getState().approveVerification(id, note);
    toast.success('Verification approved', 'Package locked and hash-sealed.');
    return tick(undefined);
  },
  async rejectVerification(id: UUID, reason: string): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerVerification(await verificationsApi.reject(id, reason));
      toast.error('Verification rejected', reason);
      return;
    }
    useStore.getState().rejectVerification(id, reason);
    toast.error('Verification rejected', reason);
    return tick(undefined);
  },

  async addVerificationComment(id: UUID, body: string, evidence?: { id: UUID; name: string }): Promise<void> {
    if (serverMode()) {
      const comment = await verificationsApi.addComment(id, body, evidence?.id);
      useStore.getState().ingestComment(comment);
      return;
    }
    useStore.getState().addComment(id, body, evidence);
    return tick(undefined, 60);
  },

  // ---------------- SF-04: REC issuance (I-REC(E) Issue Requests) ----------------
  async listRecIssues(): Promise<RecIssueRequest[]> {
    if (serverMode()) return recIssuesApi.list();
    return tick(useStore.getState().recIssues);
  },
  async createRecIssue(input: {
    project_id: UUID; period_start: string; period_end: string;
    request_type: 'Normal' | 'Self consumption'; applied_mwh?: number;
    receiving_org_name?: string; receiving_account_id?: string;
    facility_id?: string; requested_labels?: string; evidence_ids?: UUID[];
  }): Promise<RecIssueRequest> {
    if (serverMode()) {
      const { project_id, ...body } = input;
      const r = await recIssuesApi.create(project_id, body);
      useStore.getState().applyServerRecIssue(r);
      toast.success('Issue request created', 'Draft saved.');
      return r;
    }
    const r = useStore.getState().createRecIssue(input);
    toast.success('Issue request created', 'Draft saved.');
    return tick(r);
  },
  /** Resolves true when the draft was updated; false when the demo store
   *  refused (non-draft row) — so callers can stop a save-then-submit chain.
   *  Server mode throws on rejection instead. */
  async updateRecIssue(id: UUID, patch: RecIssueDraftPatch): Promise<boolean> {
    if (serverMode()) {
      useStore.getState().applyServerRecIssue(await recIssuesApi.update(id, patch));
      toast.success('Issue request updated', 'Draft saved.');
      return true;
    }
    const r = useStore.getState().updateRecIssue(id, patch);
    if (!r) {
      toast.error('Cannot update', 'Only draft issue requests can be edited.');
      return tick(false);
    }
    toast.success('Issue request updated', 'Draft saved.');
    return tick(true);
  },
  async submitRecIssue(id: UUID): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerRecIssue(await recIssuesApi.submit(id));
      toast.success('Issue request submitted', 'Sent to the Local Issuer for review.');
      return;
    }
    if (!useStore.getState().submitRecIssue(id)) {
      toast.error('Cannot submit', 'Only draft issue requests can be submitted.');
      return tick(undefined);
    }
    toast.success('Issue request submitted', 'Sent to the Local Issuer for review.');
    return tick(undefined);
  },
  async approveRecIssue(id: UUID): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerRecIssue(await recIssuesApi.approve(id));
      toast.success('REC certificates issued', 'Issue request approved.');
      return;
    }
    useStore.getState().approveRecIssue(id);
    toast.success('REC certificates issued', 'Issue request approved.');
    return tick(undefined);
  },
  async rejectRecIssue(id: UUID, reason: string): Promise<void> {
    if (serverMode()) {
      useStore.getState().applyServerRecIssue(await recIssuesApi.reject(id, reason));
      toast.error('Issue request rejected', reason);
      return;
    }
    useStore.getState().rejectRecIssue(id, reason);
    toast.error('Issue request rejected', reason);
    return tick(undefined);
  },
  async deleteRecIssue(id: UUID): Promise<void> {
    if (serverMode()) {
      await recIssuesApi.remove(id);
      useStore.setState((s) => ({ recIssues: s.recIssues.filter((r) => r.id !== id) }));
      toast.info('Issue request deleted');
      return;
    }
    useStore.getState().deleteRecIssue(id);
    toast.info('Issue request deleted');
    return tick(undefined);
  },

  // ---------------- Sprint 3: Guardian anchoring ----------------
  async anchorVerification(id: UUID): Promise<void> {
    if (serverMode()) {
      try {
        const st = useStore.getState();
        const v = st.verifications.find((x) => x.id === id);
        if (!v || !v.hash_value) return;
        const topic_id = projectTopicId(v.project_id);
        const sequenceNumber = st.credentials.filter((c) => c.hcs.topic_id === topic_id).length + 1;
        const vc = issueCredential(
          buildApprovalSubject(v, st.evidence), v.hash_value, sequenceNumber,
          { ...st.guardianConfig, topic_id }, MRV_APPROVAL_SCHEMA_V1,
          new Date().toISOString(), issuerIdentity(st.organization.id),
        );
        const res = await credentialsApi.anchorVerification(id, vc);
        st.applyServerVerificationAnchor(res.verification, res.credential);
        if (res.credential.anchor) {
          toast.success('Anchored to Hedera', `HCS topic ${res.credential.anchor.topic_id} · message #${res.credential.anchor.sequence_number}`);
        } else {
          toast.success('Credential stored', 'On-chain anchor pending — retry from the Guardian page.');
        }
      } catch (err) {
        toast.error('Cannot anchor', err instanceof Error ? err.message : 'Server rejected the credential.');
      }
      return;
    }
    useStore.getState().anchorVerification(id);
    toast.success('Anchored to Hedera Guardian', 'Verifiable Credential issued.');
    return tick(undefined);
  },

  async mintToken(credential_id: UUID): Promise<GuardianToken | null> {
    if (serverMode()) {
      try {
        const st = useStore.getState();
        const credential = st.credentials.find((c) => c.id === credential_id);
        if (!credential || st.tokens.some((t) => t.credential_id === credential_id)) return null;
        // Browser assembles the token (endpoint contract); the server replaces
        // token_id/serial with the REAL HTS mint before persisting.
        const draft = mintGuardianToken(credential, st.tokens.length + 1, st.currentUser.role, st.guardianConfig, new Date().toISOString());
        const token = await credentialsApi.mint(credential_id, draft);
        st.applyServerMint(token);
        toast.success('VCU minted on Hedera', `HTS token ${token.token_id} · serial #${token.serial_number}`);
        return token;
      } catch (err) {
        toast.error('Cannot mint', err instanceof Error ? err.message : 'Server rejected the mint.');
        return null;
      }
    }
    const token = useStore.getState().mintToken(credential_id);
    if (token) toast.success('VCU token minted', `${token.token_id} · serial #${token.serial_number}`);
    return tick(token);
  },

  // ---------------- Registration: Gate 1 ----------------
  async listMethodologies(): Promise<Methodology[]> {
    return tick(useStore.getState().methodologies);
  },
  async getMethodology(id: UUID): Promise<Methodology | undefined> {
    return tick(useStore.getState().methodologies.find((m) => m.id === id));
  },
  async listPdds(): Promise<ProjectDesignDocument[]> {
    return tick(useStore.getState().pdds);
  },
  async getPdd(id: UUID): Promise<ProjectDesignDocument | undefined> {
    return tick(useStore.getState().pdds.find((p) => p.id === id));
  },
  async selectMethodology(project_id: UUID, methodology_id: UUID): Promise<ProjectDesignDocument> {
    if (serverMode()) {
      const pdd = await pddsApi.selectMethodology(project_id, methodology_id);
      useStore.getState().applyServerPdd(pdd);
      return pdd;
    }
    return tick(useStore.getState().selectMethodology(project_id, methodology_id));
  },
  async savePddDraft(pdd_id: UUID, section_data: Record<string, unknown>, evidence_ids: UUID[]): Promise<void> {
    if (serverMode()) {
      const pdd = await pddsApi.saveDraft(pdd_id, section_data, evidence_ids);
      useStore.getState().applyServerPdd(pdd);
      return;
    }
    useStore.getState().savePddDraft(pdd_id, section_data, evidence_ids);
    return tick(undefined, 60);
  },
  async submitPdd(pdd_id: UUID): Promise<void> {
    if (serverMode()) {
      const pdd = await pddsApi.submit(pdd_id);
      useStore.getState().applyServerPdd(pdd);
      toast.success('PDD submitted', 'Sent to the validation queue.');
      return;
    }
    useStore.getState().submitPdd(pdd_id);
    toast.success('PDD submitted', 'Sent to the validation queue.');
    return tick(undefined);
  },
  async startValidation(pdd_id: UUID): Promise<void> {
    if (serverMode()) {
      const pdd = await pddsApi.startValidation(pdd_id);
      useStore.getState().applyServerPdd(pdd);
      toast.info('Validation started');
      return;
    }
    useStore.getState().startValidation(pdd_id);
    toast.info('Validation started');
    return tick(undefined);
  },
  async requestPddRevision(pdd_id: UUID, summary: string): Promise<void> {
    if (serverMode()) {
      const pdd = await pddsApi.requestRevision(pdd_id, summary);
      useStore.getState().applyServerPdd(pdd);
      toast.info('Revision requested', 'Returned to the project proponent.');
      return;
    }
    useStore.getState().requestPddRevision(pdd_id, summary);
    toast.info('Revision requested', 'Returned to the project proponent.');
    return tick(undefined);
  },
  async registerProject(pdd_id: UUID): Promise<boolean> {
    if (serverMode()) {
      // Server-authoritative registration: the server freezes hash/CID and
      // keeps salt custody; the BROWSER signs the Registration VC (keys never
      // leave the client); the server persists it and anchors it on the REAL
      // Hedera topic — the returned credential carries live coordinates.
      try {
        const st = useStore.getState();
        let reg;
        try {
          reg = await pddsApi.register(pdd_id);
        } catch (err) {
          // Heal sessions that flipped to under_validation locally before the
          // Gate-1 cutover: take the package server-side, then retry once.
          if (err instanceof Error && err.message.includes('"submitted"')) {
            await pddsApi.startValidation(pdd_id);
            reg = await pddsApi.register(pdd_id);
          } else {
            throw err;
          }
        }
        const { pdd: frozen, disclosure } = reg;
        const topic_id = projectTopicId(frozen.project_id);
        const sequenceNumber = st.credentials.filter((c) => c.hcs.topic_id === topic_id).length + 1;
        const vc = issueCredential(
          buildPddSubject(frozen, st.evidence, frozen.ipfs_cid ?? '', disclosure),
          frozen.content_hash ?? '', sequenceNumber, { ...st.guardianConfig, topic_id },
          PDD_REGISTRATION_SCHEMA_V1, frozen.validated_at ?? new Date().toISOString(),
          issuerIdentity(st.organization.id),
        );
        const res = await credentialsApi.anchorPddCredential(pdd_id, vc);
        st.applyServerRegistration(res.pdd, res.credential);
        if (res.credential.anchor) {
          toast.success('Project registered · anchored to Hedera',
            `HCS topic ${res.credential.anchor.topic_id} · message #${res.credential.anchor.sequence_number}`);
        } else {
          toast.success('Project registered', 'On-chain anchor pending — retry from the Guardian page.');
        }
        return true;
      } catch (err) {
        toast.error('Cannot register', err instanceof Error ? err.message : 'Server rejected the registration.');
        return false;
      }
    }
    const ok = useStore.getState().registerProject(pdd_id);
    if (ok) toast.success('Project registered', 'dMRV is now unlocked for this project.');
    else toast.error('Cannot register', 'PDD is incomplete — required fields are missing.');
    return tick(ok);
  },
  async rejectPdd(pdd_id: UUID, reason: string): Promise<void> {
    if (serverMode()) {
      const pdd = await pddsApi.reject(pdd_id, reason);
      useStore.getState().applyServerPdd(pdd);
      toast.error('PDD rejected', reason);
      return;
    }
    useStore.getState().rejectPdd(pdd_id, reason);
    toast.error('PDD rejected', reason);
    return tick(undefined);
  },
  async addPddComment(pdd_id: UUID, body: string, section_key?: string): Promise<void> {
    if (serverMode()) {
      const comment = await pddsApi.addComment(pdd_id, body, section_key);
      useStore.getState().ingestComment(comment);
      return;
    }
    useStore.getState().addPddComment(pdd_id, body, section_key);
    return tick(undefined, 60);
  },
};
