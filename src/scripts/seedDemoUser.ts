import "dotenv/config";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { Prisma } from "../../prisma/generated/prisma/client";
import { prisma } from "../lib/prisma";

const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_USER_PASSWORD;

if (!email || !password) {
  throw new Error(
    "SEED_USER_EMAIL and SEED_USER_PASSWORD must be defined in the backend .env file.",
  );
}

const profile = {
  firstName: "Heptex",
  lastName: "Project",
  phone: "+880 1712-345678",
  avatarUrl:
    "https://api.dicebear.com/9.x/initials/svg?seed=Heptex%20Project&backgroundColor=7c3aed&fontFamily=Arial",
  headline: "Full-Stack Software Engineer",
  bio: "Product-focused full-stack engineer with 5+ years of experience building reliable web applications, APIs, and cloud-native systems. Strong at translating business requirements into accessible user experiences and maintainable software.",
  location: "Dhaka, Bangladesh",
  website: "https://heptex.dev",
  linkedIn: "https://www.linkedin.com/in/heptex-project",
  github: "https://github.com/heptex-project",
  skills: [
    "TypeScript",
    "JavaScript",
    "React",
    "Next.js",
    "Node.js",
    "Express",
    "PostgreSQL",
    "Prisma",
    "REST APIs",
    "Docker",
    "AWS",
    "Git",
    "Tailwind CSS",
    "System Design",
  ],
  languages: ["English (Professional)", "Bangla (Native)"],
  education: [
    {
      school: "North South University",
      degree: "Bachelor of Science",
      field: "Computer Science and Engineering",
      from: "2015",
      to: "2019",
      gpa: "3.75 / 4.00",
    },
  ] as Prisma.InputJsonValue,
  experience: [
    {
      company: "Heptex Labs",
      role: "Senior Full-Stack Engineer",
      from: "2022-01",
      current: true,
      desc: "Lead delivery of customer-facing web products using Next.js, TypeScript, Node.js, PostgreSQL, and cloud services. Designed reusable frontend systems, improved API reliability, mentored engineers, and partnered with product teams to ship measurable improvements.",
    },
    {
      company: "Digital Solutions Ltd.",
      role: "Software Engineer",
      from: "2019-06",
      to: "2021-12",
      current: false,
      desc: "Built responsive React interfaces and REST APIs, automated deployment workflows, optimized database queries, and collaborated with designers and QA to deliver production releases on schedule.",
    },
  ] as Prisma.InputJsonValue,
  certifications: [
    {
      name: "AWS Certified Cloud Practitioner",
      issuer: "Amazon Web Services",
      year: "2024",
      url: "https://aws.amazon.com/certification/certified-cloud-practitioner/",
    },
    {
      name: "Professional Scrum Master I",
      issuer: "Scrum.org",
      year: "2023",
      url: "https://www.scrum.org/professional-scrum-master-i-certification",
    },
  ] as Prisma.InputJsonValue,
  referralCode: "HPXPROJECT4",
};

const passwordHash = await bcrypt.hash(password, 12);

