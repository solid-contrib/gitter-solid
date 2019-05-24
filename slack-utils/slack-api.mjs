export async function getChannelByName (bot, channelName) {
  const channels = await getChannels(bot)
  const channel = channels.find(channel => channel.name === channelName)
  if (!channel) {
    throw new Error(`No channel ${channelName} found`)
  }
  return channel
}

export async function getChannels (bot) {
  const response = await bot.conversations.list()
  return response.channels
}
