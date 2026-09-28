/**
 * Questions a CLI script asks its operator. Scripts use these, never a prompt library
 * directly, so swapping the library (or the logger, which is a separate concern) is one file.
 */
import { consola } from "consola";

export const prompt = {
	text: (message: string, options: { placeholder?: string; required?: boolean } = {}) =>
		consola.prompt(message, { type: "text", ...options }),
	confirm: (message: string, options: { default?: boolean } = {}) =>
		consola.prompt(message, { type: "confirm", ...options }),
};
