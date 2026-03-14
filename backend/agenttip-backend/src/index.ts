import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
// Note: This import assumes @coinbase/x402-express is installed in your environment.
// If the package name differs (e.g. @x402/express), update this import accordingly.
import { paymentMiddleware } from "@coinbase/x402-express";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;

const app = express();

const prisma = new PrismaClient();

// Middleware: JSON body parsing
app.use(express.json());

// Middleware: CORS for frontend
app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);

// Middleware: request logging with response time
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    // eslint-disable-next-line no-console
    console.log(
      `${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(2)}ms`,
    );
  });

  next();
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Helpers
const buildEmbedCode = (walletAddress: string) =>
  `<script src="https://agenttip.xyz/widget.js" data-wallet="${walletAddress}"></script>`;

// Routes

// POST /api/creators/register
app.post(
  "/api/creators/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { walletAddress, name } = req.body as {
        walletAddress?: string;
        name?: string;
      };

      if (!walletAddress || typeof walletAddress !== "string") {
        return res
          .status(400)
          .json({ error: "walletAddress is required", code: 400 });
      }

      const normalizedWallet = walletAddress.toLowerCase();

      let creator = await prisma.creator.findUnique({
        where: { walletAddress: normalizedWallet },
      });

      if (!creator) {
        creator = await prisma.creator.create({
          data: {
            walletAddress: normalizedWallet,
            name: name ?? null,
          },
        });
      } else if (name && !creator.name) {
        creator = await prisma.creator.update({
          where: { id: creator.id },
          data: { name },
        });
      }

      return res.json({
        id: creator.id,
        walletAddress: creator.walletAddress,
        name: creator.name,
        embedCode: buildEmbedCode(creator.walletAddress),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/creators/:walletAddress
app.get(
  "/api/creators/:walletAddress",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const walletAddress = req.params.walletAddress.toLowerCase();

      const creator = await prisma.creator.findUnique({
        where: { walletAddress },
        include: { transactions: true },
      });

      if (!creator) {
        return res.status(404).json({ error: "Creator not found", code: 404 });
      }

      let totalEarnings = 0;
      let humanEarnings = 0;
      let agentEarnings = 0;

      for (const tx of creator.transactions) {
        totalEarnings += tx.amount;
        if (tx.type === "human") {
          humanEarnings += tx.amount;
        } else if (tx.type === "agent") {
          agentEarnings += tx.amount;
        }
      }

      return res.json({
        id: creator.id,
        walletAddress: creator.walletAddress,
        name: creator.name,
        totalEarnings,
        humanEarnings,
        agentEarnings,
        transactionCount: creator.transactions.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/creators/:walletAddress/transactions
app.get(
  "/api/creators/:walletAddress/transactions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const walletAddress = req.params.walletAddress.toLowerCase();
      const limit = Number(req.query.limit ?? 20);
      const offset = Number(req.query.offset ?? 0);
      const type = (req.query.type as string | undefined) ?? undefined;

      const creator = await prisma.creator.findUnique({
        where: { walletAddress },
      });

      if (!creator) {
        return res.status(404).json({ error: "Creator not found", code: 404 });
      }

      const where: Record<string, unknown> = {
        creatorId: creator.id,
      };

      if (type === "human" || type === "agent") {
        where.type = type;
      }

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.transaction.count({ where }),
      ]);

      return res.json({
        total,
        limit,
        offset,
        transactions,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/creators/:walletAddress/stats
app.get(
  "/api/creators/:walletAddress/stats",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const walletAddress = req.params.walletAddress.toLowerCase();

      const creator = await prisma.creator.findUnique({
        where: { walletAddress },
      });

      if (!creator) {
        return res.status(404).json({ error: "Creator not found", code: 404 });
      }

      const now = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 13); // last 14 days including today

      const transactions = await prisma.transaction.findMany({
        where: {
          creatorId: creator.id,
          createdAt: {
            gte: start,
          },
        },
        orderBy: { createdAt: "asc" },
      });

      const dates: string[] = [];
      const humanAmounts: number[] = [];
      const agentAmounts: number[] = [];

      // Build date buckets
      for (let i = 13; i >= 0; i -= 1) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().slice(0, 10);
        dates.push(dateKey);
        humanAmounts.push(0);
        agentAmounts.push(0);
      }

      const indexByDate = new Map<string, number>();
      dates.forEach((d, idx) => indexByDate.set(d, idx));

      for (const tx of transactions) {
        const dateKey = tx.createdAt.toISOString().slice(0, 10);
        const idx = indexByDate.get(dateKey);
        if (idx === undefined) continue;
        if (tx.type === "human") {
          humanAmounts[idx] += tx.amount;
        } else if (tx.type === "agent") {
          agentAmounts[idx] += tx.amount;
        }
      }

      return res.json({
        dates,
        humanAmounts,
        agentAmounts,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Simple txHash validation for Base
const isValidTxHash = (hash: string): boolean =>
  /^0x[a-fA-F0-9]{64}$/.test(hash);

// POST /api/tip/human
app.post(
  "/api/tip/human",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { creatorWallet, fromAddress, amount, txHash } = req.body as {
        creatorWallet?: string;
        fromAddress?: string;
        amount?: number;
        txHash?: string;
      };

      if (
        !creatorWallet ||
        typeof creatorWallet !== "string" ||
        !fromAddress ||
        typeof fromAddress !== "string" ||
        typeof amount !== "number" ||
        amount <= 0 ||
        !txHash ||
        typeof txHash !== "string"
      ) {
        return res.status(400).json({
          error:
            "creatorWallet, fromAddress, positive amount, and txHash are required",
          code: 400,
        });
      }

      if (!isValidTxHash(txHash)) {
        return res
          .status(400)
          .json({ error: "Invalid txHash format", code: 400 });
      }

      const walletAddress = creatorWallet.toLowerCase();

      const creator = await prisma.creator.findUnique({
        where: { walletAddress },
      });

      if (!creator) {
        return res.status(404).json({ error: "Creator not found", code: 404 });
      }

      const tx = await prisma.transaction.create({
        data: {
          creatorId: creator.id,
          fromAddress,
          amount,
          currency: "USDC",
          type: "human",
          status: "confirmed",
          chain: "base",
          txHash,
        },
      });

      return res.json({ success: true, transactionId: tx.id });
    } catch (err) {
      next(err);
    }
  },
);

// x402 facilitator configuration
const facilitatorConfig = {
  facilitatorUrl: process.env.FACILITATOR_URL,
  network: process.env.NETWORK,
};

// POST /api/tip/agent
app.post(
  "/api/tip/agent",
  paymentMiddleware("0.001", "$USDC", facilitatorConfig),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { creatorWallet, fromAddress } = req.body as {
        creatorWallet?: string;
        fromAddress?: string;
      };

      if (!creatorWallet || typeof creatorWallet !== "string") {
        return res
          .status(400)
          .json({ error: "creatorWallet is required", code: 400 });
      }

      // Ensure payment proof exists; if not, treat as 402.
      const anyReq = req as any;
      if (!anyReq.payment) {
        return res
          .status(402)
          .json({ error: "Valid payment proof required", code: 402 });
      }

      const walletAddress = creatorWallet.toLowerCase();

      const creator = await prisma.creator.findUnique({
        where: { walletAddress },
      });

      if (!creator) {
        return res.status(404).json({ error: "Creator not found", code: 404 });
      }

      // If x402 exposes payer address, prefer that for fromAddress.
      const payerAddress =
        anyReq.payment?.payerAddress ||
        anyReq.payment?.fromAddress ||
        fromAddress ||
        "agent";

      const tx = await prisma.transaction.create({
        data: {
          creatorId: creator.id,
          fromAddress: payerAddress,
          amount: 0.001,
          currency: "USDC",
          type: "agent",
          status: "confirmed",
          chain: process.env.NETWORK || "base",
        },
      });

      return res.json({
        success: true,
        transactionId: tx.id,
        message: "Payment received",
      });
    } catch (err) {
      // If the payment middleware indicates a payment issue, surface 402.
      const anyErr = err as any;
      if (anyErr && (anyErr.status === 402 || anyErr.statusCode === 402)) {
        return res
          .status(402)
          .json({ error: anyErr.message ?? "Payment required", code: 402 });
      }
      next(err);
    }
  },
);

// GET /api/tip/agent/config/:walletAddress
app.get(
  "/api/tip/agent/config/:walletAddress",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const walletAddress = req.params.walletAddress.toLowerCase();
      return res.json({
        price: "0.001",
        currency: "USDC",
        network: process.env.NETWORK || "base-sepolia",
        payTo: walletAddress,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/stats/global
app.get(
  "/api/stats/global",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [totalCreators, totalTransactions, totalAgg, humanAgg, agentAgg] =
        await Promise.all([
          prisma.creator.count(),
          prisma.transaction.count(),
          prisma.transaction.aggregate({
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { type: "human" },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { type: "agent" },
            _sum: { amount: true },
          }),
        ]);

      const totalVolume = totalAgg._sum.amount ?? 0;
      const humanVolume = humanAgg._sum.amount ?? 0;
      const agentVolume = agentAgg._sum.amount ?? 0;

      let humanPercentage = 0;
      let agentPercentage = 0;

      if (totalVolume > 0) {
        humanPercentage = (humanVolume / totalVolume) * 100;
        agentPercentage = (agentVolume / totalVolume) * 100;
      }

      return res.json({
        totalCreators,
        totalTransactions,
        totalVolume,
        humanPercentage,
        agentPercentage,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction,
  ) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const status = err.statusCode || err.status || 500;
    const message = err.message || "Internal server error";
    res.status(status).json({ error: message, code: status });
  },
);

async function start() {
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to start server", err);
    process.exit(1);
  }
}

void start();

