import { prisma } from "../src/lib/prisma";
import { formatPublicAlias, generateGovernmentIdHash } from "../src/services/govIdentity/govIdentityProvider";

type SeedUser = Awaited<ReturnType<typeof prisma.user.create>>;

async function main() {
  const users = [
    { name: "Ciudadano Activo", email: "ciudadano.activo@demo.cl", role: "CITIZEN", accountStatus: "ACTIVE", governmentId: "11111111-1" },
    { name: "Ciudadano Observado", email: "ciudadano.observado@demo.cl", role: "CITIZEN", accountStatus: "WATCHED", governmentId: "22222222-2" },
    { name: "Ciudadano Limitado", email: "ciudadano.limitado@demo.cl", role: "CITIZEN", accountStatus: "LIMITED", governmentId: "33333333-3" },
    { name: "Ciudadano Suspendido", email: "ciudadano.suspendido@demo.cl", role: "CITIZEN", accountStatus: "SUSPENDED", governmentId: "44444444-4" },
    { name: "Ciudadano Baneado", email: "ciudadano.baneado@demo.cl", role: "CITIZEN", accountStatus: "BANNED", governmentId: "55555555-5" },
    { name: "Operador Demo", email: "operador@demo.cl", role: "OPERATOR", accountStatus: "ACTIVE", governmentId: "66666666-6" },
    { name: "Administrador Demo", email: "admin@demo.cl", role: "ADMIN", accountStatus: "ACTIVE", governmentId: "77777777-7" },
  ];

  await prisma.auditLog.deleteMany();
  await prisma.helpRequest.deleteMany();
  await prisma.report.deleteMany();
  await prisma.sanction.deleteMany();
  await prisma.user.deleteMany();

  const createdUsers: SeedUser[] = [];
  for (const userData of users) {
    const user = await prisma.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        phone: null,
        governmentIdHash: generateGovernmentIdHash(userData.governmentId),
        publicAlias: formatPublicAlias(userData.name),
        role: userData.role,
        accountStatus: userData.accountStatus,
      },
    });
    createdUsers.push(user);
  }

  const [activo, observado, limitado, suspendido] = createdUsers;

  const reports = [
    {
      userId: activo.id,
      category: "Incendio",
      title: "Incendio crítico en San Bernardo",
      description: "Fuego de gran magnitud en sector residencial, humo denso y posible evacuación cercana.",
      latitude: -33.6192,
      longitude: -70.6325,
      severity: "CRITICAL",
      status: "UNDER_REVIEW",
      aiSummary: "Se detecta posible evento de incendio con riesgo de propagación.",
      aiRecommendation: "Desplegar unidad de bomberos inmediata.",
      aiConfidence: 92,
      falseReportRisk: 12,
    },
    {
      userId: observado.id,
      category: "Accidente vehicular",
      title: "Accidente vehicular en Providencia",
      description: "Colisión múltiple en Av. Providencia, tráfico detenido y riesgos de heridos graves.",
      latitude: -33.4239,
      longitude: -70.6138,
      severity: "HIGH",
      status: "NEW",
      aiSummary: "Accidente con múltiples vehículos involucrados.",
      aiRecommendation: "Priorizar ambulancias y control de tráfico.",
      aiConfidence: 86,
      falseReportRisk: 15,
    },
    {
      userId: limitado.id,
      category: "Infraestructura",
      title: "Infraestructura dañada en Maipú",
      description: "Corte de agua y daños en sistema eléctrico tras caída de poste en sector industrial.",
      latitude: -33.4715,
      longitude: -70.7344,
      severity: "MEDIUM",
      status: "NEW",
      aiSummary: "Daño en infraestructura pública con posibles cortes de servicio.",
      aiRecommendation: "Enviar cuadrilla de reparación y asegurar el área.",
      aiConfidence: 74,
      falseReportRisk: 10,
    },
  ];

  const helpRequests = [
    {
      userId: suspendido.id,
      category: "SOS",
      title: "Solicitud SOS en Puente Alto",
      description: "Usuario solicita auxilio urgente desde sector montañoso, ubicación aproximada confirmada.",
      latitude: -33.6137,
      longitude: -70.5838,
      priority: "CRITICAL",
      status: "RECEIVED",
      restrictedMode: true,
      aiSummary: "Solicitud SOS urgente clasificada como crítica.",
      aiRecommendation: "Priorizar rescate y coordinar con unidades aéreas.",
      aiConfidence: 95,
    },
    {
      userId: observado.id,
      category: "Emergencia médica",
      title: "Emergencia médica en Ñuñoa",
      description: "Persona inconsciente en plaza pública, se requiere atención rápida.",
      latitude: -33.4575,
      longitude: -70.6044,
      priority: "HIGH",
      status: "UNDER_REVIEW",
      restrictedMode: false,
      aiSummary: "Solicitud de ayuda inmediata para emergencia médica.",
      aiRecommendation: "Enviar unidad médica de respuesta rápida.",
      aiConfidence: 88,
    },
  ];

  for (const r of reports) {
    await prisma.report.create({ data: r });
  }

  for (const h of helpRequests) {
    await prisma.helpRequest.create({ data: h });
  }

  for (const a of [
    { actorUserId: activo.id, action: "SEED", targetType: "Database", metadata: JSON.stringify({ source: "seed" }) },
    { actorUserId: observado.id, action: "SEED", targetType: "Database", metadata: JSON.stringify({ source: "seed" }) },
  ]) {
    await prisma.auditLog.create({ data: a });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
