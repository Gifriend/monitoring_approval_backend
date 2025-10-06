import { PrismaClient, Role, Status, ApprovalType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  // === USERS ===
  const [manager, dalkon, engineer, vendor] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'manager@example.com' },
      update: {},
      create: { email: 'manager@example.com', name: 'John Manager', password: passwordHash, role: Role.Manager },
    }),
    prisma.user.upsert({
      where: { email: 'dalkon@example.com' },
      update: {},
      create: { email: 'dalkon@example.com', name: 'Jane Dalkon', password: passwordHash, role: Role.Dalkon },
    }),
    prisma.user.upsert({
      where: { email: 'engineer@example.com' },
      update: {},
      create: { email: 'engineer@example.com', name: 'Bob Engineer', password: passwordHash, role: Role.Engineer },
    }),
    prisma.user.upsert({
      where: { email: 'vendor@example.com' },
      update: {},
      create: { email: 'vendor@example.com', name: 'Alice Vendor', password: passwordHash, role: Role.Vendor },
    }),
  ]);

  // === CONTRACTS ===
  const [contract1, contract2] = await Promise.all([
    prisma.contract.create({
      data: { contractNumber: 'CONTRACT-001', contractDate: new Date('2025-01-01') },
    }),
    prisma.contract.create({
      data: { contractNumber: 'CONTRACT-002', contractDate: new Date('2025-02-01') },
    }),
  ]);

  // === DOCUMENTS ===
  const [doc1, doc2, doc3] = await Promise.all([
    prisma.document.create({
      data: {
        name: 'Protection Plan v1',
        filePath: '/uploads/protection_plan_v1.pdf',
        version: 1,
        status: Status.submitted,
        overallDeadline: new Date('2025-10-15'),
        documentType: ApprovalType.protection,
        contractId: contract1.id,
        submittedById: vendor.id,
        remarks: 'Initial submission',
      },
    }),
    prisma.document.create({
      data: {
        name: 'Civil Blueprint v1',
        filePath: '/uploads/civil_blueprint_v1.pdf',
        version: 1,
        status: Status.inReviewConsultant,
        overallDeadline: new Date('2025-10-20'),
        documentType: ApprovalType.civil,
        contractId: contract2.id,
        submittedById: vendor.id,
        reviewedById: dalkon.id,
        remarks: 'Awaiting Dalkon review',
      },
    }),
    prisma.document.create({
      data: {
        name: 'Safety Guidelines v2',
        filePath: '/uploads/safety_guidelines_v2.pdf',
        version: 2,
        status: Status.approved,
        overallDeadline: new Date('2025-09-30'),
        documentType: ApprovalType.protection,
        contractId: contract1.id,
        submittedById: vendor.id,
        reviewedById: engineer.id,
        remarks: 'Revised and approved',
      },
    }),
  ]);

  // === APPROVALS ===
  await Promise.all([
    prisma.approval.create({
      data: {
        documentId: doc1.id,
        type: ApprovalType.protection,
        approvedById: manager.id,
        status: Status.submitted,
        deadline: new Date('2025-10-10'),
      },
    }),
    prisma.approval.create({
      data: {
        documentId: doc2.id,
        type: ApprovalType.civil,
        approvedById: dalkon.id,
        status: Status.inReviewConsultant,
        notes: 'Please verify structural integrity.',
        deadline: new Date('2025-10-12'),
      },
    }),
    prisma.approval.create({
      data: {
        documentId: doc3.id,
        type: ApprovalType.protection,
        approvedById: engineer.id,
        status: Status.approved,
        notes: 'All requirements met.',
        deadline: new Date('2025-09-25'),
      },
    }),
  ]);

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
