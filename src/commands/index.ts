import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { linkCommand } from './link.js';

// 모든 커맨드 목록
export const commands = [linkCommand];

// 커맨드 데이터 (등록용)
const commandsData = commands.map(cmd => cmd.data.toJSON());

// Discord에 슬래시 커맨드 등록
export async function registerCommands(clientId: string): Promise<void> {
  const rest = new REST().setToken(config.discord.token);

  console.log('Registering slash commands...');

  await rest.put(Routes.applicationCommands(clientId), {
    body: commandsData,
  });

  console.log('Slash commands registered successfully!');
}
