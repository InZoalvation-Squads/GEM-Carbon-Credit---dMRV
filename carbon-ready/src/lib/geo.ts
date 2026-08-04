export function locationToCountryCode(s: string): string {
  const map: Record<string, string> = { India: 'IN', Thailand: 'TH', Vietnam: 'VN' };
  if (map[s]) return map[s];
  // Projects created from the IoT registry carry free-text Thai addresses
  // ("ตำบลเนินทราย อำเภอเมืองตราด ตราด 23000") with no comma and no English
  // country segment — Thai script in the location means Thailand.
  if (/[\u0E00-\u0E7F]/.test(s)) return 'TH';
  return s;
}
