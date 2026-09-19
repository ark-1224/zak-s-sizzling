import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import type { Request } from "express";
import { authRouter } from "./modules/auth/routes";
import { categoriesRouter } from "./modules/categories/routes";
import { inventoryRouter } from "./modules/inventory/routes";
import { kitchenRouter } from "./modules/kitchen/routes";
import { ordersRouter } from "./modules/orders/routes";
import { paymentsRouter } from "./modules/payments/routes";
import { productsRouter } from "./modules/products/routes";
import { reportsRouter } from "./modules/reports/routes";
import { usersRouter } from "./modules/users/routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true }));
  app.use(cookieParser());
  // Stashes the raw request body on req.rawBody — needed by the PayMongo webhook route
  // to verify the Paymongo-Signature header, which is computed over the exact raw bytes.
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/kitchen", kitchenRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/users", usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
