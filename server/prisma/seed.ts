import { PrismaClient, ProductKind } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const RM = ProductKind.READYMADE;
const PR = ProductKind.PREPARED;

/** [name, kind, price, emoji, stock|null] */
type P = [string, ProductKind, number, string, number | null];

const catalog: { name: string; emoji: string; color: string; items: P[] }[] = [
  {
    name: "Fresh Juices",
    emoji: "🧃",
    color: "#fff3d6",
    items: [
      ["Orange Juice", PR, 90, "🍊", null],
      ["Watermelon Juice", PR, 80, "🍉", null],
      ["Mosambi Juice", PR, 90, "🍋", null],
      ["Pineapple Juice", PR, 100, "🍍", null],
      ["Pomegranate Juice", PR, 130, "🍎", null],
      ["ABC (Apple-Beet-Carrot)", PR, 120, "🥤", null],
    ],
  },
  {
    name: "Smoothies",
    emoji: "🥤",
    color: "#f3e6ff",
    items: [
      ["Mango Smoothie", PR, 140, "🥭", null],
      ["Berry Blast Smoothie", PR, 160, "🫐", null],
      ["Banana Peanut Smoothie", PR, 150, "🍌", null],
      ["Avocado Smoothie", PR, 170, "🥑", null],
    ],
  },
  {
    name: "Milkshakes",
    emoji: "🥛",
    color: "#ffe6ef",
    items: [
      ["Chocolate Shake", PR, 130, "🍫", null],
      ["Strawberry Shake", PR, 130, "🍓", null],
      ["Cold Coffee Shake", PR, 120, "☕", null],
      ["Oreo Shake", PR, 150, "🍪", null],
    ],
  },
  {
    name: "Fruit Bowls",
    emoji: "🥗",
    color: "#e2f5e9",
    items: [
      ["Regular Fruit Bowl", PR, 120, "🍓", null],
      ["Premium Exotic Bowl", PR, 180, "🥭", null],
      ["Protein Fruit Bowl", PR, 200, "💪", null],
    ],
  },
  {
    name: "Coffee & Tea",
    emoji: "☕",
    color: "#efe1d3",
    items: [
      ["Espresso", PR, 70, "☕", null],
      ["Cappuccino", PR, 110, "☕", null],
      ["Cafe Latte", PR, 120, "☕", null],
      ["Masala Chai", PR, 40, "🫖", null],
      ["Green Tea", PR, 50, "🍵", null],
    ],
  },
  {
    name: "Whole Fruits",
    emoji: "🍎",
    color: "#ffe9e9",
    items: [
      ["Banana (1 pc)", RM, 10, "🍌", 200],
      ["Apple (1 pc)", RM, 25, "🍎", 150],
      ["Orange (1 pc)", RM, 20, "🍊", 150],
      ["Pomegranate (1 pc)", RM, 60, "🔴", 80],
    ],
  },
  {
    name: "Packaged Juices",
    emoji: "📦",
    color: "#e6f0ff",
    items: [
      ["Tropicana Orange 200ml", RM, 40, "🧃", 60],
      ["Real Mixed Fruit 200ml", RM, 35, "🧃", 60],
      ["Paper Boat Aamras 250ml", RM, 45, "🧃", 40],
      ["Coconut Water 200ml", RM, 50, "🥥", 50],
    ],
  },
  {
    name: "Ice Creams",
    emoji: "🍨",
    color: "#e9f7ff",
    items: [
      ["Vanilla Cup", RM, 40, "🍦", 40],
      ["Chocolate Cup", RM, 50, "🍫", 40],
      ["Mango Kulfi", RM, 45, "🍨", 30],
      ["Choco Bar", RM, 30, "🍫", 50],
    ],
  },
  {
    name: "Snacks & Chocolates",
    emoji: "🍫",
    color: "#fdeede",
    items: [
      ["Salted Chips", RM, 20, "🥔", 60],
      ["Roasted Peanuts Pack", RM, 25, "🥜", 50],
      ["Dairy Milk", RM, 45, "🍫", 40],
      ["KitKat", RM, 40, "🍫", 40],
    ],
  },
  {
    name: "Dry Fruits & Health",
    emoji: "🥜",
    color: "#f0ead6",
    items: [
      ["Almonds 100g", RM, 120, "🌰", 30],
      ["Cashews 100g", RM, 140, "🥜", 30],
      ["Dates 250g", RM, 110, "🌴", 25],
      ["Protein Bar", RM, 90, "💪", 40],
      ["Honey 250g", RM, 180, "🍯", 20],
    ],
  },
  {
    name: "Combos",
    emoji: "🎁",
    color: "#ffe8cc",
    items: [
      ["Juice + Fruit Bowl Combo", PR, 200, "🎁", null],
      ["Coffee + Sandwich Combo", PR, 180, "🎁", null],
      ["Detox Combo (ABC + Bowl)", PR, 260, "🥗", null],
    ],
  },
];

