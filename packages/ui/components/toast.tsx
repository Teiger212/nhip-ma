"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircle2Icon, InfoIcon, LoaderIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { cn } from "../lib";
import { Button } from "./button";

const toast = ToastPrimitive.createToastManager();

type ToastPosition = "top-right" | "top-center" | "bottom-right" | "bottom-center";

type ToastSide = "top" | "bottom";

const viewportClassNames: Record<ToastPosition, string> = {
	"top-right": "top-4 sm:right-4 sm:left-auto sm:mx-0",
	"top-center": "top-4",
	"bottom-right": "bottom-4 sm:right-4 sm:left-auto sm:mx-0",
	"bottom-center": "bottom-4",
};

const toastSharedClassNames = [
	"pointer-events-auto absolute right-0 left-0 z-[calc(1000-var(--toast-index))] w-full border border-border bg-card text-card-foreground rounded-xl shadow-lg shadow-black/5 select-none outline-none will-change-transform focus-visible:ring-2 focus-visible:ring-ring",
	"[--gap:0.75rem] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))]",
	"h-(--height) data-expanded:h-(--toast-height) [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
	"data-limited:opacity-0 data-ending-style:opacity-0",
	"data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
	"data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
	"data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
	"data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
].join(" ");

const toastSideClassNames: Record<ToastSide, string> = {
	top: [
		"top-0 origin-top",
		"[--offset-y:calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))]",
		"[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))]",
		"after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
		"data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
		"data-starting-style:[transform:translateY(-150%)]",
		"[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
	].join(" "),
	bottom: [
		"bottom-0 origin-bottom",
		"[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
		"[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
		"after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
		"data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
		"data-starting-style:[transform:translateY(150%)]",
		"[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
	].join(" "),
};

function ToastProvider(props: ToastPrimitive.Provider.Props) {
	return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal(props: ToastPrimitive.Portal.Props) {
	return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
	return (
		<ToastPrimitive.Viewport
			data-slot="toast-viewport"
			className={cn(
				"inset-x-4 max-w-sm sm:w-full pointer-events-none fixed z-50 mx-auto w-auto outline-none",
				className,
			)}
			{...props}
		/>
	);
}

function Toast({
	className,
	side = "bottom",
	...props
}: ToastPrimitive.Root.Props & { side?: ToastSide }) {
	return (
		<ToastPrimitive.Root
			data-slot="toast"
			swipeDirection={[side === "top" ? "up" : "down", "right"]}
			className={cn(toastSharedClassNames, toastSideClassNames[side], className)}
			{...props}
		/>
	);
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
	return (
		<ToastPrimitive.Content
			data-slot="toast-content"
			className={cn(
				"gap-3 p-4 flex h-full items-center overflow-hidden transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100",
				className,
			)}
			{...props}
		/>
	);
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
	return (
		<ToastPrimitive.Title
			data-slot="toast-title"
			className={cn("text-sm font-medium leading-tight tracking-tight", className)}
			{...props}
		/>
	);
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
	return (
		<ToastPrimitive.Description
			data-slot="toast-description"
			className={cn("text-sm leading-relaxed text-muted-foreground", className)}
			{...props}
		/>
	);
}

function ToastAction({
	className,
	render = <Button variant="outline" size="sm" />,
	...props
}: ToastPrimitive.Action.Props) {
	return (
		<ToastPrimitive.Action
			data-slot="toast-action"
			render={render}
			className={cn("shrink-0", className)}
			{...props}
		/>
	);
}

function ToastClose({
	className,
	children,
	render = <Button variant="ghost" size="icon" />,
	...props
}: ToastPrimitive.Close.Props) {
	return (
		<ToastPrimitive.Close
			data-slot="toast-close"
			render={render}
			className={cn("shrink-0 text-muted-foreground hover:text-foreground", className)}
			{...props}
		>
			{children ?? <XIcon className="size-4" aria-hidden="true" />}
		</ToastPrimitive.Close>
	);
}

function ToastIcon({ type }: { type: string | undefined }) {
	if (type === "success") {
		return <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden="true" />;
	}
	if (type === "error") {
		return <XIcon className="size-5 shrink-0 text-destructive" aria-hidden="true" />;
	}
	if (type === "info") {
		return <InfoIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />;
	}
	if (type === "warning") {
		return <TriangleAlertIcon className="size-5 shrink-0 text-warning" aria-hidden="true" />;
	}
	if (type === "loading") {
		return <LoaderIcon className="size-5 animate-spin shrink-0 text-primary" aria-hidden="true" />;
	}
	return null;
}

function ToastList({ side, closeLabel }: { side: ToastSide; closeLabel: string }) {
	const { toasts } = ToastPrimitive.useToastManager();

	return toasts.map((toastItem) => (
		<Toast key={toastItem.id} toast={toastItem} side={side}>
			<ToastContent>
				<ToastIcon type={toastItem.type} />
				<div className="gap-1 min-w-0 flex flex-1 flex-col">
					<ToastTitle />
					<ToastDescription />
				</div>
				<ToastAction />
				<ToastClose aria-label={closeLabel} />
			</ToastContent>
		</Toast>
	));
}

const Toaster = ({
	children,
	position = "bottom-right",
	closeLabel = "Close toast",
	toastManager = toast,
	...props
}: ToastPrimitive.Provider.Props & { position?: ToastPosition; closeLabel?: string }) => {
	const side: ToastSide = position.startsWith("top") ? "top" : "bottom";

	return (
		<ToastProvider toastManager={toastManager} {...props}>
			{children}
			<ToastPortal>
				<ToastViewport className={viewportClassNames[position]}>
					<ToastList side={side} closeLabel={closeLabel} />
				</ToastViewport>
			</ToastPortal>
		</ToastProvider>
	);
};

export {
	Toast,
	ToastAction,
	ToastClose,
	ToastContent,
	ToastDescription,
	Toaster,
	ToastPortal,
	ToastProvider,
	ToastTitle,
	ToastViewport,
	toast,
};
