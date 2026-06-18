import { db } from "@workspace/db";
import {
  usersTable,
  stageTemplatesTable,
  stagesTable,
  stageFieldsTable,
  projectsTable,
  systemSettingsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

function hash(pw: string) {
  return bcrypt.hashSync(pw, 12);
}

async function seed() {
  console.log("Seeding database...");

  // ── System Settings ────────────────────────────────────────────────
  const defaultSettings = [
    { key: "stalledThresholdDays", value: "45" },
    { key: "delayedThresholdDays", value: "30" },
    { key: "outOfBandNotificationsEnabled", value: "false" },
    { key: "loginThrottleMaxAttempts", value: "10" },
    { key: "loginThrottleWindowSeconds", value: "60" },
  ];
  for (const s of defaultSettings) {
    const [existing] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, s.key));
    if (!existing) await db.insert(systemSettingsTable).values(s);
  }

  // ── Users ──────────────────────────────────────────────────────────
  const seedUsers = [
    { email: "admin@jabeen.sa", fullName: "JABEEN Admin", companyName: "JABEEN / RCJY", role: "administrator" as const, password: "Admin@2026!" },
    { email: "pm1@jabeen.sa", fullName: "Khalid Al-Rashidi", companyName: "JABEEN / RCJY", role: "project-manager" as const, password: "Manager@2026!" },
    { email: "tm1@jabeen.sa", fullName: "Fatima Al-Dosari", companyName: "JABEEN / RCJY", role: "top-management" as const, password: "TopMgmt@2026!" },
    { email: "investor1@acmecorp.com", fullName: "Ahmed Al-Mutairi", companyName: "Acme Industrial Co.", role: "investor" as const, password: "Investor@2026!" },
    { email: "investor2@gulfpetro.com", fullName: "Sara Al-Zahrani", companyName: "Gulf Petrochemicals Ltd.", role: "investor" as const, password: "Investor@2026!" },
  ];

  const createdUsers: Record<string, number> = {};
  for (const u of seedUsers) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, u.email));
    if (existing) {
      createdUsers[u.email] = existing.id;
      continue;
    }
    const [created] = await db.insert(usersTable).values({
      email: u.email,
      fullName: u.fullName,
      companyName: u.companyName,
      role: u.role,
      passwordHash: hash(u.password),
    }).returning({ id: usersTable.id });
    createdUsers[u.email] = created.id;
    console.log(`  Created user: ${u.email} (${u.role})`);
  }

  // ── RCJY Standard Pipeline ─────────────────────────────────────────
  // Seed the canonical RCJY 7-stage pipeline (RD-006)
  const [existingTemplate] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.name, "RCJY Standard Pipeline"));
  let templateId: number;

  if (existingTemplate) {
    templateId = existingTemplate.id;
    console.log("  RCJY Standard Pipeline already exists, skipping.");
  } else {
    const [template] = await db.insert(stageTemplatesTable).values({
      name: "RCJY Standard Pipeline",
      description: "Standard industrial project lifecycle for Jubail Industrial City per RCJY guidelines",
      isDefault: true,
    }).returning({ id: stageTemplatesTable.id });
    templateId = template.id;
    console.log(`  Created template: RCJY Standard Pipeline (id=${templateId})`);

    const stages: {
      name: string;
      description: string;
      orderIndex: number;
      progressBaseline: number;
      category: "on-hold" | "active" | "complete";
      fields: {
        name: string;
        baseType: "text" | "number" | "date" | "boolean" | "file" | "image" | "single-choice" | "multi-choice";
        widget: "single-line" | "multi-line" | "email" | "telephone" | "number" | "date" | "checkbox" | "toggle" | "file-upload" | "single-photo" | "photo-gallery" | "drop-list" | "list-box" | "radio" | "checkbox-list";
        required: boolean;
        options?: string[];
      }[];
    }[] = [
      {
        name: "Agreement Signed",
        description: "Investment agreement executed and all parties have signed",
        orderIndex: 0,
        progressBaseline: 0,
        category: "on-hold",
        fields: [
          { name: "Agreement Date", baseType: "date", widget: "date", required: true },
          { name: "Agreement Reference", baseType: "text", widget: "single-line", required: true },
          { name: "Signed Agreement Copy", baseType: "file", widget: "file-upload", required: true },
        ],
      },
      {
        name: "Land Allocation",
        description: "Industrial plot allocated and land-use permit issued",
        orderIndex: 1,
        progressBaseline: 10,
        category: "active",
        fields: [
          { name: "Allocation Date", baseType: "date", widget: "date", required: true },
          { name: "Deed / Allocation Certificate", baseType: "file", widget: "file-upload", required: true },
          { name: "Plot Survey", baseType: "file", widget: "file-upload", required: false },
        ],
      },
      {
        name: "Design & Approvals",
        description: "Engineering designs completed and municipal/regulatory approvals obtained",
        orderIndex: 2,
        progressBaseline: 20,
        category: "active",
        fields: [
          { name: "Design Status", baseType: "single-choice", widget: "radio", required: true, options: ["Preliminary", "Detailed", "Final"] },
          { name: "Building Permit Number", baseType: "text", widget: "single-line", required: false },
          { name: "Approved Design Documents", baseType: "file", widget: "file-upload", required: true },
        ],
      },
      {
        name: "Foundation & Structure",
        description: "Foundations poured and structural skeleton erected",
        orderIndex: 3,
        progressBaseline: 40,
        category: "active",
        fields: [
          { name: "Foundation Completion %", baseType: "number", widget: "number", required: true },
          { name: "Structure Completion %", baseType: "number", widget: "number", required: true },
          { name: "Structural Photos", baseType: "image", widget: "photo-gallery", required: true },
          { name: "Structural Inspection Report", baseType: "file", widget: "file-upload", required: false },
        ],
      },
      {
        name: "MEP & Fit-Out",
        description: "Mechanical, electrical, plumbing, and interior fit-out works in progress",
        orderIndex: 4,
        progressBaseline: 60,
        category: "active",
        fields: [
          { name: "MEP Completion %", baseType: "number", widget: "number", required: true },
          { name: "MEP Contractor", baseType: "text", widget: "single-line", required: false },
          { name: "Site Photos", baseType: "image", widget: "photo-gallery", required: true },
        ],
      },
      {
        name: "Testing & Commissioning",
        description: "All systems tested, inspected, and commissioned for operation",
        orderIndex: 5,
        progressBaseline: 85,
        category: "active",
        fields: [
          { name: "Commissioning Authority", baseType: "text", widget: "single-line", required: false },
          { name: "Commissioning Report", baseType: "file", widget: "file-upload", required: true },
          { name: "Issues Raised", baseType: "boolean", widget: "toggle", required: false },
          { name: "Issue Notes", baseType: "text", widget: "multi-line", required: false },
        ],
      },
      {
        name: "Operational",
        description: "Facility is fully operational; investment project complete",
        orderIndex: 6,
        progressBaseline: 100,
        category: "complete",
        fields: [
          { name: "Commercial Registration Copy", baseType: "file", widget: "file-upload", required: false },
          { name: "Operating License", baseType: "file", widget: "file-upload", required: false },
          { name: "Actual Operational Date", baseType: "date", widget: "date", required: true },
        ],
      },
    ];

    for (const s of stages) {
      const [stage] = await db.insert(stagesTable).values({
        templateId,
        name: s.name,
        description: s.description,
        orderIndex: s.orderIndex,
        progressBaseline: s.progressBaseline,
        category: s.category,
      }).returning({ id: stagesTable.id });

      for (let j = 0; j < s.fields.length; j++) {
        const f = s.fields[j];
        await db.insert(stageFieldsTable).values({
          stageId: stage.id,
          name: f.name,
          baseType: f.baseType,
          widget: f.widget,
          required: f.required,
          position: j,
          options: f.options ?? null,
        });
      }

      console.log(`    Created stage: ${s.name}`);
    }
  }

  // ── Sample Projects ────────────────────────────────────────────────
  // Get the first stage of the pipeline
  const [firstStage] = await db.select({ id: stagesTable.id }).from(stagesTable).where(eq(stagesTable.templateId, templateId)).orderBy(stagesTable.orderIndex).limit(1);
  const firstStageId = firstStage?.id;

  const [thirdStage] = await db
    .select({ id: stagesTable.id })
    .from(stagesTable)
    .where(eq(stagesTable.templateId, templateId))
    .orderBy(stagesTable.orderIndex)
    .limit(1)
    .offset(2);

  const sampleProjects = [
    {
      name: "Acme Plastics Manufacturing Facility",
      sector: "Petrochemicals & Plastics",
      agreementNumber: "RCJY-2024-001",
      plotNumber: "P-1432-J",
      constructionPct: 40,
      investorEmail: "investor1@acmecorp.com",
      currentStageIndex: 3,
    },
    {
      name: "Gulf Petro Refinery Expansion",
      sector: "Petroleum Refining",
      agreementNumber: "RCJY-2024-002",
      plotNumber: "P-2891-J",
      constructionPct: 20,
      investorEmail: "investor2@gulfpetro.com",
      currentStageIndex: 2,
    },
  ];

  for (const p of sampleProjects) {
    const [existing] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.agreementNumber, p.agreementNumber));
    if (existing) { console.log(`  Project already exists: ${p.name}`); continue; }

    const stageRecord = p.currentStageIndex === 3 ? null : thirdStage; // simplify: use thirdStage for design stage
    const [stageAtIndex] = await db
      .select({ id: stagesTable.id })
      .from(stagesTable)
      .where(eq(stagesTable.templateId, templateId))
      .orderBy(stagesTable.orderIndex)
      .limit(1)
      .offset(p.currentStageIndex);

    await db.insert(projectsTable).values({
      name: p.name,
      sector: p.sector,
      agreementNumber: p.agreementNumber,
      plotNumber: p.plotNumber,
      constructionPct: p.constructionPct,
      pipelineId: templateId,
      currentStageId: stageAtIndex?.id ?? firstStageId,
      investorId: createdUsers[p.investorEmail],
      lastUpdateAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    });
    console.log(`  Created project: ${p.name}`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
