import type { GuestLanguage } from "./types";

export function detectLanguage(text: string): GuestLanguage {
	const sample = String(text || "");
	if (/[\uac00-\ud7af]/.test(sample)) {
		return "ko";
	}
	if (/[\u3040-\u30ff]/.test(sample)) {
		return "ja";
	}
	if (/[\u0400-\u04ff]/.test(sample)) {
		return "ru";
	}
	if (/[ăâêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵđ]/i.test(sample)) {
		return "vi";
	}
	if (/\b(tôi|mình|muốn|thuê|mua|căn|hộ|phòng|ngủ|nhà|giá|quận|anh|chị)\b/i.test(sample)) {
		return "vi";
	}
	return "en";
}
