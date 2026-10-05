// A one-migration project for migrate-deploy.test.ts: its migration alters a table the test
// holds a lock on. The table lives outside `public`, so `migrate deploy` sees an empty schema.
export default {
	schema: "./schema.prisma",
	datasource: { url: process.env.DATABASE_URL },
};
