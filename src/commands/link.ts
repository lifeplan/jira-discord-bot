import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { saveUserMapping, deleteUserMapping, getAllUserMappings } from '../database/mappings.js';

export const linkCommand = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Jira 계정과 Discord 계정을 연결합니다')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Jira 계정을 연결합니다')
        .addStringOption(option =>
          option
            .setName('jira_id')
            .setDescription('Jira 계정 ID (예: 712020:xxxxxxxx)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('jira_name')
            .setDescription('Jira 표시 이름 (예: 윤마므)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Jira 계정 연결을 해제합니다')
        .addStringOption(option =>
          option
            .setName('jira_id')
            .setDescription('Jira 계정 ID')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('연결된 모든 계정을 확인합니다')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const jiraId = interaction.options.getString('jira_id', true);
      const jiraName = interaction.options.getString('jira_name', true);
      const discordUserId = interaction.user.id;

      saveUserMapping(jiraId, jiraName, discordUserId);

      await interaction.reply({
        content: `✅ 연결 완료!\n\n**Jira ID:** ${jiraId}\n**Jira 이름:** ${jiraName}\n**Discord:** <@${discordUserId}>`,
        ephemeral: true,
      });
    }

    if (subcommand === 'remove') {
      const jiraId = interaction.options.getString('jira_id', true);

      deleteUserMapping(jiraId);

      await interaction.reply({
        content: `✅ 연결 해제 완료: ${jiraId}`,
        ephemeral: true,
      });
    }

    if (subcommand === 'list') {
      const mappings = getAllUserMappings();

      if (mappings.length === 0) {
        await interaction.reply({
          content: '연결된 계정이 없습니다.',
          ephemeral: true,
        });
        return;
      }

      const list = mappings
        .map(m => `• **${m.jira_display_name}** (${m.jira_account_id}) → <@${m.discord_user_id}>`)
        .join('\n');

      await interaction.reply({
        content: `📋 **연결된 계정 목록**\n\n${list}`,
        ephemeral: true,
      });
    }
  },
};
