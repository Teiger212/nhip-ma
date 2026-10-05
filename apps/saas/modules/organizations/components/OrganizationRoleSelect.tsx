import {
	useOrganizationMemberRoleOptions,
	useOrganizationMemberRoles,
} from "@organizations/hooks/member-roles";
import type { OrganizationMemberRole } from "@repo/auth";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";

export function OrganizationRoleSelect({
	value,
	onSelect,
	disabled,
	dataTest,
}: {
	value?: OrganizationMemberRole;
	onSelect: (value: OrganizationMemberRole) => void;
	disabled?: boolean;
	/** The trigger's `data-test` handle. */
	dataTest?: string;
}) {
	const roleOptions = useOrganizationMemberRoleOptions();
	// Every role labels the trigger (an owner row reads Manager); only grantable ones are offered.
	const roleLabels = Object.entries(useOrganizationMemberRoles()).map(([role, label]) => ({
		value: role as OrganizationMemberRole,
		label,
	}));

	return (
		<Select
			value={value}
			items={roleLabels}
			onValueChange={(selectedValue) => {
				if (selectedValue === null) {
					return;
				}
				onSelect(selectedValue);
			}}
			disabled={disabled}
		>
			<SelectTrigger className="w-max" data-test={dataTest}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{roleOptions.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
