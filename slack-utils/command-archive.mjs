import { getChannelByName } from './slack-api'

export default async function archiveChannel (bot, channelName, pod) {
  const channel = await getChannelByName(bot, channelName)
  console.log(channel, pod)
}