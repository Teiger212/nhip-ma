import { ORPCError } from "@orpc/server";
import { getOrganizationById } from "@repo/database";
import { logger } from "@repo/logs";
import {
	createCheckoutLink as createCheckoutLinkFn,
	findPriceByPlanId,
	getCustomerIdFromEntity,
	getProviderPriceIdByPlanId,
	isPlanId,
} from "@repo/payments";
import { z } from "zod";

import { localeMiddleware } from "../../../orpc/middleware/locale-middleware";
import { protectedProcedure } from "../../../orpc/procedures";
import { verifyOrganizationBillingManagement } from "../../organizations/lib/membership";
import { paymentRedirectUrlSchema } from "../redirect-url";

export const createCheckoutLink = protectedProcedure
	.use(localeMiddleware)
	.route({
		method: "POST",
		path: "/payments/create-checkout-link",
		tags: ["Payments"],
		summary: "Create checkout link",
		description: "Creates a checkout link for a one-time or subscription product",
	})
	.input(
		z.object({
			planId: z.string(),
			type: z.enum(["one-time", "subscription"]),
			interval: z.enum(["month", "year"]).optional(),
			redirectUrl: paymentRedirectUrlSchema,
			organizationId: z.string().optional(),
		}),
	)
	.output(
		z.object({
			checkoutLink: z.url(),
		}),
	)
	.handler(
		async ({
			input: { planId, redirectUrl, type, interval, organizationId },
			context: { user },
		}) => {
			const organizationBillingAccess = organizationId
				? await verifyOrganizationBillingManagement(organizationId, user.id)
				: null;

			if (organizationId && !organizationBillingAccess) {
				throw new ORPCError("FORBIDDEN");
			}

			const customerId = await getCustomerIdFromEntity(
				organizationId
					? {
							organizationId,
						}
					: {
							userId: user.id,
						},
			);

			const normalizedType = type === "subscription" ? "subscription" : "one-time";

			if (!isPlanId(planId)) {
				throw new ORPCError("NOT_FOUND");
			}

			const price = findPriceByPlanId(planId, {
				type: normalizedType,
				interval,
			});
			const priceId = getProviderPriceIdByPlanId(planId, {
				type: normalizedType,
				interval,
			});

			if (!price || !priceId) {
				throw new ORPCError("NOT_FOUND");
			}

			const trialPeriodDays =
				price && "trialPeriodDays" in price ? price.trialPeriodDays : undefined;

			const organization = organizationId ? await getOrganizationById(organizationId) : undefined;

			if (organization === null) {
				throw new ORPCError("NOT_FOUND");
			}

			const seats =
				organization && price && "seatBased" in price && price.seatBased
					? organization.members.length
					: undefined;

			try {
				const checkoutLink = await createCheckoutLinkFn({
					type,
					priceId,
					email: user.email,
					name: user.name ?? "",
					redirectUrl,
					...(organizationId ? { organizationId } : { userId: user.id }),
					trialPeriodDays,
					seats,
					customerId: customerId ?? undefined,
				});

				if (!checkoutLink) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return { checkoutLink };
			} catch (error) {
				logger.error(error);
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
		},
	);
