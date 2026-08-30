import type { StaticImageData } from "next/image";

import ameliaOrtiz from "../../../public/images/testimonials/amelia-ortiz.webp";
import jonasWeber from "../../../public/images/testimonials/jonas-weber.webp";
import mayaChen from "../../../public/images/testimonials/maya-chen.webp";

export const dummyPortraits = {
	item1: mayaChen,
	item2: jonasWeber,
	item3: ameliaOrtiz,
} as const satisfies Record<string, StaticImageData>;

export const dummyTeamPortraits = [mayaChen, jonasWeber, ameliaOrtiz] as const;
