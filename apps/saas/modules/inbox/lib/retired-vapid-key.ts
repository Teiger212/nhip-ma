/**
 * The VAPID public key of the pair once committed in `.env.e2e` (#135). That pair is public,
 * so no deployment that matters may use it: a production or staging deployment, or any live
 * one, refuses it at startup (`config.ts`). E2E makes a fresh pair per run instead. A public
 * key is public by design (every subscribing page receives it), so naming it gives nothing away.
 */
export const RETIRED_E2E_VAPID_PUBLIC_KEY =
	"BPojYs1-2CBS906VDuoVMLeVC8BngJCSnQaz5DQgf2XZk5pzKuUeV2rKABvq6GzAWR1Sb5p9SQfc_sjYOhb8M30";
