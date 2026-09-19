/**
 * The post-check behind the model (ADR 0005). The prompt carries the rules; this is the
 * part that does not trust the prompt. A draft that fails here is dropped and the template
 * stands, so nothing a model writes about paperwork can reach the reply box unread.
 */

/**
 * Words a reply must not contain: the paperwork and ownership vocabulary in the guest
 * languages. The agent handles those by hand; the flag in the operator note says so.
 */
const PAPERWORK_TERMS =
	/pink\s*book|s[ổo]\s*h[ồo]ng|s[ổo]\s*đ[ỏo]|ownership|residency|visa|work\s*permit|sở\s*hữu|giấy\s*tờ|pháp\s*lý|핑크북|소유권|비자|所有権|ピンクブック|ビザ|розов(?:ая|ую)\s+книг|собственност|виз[аы]/iu;

/** A follow-up is one to three short sentences; anything longer is not the agent's register. */
export const MAX_FOLLOW_UP_CHARS = 600;

/** Returns the draft to store, or `null` when the template must stand instead. */
export function checkFollowUp(draft: string | null | undefined): string | null {
	if (!draft) {
		return null;
	}
	const text = draft.trim();
	if (!text || text.length > MAX_FOLLOW_UP_CHARS) {
		return null;
	}
	if (PAPERWORK_TERMS.test(text)) {
		return null;
	}
	return text;
}
