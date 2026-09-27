import { findOrganization } from "./procedures/find-organization";
import { listOrganizations } from "./procedures/list-organizations";
import { listUsers } from "./procedures/list-users";
import { getOrganizationCrm, setOrganizationCrm } from "./procedures/organization-crm";

export const adminRouter = {
	users: {
		list: listUsers,
	},
	organizations: {
		list: listOrganizations,
		find: findOrganization,
		crm: {
			get: getOrganizationCrm,
			set: setOrganizationCrm,
		},
	},
};
