import { Client, Message, MessageEmbed } from 'discord.js-selfbot-v13';
import { CommandHandler } from '../handlers/CommandHandler';
import { EventHandler } from '../handlers/EventHandler';

// EmbedBuilder alias for compatibility
export const EmbedBuilder = MessageEmbed;
export type EmbedBuilderType = MessageEmbed;

export interface BotConfig {
  discord: {
    token: string;
    baseChannelId: string;
    commandPrefix: string;
  };
  features: {
    autoResponder: {
      enabled: boolean;
      message: string;
    };
    raidProtection: {
      enabled: boolean;
      joinLimit: number;
      timeWindow: number;
    };
    antiCrash: boolean;
    watchdogInterval: number;
    reconnectDelay: number;
  };
  dashboard: {
    enabled: boolean;
    port: number;
    password: string;
  };
  notifications: {
    webhookUrl?: string;
    mentionAlerts: boolean;
    dmAlerts: boolean;
  };
  debug: {
    enabled: boolean;
    logLevel: string;
  };
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  category: CommandCategory;
  usage?: string;
  cooldown?: number;
  permissions?: PermissionLevel;
  execute: (client: ExtendedClient, message: Message, args: string[]) => Promise<Message<boolean> | void>;
}

export type CommandCategory =
  | 'general'
  | 'voice'
  | 'moderation'
  | 'utility'
  | 'fun'
  | 'admin'
  | 'developer';

export type PermissionLevel =
  | 'everyone'
  | 'trusted'
  | 'admin'
  | 'owner';

export interface ExtendedClient extends Client {
  commands: Map<string, Command>;
  aliases: Map<string, string>;
  cooldowns: Map<string, Map<string, number>>;
  config: BotConfig;
  voiceManager: VoiceManager;
  raidProtection: RaidProtectionManager;
  commandHandler: CommandHandler;
  eventHandler: EventHandler;
  logger: any;
  stats: BotStats;
  startTime: Date;
}

export interface VoiceManager {
  targetChannelId: string | null;
  targetGuildId: string | null;
  isConnecting: boolean;
  connectionStartTime: Date | null;
  joinTarget(): Promise<void>;
  leaveChannel(): Promise<void>;
  moveToChannel(channelId: string): Promise<void>;
  getConnectionTime(): number;
  getStatus(): { connected: boolean; channel: string | null; guild: string | null; connectionTime: number };
  updateTarget(channelId: string, guildId: string): Promise<void>;
  startWatchdog(): void;
}

export interface RaidProtectionManager {
  joinHistory: Map<string, number[]>;
  isLocked: boolean;
  checkRaid(guildId: string, userId: string): boolean;
  lockGuild(guildId: string): void;
  unlockGuild(guildId: string): void;
  shouldKick(member: any): boolean;
  getStats(guildId: string): { joinsInWindow: number; isLocked: boolean; timeWindow: number; joinLimit: number };
  startCleanup(): void;
}

export interface BotStats {
  commandsExecuted: number;
  messagesReceived: number;
  dmsReceived: number;
  mentionsReceived: number;
  voiceConnections: number;
  reconnections: number;
  errors: number;
  lastError?: string;
  lastErrorTime?: Date;
}

export interface Event {
  name: string;
  once?: boolean;
  execute: (client: ExtendedClient, ...args: any[]) => Promise<void>;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  metadata?: any;
}

export interface VoiceState {
  channelId: string | null;
  guildId: string;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
}

export interface GuildInfo {
  id: string;
  name: string;
  memberCount: number;
  ownerId: string;
  iconURL?: string;
}

export interface UserInfo {
  id: string;
  tag: string;
  username: string;
  discriminator: string;
  avatarURL?: string;
  createdAt: Date;
  bot: boolean;
}

export interface AutoResponderSettings {
  enabled: boolean;
  message: string;
  cooldown: number;
  lastResponse: Map<string, number>;
}

export interface WebhookConfig {
  url: string;
  enabled: boolean;
  events: string[];
}

export interface DashboardData {
  stats: BotStats;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  guilds: GuildInfo[];
  currentVoiceChannel: string | null;
  logs: LogEntry[];
}