async function main() {
  // Users
  const adminUser = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const cashierUser = process.env.SEED_CASHIER_USERNAME ?? "cashier";
  const cashierPass = process.env.SEED_CASHIER_PASSWORD ?? "cashier123";

  await prisma.user.upsert({
    where: { username: adminUser },
    update: {},
    create: {
      username: adminUser,
      name: "Store Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPass, 10),
    },
  });
  await prisma.user.upsert({
    where: { username: cashierUser },
    update: {},
    create: {
      username: cashierUser,
      name: "Front Cashier",
      role: "CASHIER",
      passwordHash: await bcrypt.hash(cashierPass, 10),
    },
  });

  // Catalog
  let catSort = 0;
  for (const cat of catalog) {
    const category = await prisma.category.upsert({
      where: { name: cat.name },
      update: { emoji: cat.emoji, sort: catSort },
      create: { name: cat.name, emoji: cat.emoji, sort: catSort },
    });
    catSort++;

    let itemSort = 0;
    for (const [name, kind, price, emoji, stock] of cat.items) {
      // Idempotent-ish: skip if a product with this name already exists in the category.
      const existing = await prisma.product.findFirst({
        where: { name, categoryId: category.id },
      });
      if (existing) {
        itemSort++;
        continue;
      }
      await prisma.product.create({
        data: {
          name,
          kind,
          price,
          emoji,
          color: cat.color,
          stock,
          categoryId: category.id,
          sort: itemSort++,
        },
      });
    }
  }

  // Example reusable modifier groups (only on a fresh DB) so the feature is usable at once.
  if ((await prisma.modifierGroup.count()) === 0) {
    const size = await prisma.modifierGroup.create({
      data: {
        name: "Size", selectType: "SINGLE", required: true, sort: 0,
        options: { create: [
          { name: "Regular", priceDelta: 0, sort: 0 },
          { name: "Large", priceDelta: 30, sort: 1 },
        ] },
      },
    });
    const addons = await prisma.modifierGroup.create({
      data: {
        name: "Add-ons", selectType: "MULTI", required: false, sort: 1,
        options: { create: [
          { name: "Extra scoop", priceDelta: 25, sort: 0 },
          { name: "Whipped cream", priceDelta: 20, sort: 1 },
          { name: "Dry fruits", priceDelta: 30, sort: 2 },
        ] },
      },
    });
    const sugar = await prisma.modifierGroup.create({
      data: {
        name: "Sugar", selectType: "SINGLE", required: false, sort: 2,
        options: { create: [
          { name: "Normal", priceDelta: 0, sort: 0 },
          { name: "Less sugar", priceDelta: 0, sort: 1 },
          { name: "No sugar", priceDelta: 0, sort: 2 },
        ] },
      },
    });
    // Attach to shakes, smoothies and fresh juices.
    const drinkCats = await prisma.category.findMany({
      where: { name: { in: ["Milkshakes", "Smoothies", "Fresh Juices"] } },
      select: { id: true },
    });
    const drinks = await prisma.product.findMany({
      where: { categoryId: { in: drinkCats.map((c) => c.id) } },
      select: { id: true },
    });
    for (const d of drinks) {
      await prisma.productModifier.createMany({
        data: [
          { productId: d.id, groupId: size.id, sort: 0 },
          { productId: d.id, groupId: addons.id, sort: 1 },
          { productId: d.id, groupId: sugar.id, sort: 2 },
        ],
        skipDuplicates: true,
      });
    }
    console.log(`  Modifier groups seeded and attached to ${drinks.length} drinks.`);
  }

  const productCount = await prisma.product.count();
  console.log(
    `Seed complete: ${catalog.length} categories, ${productCount} products.`
  );
  console.log(`  Admin login:   ${adminUser} / ${adminPass}`);
  console.log(`  Cashier login: ${cashierUser} / ${cashierPass}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
