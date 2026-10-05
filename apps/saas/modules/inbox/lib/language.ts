import type { GuestLanguage } from "./types";

export function detectLanguage(text: string): GuestLanguage {
	const sample = String(text || "");
	if (/[가-힯]/.test(sample)) {
		return "ko";
	}
	if (/[぀-ヿ]/.test(sample)) {
		return "ja";
	}
	if (/[Ѐ-ӿ]/.test(sample)) {
		return "ru";
	}
	// Only letters Vietnamese alone uses (ADR 0021): ă â đ ơ ư; a hook above or a dot below;
	// ẽ ĩ ũ ỹ; any tone on ă â ê ô ơ ư. French, Spanish and Portuguese accents are left out.
	if (/[ăâđơưảẻỉỏủỷạẹịọụỵẽĩũỹằắẳẵặầấẩẫậềếểễệồốổỗộờớởỡợừứửữự]/i.test(sample)) {
		return "vi";
	}
	if (/\b(tôi|mình|muốn|thuê|mua|căn|hộ|phòng|ngủ|nhà|giá|quận|anh|chị)\b/i.test(sample)) {
		return "vi";
	}
	return "en";
}
