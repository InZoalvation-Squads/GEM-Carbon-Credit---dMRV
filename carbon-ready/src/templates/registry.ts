import { lazy, type ComponentType } from 'react';
import type { DocumentTemplate } from '../types';
const TverSF001Pdd = lazy(() => import('./TverSF001Pdd').then((module) => ({ default: module.TverSF001Pdd })));
const EvidentSF02 = lazy(() => import('./EvidentSF02').then((module) => ({ default: module.EvidentSF02 })));

export interface OfficialFormMeta {
  component: ComponentType<{ pddId?: string }>;
  /** Badge text on the Registration methodology card. */
  badgeLabel: string;
  /** Button label on the PDD document page. */
  buttonLabel: string;
  /** Repo-relative path to the component source — surfaced on the methodology
   *  detail panel so developers can jump straight into the renderer. */
  componentPath: string;
}

/** Template-per-form registry — single source for route + button + badge. */
export const OFFICIAL_FORMS: Record<DocumentTemplate, OfficialFormMeta> = {
  'T-VER-S-F001-PDD': {
    component: TverSF001Pdd,
    badgeLabel: 'ฟอร์ม อบก.',
    buttonLabel: 'เอกสารฟอร์ม อบก.',
    componentPath: 'carbon-ready/src/templates/TverSF001Pdd.tsx',
  },
  'EVIDENT-SF-02': {
    component: EvidentSF02,
    badgeLabel: 'ฟอร์ม Evident',
    buttonLabel: 'เอกสารฟอร์ม Evident SF-02',
    componentPath: 'carbon-ready/src/templates/EvidentSF02.tsx',
  },
};
