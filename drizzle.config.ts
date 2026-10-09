import type { Config } from "drizzle-kit";

// Generates SQL migrations from src/db/schema.ts into drizzle/.
// Dialect is SQLite because Webflow Cloud's database (D1) is SQLite.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
} satisfies Config;
