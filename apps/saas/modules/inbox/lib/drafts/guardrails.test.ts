import { expect, test } from "vitest";

import { checkFollowUp } from "./guardrails";

// ADR 0021, R2: the model's text is checked as the guest would read it. A model can send
// Vietnamese decomposed (a base letter, then its marks), which reads the same on a phone.

test("a decomposed paperwork word is caught like the composed one", () => {
	const decomposed = "Anh/chị sẽ được sở hữu căn hộ.".normalize("NFD");
	expect(decomposed).not.toBe(decomposed.normalize("NFC"));
	expect(checkFollowUp(decomposed)).toBeNull();
});

test("a draft that passes is stored composed", () => {
	const draft = "Cảm ơn anh/chị, bên em sẽ gửi thêm thông tin ạ.";
	expect(checkFollowUp(draft.normalize("NFD"))).toBe(draft.normalize("NFC"));
});
