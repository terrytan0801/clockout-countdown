// Public holidays, so the app doesn't count down (or break anyone's streak) on a day off.
// Each person picks a list in their account. Add next year's dates when they're announced.
// Singapore: Ministry of Manpower (mom.gov.sg). A holiday on a Sunday makes the Monday a holiday too.
// Malaysia: national holidays plus Kuala Lumpur's own, with replacement days for Sunday holidays.
export const REGIONS = { sg: "Singapore", my: "Malaysia (Kuala Lumpur)", none: "No public holidays" };

const SG = {
  "2026-01-01": "New Year's Day", "2026-02-17": "Chinese New Year", "2026-02-18": "Chinese New Year",
  "2026-03-21": "Hari Raya Puasa", "2026-04-03": "Good Friday", "2026-05-01": "Labour Day", "2026-05-27": "Hari Raya Haji",
  "2026-05-31": "Vesak Day", "2026-06-01": "Vesak Day (observed)", "2026-08-09": "National Day", "2026-08-10": "National Day (observed)",
  "2026-11-08": "Deepavali", "2026-11-09": "Deepavali (observed)", "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day", "2027-02-06": "Chinese New Year", "2027-02-07": "Chinese New Year", "2027-02-08": "Chinese New Year (observed)",
  "2027-03-10": "Hari Raya Puasa", "2027-03-26": "Good Friday", "2027-05-01": "Labour Day", "2027-05-17": "Hari Raya Haji",
  "2027-05-20": "Vesak Day", "2027-08-09": "National Day", "2027-10-28": "Deepavali", "2027-12-25": "Christmas Day",
};
const MY = {
  "2026-01-01": "New Year's Day", "2026-02-01": "Federal Territory Day & Thaipusam", "2026-02-02": "Federal Territory Day & Thaipusam (replacement)",
  "2026-02-17": "Chinese New Year", "2026-02-18": "Chinese New Year", "2026-03-21": "Hari Raya Aidilfitri", "2026-03-22": "Hari Raya Aidilfitri",
  "2026-03-23": "Hari Raya Aidilfitri", "2026-05-01": "Labour Day", "2026-05-27": "Hari Raya Haji", "2026-05-31": "Wesak Day",
  "2026-06-01": "Agong's Birthday & Wesak (replacement)", "2026-06-17": "Awal Muharram", "2026-08-25": "Prophet Muhammad's Birthday",
  "2026-08-31": "Merdeka Day", "2026-09-16": "Malaysia Day", "2026-11-08": "Deepavali", "2026-11-09": "Deepavali (replacement)",
  "2026-12-25": "Christmas Day",
};
const TABLES = { sg: SG, my: MY, none: {} };

export const regionOf = (p) => (p && TABLES[p.region] ? p.region : "sg");
export const holidayOf = (region, day) => (TABLES[region] || SG)[day] || null;
