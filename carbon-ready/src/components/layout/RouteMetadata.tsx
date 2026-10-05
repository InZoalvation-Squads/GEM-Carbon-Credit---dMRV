import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function pageTitle(path: string): string {
  if (path === '/login') return 'Login';
  if (path === '/register') return 'Register';
  if (/^\/registration\/[^/]+\/official$/.test(path)) return 'Official Form';
  if (/^\/registration\/[^/]+\/document$/.test(path)) return 'Project Design Document';
  if (/^\/rec-issuance\/[^/]+\/official$/.test(path)) return 'REC Issue Official Form';
  if (/^\/projects\/[^/]+$/.test(path)) return 'Project Detail';
  if (/^\/verifications\/[^/]+$/.test(path)) return 'Review Detail';
  if (/^\/validation\/[^/]+$/.test(path)) return 'Validation Detail';
  if (path === '/reports/investor') return 'Investor Report';
  if (/^\/reports\/investor\/[^/]+$/.test(path)) return 'Investor Report';
  const titles: Record<string, string> = {
    dashboard: 'Dashboard', 'how-it-works': 'How it works', methodologies: 'Methodologies',
    registration: 'Register Project', validation: 'Validation Queue', projects: 'Projects',
    upload: 'Upload', iot: 'IoT Mapping', calculations: 'Calculations',
    'emission-factors': 'Emission Factors', verifications: 'Verifications',
    'rec-issuance': 'REC Issuance', 'rec-roi': 'REC ROI', guardian: 'Guardian', 'audit-log': 'Audit Log',
  };
  return titles[path.split('/')[1]] ?? 'Page not found';
}

/** Language annotations follow rendered content, including lazy route arrivals. */
export function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${pageTitle(pathname)} · GEM Carbon Credit`;
    if (pathname !== '/login') document.documentElement.lang = 'en';
    const root = document.getElementById('root');
    if (!root) return;
    const annotations = new Map<HTMLElement, string | null>();
    const restoreAnnotations = () => {
      annotations.forEach((lang, element) => { if (lang === null) element.removeAttribute('lang'); else element.lang = lang; });
      annotations.clear();
    };
    const markLanguage = () => {
      restoreAnnotations();
      const content = document.getElementById('content') ?? root;
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let thai = 0;
      let latin = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, [aria-hidden="true"]')) continue;
        const text = node.textContent ?? '';
        const count = (text.match(/[\u0e00-\u0e7f]/g) ?? []).length;
        thai += count;
        latin += (text.match(/[A-Za-z]/g) ?? []).length;
        if (count && !annotations.has(parent)) { annotations.set(parent, parent.getAttribute('lang')); parent.lang = 'th'; }
      }
      // Login explicitly follows its working language toggle.
      if (pathname !== '/login') document.documentElement.lang = thai > latin ? 'th' : 'en';
    };
    markLanguage();
    const observer = new MutationObserver(markLanguage);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); restoreAnnotations(); };
  }, [pathname]);
  return null;
}
