import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não foi definida.");
}

export const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
