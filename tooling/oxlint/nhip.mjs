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

export default {
	meta: { name: "nhip" },
	rules: { "background-label-is-literal": backgroundLabelIsLiteral },
};
