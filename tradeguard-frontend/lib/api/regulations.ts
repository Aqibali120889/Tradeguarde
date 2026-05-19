import { Regulation } from './types'

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MOCK_REGULATIONS: Regulation[] = [
  {
    id: 'REG-EU-2026-041',
    title: 'EU Aluminum Import Tariff Update',
    jurisdiction: 'European Union',
    category: 'Tariffs',
    effectiveDate: '2026-07-01',
    impactLevel: 'warning',
    affectedHsCodes: ['7601.10', '7601.20', '7604.10'],
    summary: '15% tariff increase on primary aluminum from APAC region under EU trade defense measures.',
    source: 'EUR-Lex',
  },
  {
    id: 'REG-US-2026-BIS-018',
    title: 'US BIS Advanced Semiconductor Controls',
    jurisdiction: 'United States',
    category: 'Export Controls',
    effectiveDate: '2026-06-15',
    impactLevel: 'critical',
    affectedHsCodes: ['8542.31', '8542.32', '8473.30'],
    summary: 'Expanded export control requirements for advanced AI chips and semiconductor equipment to restricted destinations.',
    source: 'Federal Register',
  },
  {
    id: 'REG-UAE-2026-009',
    title: 'UAE Free Zone Re-export Restrictions',
    jurisdiction: 'United Arab Emirates',
    category: 'Re-export Controls',
    effectiveDate: '2026-08-01',
    impactLevel: 'warning',
    affectedHsCodes: ['8471.30', '8517.62'],
    summary: 'New compliance requirements for technology goods transiting UAE free zones destined for restricted regions.',
    source: 'UAE Ministry of Economy',
  },
]

// ─── API Function ─────────────────────────────────────────────────────────────

export async function fetchRegulations(): Promise<Regulation[]> {
  await new Promise(r => setTimeout(r, 380))
  return MOCK_REGULATIONS
}
