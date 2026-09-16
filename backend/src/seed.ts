// Bootstrap: create the initial super-admin and event settings if DB is empty.
// (was seed.py) — same defaults/strings.
import { prisma } from './db';
import { settings } from './config';
import { hashPassword } from './security';
import { daysFromNow, nowIso, uid } from './utils';

export async function bootstrap(): Promise<void> {
  const committeeCount = await prisma.committee.count();
  if (committeeCount === 0) {
    await prisma.committee.create({
      data: {
        id: uid(),
        name: settings.bootstrapAdminName,
        email: settings.bootstrapAdminEmail.trim().toLowerCase(),
        role: 'super_admin',
        isActive: true,
        createdAt: nowIso(),
        passwordHash: hashPassword(settings.bootstrapAdminPassword),
      },
    });
  }

  const eventCount = await prisma.eventSettings.count();
  if (eventCount === 0) {
    await prisma.eventSettings.create({
      data: {
        id: uid(),
        eventName: 'Reuni Akbar Keluarga Soero Pramono 2026',
        tagline: 'Satukan kembali keluarga besar Soero Pramono. Guyub Rukun Saklawase.',
        // Tanggal RELATIF, bukan tanggal mati. Tanggal mati apa pun akhirnya
        // lewat, dan begitu lewat setiap basis data baru lahir dengan
        // pendaftaran TERTUTUP tanpa ada yang menutupnya — itu persis yang
        // terjadi dengan '2026-08-01T16:59:00.000Z' yang dulu dipaku di sini.
        eventDate: daysFromNow(45),
        location: 'Sajian Kembang Turi',
        address: 'Sleman, Yogyakarta',
        mapsQuery: 'Sajian Kembang Turi',
        registrationDeadline: daysFromNow(30),
        registrationOpen: true,
        qrCheckinEnabled: true,
        updatedAt: nowIso(),
      },
    });
  }
}
