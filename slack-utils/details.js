module.exports = async function (bot, channelName) {
  try {
    const listResponse = await bot.conversations.list()
    const channel = listResponse.channels.find(channel => channel.name === channelName)
    if (!channel) {
      console.error(`No channel ${channelName} found`)
      return
    }

    const infoResponse = await bot.conversations.info({ channel: channel.id })
    console.log(infoResponse.channel)
  } catch (e) {
    console.error(e)
  }
}
