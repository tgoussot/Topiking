import "dotenv/config";
import { DataSource } from "typeorm";
import { join } from "node:path";

const entites = join(__dirname, "entities", "**", "*.{ts,js}");
const enProduction = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  database: process.env.DB_NAME || "postgres",
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "supersecret",
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT) || 5432,
  synchronize: !enProduction,
  logging: !enProduction,
  entities: [entites]
});
