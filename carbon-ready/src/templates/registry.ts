import type { ComponentType } from 'react';
import type { DocumentTemplate } from '../types';
import { TverSF001Pdd } from './TverSF001Pdd';
import { EvidentSF02 } from './EvidentSF02';

export interface OfficialFormMeta {
  component: ComponentType<{ pddId?: string }>;
  /** Badge text on the Registration methodology card. */
  badgeLabel: string;
  /** Button label on the PDD document page. */
  buttonLabel: string;
}

/** Template-per-form registry — single source for route + button + badge. */
export const OFFICIAL_FORMS: Record<DocumentTemplate, OfficialFormMeta> = {
  'T-VER-S-F001-PDD': {
    component: TverSF001Pdd,
    badgeLabel: 'ฟอร์ม อบก.',
    buttonLabel: 'เอกสารฟอร์ม อบก.',
  },
  'EVIDENT-SF-02': {
    component: EvidentSF02,
    badgeLabel: 'ฟอร์ม Evident',
    buttonLabel: 'เอกสารฟอร์ม Evident SF-02',
  },
};