const userId = await prisma.$transaction(async (tx) => {
  const existing = await tx.user.findUnique({ where: { email } });
  const id = existing?.id ?? crypto.randomUUID();

  if (existing) {
    await tx.user.update({
      where: { id },
      data: {
        name: `${profile.firstName} ${profile.lastName}`,
        emailVerified: true,
        isActive: true,
        role: "USER",
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
  } else {
    await tx.user.create({
      data: {
        id,
        name: `${profile.firstName} ${profile.lastName}`,
        email,
        emailVerified: true,
        isActive: true,
        role: "USER",
        twoFactorEnabled: false,
      },
    });
  }

  const credentialAccount = await tx.account.findFirst({
    where: { userId: id, providerId: "credential" },
  });
  if (credentialAccount) {
    await tx.account.update({
      where: { id: credentialAccount.id },
      data: { password: passwordHash, accountId: id },
    });
  } else {
    await tx.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: passwordHash,
      },
    });
  }

  await tx.userProfile.upsert({
    where: { userId: id },
    create: { userId: id, ...profile },
    update: profile,
  });

  await tx.userLimit.upsert({
    where: { userId: id },
    create: {
      userId: id,
      resumeLimit: 25,
      apiLimit: 500,
      resumeUsed: 0,
      apiUsed: 0,
      overrideByAdmin: true,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      resumeLimit: 25,
      apiLimit: 500,
      resumeUsed: 0,
      apiUsed: 0,
      overrideByAdmin: true,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await tx.notificationPreference.upsert({
    where: { userId: id },
    create: {
      userId: id,
      emailMarketing: false,
      emailProduct: true,
      emailSecurity: true,
      emailResumeTips: true,
      pushEnabled: false,
      inAppEnabled: true,
      digestFrequency: "WEEKLY",
    },
    update: {
      emailMarketing: false,
      emailProduct: true,
      emailSecurity: true,
      emailResumeTips: true,
      pushEnabled: false,
      inAppEnabled: true,
      digestFrequency: "WEEKLY",
    },
  });

  await tx.session.deleteMany({ where: { userId: id } });
  await tx.otpCode.deleteMany({ where: { userId: id } });

  return id;
}, { maxWait: 30_000, timeout: 60_000 });

const projects = [
  {
    title: "AI Resume and Career Platform",
    description:
      "Designed and built a full-stack career platform with AI-assisted resume generation, ATS scoring, cover letters, profile management, and application tracking.",
    techStack: ["Next.js", "TypeScript", "Node.js", "PostgreSQL", "Prisma", "Docker"],
    url: "https://heptex.dev/projects/profile-ai",
    repoUrl: "https://github.com/heptex-project/profile-ai",
    startDate: "2025-01",
    current: true,
  },
  {
    title: "Operations Analytics Dashboard",
    description:
      "Created a responsive analytics dashboard with role-based access, reusable data visualizations, export workflows, and automated reporting.",
    techStack: ["React", "TypeScript", "Express", "PostgreSQL", "Recharts"],
    url: "https://heptex.dev/projects/operations-dashboard",
    repoUrl: "https://github.com/heptex-project/operations-dashboard",
    startDate: "2023-03",
    endDate: "2024-02",
    current: false,
  },
];

for (const project of projects) {
  const existingProject = await prisma.project.findFirst({
    where: { userId, title: project.title },
  });
  if (existingProject) {
    await prisma.project.update({
      where: { id: existingProject.id },
      data: project,
    });
  } else {
    await prisma.project.create({ data: { userId, ...project } });
  }
}

const reference = {
  name: "Ayesha Rahman",
  relationship: "Engineering Manager",
  company: "Heptex Labs",
  email: "ayesha.rahman@example.com",
  phone: "+880 1812-345678",
};
const existingReference = await prisma.reference.findFirst({
  where: { userId, email: reference.email },
});
if (existingReference) {
  await prisma.reference.update({
    where: { id: existingReference.id },
    data: reference,
  });
} else {
  await prisma.reference.create({ data: { userId, ...reference } });
}

const seeded = await prisma.user.findUniqueOrThrow({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    emailVerified: true,
    isActive: true,
    profile: true,
    limits: true,
    notificationPreference: true,
    _count: { select: { projects: true, references: true } },
  },
});

const completionFields = [
  seeded.profile?.firstName,
  seeded.profile?.lastName,
  seeded.profile?.phone,
  seeded.profile?.headline,
  seeded.profile?.bio,
  seeded.profile?.location,
  seeded.profile?.website,
  seeded.profile?.linkedIn,
  seeded.profile?.avatarUrl,
  seeded.profile?.skills.length,
  Array.isArray(seeded.profile?.experience) && seeded.profile.experience.length,
  Array.isArray(seeded.profile?.education) && seeded.profile.education.length,
];
const completion = Math.round(
  (completionFields.filter(Boolean).length / completionFields.length) * 100,
);

console.log(
  JSON.stringify(
    {
      userId: seeded.id,
      email: seeded.email,
      verified: seeded.emailVerified,
      active: seeded.isActive,
      profileCompletion: completion,
      projects: seeded._count.projects,
      references: seeded._count.references,
      resumeLimit: seeded.limits?.resumeLimit,
      apiLimit: seeded.limits?.apiLimit,
      credentialStoredInEnv: true,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
