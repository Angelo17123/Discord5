import { GuildMember } from 'discord.js-selfbot-v13';
import { Event, ExtendedClient } from '../types';
import { log, logEvent } from '../utils/logger';

export const guildMemberAdd: Event = {
  name: 'guildMemberAdd',
  once: false,
  async execute(client: ExtendedClient, member: GuildMember) {
    if (!client.config.features.raidProtection.enabled) return;

    // ⚠️ SEGURIDAD: Solo MONITOREAR, NUNCA kickear
    // Kickear usuarios automáticamente es una bandera roja ENORME
    const isRaid = client.raidProtection.checkRaid(member.guild.id, member.id);

    if (isRaid) {
      logEvent('RAID', `Posible raid detectado - nuevo miembro: ${member.user.tag}`);
      // Solo loguear y notificar por webhook - NO tomar acción
      log.warn(`⚠️ Raid detectado en ${member.guild.name} - Solo monitoreo activo`);
    }
  },
};

export default guildMemberAdd;
