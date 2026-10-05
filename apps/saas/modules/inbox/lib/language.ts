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
	// Whole words by any letter, not \b's ASCII: "thuê" and "nhà" end in a non-ASCII letter.
	if (
		/(?<!\p{L})(tôi|mình|muốn|thuê|mua|căn|hộ|phòng|ngủ|nhà|giá|quận|anh|chị)(?!\p{L})/iu.test(
			sample,
		)
	) {
		return "vi";
	}
	return "en";
}
