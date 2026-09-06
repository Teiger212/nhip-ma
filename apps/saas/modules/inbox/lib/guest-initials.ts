/** First and last initials from a guest label. One token keeps the first letter. */
export function guestInitials(name: string): string {
	const parts = name
		.trim()
		.split(/\s+/)
		.filter((part) => part.length > 0);
	if (parts.length === 0) {
		return "?";
	}
	const first = parts[0][0];
	if (parts.length === 1) {
		return first.toLocaleUpperCase();
	}
	return `${first}${parts[parts.length - 1][0]}`.toLocaleUpperCase();
}
