import "dotenv/config";
import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
  type: "postgres",
  database: process.env.DB_NAME || "postgres",
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "supersecret",
  host: process.env.DB_HOST || "db",
  synchronize: true,
  logging: true,
  entities: ["src/entities/**/*.{ts,js}"]
});
