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
