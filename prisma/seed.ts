import {
  PrismaClient,
  Division,
  Status,
  ApprovalType,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Start seeding...");
  // Hash password
  const passwordHash = await bcrypt.hash("password123", 10);

  // === USERS ===
  console.log("Creating users...");
  const [manager, dalkon, engineer, vendor, vendor2] = await Promise.all([
    prisma.user.upsert({
      where: { email: "manager@example.com" },
      update: {},
      create: {
        email: "manager@example.com",
        name: "John Manager",
        password: passwordHash, //   FIX: Menggunakan password yang di-hash
        division: Division.Manager, //   FIX: Menggunakan Enum
      },
    }),
    prisma.user.upsert({
      where: { email: "dalkon@example.com" },
      update: {},
      create: {
        email: "dalkon@example.com",
        name: "Jane Dalkon",
        password: passwordHash,
        division: Division.Dalkon, //   FIX: Menggunakan Enum
      },
    }),
    prisma.user.upsert({
      where: { email: "engineer@example.com" },
      update: {},
      create: {
        email: "engineer@example.com",
        name: "Bob Engineer",
        password: passwordHash,
        division: Division.Engineer, //   FIX: Menggunakan Enum
      },
    }),
    prisma.user.upsert({
      where: { email: "vendor@example.com" },
      update: {},
      create: {
        email: "vendor@example.com",
        name: "Alice Vendor",
        password: passwordHash,
        division: Division.Vendor, //   FIX: Menggunakan Enum
      },
    }),
    prisma.user.upsert({
      where: { email: "vendor2@example.com" },
      update: {},
      create: {
        email: "vendor2@example.com",
        name: "Victor Vendor",
        password: passwordHash,
        division: Division.Vendor, //   FIX: Menggunakan Enum
      },
    }),
  ]);
  console.log("Users created.");

  // === CONTRACTS ===
  console.log("Creating contracts...");
  const [contract1, contract2] = await Promise.all([
    prisma.contract.upsert({
      where: { contractNumber: "CONTRACT-001" },
      update: {},
      create: {
        contractNumber: "CONTRACT-001",
        contractDate: new Date("2025-01-01"),
      },
    }),
    prisma.contract.upsert({
      where: { contractNumber: "CONTRACT-002" },
      update: {},
      create: {
        contractNumber: "CONTRACT-002",
        contractDate: new Date("2025-02-01"),
      },
    }),
  ]);
  console.log("Contracts created.");

  // === DOCUMENTS ===
  console.log("Creating documents...");

  //   FIX: Logika pembuatan dokumen disesuaikan dengan schema.prisma
  // (Menambahkan latestVersion, progress, dan relasi versions)

  const doc1 = await prisma.document.create({
    data: {
      name: "Dokumen Baru (untuk Dalkon)",
      filePath: "uploads/test.pdf",
      latestVersion: 1, //   FIX: Sesuai schema
      status: Status.submitted, //   FIX: Menggunakan Enum
      progress: ["Submitted by vendor"], //   FIX: Sesuai schema (array)
      // overallDeadline: new Date("2025-11-15"),
      documentType: ApprovalType.protection, //   FIX: Menggunakan Enum
      contractId: contract1.id,
      submittedById: vendor.id,
      remarks: "Submission awal, menunggu review Dalkon",
      versions: {
        //   FIX: Buat catatan versi awal
        create: {
          filePath: "uploads/doc1.pdf",
          version: 1,
          uploadedById: vendor.id,
        },
      },
    },
  });

  const doc2 = await prisma.document.create({
    data: {
      name: "Dokumen Review Engineer (untuk Engineer)",
      filePath: "uploads/test2.pdf",
      latestVersion: 1,
      status: Status.inReviewEngineering, //   FIX: Menggunakan Enum
      progress: ["Submitted by vendor", "Forwarded to Engineering"],
      // overallDeadline: new Date("2025-11-20"),
      documentType: ApprovalType.civil, //   FIX: Menggunakan Enum
      contractId: contract2.id,
      submittedById: vendor.id,
      reviewedById: dalkon.id,
      remarks: "Awaiting Engineer review",
      versions: {
        create: {
          filePath: "uploads/doc2.pdf",
          version: 1,
          uploadedById: vendor.id,
        },
      },
    },
  });

  const doc3 = await prisma.document.create({
    data: {
      name: "Dokumen Disetujui (untuk histori)",
      filePath: "uploads/test3_v2.pdf", // File v2 adalah yang terbaru
      latestVersion: 2, //   FIX: Versi terbaru adalah 2
      status: Status.approved, //   FIX: Menggunakan Enum
      progress: [
        "Submitted by vendor",
        "Returned by Engineer",
        "Resubmitted by vendor",
        "Forwarded to Engineer",
        "Approved by Engineer",
      ],
      // overallDeadline: new Date("2025-09-30"),
      documentType: ApprovalType.protection, //   FIX: Menggunakan Enum
      contractId: contract1.id,
      submittedById: vendor2.id,
      reviewedById: engineer.id,
      remarks: "Final version approved",
      versions: {
        //   FIX: Buat 2 catatan versi
        create: [
          {
            filePath: "uploads/test3_v1.pdf",
            version: 1,
            uploadedById: vendor2.id,
          },
          {
            filePath: "uploads/test3_v2.pdf",
            version: 2,
            uploadedById: vendor2.id,
          },
        ],
      },
    },
  });

  const doc4 = await prisma.document.create({
    data: {
      name: "Dokumen Dikembalikan (untuk Vendor/Dalkon)",
      filePath: "uploads/test4.pdf",
      latestVersion: 1,
      status: Status.returnForCorrection, //   FIX: Menggunakan Enum
      progress: [
        "Submitted by vendor",
        "Forwarded to Engineer",
        "Returned for correction",
      ],
      // overallDeadline: new Date("2025-11-05"),
      documentType: ApprovalType.civil, //   FIX: Menggunakan Enum
      contractId: contract2.id,
      submittedById: vendor2.id,
      reviewedById: engineer.id,
      remarks: "Perlu revisi perhitungan di hal. 5",
      versions: {
        create: {
          filePath: "uploads/test4.pdf",
          version: 1,
          uploadedById: vendor2.id,
        },
      },
    },
  });

  const doc5 = await prisma.document.create({
    data: {
      name: "Dokumen Ditolak (untuk histori)",
      filePath: "uploads/doc5.pdf",
      latestVersion: 1,
      status: Status.rejected, //   FIX: Menggunakan Enum
      progress: ["Submitted by vendor", "Rejected by Dalkon"],
      // overallDeadline: new Date("2025-10-01"),
      documentType: ApprovalType.protection, //   FIX: Menggunakan Enum
      contractId: contract1.id,
      submittedById: vendor.id,
      reviewedById: dalkon.id,
      remarks: "Rencana ini sudah tidak relevan.",
      versions: {
        create: {
          filePath: "uploads/doc5.pdf",
          version: 1,
          uploadedById: vendor.id,
        },
      },
    },
  });
  console.log("Documents created.");

  // === APPROVALS (Histori Approval) ===
  console.log("Creating approval history...");
  await Promise.all([
    // Histori untuk doc2
    prisma.approval.create({
      data: {
        documentId: doc2.id,
        type: ApprovalType.civil, //   FIX: Menggunakan Enum
        approvedById: dalkon.id,
        status: Status.inReviewEngineering, //   FIX: Menggunakan Enum
        notes: "Diteruskan ke Engineer untuk review teknis.",
        deadline: new Date("2025-10-10"),
      },
    }),

    // Histori untuk doc3
    prisma.approval.create({
      data: {
        documentId: doc3.id,
        type: ApprovalType.protection, //   FIX: Menggunakan Enum
        approvedById: dalkon.id,
        status: Status.inReviewEngineering, //   FIX: Menggunakan Enum
        notes: "Review Dalkon OK.",
        deadline: new Date("2025-09-20"),
      },
    }),
    prisma.approval.create({
      data: {
        documentId: doc3.id,
        type: ApprovalType.protection, //   FIX: Menggunakan Enum
        approvedById: engineer.id,
        status: Status.approved, //   FIX: Menggunakan Enum
        notes: "Final approval dari Engineer.",
        deadline: new Date("2025-09-25"),
      },
    }),

    // Histori untuk doc4
    prisma.approval.create({
      data: {
        documentId: doc4.id,
        type: ApprovalType.civil, //   FIX: Menggunakan Enum
        approvedById: engineer.id,
        status: Status.returnForCorrection, //   FIX: Menggunakan Enum
        notes: "Perlu revisi perhitungan di hal. 5",
        deadline: new Date("2025-10-12"),
      },
    }),

    // Histori untuk doc5
    prisma.approval.create({
      data: {
        documentId: doc5.id,
        type: ApprovalType.protection, //   FIX: Menggunakan Enum
        approvedById: dalkon.id,
        status: Status.rejected, //   FIX: Menggunakan Enum
        notes: "Sudah tidak relevan dengan proyek.",
        deadline: new Date("2025-09-28"),
      },
    }),
  ]);
  console.log("Approval history created.");

  console.log("  Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(" Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });