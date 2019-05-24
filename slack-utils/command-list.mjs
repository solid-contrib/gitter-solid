import { getChannels } from './slack-api'

export default async function listChannels (bot) {
  const channels = await getChannels(bot)
  channels.forEach(channel => console.log(`#${channel.name}`))
}
