// Wipe ALL project data (projects + every dependent row) from the company DB.
//
//   node scripts/wipe-projects.mjs --yes
//
// Deletes: guardian_tokens, credentials, verification_comments,
//          verification_requests, monitoring_records, evidence_files, pdds, projects
// Keeps:   users/orgs, methodologies, emission_factors, audit_log (hash chain
//          must stay intact), app_state (on-chain token ids + ERC-1155 counter)
import { PrismaClient } from '@prisma/client';

if (!process.argv.includes('--yes')) {
  console.error('Refusing to run without --yes (this deletes ALL projects).');
  process.exit(1);
}

const prisma = new PrismaClient();
const before = {
  projects: await prisma.project.count(),
  pdds: await prisma.pdd.count(),
  evidence: await prisma.evidenceFile.count(),
  verifications: await prisma.verificationRequest.count(),
  credentials: await prisma.credential.count(),
  tokens: await prisma.guardianToken.count(),
};
console.log('before:', JSON.stringify(before));

await prisma.$transaction([
  prisma.guardianToken.deleteMany(),
  prisma.credential.deleteMany(),
  prisma.verificationComment.deleteMany(),
  prisma.verificationRequest.deleteMany(),
  prisma.monitoringRecord.deleteMany(),
  prisma.evidenceFile.deleteMany(),
  prisma.pdd.deleteMany(),
  prisma.project.deleteMany(),
]);

console.log('✅ wiped. remaining projects:', await prisma.project.count(),
  '| kept — users:', await prisma.user.count(),
  'methodologies:', await prisma.methodology.count(),
  'factors:', await prisma.emissionFactor.count(),
  'app_state:', await prisma.appState.count());
await prisma.$disconnect();
