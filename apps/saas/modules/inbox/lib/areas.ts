/**
 * Hanoi's areas as guests write them, with or without diacritics. Extraction reads the area of
 * interest from them; language detection leaves them out, since a place name is no language.
 */

/** A whole-word match by ASCII letters, case-insensitive. */
export function bounded(source: string): RegExp {
	return new RegExp(`(?<![A-Za-z])(?:${source})(?![A-Za-z])`, "iu");
}

export const AREAS: Array<{ id: string; re: RegExp }> = [
	{ id: "Tây Hồ", re: bounded("tay\\s*ho|tây\\s*hồ|west\\s*lake") },
	{ id: "Ba Đình", re: bounded("ba\\s*dinh|ba\\s*đình") },
	{ id: "Hoàn Kiếm", re: bounded("hoan\\s*kiem|hoàn\\s*kiếm|old\\s*quarter") },
	{ id: "Cầu Giấy", re: bounded("cau\\s*giay|cầu\\s*giấy") },
	{ id: "Đống Đa", re: bounded("dong\\s*da|đống\\s*đa") },
	{ id: "Hai Bà Trưng", re: bounded("hai\\s*ba\\s*trung|hai\\s*bà\\s*trưng") },
	{ id: "Long Biên", re: bounded("long\\s*bien|long\\s*biên") },
	{ id: "Ciputra", re: bounded("ciputra") },
	{ id: "Vinhomes", re: bounded("vinhomes|vinhom") },
	{ id: "Times City", re: bounded("times\\s*city") },
	{ id: "Landmark", re: bounded("landmark\\s*\\d*") },
	{ id: "Ecopark", re: bounded("ecopark") },
	{ id: "Hà Nội", re: bounded("ha\\s*noi|hà\\s*nội|hanoi") },
];
