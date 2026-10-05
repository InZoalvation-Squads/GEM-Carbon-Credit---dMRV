/** Cache the same promise for intent prefetch and React.lazy, including repeated focus. */
export function once<T>(loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => promise ??= loader();
}

export const routeLoaders = {
  Register: once(() => import('./pages/Register').then((module) => ({ default: module.Register }))),
  HowItWorks: once(() => import('./pages/HowItWorks').then((module) => ({ default: module.HowItWorks }))),
  Projects: once(() => import('./pages/Projects').then((module) => ({ default: module.Projects }))),
  ProjectDetail: once(() => import('./pages/ProjectDetail').then((module) => ({ default: module.ProjectDetail }))),
  UploadPage: once(() => import('./pages/Upload').then((module) => ({ default: module.UploadPage }))),
  IotMapping: once(() => import('./pages/IotMapping').then((module) => ({ default: module.IotMapping }))),
  Calculations: once(() => import('./pages/Calculations').then((module) => ({ default: module.Calculations }))),
  EmissionFactors: once(() => import('./pages/EmissionFactors').then((module) => ({ default: module.EmissionFactors }))),
  AuditLogPage: once(() => import('./pages/AuditLog').then((module) => ({ default: module.AuditLogPage }))),
  Verifications: once(() => import('./pages/Verifications').then((module) => ({ default: module.Verifications }))),
  ReviewDetail: once(() => import('./pages/ReviewDetail').then((module) => ({ default: module.ReviewDetail }))),
  RecIssuance: once(() => import('./pages/RecIssuance').then((module) => ({ default: module.RecIssuance }))),
  RecIssueOfficialForm: once(() => import('./templates/RecIssueOfficialForm').then((module) => ({ default: module.RecIssueOfficialForm }))),
  RecRoi: once(() => import('./pages/RecRoi').then((module) => ({ default: module.RecRoi }))),
  Guardian: once(() => import('./pages/Guardian').then((module) => ({ default: module.Guardian }))),
  Methodologies: once(() => import('./pages/Methodologies').then((module) => ({ default: module.Methodologies }))),
  Registration: once(() => import('./pages/Registration').then((module) => ({ default: module.Registration }))),
  PddDocument: once(() => import('./pages/PddDocument').then((module) => ({ default: module.PddDocument }))),
  OfficialForm: once(() => import('./templates/OfficialForm').then((module) => ({ default: module.OfficialForm }))),
  ValidationQueue: once(() => import('./pages/ValidationQueue').then((module) => ({ default: module.ValidationQueue }))),
  ValidationDetail: once(() => import('./pages/ValidationDetail').then((module) => ({ default: module.ValidationDetail }))),
};

/** Exact sidebar destinations; eager Dashboard needs no additional import. */
const sidebarLoaders: Record<string, keyof typeof routeLoaders> = {
  '/methodologies': 'Methodologies',
  '/registration': 'Registration',
  '/validation': 'ValidationQueue',
  '/how-it-works': 'HowItWorks',
  '/projects': 'Projects',
  '/upload': 'UploadPage',
  '/iot': 'IotMapping',
  '/calculations': 'Calculations',
  '/emission-factors': 'EmissionFactors',
  '/verifications': 'Verifications',
  '/rec-issuance': 'RecIssuance',
  '/rec-roi': 'RecRoi',
  '/guardian': 'Guardian',
  '/audit-log': 'AuditLogPage',
};

export function prefetchRoute(path: string): void {
  // Prefetch is an optimisation; a rejected import still reaches the route boundary.
  const name = sidebarLoaders[path];
  if (name) void routeLoaders[name]().catch(() => undefined);
}
