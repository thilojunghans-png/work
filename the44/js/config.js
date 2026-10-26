// Stammdaten, Kategorien und Vorlagen der App.

export const PROPERTY_DEFAULTS = {
  name: 'THE44',
  address: '',
  unit: '',
  sizeM2: null,
  rooms: null,
  purchasePrice: null,
  buildingSharePct: 80,
  contractDate: '',
  handoverDate: '',
  developer: '',
  afaMethod: 'linear',
  afaRate: 3,
  note: '',
};

export const TAX_CLASSES = {
  anschaffung: 'Anschaffungskosten (AfA)',
  werbungskosten: 'Werbungskosten (sofort)',
  einnahme: 'Einnahme V+V',
  neutral: 'Steuerlich neutral',
  pruefen: 'Prüfen (Steuerberater)',
};

// kind: expense | income, tax: Standard-Zuordnung für die Anlage V
export const CATEGORIES = [
  { id: 'kaufpreis', label: 'Kaufpreisrate (MaBV)', kind: 'expense', tax: 'anschaffung', group: 'Kauf & Bau' },
  { id: 'grest', label: 'Grunderwerbsteuer', kind: 'expense', tax: 'anschaffung', group: 'Kauf & Bau' },
  { id: 'notar_kauf', label: 'Notar & Grundbuch (Kauf)', kind: 'expense', tax: 'anschaffung', group: 'Kauf & Bau' },
  { id: 'makler', label: 'Makler / Vermittlung', kind: 'expense', tax: 'anschaffung', group: 'Kauf & Bau' },
  { id: 'sonderwunsch', label: 'Sonderwünsche / Ausstattung', kind: 'expense', tax: 'anschaffung', group: 'Kauf & Bau' },
  { id: 'kueche', label: 'Einbauküche / Inventar', kind: 'expense', tax: 'pruefen', group: 'Kauf & Bau', hint: 'Einbauküchen werden i. d. R. separat über 10 Jahre abgeschrieben.' },

  { id: 'notar_grundschuld', label: 'Notar & Grundbuch (Grundschuld)', kind: 'expense', tax: 'werbungskosten', group: 'Finanzierung' },
  { id: 'bereitstellung', label: 'Bereitstellungszinsen', kind: 'expense', tax: 'werbungskosten', group: 'Finanzierung' },
  { id: 'zinsen', label: 'Darlehenszinsen', kind: 'expense', tax: 'werbungskosten', group: 'Finanzierung' },
  { id: 'finanzierung_nk', label: 'Bankgebühren / Schätzung', kind: 'expense', tax: 'werbungskosten', group: 'Finanzierung' },
  { id: 'tilgung', label: 'Tilgung', kind: 'expense', tax: 'neutral', group: 'Finanzierung' },

  { id: 'hausgeld_umlage', label: 'Hausgeld (umlagefähig)', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'hausgeld_nicht', label: 'Hausgeld (nicht umlagefähig)', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'ruecklage', label: 'Erhaltungsrücklage', kind: 'expense', tax: 'neutral', group: 'Laufende Kosten', hint: 'Zuführungen zur Rücklage sind erst bei Verwendung abziehbar.' },
  { id: 'grundsteuer', label: 'Grundsteuer', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'versicherung', label: 'Versicherungen', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'verwaltung', label: 'Mietverwaltung (SE)', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'instandhaltung', label: 'Reparatur / Instandhaltung', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'steuerberatung', label: 'Steuerberatung', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'fahrt', label: 'Fahrtkosten', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'konto', label: 'Kontoführung / Porto / Büro', kind: 'expense', tax: 'werbungskosten', group: 'Laufende Kosten' },
  { id: 'kaution_rueck', label: 'Kaution zurückgezahlt', kind: 'expense', tax: 'neutral', group: 'Laufende Kosten' },
  { id: 'sonst_ausgabe', label: 'Sonstige Ausgabe', kind: 'expense', tax: 'pruefen', group: 'Laufende Kosten' },

  { id: 'miete_kalt', label: 'Kaltmiete', kind: 'income', tax: 'einnahme', group: 'Einnahmen' },
  { id: 'miete_nk', label: 'Nebenkostenvorauszahlung', kind: 'income', tax: 'einnahme', group: 'Einnahmen' },
  { id: 'nk_nachzahlung', label: 'NK-Nachzahlung Mieter', kind: 'income', tax: 'einnahme', group: 'Einnahmen' },
  { id: 'hausgeld_erstattung', label: 'Hausgeld-Erstattung (Abrechnung)', kind: 'income', tax: 'einnahme', group: 'Einnahmen' },
  { id: 'kaution', label: 'Mietkaution erhalten', kind: 'income', tax: 'neutral', group: 'Einnahmen' },
  { id: 'darlehen', label: 'Darlehensauszahlung', kind: 'income', tax: 'neutral', group: 'Einnahmen' },
  { id: 'sonst_einnahme', label: 'Sonstige Einnahme', kind: 'income', tax: 'pruefen', group: 'Einnahmen' },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catById = (id) => CAT_MAP[id] || { id, label: id || 'Ohne Kategorie', kind: 'expense', tax: 'pruefen' };

export const DOC_CATEGORIES = [
  'Kaufvertrag',
  'Baubeschreibung',
  'Pläne & Grundrisse',
  'Teilungserklärung',
  'Finanzierung',
  'Bauträger',
  'Abnahme & Übergabe',
  'WEG & Verwaltung',
  'Mietvertrag',
  'Versicherung',
  'Steuer',
  'Belege',
  'Mängel & Aufgaben',
  'Sonstiges',
];

export const TASK_KINDS = { aufgabe: 'Aufgabe', termin: 'Termin', mangel: 'Mangel' };
export const TASK_STATUS = { offen: 'Offen', gemeldet: 'Gemeldet', erledigt: 'Erledigt' };

export const CONTACT_ROLES = [
  'Bauträger',
  'Vertrieb / Berater',
  'Notar',
  'Bank',
  'WEG-Verwaltung',
  'Mietverwaltung',
  'Mieter',
  'Steuerberater',
  'Gutachter',
  'Handwerker',
  'Versicherung',
  'Sonstige',
];

export const PAYMENT_STATUS = { offen: 'Ausstehend', abgerufen: 'Abgerufen', bezahlt: 'Bezahlt' };

// Ratenplan nach § 3 Abs. 2 MaBV (max. 7 Raten – einzelne Positionen können zusammengefasst werden)
export const MABV_PLAN = [
  { label: 'Beginn der Erdarbeiten', pct: 30 },
  { label: 'Rohbaufertigstellung inkl. Zimmererarbeiten', pct: 28 },
  { label: 'Dachflächen und Dachrinnen', pct: 5.6 },
  { label: 'Rohinstallation Heizung', pct: 2.1 },
  { label: 'Rohinstallation Sanitär', pct: 2.1 },
  { label: 'Rohinstallation Elektro', pct: 2.1 },
  { label: 'Fenstereinbau inkl. Verglasung', pct: 7 },
  { label: 'Innenputz (ohne Beiputzarbeiten)', pct: 4.2 },
  { label: 'Estrich', pct: 2.1 },
  { label: 'Fliesenarbeiten im Sanitärbereich', pct: 2.8 },
  { label: 'Bezugsfertigkeit / Besitzübergabe', pct: 8.4 },
  { label: 'Fassadenarbeiten', pct: 2.1 },
  { label: 'Vollständige Fertigstellung', pct: 3.5 },
];
