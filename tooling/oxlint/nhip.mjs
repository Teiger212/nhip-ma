/**
 * Nhịp's own lint rules, loaded by `.oxlintrc.json` as a JS plugin.
 *
 * `nhip/background-label-is-literal` (#220): a `runInBackground` label names the kind of job
 * and nothing else, so it must be a plain string literal. A failed job logs its label to
 * Vercel, which is telemetry under Vietnam's PDPL: a template, a concatenation or a variable is
 * how a thread's id, and with it a guest's Zalo or WhatsApp id, gets into the log.
 */
const backgroundLabelIsLiteral = {
	meta: {
		type: "problem",
		docs: { description: "A runInBackground label is a string literal naming the job's kind." },
	},
	create(context) {
		return {
			// Renamed on import, the calls below would no longer be recognised by name.
			ImportSpecifier(node) {
				const imported = node.imported.type === "Identifier" ? node.imported.name : null;
				if (imported === "runInBackground" && node.local.name !== imported) {
					context.report({
						node,
						message:
							"Import runInBackground under its own name, so nhip/background-label-is-literal can check its labels (#220).",
					});
				}
			},
			CallExpression(node) {
				const { callee } = node;
				const name =
					callee.type === "Identifier"
						? callee.name
						: callee.type === "MemberExpression" && callee.property.type === "Identifier"
							? callee.property.name
							: null;
				if (name !== "runInBackground") return;
				const [label] = node.arguments;
				if (label?.type === "Literal" && typeof label.value === "string") return;
				context.report({
					node: label ?? node,
					message:
						'A runInBackground label is a string literal naming the job\'s kind ("translate"), never an id or any other value: a failed job logs it, and server logs carry no guest data (#220).',
				});
			},
		};
	},
};

/**
 * `nhip/no-native-select` (#248): every select in the app is the kit's `Select`
 * (`@repo/ui`, Base UI), never a native `<select>`, so a list of choices looks and behaves the
 * same everywhere (DESIGN.md, Owner Select). `packages/ui` is exempt: it is where the kit's own
 * controls are built.
 */
const noNativeSelect = {
	meta: {
		type: "problem",
		docs: { description: "Use the kit's Select from @repo/ui, never a native <select>." },
	},
	create(context) {
		return {
			JSXOpeningElement(node) {
				if (node.name.type !== "JSXIdentifier" || node.name.name !== "select") return;
				context.report({
					node,
					message:
						"Use the kit's Select (Select, SelectTrigger, SelectValue, SelectContent, SelectItem from @repo/ui), never a native <select> (#248, DESIGN.md Owner Select).",
				});
			},
		};
	},
};

export default {
	meta: { name: "nhip" },
	rules: {
		"background-label-is-literal": backgroundLabelIsLiteral,
		"no-native-select": noNativeSelect,
	},
};
