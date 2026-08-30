"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { CheckCircleIcon, MailIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
	email: z.email(),
});

export function NewsletterSection() {
	const t = useTranslations();

	const form = useForm({
		resolver: zodResolver(formSchema),
	});

	const onSubmit = form.handleSubmit(async ({ email }) => {
		try {
			// TODO: Insert your newsletter signup logic here to integrate with your CRM or email service
			void email;
			await new Promise((resolve) => setTimeout(resolve, 1000));
		} catch {
			form.setError("email", {
				message: t("newsletter.hints.error.message"),
			});
		}
	});

	return (
		<section className="py-16 lg:py-20 border-t border-border/60">
			<div className="container">
				{form.formState.isSubmitSuccessful ? (
					<Alert variant="success">
						<CheckCircleIcon />
						<AlertTitle>{t("newsletter.hints.success.title")}</AlertTitle>
						<AlertDescription>{t("newsletter.hints.success.message")}</AlertDescription>
					</Alert>
				) : (
					<form
						onSubmit={onSubmit}
						className="gap-6 md:grid-cols-[1fr_auto] md:items-end grid grid-cols-1"
					>
						<div className="max-w-md">
							<h2 className="font-medium text-lg tracking-tight gap-2.5 flex items-center text-foreground">
								<MailIcon className="size-5 text-touch" />
								{t("newsletter.title")}
							</h2>
							<p className="mt-1.5 text-sm leading-relaxed text-foreground/50">
								{t("newsletter.subtitle")}
							</p>
						</div>
						<div className="sm:flex-row sm:items-start gap-2 flex flex-col items-stretch">
							<Input
								type="email"
								required
								placeholder={t("newsletter.email")}
								className="md:w-64"
								{...form.register("email")}
							/>
							<Button
								type="submit"
								className="bg-touch text-touch-foreground hover:bg-touch/90"
								loading={form.formState.isSubmitting}
							>
								{t("newsletter.submit")}
							</Button>
						</div>
						{form.formState.errors.email && (
							<p className="text-xs md:col-start-2 text-destructive">
								{form.formState.errors.email.message}
							</p>
						)}
					</form>
				)}
			</div>
		</section>
	);
}
