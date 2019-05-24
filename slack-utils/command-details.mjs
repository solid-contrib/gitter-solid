import { getChannelByName } from './slack-api'

export default async function showDetailsForChannel (bot, channelName) {
  try {
    const channel = await getChannelByName(bot, channelName)
    if (!channel) {
      return
    }

    const infoResponse = await bot.conversations.info({ channel: channel.id })
    console.log(infoResponse.channel)
  } catch (e) {
    console.error(e)
  }
}
