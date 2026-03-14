import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data to make local dev repeatable
  await prisma.transaction.deleteMany();
  await prisma.creator.deleteMany();

  const creators = await prisma.creator.createMany({
    data: [
      {
        walletAddress: "0xabc1234567890abcdef1234567890abcdef1234",
        name: "Onchain Oracle",
      },
      {
        walletAddress: "0xdef9876543210abcdef9876543210abcdef9876",
        name: "AI Research Lab",
      },
      {
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        name: "Crypto Storyteller",
      },
    ],
  });

  if (!creators) {
    throw new Error("Failed to create creators");
  }

  const createdCreators = await prisma.creator.findMany();

  const humanTipAmounts = [0.5, 1, 5];

  const transactionsData: {
    creatorId: string;
    fromAddress: string;
    amount: number;
    currency: string;
    type: string;
    status: string;
    chain: string;
    txHash?: string;
    createdAt: Date;
  }[] = [];

  const now = new Date();

  for (const creator of createdCreators) {
    for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date(now);
      day.setHours(12, 0, 0, 0);
      day.setDate(day.getDate() - dayOffset);

      // Human tips: 0–3 per day with random amounts
      const humanTipsCount = Math.floor(Math.random() * 4);
      for (let i = 0; i < humanTipsCount; i += 1) {
        const amount =
          humanTipAmounts[Math.floor(Math.random() * humanTipAmounts.length)];
        const txTime = new Date(day);
        txTime.setMinutes(txTime.getMinutes() + i * 10);

        transactionsData.push({
          creatorId: creator.id,
          fromAddress: `0xHUMAN${i.toString().padStart(2, "0")}`,
          amount,
          currency: "USDC",
          type: "human",
          status: "confirmed",
          chain: "base",
          txHash: `0x${Array.from({ length: 64 })
            .map(() => Math.floor(Math.random() * 16).toString(16))
            .join("")}`,
          createdAt: txTime,
        });
      }

      // Agent micropayments: start small and grow daily to show trend
      const baseMicropayments = 20;
      const incrementPerDay = 10;
      const dayIndex = 13 - dayOffset; // 0..13
      const agentCount = baseMicropayments + dayIndex * incrementPerDay;

      for (let j = 0; j < agentCount; j += 1) {
        const txTime = new Date(day);
        txTime.setMinutes(txTime.getMinutes() + j);

        transactionsData.push({
          creatorId: creator.id,
          fromAddress: `agent-wallet-${j.toString().padStart(3, "0")}`,
          amount: 0.001,
          currency: "USDC",
          type: "agent",
          status: "confirmed",
          chain: "base-sepolia",
          createdAt: txTime,
        });
      }
    }
  }

  await prisma.transaction.createMany({
    data: transactionsData,
  });
}

main()
  .then(async () => {
    // eslint-disable-next-line no-console
    console.log("Seed data created successfully");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

