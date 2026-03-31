import { buildApp } from "./app.js";

const app = await buildApp();

await app.listen({
  host: app.config.HOST,
  port: app.config.PORT,
});
