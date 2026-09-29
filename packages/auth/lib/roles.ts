/** The platform admin: Nhịp's own staff (`role` "admin", alone or in a comma list). */
export function isPlatformAdmin(role: string | null | undefined): boolean {
	return role?.split(",").includes("admin") ?? false;
}
